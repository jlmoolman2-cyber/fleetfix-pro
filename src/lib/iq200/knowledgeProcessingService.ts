import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  PROCESSING_LEASE_MILLISECONDS,
  KnowledgeProcessingError,
  generateProcessingAttemptId,
  verifyAttemptOwnership,
  isEligibleForClaim,
  isValidFailureCode,
  type ProcessingFailureCode,
} from "./knowledgeProcessingCore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessingClaim {
  companyId: string;
  documentId: string;
  processingAttemptId: string;
  processingAttempts: number;
}

// ─── Candidate Search ─────────────────────────────────────────────────────────

async function findCandidateDocument(): Promise<{ ref: ReturnType<typeof adminDb.doc>; companyId: string; documentId: string } | null> {
  const nowMs = Date.now();

  // Check for expired processing leases (recovery)
  const processing = await adminDb.collectionGroup("iq200_documents")
    .where("processingStatus", "==", "PROCESSING")
    .limit(5)
    .get();

  for (const doc of processing.docs) {
    const leaseExpiry = doc.data()?.processingLeaseExpiresAt?.toMillis?.() || 0;
    if (leaseExpiry <= nowMs) {
      const companyId = doc.ref.parent.parent!.id;
      return { ref: doc.ref, companyId, documentId: doc.id };
    }
  }

  // Check for pending documents
  const pending = await adminDb.collectionGroup("iq200_documents")
    .where("processingStatus", "==", "PENDING")
    .limit(1)
    .get();

  if (!pending.empty) {
    const doc = pending.docs[0];
    const companyId = doc.ref.parent.parent!.id;
    return { ref: doc.ref, companyId, documentId: doc.id };
  }

  return null;
}

// ─── Claim ────────────────────────────────────────────────────────────────────

export async function claimNextPendingDocument(): Promise<ProcessingClaim | null> {
  const candidate = await findCandidateDocument();
  if (!candidate) return null;

  const result = await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(candidate.ref);
    const data = snapshot.data() || {};
    const now = Date.now();

    const leaseExpiresAtMillis = data.processingLeaseExpiresAt?.toMillis?.() || undefined;
    if (!isEligibleForClaim(data.processingStatus, leaseExpiresAtMillis, now)) {
      return null;
    }

    const attemptId = generateProcessingAttemptId();
    const attempts = Number(data.processingAttempts || 0) + 1;

    transaction.update(candidate.ref, {
      processingStatus: "PROCESSING",
      processingAttemptId: attemptId,
      processingLeaseExpiresAt: Timestamp.fromMillis(now + PROCESSING_LEASE_MILLISECONDS),
      processingAttempts: attempts,
      processingClaimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      companyId: candidate.companyId,
      documentId: candidate.documentId,
      processingAttemptId: attemptId,
      processingAttempts: attempts,
    };
  });

  return result;
}

// ─── Lease Extension (Heartbeat) ──────────────────────────────────────────────

export async function extendProcessingLease(
  companyId: string,
  documentId: string,
  callerAttemptId: string,
): Promise<boolean> {
  const ref = adminDb.doc(`companies/${companyId}/iq200_documents/${documentId}`);

  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};

    if (!verifyAttemptOwnership(data.processingStatus, data.processingAttemptId, callerAttemptId)) {
      throw new KnowledgeProcessingError("STALE_ATTEMPT", "Attempt ownership has expired.", 409);
    }

    const now = Date.now();
    transaction.update(ref, {
      processingLeaseExpiresAt: Timestamp.fromMillis(now + PROCESSING_LEASE_MILLISECONDS),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return true;
}

// ─── Failure Transition ───────────────────────────────────────────────────────

export async function markProcessingFailed(
  companyId: string,
  documentId: string,
  callerAttemptId: string,
  failureCode: ProcessingFailureCode,
): Promise<boolean> {
  if (!isValidFailureCode(failureCode)) {
    throw new KnowledgeProcessingError("INVALID_FAILURE_CODE", "The failure code is not allowed.", 400);
  }

  const ref = adminDb.doc(`companies/${companyId}/iq200_documents/${documentId}`);

  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};

    if (!verifyAttemptOwnership(data.processingStatus, data.processingAttemptId, callerAttemptId)) {
      throw new KnowledgeProcessingError("STALE_ATTEMPT", "Attempt ownership has expired.", 409);
    }

    transaction.update(ref, {
      processingStatus: "FAILED",
      processingFailureCode: failureCode,
      processingFailedAt: FieldValue.serverTimestamp(),
      processingLeaseExpiresAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return true;
}

// ─── Ready Guard Foundation ───────────────────────────────────────────────────

export function verifyReadyOwnership(
  processingStatus: string,
  processingAttemptId: string | undefined,
  callerAttemptId: string,
): boolean {
  return verifyAttemptOwnership(processingStatus, processingAttemptId, callerAttemptId);
}
