// IQ200 Knowledge Document Processing — Control foundation
// Phase 24E-2A: State guards, claim/lease, attempt fencing, worker auth.
// No PDF parsing, no rendering, no Storage writes.

import { randomUUID, timingSafeEqual } from "node:crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

export const PROCESSING_LEASE_MILLISECONDS = 5 * 60 * 1000; // 5 minutes
export const PROCESSING_MAX_ATTEMPTS = 3;
export const PROCESSING_SERVER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type ProcessingTaskDescriptor = {
  companyId: string;
  documentId: string;
  processingEnqueueGeneration: number;
};

export function parseProcessingTaskDescriptor(value: unknown): ProcessingTaskDescriptor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KnowledgeProcessingError("INVALID_TASK", "Processing task descriptor is invalid.", 400);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "companyId,documentId,processingEnqueueGeneration") {
    throw new KnowledgeProcessingError("INVALID_TASK", "Processing task descriptor is invalid.", 400);
  }
  if (
    typeof record.companyId !== "string" ||
    !PROCESSING_SERVER_ID_PATTERN.test(record.companyId) ||
    typeof record.documentId !== "string" ||
    !PROCESSING_SERVER_ID_PATTERN.test(record.documentId) ||
    typeof record.processingEnqueueGeneration !== "number" ||
    !Number.isSafeInteger(record.processingEnqueueGeneration) ||
    record.processingEnqueueGeneration < 1
  ) {
    throw new KnowledgeProcessingError("INVALID_TASK", "Processing task descriptor is invalid.", 400);
  }
  return record as ProcessingTaskDescriptor;
}

// ─── Attempt ID ───────────────────────────────────────────────────────────────

export const PROCESSING_ATTEMPT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function generateProcessingAttemptId(): string {
  return randomUUID();
}

export function isValidProcessingAttemptId(value: unknown): value is string {
  return typeof value === "string" && PROCESSING_ATTEMPT_ID_PATTERN.test(value);
}

// ─── Bounded Failure Codes ────────────────────────────────────────────────────

export const PROCESSING_FAILURE_CODES = [
  "SOURCE_UNAVAILABLE",
  "ENCRYPTED_PDF",
  "PASSWORD_PROTECTED_PDF",
  "MALFORMED_PDF",
  "ZERO_PAGE_PDF",
  "UNSUPPORTED_PDF_FEATURE",
  "RENDER_FAILED",
  "TEXT_EXTRACTION_FAILED",
  "STORAGE_WRITE_FAILED",
  "PERSISTENCE_FAILED",
  "TIMEOUT",
  "INTERNAL_ERROR",
] as const;

export type ProcessingFailureCode = typeof PROCESSING_FAILURE_CODES[number];

export function isValidFailureCode(value: unknown): value is ProcessingFailureCode {
  return typeof value === "string" && (PROCESSING_FAILURE_CODES as readonly string[]).includes(value);
}

// ─── Error Type ───────────────────────────────────────────────────────────────

export class KnowledgeProcessingError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "KnowledgeProcessingError";
    this.code = code;
    this.status = status;
  }
}

// ─── Attempt Ownership / Fencing ──────────────────────────────────────────────

export function verifyAttemptOwnership(
  currentStatus: string,
  currentAttemptId: string | undefined,
  callerAttemptId: string,
): boolean {
  return (
    currentStatus === "PROCESSING" &&
    typeof currentAttemptId === "string" &&
    currentAttemptId.length > 0 &&
    currentAttemptId === callerAttemptId
  );
}

// ─── Claim Eligibility ───────────────────────────────────────────────────────

export function isEligibleForClaim(
  processingStatus: string,
  leaseExpiresAtMillis: number | undefined,
  now: number,
  processingAttempts = 0,
): boolean {
  if (processingAttempts >= PROCESSING_MAX_ATTEMPTS) return false;
  if (processingStatus === "PENDING") return true;
  if (
    processingStatus === "PROCESSING" &&
    leaseExpiresAtMillis !== undefined &&
    leaseExpiresAtMillis <= now
  ) return true;
  return false;
}

// ─── Worker Authentication ────────────────────────────────────────────────────

export function requireProcessingWorker(request: Request): void {
  const expected = process.env.IQ200_PROCESSING_WORKER_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (
    !expected ||
    expected.length !== supplied.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  ) {
    throw new KnowledgeProcessingError("AUTH_REQUIRED", "Processing worker authentication failed.", 401);
  }
}
