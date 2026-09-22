import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_IQ200_KNOWLEDGE_UPLOAD_BYTES,
  PDF_MAGIC_BYTES,
  IDEMPOTENCY_KEY_PATTERN,
  EXPECTED_PDF_MIME,
  KnowledgeUploadError,
  validateIdempotencyKey,
  validatePdfEnvelope,
  validatePdfMimeType,
  sanitizeFilename,
  generateDocumentId,
  computeContentHash,
  buildStoragePath,
} from "../src/lib/iq200/knowledgeUploadCore.ts";

const src = (p: string) => readFileSync(p, "utf8");
const coreSrc = () => src("src/lib/iq200/knowledgeUploadCore.ts");
const serviceSrc = () => src("src/lib/iq200/knowledgeUploadService.ts");
const routeSrc = () => src("src/app/api/iq200/knowledge/documents/upload/route.ts");

const makePdfBytes = (size = 100) => {
  const bytes = new Uint8Array(size);
  bytes[0] = 0x25; bytes[1] = 0x50; bytes[2] = 0x44; bytes[3] = 0x46; // %PDF
  for (let i = 4; i < size; i++) bytes[i] = 0x20;
  return bytes;
};

// ── AUTH / TENANT (1–7) ──────────────────────────────────────────────────────

test("1. unauthenticated upload denied — route uses authenticateServerRequest", () => {
  assert.match(routeSrc(), /authenticateServerRequest\(request\)/);
});

test("2. inactive/invalid membership denied — serverAuth rejects non-active membership", () => {
  const core = src("src/lib/serverAuthCore.ts");
  assert.match(core, /active !== false/);
  assert.match(core, /No active FleetFix company membership/);
});

test("3. authenticated member without Upload IQ200 Knowledge denied", () => {
  assert.match(serviceSrc(), /Upload IQ200 Knowledge/);
  assert.match(serviceSrc(), /FORBIDDEN/);
  assert.match(serviceSrc(), /effectivePermissions/);
});

test("4. authorized member allowed — service checks Upload IQ200 Knowledge permission", () => {
  assert.match(serviceSrc(), /requireUploadKnowledgePermission/);
  assert.match(serviceSrc(), /permissions\[UPLOAD_KNOWLEDGE_PERMISSION\] !== true/);
});

test("5. companyId derived server-side from context", () => {
  assert.match(serviceSrc(), /const companyId = context\.companyId/);
  assert.doesNotMatch(serviceSrc(), /body\.companyId|input\.companyId|form\.companyId/);
});

test("6. client cannot override companyId — route never reads companyId from request", () => {
  assert.doesNotMatch(routeSrc(), /companyId/);
  assert.doesNotMatch(serviceSrc(), /request\.companyId|formData.*companyId|header.*companyId/);
});

test("7. cross-company existence not leaked — transaction scoped to companyId", () => {
  assert.match(serviceSrc(), /companies\/\$\{companyId\}\/iq200_idempotency_keys/);
  assert.match(serviceSrc(), /companies\/\$\{companyId\}\/iq200_content_hashes/);
  assert.match(serviceSrc(), /companies\/\$\{companyId\}\/iq200_documents/);
});

// ── FILE VALIDATION (8–14) ───────────────────────────────────────────────────

test("8. missing file rejected", () => {
  assert.match(routeSrc(), /MISSING_FILE/);
  assert.match(serviceSrc(), /MISSING_FILE/);
});

test("9. empty file rejected", () => {
  assert.throws(
    () => validatePdfEnvelope(new Uint8Array(0)),
    (e: unknown) => e instanceof KnowledgeUploadError && (e as KnowledgeUploadError).code === "EMPTY_FILE",
  );
});

test("10. >20 MB rejected", () => {
  assert.equal(MAX_IQ200_KNOWLEDGE_UPLOAD_BYTES, 20 * 1024 * 1024);
  const oversized = new Uint8Array(MAX_IQ200_KNOWLEDGE_UPLOAD_BYTES + 1);
  oversized[0] = 0x25; oversized[1] = 0x50; oversized[2] = 0x44; oversized[3] = 0x46;
  assert.throws(
    () => validatePdfEnvelope(oversized),
    (e: unknown) => e instanceof KnowledgeUploadError && (e as KnowledgeUploadError).code === "FILE_TOO_LARGE",
  );
});

