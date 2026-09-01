import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { idempotencyKey } from "./idempotencyCore";
import { shouldProcessWebhook } from "./idempotencyState";

export { idempotencyKey } from "./idempotencyCore";

export type WebhookClaim = { eventId: string; shouldProcess: boolean; recovered: boolean };

export async function beginWebhookEvent(companyId: string, key: string, payloadHash: string): Promise<WebhookClaim> {
  const eventId = idempotencyKey(key);
  const ref = adminDb.doc(`companies/${companyId}/whatsappWebhookEvents/${eventId}`);
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const data = existing.data() || {};
    const leaseExpiresAt = data.leaseExpiresAt?.toMillis?.() || 0;
    if (!shouldProcessWebhook(data.state, leaseExpiresAt, Date.now())) {
      return { eventId, shouldProcess: false, recovered: false };
    }
    const recovered = existing.exists;
    transaction.set(ref, {
      companyId,
      eventKeyHash: eventId,
      payloadHash,
      state: "processing",
      attempts: Number(data.attempts || 0) + 1,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      lastAttemptAt: FieldValue.serverTimestamp(),
      createdAt: data.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastErrorCode: null,
    }, { merge: true });
    return { eventId, shouldProcess: true, recovered };
  });
}

export async function completeWebhookEvent(companyId: string, eventId: string): Promise<void> {
  await adminDb.doc(`companies/${companyId}/whatsappWebhookEvents/${eventId}`).set({
    state: "processed",
    processedAt: FieldValue.serverTimestamp(),
    leaseExpiresAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function failWebhookEvent(companyId: string, eventId: string, errorCode: string): Promise<void> {
  await adminDb.doc(`companies/${companyId}/whatsappWebhookEvents/${eventId}`).set({
    state: "retryable",
    lastErrorCode: String(errorCode || "PROCESSING_ERROR").slice(0, 100),
    failedAt: FieldValue.serverTimestamp(),
    leaseExpiresAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
