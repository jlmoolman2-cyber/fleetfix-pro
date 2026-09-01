import "server-only";

import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { idempotencyKey } from "./idempotencyCore";
import { ingestMediaDescriptor, type MediaDescriptor } from "./mediaService";
import { MEDIA_LEASE_MILLISECONDS, mediaFailureState, mediaRetryDelayMilliseconds } from "./mediaQueueCore";
import { getWhatsAppSettings } from "./settings";

type ClaimedJob = { ref: DocumentSnapshot["ref"]; companyId: string; messageId: string; phoneNumberId: string; descriptor: MediaDescriptor; attempt: number };

function validDescriptor(value: unknown): value is MediaDescriptor {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return ["image", "video", "audio", "document", "sticker"].includes(String(data.type)) && /^[A-Za-z0-9_-]{1,200}$/.test(String(data.id || ""));
}

async function candidate(): Promise<DocumentSnapshot | null> {
  const now = Timestamp.now();
  const expired = await adminDb.collectionGroup("whatsappMediaJobs").where("status", "==", "processing").where("leaseExpiresAt", "<=", now).orderBy("leaseExpiresAt").limit(1).get();
  if (!expired.empty) return expired.docs[0];
  const ready = await adminDb.collectionGroup("whatsappMediaJobs").where("status", "in", ["pending", "retryable"]).where("nextAttemptAt", "<=", now).orderBy("nextAttemptAt").limit(1).get();
  return ready.empty ? null : ready.docs[0];
}

async function claimJob(): Promise<ClaimedJob | null> {
  const selected = await candidate();
  if (!selected) return null;
  return adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(selected.ref);
    const data = current.data() || {};
    const now = Date.now();
    const eligible = ["pending", "retryable"].includes(data.status) || (data.status === "processing" && Number(data.leaseExpiresAt?.toMillis?.() || 0) <= now);
    if (!eligible || !validDescriptor(data.descriptor)) return null;
    const attempt = Number(data.attempts || 0) + 1;
    transaction.update(current.ref, { status: "processing", attempts: attempt, leaseExpiresAt: Timestamp.fromMillis(now + MEDIA_LEASE_MILLISECONDS), processingStartedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { ref: current.ref, companyId: String(data.companyId || ""), messageId: String(data.messageId || ""), phoneNumberId: String(data.phoneNumberId || ""), descriptor: data.descriptor, attempt };
  });
}

export async function processNextMediaJob(): Promise<{ processed: boolean; status?: string; messageId?: string }> {
  const job = await claimJob();
  if (!job) return { processed: false };
  const messageRef = adminDb.doc(`companies/${job.companyId}/whatsappMessages/${job.messageId}`);
  try {
    const message = await messageRef.get();
    if (message.data()?.mediaIngestionStatus === "stored") {
      await job.ref.update({ status: "stored", completedAt: FieldValue.serverTimestamp(), leaseExpiresAt: null, updatedAt: FieldValue.serverTimestamp() });
      return { processed: true, status: "stored", messageId: job.messageId };
    }
    await messageRef.update({ mediaIngestionStatus: "processing", mediaFailureReason: null, updatedAt: FieldValue.serverTimestamp() });
    const settings = await getWhatsAppSettings(job.companyId);
    const media = await ingestMediaDescriptor({ companyId: job.companyId, messageId: job.messageId, phoneNumberId: job.phoneNumberId, settings, descriptor: job.descriptor });
    const batch = adminDb.batch();
    batch.update(messageRef, { ...media, updatedAt: FieldValue.serverTimestamp() });
    batch.update(job.ref, { status: "stored", completedAt: FieldValue.serverTimestamp(), leaseExpiresAt: null, updatedAt: FieldValue.serverTimestamp() });
    batch.set(adminDb.doc(`companies/${job.companyId}/whatsappAuditLog/${idempotencyKey(`${job.messageId}:MEDIA_STORED`)}`), { companyId: job.companyId, action: "MEDIA_STORED", result: "success", messageId: job.messageId, attempts: job.attempt, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
    return { processed: true, status: "stored", messageId: job.messageId };
  } catch (error) {
    const status = mediaFailureState(job.attempt);
    const reason = error instanceof Error ? error.message.slice(0, 200) : "Media ingestion failed";
    const nextAttemptAt = Timestamp.fromMillis(Date.now() + mediaRetryDelayMilliseconds(job.attempt));
    const batch = adminDb.batch();
    batch.update(messageRef, { mediaIngestionStatus: status, mediaFailureReason: reason, updatedAt: FieldValue.serverTimestamp() });
    batch.update(job.ref, { status, failureReason: reason, nextAttemptAt, leaseExpiresAt: null, updatedAt: FieldValue.serverTimestamp() });
    batch.set(adminDb.doc(`companies/${job.companyId}/whatsappAuditLog/${idempotencyKey(`${job.messageId}:MEDIA_ATTEMPT:${job.attempt}`)}`), { companyId: job.companyId, action: status === "failed" ? "MEDIA_INGESTION_FAILED" : "MEDIA_RETRY_SCHEDULED", result: "failure", messageId: job.messageId, attempt: job.attempt, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return { processed: true, status, messageId: job.messageId };
  }
}