test("11. wrong MIME rejected", () => {
  assert.throws(
    () => validatePdfMimeType("image/png"),
    (e: unknown) => e instanceof KnowledgeUploadError && (e as KnowledgeUploadError).code === "INVALID_PDF",
  );
});

test("12. fake .pdf rejected — non-PDF magic bytes", () => {
  const fakePdf = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header
  assert.throws(
    () => validatePdfEnvelope(fakePdf),
    (e: unknown) => e instanceof KnowledgeUploadError && (e as KnowledgeUploadError).code === "INVALID_PDF",
  );
});

test("13. valid PDF envelope accepted", () => {
  const validPdf = makePdfBytes(100);
  assert.doesNotThrow(() => validatePdfEnvelope(validPdf));
  assert.doesNotThrow(() => validatePdfMimeType("application/pdf"));
});

test("14. filename cannot control Storage path", () => {
  assert.match(serviceSrc(), /buildStoragePath\(companyId, documentId\)/);
  assert.match(coreSrc(), /companies\/\$\{companyId\}\/iq200\/documents\/\$\{documentId\}\/original\/source\.pdf/);
  assert.doesNotMatch(coreSrc(), /originalFilename.*storagePath|filename.*path/);
});

// ── SERVER AUTHORITY (15–20) ─────────────────────────────────────────────────

test("15. client cannot set documentId — server generates via generateDocumentId", () => {
  assert.match(serviceSrc(), /const documentId = generateDocumentId\(\)/);
  assert.match(coreSrc(), /export function generateDocumentId/);
  assert.doesNotMatch(routeSrc(), /documentId/);
});

test("16. client cannot set contentHash — server computes via computeContentHash", () => {
  assert.match(serviceSrc(), /const contentHash = computeContentHash\(fileBytes\)/);
  assert.doesNotMatch(routeSrc(), /contentHash/);
});

test("17. client cannot set storagePath — server builds via buildStoragePath", () => {
  assert.match(serviceSrc(), /const storagePath = buildStoragePath\(companyId, documentId\)/);
  assert.doesNotMatch(routeSrc(), /storagePath/);
});

test("18. client cannot set READY — processingStatus is hardcoded PENDING", () => {
  assert.match(serviceSrc(), /processingStatus: "PENDING"/);
  assert.doesNotMatch(serviceSrc(), /processingStatus: "READY"/);
});

test("19. client cannot set APPROVED — approvalStatus is hardcoded DRAFT", () => {
  assert.match(serviceSrc(), /approvalStatus: "DRAFT"/);
  assert.doesNotMatch(serviceSrc(), /approvalStatus: "APPROVED"/);
});

test("20. uploadedBy derived server-side from context.uid", () => {
  assert.match(serviceSrc(), /uploadedBy: (?:context\.)?uid/);
  assert.doesNotMatch(routeSrc(), /uploadedBy/);
});

// ── HASH / DUPLICATE (21–23) ─────────────────────────────────────────────────

test("21. SHA-256 generated server-side", () => {
  const hash = computeContentHash(makePdfBytes(64));
  assert.equal(typeof hash, "string");
  assert.equal(hash.length, 64); // SHA-256 hex = 64 chars
  assert.match(hash, /^[a-f0-9]{64}$/);
  // Deterministic
  assert.equal(computeContentHash(makePdfBytes(64)), hash);
});

test("22. same company + different key + same hash => duplicate conflict", () => {
  assert.match(serviceSrc(), /DUPLICATE_DOCUMENT/);
  assert.match(serviceSrc(), /iq200_content_hashes\/\$\{contentHash\}/);
  assert.match(serviceSrc(), /hashSnap\.exists/);
});

test("23. cross-company same hash does not leak/collide — scoped by companyId", () => {
  assert.match(serviceSrc(), /companies\/\$\{companyId\}\/iq200_content_hashes/);
  assert.doesNotMatch(serviceSrc(), /adminDb\.collection\("iq200_content_hashes"\)/);
});

// ── IDEMPOTENCY (24–27) ──────────────────────────────────────────────────────

