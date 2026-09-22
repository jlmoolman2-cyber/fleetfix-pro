// IQ200 Knowledge Document Upload — Pure core logic
// Phase 24D-2B: Validation, hashing, path building, error types.
// No Firebase, no Storage, no API routes.

import { createHash, randomUUID } from "node:crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_IQ200_KNOWLEDGE_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
export const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46] as const; // %PDF
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export const EXPECTED_PDF_MIME = "application/pdf";

// ─── Error Type ───────────────────────────────────────────────────────────────

export type KnowledgeUploadErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_IDEMPOTENCY_KEY"
  | "MISSING_FILE"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "INVALID_PDF"
  | "IDEMPOTENCY_CONFLICT"
  | "DUPLICATE_DOCUMENT"
  | "UPLOAD_FAILED"
  | "PERSISTENCE_FAILED";

export class KnowledgeUploadError extends Error {
  code: KnowledgeUploadErrorCode;
  status: number;

  constructor(code: KnowledgeUploadErrorCode, message: string, status: number) {
    super(message);
    this.name = "KnowledgeUploadError";
    this.code = code;
    this.status = status;
  }
}

// ─── Pure Validation ──────────────────────────────────────────────────────────

export function validateIdempotencyKey(key: unknown): string {
  if (typeof key !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new KnowledgeUploadError("INVALID_IDEMPOTENCY_KEY", "A valid Idempotency-Key is required.", 400);
  }
  return key;
}

export function validatePdfEnvelope(bytes: Uint8Array): void {
  if (!bytes || bytes.length === 0) {
    throw new KnowledgeUploadError("EMPTY_FILE", "The uploaded file is empty.", 400);
  }
  if (bytes.length > MAX_IQ200_KNOWLEDGE_UPLOAD_BYTES) {
    throw new KnowledgeUploadError("FILE_TOO_LARGE", "The uploaded file exceeds the 20 MB limit.", 413);
  }
  if (bytes.length < PDF_MAGIC_BYTES.length) {
    throw new KnowledgeUploadError("INVALID_PDF", "The uploaded file is not a valid PDF.", 400);
  }
  for (let i = 0; i < PDF_MAGIC_BYTES.length; i++) {
    if (bytes[i] !== PDF_MAGIC_BYTES[i]) {
      throw new KnowledgeUploadError("INVALID_PDF", "The uploaded file is not a valid PDF.", 400);
    }
  }
}

export function validatePdfMimeType(mimeType: string): void {
  const normalized = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (normalized !== EXPECTED_PDF_MIME) {
    throw new KnowledgeUploadError("INVALID_PDF", "Only PDF files are accepted.", 400);
  }
}

export function sanitizeFilename(name: string): string {
  if (!name || typeof name !== "string") return "document.pdf";
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return safe || "document.pdf";
}

// ─── Server-Generated Identifiers ─────────────────────────────────────────────

export function generateDocumentId(): string {
  return randomUUID();
}

export function computeContentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildStoragePath(companyId: string, documentId: string): string {
  return `companies/${companyId}/iq200/documents/${documentId}/original/source.pdf`;
}

// ─── Upload Response Shape ────────────────────────────────────────────────────

export interface KnowledgeUploadResult {
  documentId: string;
  contentHash: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  processingStatus: "PENDING";
  approvalStatus: "DRAFT";
  uploadedAt: string;
  idempotentRetry: boolean;
}
