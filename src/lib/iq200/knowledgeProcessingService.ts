import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  PROCESSING_LEASE_MILLISECONDS,
  PROCESSING_MAX_ATTEMPTS,
  KnowledgeProcessingError,
  generateProcessingAttemptId,
  verifyAttemptOwnership,
  isEligibleForClaim,
  isValidFailureCode,
  type ProcessingTaskDescriptor,
  type ProcessingFailureCode,
} from "./knowledgeProcessingCore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessingClaim {
  companyId: string;
  documentId: string;
  processingAttemptId: string;
  processingAttempts: number;
}

export type DocumentClaimOutcome =
  | { kind: "claimed"; claim: ProcessingClaim }
  | { kind: "handled"; reason: "MISSING" | "STALE_GENERATION" | "INELIGIBLE" | "READY" | "FAILED" | "ACTIVE_OWNER" | "ATTEMPT_LIMIT" };

export type ProcessingClaimSnapshot = {
  exists: boolean;
  data(): Record<string, any> | undefined;
};

export type ProcessingClaimTransaction = {
  get(ref: unknown): Promise<ProcessingClaimSnapshot>;
  update(ref: unknown, fields: Record<string, unknown>): void;
};

export type ProcessingClaimStore = {
  doc(path: string): unknown;
  runTransaction<T>(work: (transaction: ProcessingClaimTransaction) => Promise<T>): Promise<T>;
};

const processingClaimStore: ProcessingClaimStore = {
  doc: (path) => adminDb.doc(path),
  runTransaction: (work) => adminDb.runTransaction(async (transaction) => work(transaction as unknown as ProcessingClaimTransaction)),
};

export const INITIAL_PROCESSING_ENQUEUE_GENERATION = 1;

export type ProcessingEnqueueIdentity = {
  companyId: string;
  documentId: string;
  enqueueGeneration: number;
};

export type ProcessingGenerationSnapshot = {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

export type ProcessingGenerationTransaction = {
  get(ref: unknown): Promise<ProcessingGenerationSnapshot>;
  update(ref: unknown, fields: Record<string, unknown>): void;
};

export type ProcessingGenerationStore = {
  doc(path: string): unknown;
  runTransaction<T>(work: (transaction: ProcessingGenerationTransaction) => Promise<T>): Promise<T>;
};

const processingGenerationStore: ProcessingGenerationStore = {
  doc: (path) => adminDb.doc(path),
  runTransaction: (work) => adminDb.runTransaction(async (transaction) => work(transaction as unknown as ProcessingGenerationTransaction)),
};

const PROCESSING_DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export async function advanceProcessingEnqueueGeneration(
  companyId: string,
  documentId: string,
  store: ProcessingGenerationStore = processingGenerationStore,
): Promise<number> {
  if (!PROCESSING_DOCUMENT_ID_PATTERN.test(companyId) || !PROCESSING_DOCUMENT_ID_PATTERN.test(documentId)) {
    throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "Processing document identity is invalid.", 400);
  }

  const ref = store.doc(`companies/${companyId}/iq200_documents/${documentId}`);
  return store.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "Processing document does not exist.", 404);
    }

    const data = snapshot.data();
    if (
      !data ||
      data.companyId !== companyId ||
      data.documentId !== documentId ||
      data.processingStatus !== "PENDING"
    ) {
      throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "Processing document is not eligible for re-enqueue.", 409);
    }

    const currentGeneration = data.processingEnqueueGeneration;
    if (
      typeof currentGeneration !== "number" ||
      !Number.isInteger(currentGeneration) ||
      !Number.isSafeInteger(currentGeneration) ||
      currentGeneration < INITIAL_PROCESSING_ENQUEUE_GENERATION ||
      currentGeneration >= Number.MAX_SAFE_INTEGER
    ) {
      throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "Processing enqueue generation is invalid.", 500);
    }
    const nextGeneration = currentGeneration + 1;
    if (!Number.isSafeInteger(nextGeneration)) {
      throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "Processing enqueue generation could not advance.", 500);
    }
    transaction.update(ref, {
      processingEnqueueGeneration: nextGeneration,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return nextGeneration;
  });
}

export async function claimProcessingDocument(descriptor: ProcessingTaskDescriptor, store: ProcessingClaimStore = processingClaimStore): Promise<DocumentClaimOutcome> {
  const ref = store.doc(`companies/${descriptor.companyId}/iq200_documents/${descriptor.documentId}`);
  return store.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return { kind: "handled", reason: "MISSING" };
    const data = snapshot.data() || {};
    if (data.companyId !== descriptor.companyId || data.documentId !== descriptor.documentId) {
      return { kind: "handled", reason: "MISSING" };
    }
    if (data.processingEnqueueGeneration !== descriptor.processingEnqueueGeneration) {
      return { kind: "handled", reason: "STALE_GENERATION" };
    }

    const currentAttempts = Number(data.processingAttempts || 0);
    const leaseExpiresAtMillis = data.processingLeaseExpiresAt?.toMillis?.() || undefined;
    const now = Date.now();
    if (data.processingStatus === "READY") return { kind: "handled", reason: "READY" };
    if (data.processingStatus === "FAILED") return { kind: "handled", reason: "FAILED" };
    if (data.processingStatus === "PROCESSING" && leaseExpiresAtMillis !== undefined && leaseExpiresAtMillis > now) {
      return { kind: "handled", reason: "ACTIVE_OWNER" };
    }
    if (!isEligibleForClaim(data.processingStatus, leaseExpiresAtMillis, now, currentAttempts)) {
      if (currentAttempts >= PROCESSING_MAX_ATTEMPTS) {
        transaction.update(ref, {
          processingStatus: "FAILED",
          processingFailureCode: "TIMEOUT",
          processingFailedAt: FieldValue.serverTimestamp(),
          processingLeaseExpiresAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { kind: "handled", reason: "ATTEMPT_LIMIT" };
      }
      return { kind: "handled", reason: "INELIGIBLE" };
    }

    const attemptId = generateProcessingAttemptId();
    const attempts = currentAttempts + 1;
    transaction.update(ref, {
      processingStatus: "PROCESSING",
      processingAttemptId: attemptId,
      processingLeaseExpiresAt: Timestamp.fromMillis(now + PROCESSING_LEASE_MILLISECONDS),
      processingAttempts: attempts,
      processingClaimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      kind: "claimed",
      claim: {
        companyId: descriptor.companyId,
        documentId: descriptor.documentId,
        processingAttemptId: attemptId,
        processingAttempts: attempts,
      },
    };
  });
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
    const currentAttempts = Number(data.processingAttempts || 0);
    if (!isEligibleForClaim(data.processingStatus, leaseExpiresAtMillis, now, currentAttempts)) {
      if (
        currentAttempts >= PROCESSING_MAX_ATTEMPTS &&
        (data.processingStatus === "PENDING" ||
          (data.processingStatus === "PROCESSING" && leaseExpiresAtMillis !== undefined && leaseExpiresAtMillis <= now))
      ) {
        transaction.update(candidate.ref, {
          processingStatus: "FAILED",
          processingFailureCode: "TIMEOUT",
          processingFailedAt: FieldValue.serverTimestamp(),
          processingLeaseExpiresAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
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