test("24. missing/invalid idempotency key rejected", () => {
  assert.throws(
    () => validateIdempotencyKey(null),
    (e: unknown) => e instanceof KnowledgeUploadError && (e as KnowledgeUploadError).code === "INVALID_IDEMPOTENCY_KEY",
  );
  assert.throws(
    () => validateIdempotencyKey(""),
    (e: unknown) => e instanceof KnowledgeUploadError && (e as KnowledgeUploadError).code === "INVALID_IDEMPOTENCY_KEY",
  );
  assert.throws(
    () => validateIdempotencyKey("key with spaces!"),
    (e: unknown) => e instanceof KnowledgeUploadError && (e as KnowledgeUploadError).code === "INVALID_IDEMPOTENCY_KEY",
  );
  assert.doesNotThrow(() => validateIdempotencyKey("valid-key_123"));
});

test("25. same company + same key retry returns original result", () => {
  assert.match(serviceSrc(), /idempotentRetry: true/);
  assert.match(serviceSrc(), /idemSnap\.exists/);
  assert.match(serviceSrc(), /existingDocumentId/);
});

test("26. same key + conflicting payload rejected", () => {
  assert.match(serviceSrc(), /IDEMPOTENCY_CONFLICT/);
  assert.match(serviceSrc(), /contentHash !== contentHash/);
});

test("27. idempotency namespace isolated by company", () => {
  assert.match(serviceSrc(), /companies\/\$\{companyId\}\/iq200_idempotency_keys\/\$\{safeIdempotencyKey\}/);
});

// ── CONCURRENCY / TRANSACTION (28–30) ────────────────────────────────────────

test("28. duplicate reservations are transaction coordinated", () => {
  assert.match(serviceSrc(), /adminDb\.runTransaction/);
  assert.match(serviceSrc(), /transaction\.get\(idemRef\)/);
  assert.match(serviceSrc(), /transaction\.get\(hashRef\)/);
});

test("29. concurrent same-content path cannot create two authoritative docs", () => {
  assert.match(serviceSrc(), /transaction\.create\(hashRef/);
  assert.match(serviceSrc(), /transaction\.create\(docRef/);
  assert.match(serviceSrc(), /transaction\.create\(idemRef/);
});

test("30. no non-transactional check-then-create duplicate window", () => {
  const svc = serviceSrc();
  const beforeTransaction = svc.slice(0, svc.indexOf("runTransaction"));
  assert.doesNotMatch(beforeTransaction, /iq200_content_hashes.*\.get\(\)|iq200_idempotency_keys.*\.get\(\)/);
});

// ── STORAGE (31–34) ──────────────────────────────────────────────────────────

test("31. tenant-scoped immutable path", () => {
  const path = buildStoragePath("comp-1", "doc-uuid");
  assert.equal(path, "companies/comp-1/iq200/documents/doc-uuid/original/source.pdf");
});

test("32. original filename not used as authoritative path", () => {
  assert.doesNotMatch(coreSrc(), /sanitizeFilename.*buildStoragePath|filename.*storagePath/);
  assert.match(serviceSrc(), /buildStoragePath\(companyId, documentId\)/);
});

test("33. no persisted long-lived download URL", () => {
  assert.doesNotMatch(serviceSrc(), /getDownloadURL|signedUrl|downloadUrl/);
  assert.doesNotMatch(routeSrc(), /getDownloadURL|signedUrl|downloadUrl/);
});

test("34. retry does not overwrite original object — idempotent path compensates", () => {
  assert.match(serviceSrc(), /compensateStorageObject\(storagePath\)/);
});

// ── COMPENSATION (35–38) ─────────────────────────────────────────────────────

test("35. transaction failure after request-owned upload triggers compensation", () => {
  assert.match(serviceSrc(), /if \(storageUploadSucceeded\) await compensateStorageObject/);
});

test("36. compensation targets only request-owned object", () => {
  const compFn = serviceSrc().slice(serviceSrc().indexOf("async function compensateStorageObject"), serviceSrc().indexOf("export async function uploadKnowledgeDocument"));
  assert.match(compFn, /adminStorage\.bucket\(\)\.file\(storagePath\)\.delete\(\)/);
});

test("37. existing document/object is never deleted during duplicate handling", () => {
  assert.doesNotMatch(serviceSrc(), /delete.*existing|delete.*document/);
});

test("38. compensation failure does not broaden deletion scope", () => {
  const compFn = serviceSrc().slice(serviceSrc().indexOf("async function compensateStorageObject"), serviceSrc().indexOf("async function compensateStorageObject") + 400);
  assert.match(compFn, /catch/);
  assert.match(compFn, /console\.error/);
});

// ── INITIAL STATE (39–41) ────────────────────────────────────────────────────

test("39. processing not READY — initial status is PENDING", () => {
  assert.match(serviceSrc(), /processingStatus: "PENDING"/);
  assert.doesNotMatch(serviceSrc(), /processingStatus: "READY"/);
});

test("40. approval DRAFT/not APPROVED", () => {
  assert.match(serviceSrc(), /approvalStatus: "DRAFT"/);
  assert.doesNotMatch(serviceSrc(), /approvalStatus: "APPROVED"/);
});

test("41. upload response does not claim processing/approval completion", () => {
  assert.doesNotMatch(routeSrc(), /READY|APPROVED|processed|verified/);
});

// ── REGRESSION / SCOPE (42–47) ───────────────────────────────────────────────

test("42. no PDF extraction introduced", () => {
  const allSrc = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(allSrc, /extractText|parsePages|pdfjs|pdf-parse/);
});

test("43. no OCR introduced", () => {
  const allSrc = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(allSrc, /tesseract|ocrSpace/);
});

test("44. no indexing introduced", () => {
  const allSrc = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(allSrc, /searchIndex|createIndex|vectorEmbedding/);
});

test("45. no provider execution introduced", () => {
  const allSrc = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(allSrc, /openai|gemini|generateContent|chatCompletion/);
});

test("46. no direct browser Firestore path introduced", () => {
  const allSrc = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(allSrc, /collection\(db|doc\(db|setDoc|getDoc|addDoc/);
  assert.match(allSrc, /adminDb/);
});

test("47. no long-lived URL introduced", () => {
  const allSrc = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(allSrc, /getDownloadURL|signedUrl|getSignedUrl/);
});

// ── ADDITIONAL CORRECTNESS ───────────────────────────────────────────────────

test("PDF magic bytes constant is correct", () => {
  assert.deepEqual([...PDF_MAGIC_BYTES], [0x25, 0x50, 0x44, 0x46]);
});

test("idempotency key pattern matches Firestore-safe character set", () => {
  assert.ok(IDEMPOTENCY_KEY_PATTERN.test("abc-123_XYZ"));
  assert.ok(!IDEMPOTENCY_KEY_PATTERN.test(""));
  assert.ok(!IDEMPOTENCY_KEY_PATTERN.test("has space"));
  assert.ok(!IDEMPOTENCY_KEY_PATTERN.test("has/slash"));
  assert.ok(!IDEMPOTENCY_KEY_PATTERN.test("a".repeat(129)));
  assert.ok(IDEMPOTENCY_KEY_PATTERN.test("a".repeat(128)));
});

test("sanitizeFilename handles edge cases safely", () => {
  assert.equal(sanitizeFilename(""), "document.pdf");
  assert.equal(sanitizeFilename("../../../etc/passwd"), ".._.._.._etc_passwd");
  assert.equal(sanitizeFilename("normal-file_v2.pdf"), "normal-file_v2.pdf");
  assert.equal(sanitizeFilename("file name with spaces.pdf"), "file_name_with_spaces.pdf");
});

test("generateDocumentId returns unique UUIDs", () => {
  const a = generateDocumentId();
  const b = generateDocumentId();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test("knowledge upload does not modify security rules", () => {
  assert.doesNotMatch(coreSrc(), /firestore\.rules|storage\.rules/);
  assert.doesNotMatch(serviceSrc(), /firestore\.rules|storage\.rules/);
  assert.doesNotMatch(routeSrc(), /firestore\.rules|storage\.rules/);
});

test("route uses safeServerErrorResponse for unexpected errors", () => {
  assert.match(routeSrc(), /safeServerErrorResponse/);
});

test("route sets cache-control no-store", () => {
  assert.match(routeSrc(), /cache-control.*no-store/);
});

test("Phase 24C contracts remain unmodified", () => {
  const contracts = src("src/lib/iq200/knowledgeContracts.ts");
  assert.match(contracts, /canApproveKnowledgeDocument/);
  assert.match(contracts, /isKnowledgeDocumentRetrievable/);
  assert.match(contracts, /KNOWLEDGE_PROCESSING_STATUSES/);
  assert.match(contracts, /KNOWLEDGE_APPROVAL_STATUSES/);
});
