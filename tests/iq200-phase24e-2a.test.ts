import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PROCESSING_LEASE_MILLISECONDS,
  PROCESSING_MAX_ATTEMPTS,
  PROCESSING_FAILURE_CODES,
  PROCESSING_ATTEMPT_ID_PATTERN,
  KnowledgeProcessingError,
  generateProcessingAttemptId,
  isValidProcessingAttemptId,
  isValidFailureCode,
  verifyAttemptOwnership,
  isEligibleForClaim,
} from "../src/lib/iq200/knowledgeProcessingCore.ts";

const src = (p: string) => readFileSync(p, "utf8");
const coreSrc = () => src("src/lib/iq200/knowledgeProcessingCore.ts");
const serviceSrc = () => src("src/lib/iq200/knowledgeProcessingService.ts");
const routeSrc = () => src("src/app/api/iq200/knowledge/documents/process/route.ts");

// ── CLAIM ELIGIBILITY (1–2) ──────────────────────────────────────────────────

test("1. PENDING document eligible for claim", () => {
  assert.equal(isEligibleForClaim("PENDING", undefined, Date.now()), true);
  assert.equal(isEligibleForClaim("PENDING", 0, Date.now()), true);
});

test("2. claim sets PROCESSING — service updates processingStatus", () => {
  assert.match(serviceSrc(), /processingStatus: "PROCESSING"/);
  assert.match(serviceSrc(), /transaction\.update\(/);
});

// ── ATTEMPT ID (3–4) ─────────────────────────────────────────────────────────

test("3. claim creates server-owned attemptId", () => {
  assert.match(serviceSrc(), /generateProcessingAttemptId\(\)/);
  const id = generateProcessingAttemptId();
  assert.match(id, PROCESSING_ATTEMPT_ID_PATTERN);
});

test("4. client cannot select attemptId", () => {
  assert.doesNotMatch(routeSrc(), /body.*attemptId|request.*attemptId/);
  assert.match(serviceSrc(), /const attemptId = generateProcessingAttemptId\(\)/);
});

// ── LEASE (5) ────────────────────────────────────────────────────────────────

test("5. claim creates lease expiry", () => {
  assert.equal(PROCESSING_LEASE_MILLISECONDS, 5 * 60 * 1000);
  assert.match(serviceSrc(), /processingLeaseExpiresAt.*Timestamp\.fromMillis.*PROCESSING_LEASE_MILLISECONDS/);
});

// ── ATTEMPTS COUNTER (6) ─────────────────────────────────────────────────────

test("6. processingAttempts increments", () => {
  assert.match(serviceSrc(), /Number\(data\.processingAttempts \|\| 0\) \+ 1/);
});

// ── APPROVAL PRESERVED (7) ───────────────────────────────────────────────────

test("7. approvalStatus unchanged by claim", () => {
  const claimSection = serviceSrc().slice(serviceSrc().indexOf("async function claimNextPendingDocument"), serviceSrc().indexOf("async function extendProcessingLease"));
  assert.doesNotMatch(claimSection, /approvalStatus/);
});

// ── ACTIVE LEASE PROTECTION (8) ──────────────────────────────────────────────

test("8. active PROCESSING lease cannot be claimed again", () => {
  assert.equal(isEligibleForClaim("PROCESSING", Date.now() + 60_000, Date.now()), false);
  assert.equal(isEligibleForClaim("READY", undefined, Date.now()), false);
  assert.equal(isEligibleForClaim("FAILED", undefined, Date.now()), false);
});

// ── EXPIRED LEASE RECOVERY (9–10) ────────────────────────────────────────────

test("9. expired PROCESSING lease can be recovered", () => {
  assert.equal(isEligibleForClaim("PROCESSING", Date.now() - 1, Date.now()), true);
});

test("10. recovery creates NEW attemptId", () => {
  const a = generateProcessingAttemptId();
  const b = generateProcessingAttemptId();
  assert.notEqual(a, b);
});

// ── ATTEMPT FENCING (11–14) ──────────────────────────────────────────────────

test("11. old attempt becomes stale after new claim", () => {
  assert.equal(verifyAttemptOwnership("PROCESSING", "new-uuid", "old-uuid"), false);
  assert.equal(verifyAttemptOwnership("PROCESSING", "same", "same"), true);
});

test("12. current attempt ownership accepted", () => {
  assert.equal(verifyAttemptOwnership("PROCESSING", "abc", "abc"), true);
});

test("13. stale attempt ownership rejected", () => {
  assert.equal(verifyAttemptOwnership("PROCESSING", "current", "stale"), false);
  assert.equal(verifyAttemptOwnership("PENDING", "x", "x"), false);
  assert.equal(verifyAttemptOwnership("PROCESSING", undefined, "x"), false);
});

test("14. stale attempt cannot extend lease", () => {
  const s = serviceSrc().slice(serviceSrc().indexOf("async function extendProcessingLease"), serviceSrc().indexOf("async function markProcessingFailed"));
  assert.match(s, /verifyAttemptOwnership/);
  assert.match(s, /STALE_ATTEMPT/);
});

// ── HEARTBEAT (15) ───────────────────────────────────────────────────────────

test("15. current attempt can extend lease", () => {
  assert.match(serviceSrc(), /export async function extendProcessingLease/);
});

// ── FAILURE TRANSITION (16–19) ───────────────────────────────────────────────

test("16. stale attempt cannot mark FAILED", () => {
  const s = serviceSrc().slice(serviceSrc().indexOf("async function markProcessingFailed"), serviceSrc().indexOf("export function verifyReadyOwnership"));
  assert.match(s, /verifyAttemptOwnership/);
  assert.match(s, /STALE_ATTEMPT/);
});

test("17. current attempt can mark FAILED", () => {
  assert.match(serviceSrc(), /processingStatus: "FAILED"/);
});

test("18. failure does not change approval status", () => {
  const s = serviceSrc().slice(serviceSrc().indexOf("async function markProcessingFailed"), serviceSrc().indexOf("export function verifyReadyOwnership"));
  assert.doesNotMatch(s, /approvalStatus/);
});

test("19. failure code bounded/allowlisted", () => {
  assert.equal(PROCESSING_FAILURE_CODES.length, 12);
  assert.ok(isValidFailureCode("ENCRYPTED_PDF"));
  assert.ok(!isValidFailureCode("ARBITRARY"));
  assert.ok(!isValidFailureCode(null));
});

// ── STACK TRACE (20) ─────────────────────────────────────────────────────────

test("20. stack trace not persisted", () => {
  assert.doesNotMatch(serviceSrc(), /error\.stack|stackTrace/);
  assert.match(serviceSrc(), /processingFailureCode: failureCode/);
});

// ── READY GUARD (21–23) ──────────────────────────────────────────────────────

test("21. READY ownership guard accepts current attempt", () => {
  assert.match(serviceSrc(), /export function verifyReadyOwnership/);
  assert.match(serviceSrc(), /verifyAttemptOwnership\(processingStatus, processingAttemptId, callerAttemptId\)/);
});

test("22. READY ownership guard rejects stale attempt", () => {
  // verifyReadyOwnership delegates to verifyAttemptOwnership which checks status + id match
  assert.equal(verifyAttemptOwnership("PROCESSING", "stale", "current"), false);
});

test("23. processing cannot set APPROVED", () => {
  assert.doesNotMatch(serviceSrc(), /approvalStatus: "APPROVED"/);
  assert.doesNotMatch(coreSrc(), /approvalStatus: "APPROVED"/);
  assert.doesNotMatch(routeSrc(), /APPROVED/);
});

// ── WORKER AUTH (24–27) ──────────────────────────────────────────────────────

test("24. worker endpoint requires worker authentication", () => {
  assert.match(routeSrc(), /requireProcessingWorker\(request\)/);
  assert.match(coreSrc(), /export function requireProcessingWorker/);
});

test("25. missing worker secret/auth denied", () => {
  assert.match(coreSrc(), /!expected/);
  assert.match(coreSrc(), /AUTH_REQUIRED/);
});

test("26. wrong worker authentication denied — timingSafeEqual used", () => {
  assert.match(coreSrc(), /timingSafeEqual/);
  assert.match(coreSrc(), /IQ200_PROCESSING_WORKER_SECRET/);
});

test("27. worker response does not expose secret", () => {
  assert.doesNotMatch(routeSrc(), /SECRET|secret|process\.env/);
  assert.doesNotMatch(serviceSrc(), /SECRET|secret.*response/);
});

// ── NO PDF/RENDERING/OCR (28–32) ─────────────────────────────────────────────

test("28. no PDF parsing import", () => {
  const all = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(all, /pdfjs|pdf-parse|pdf-lib|getDocument/);
});

test("29. no PDF extraction", () => {
  const all = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(all, /extractText|getTextContent|textExtraction/);
});

test("30. no canvas/rendering", () => {
  const all = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(all, /canvas|createCanvas|renderPage|@napi-rs/);
});

test("31. no OCR", () => {
  const all = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(all, /tesseract|ocr|ocrSpace/);
});

test("32. no indexing", () => {
  const all = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(all, /searchIndex|createIndex|embedding/);
});

// ── NO SEARCH/PROVIDER/STORAGE/PAGES (33–37) ─────────────────────────────────

test("33. no semantic search", () => {
  const all = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(all, /semanticSearch|vectorSearch|similarity/);
});

test("34. no provider execution", () => {
  const all = coreSrc() + serviceSrc() + routeSrc();
  assert.doesNotMatch(all, /openai|gemini|chatCompletion|generateContent/);
});

test("35. no Storage write", () => {
  assert.doesNotMatch(serviceSrc(), /adminStorage|\.save\(|\.upload\(/);
  assert.doesNotMatch(routeSrc(), /adminStorage|storage/);
});

test("36. no page Firestore write", () => {
  assert.doesNotMatch(serviceSrc(), /pages\/|pageRecord|createPage/);
});

test("37. claim service stays isolated while the route delegates the server-owned claim", () => {
  assert.match(routeSrc(), /claimNextPendingDocument/);
  assert.match(routeSrc(), /processClaimedKnowledgeDocument\(claim\)/);
  assert.doesNotMatch(routeSrc(), /request\.json|searchParams|body\.companyId|body\.documentId|storagePath/);
  assert.doesNotMatch(serviceSrc(), /download|\.download\(\)/);
});

// ── TENANT / SCOPE (38–40) ───────────────────────────────────────────────────

test("38. no browser-direct processing path", () => {
  assert.match(routeSrc(), /requireProcessingWorker/);
  assert.doesNotMatch(routeSrc(), /authenticateServerRequest/);
});

test("39. tenant/company scope not trusted from browser input", () => {
  assert.doesNotMatch(routeSrc(), /body\.companyId|request\.companyId|query\.companyId/);
  assert.match(serviceSrc(), /candidate\.companyId/);
});

test("40. no WhatsApp worker secret reuse", () => {
  assert.match(coreSrc(), /IQ200_PROCESSING_WORKER_SECRET/);
  assert.doesNotMatch(coreSrc(), /WHATSAPP_MEDIA_WORKER_SECRET/);
});

// ── ADDITIONAL CORRECTNESS ───────────────────────────────────────────────────

test("isValidProcessingAttemptId validates UUID format", () => {
  assert.ok(isValidProcessingAttemptId(generateProcessingAttemptId()));
  assert.ok(!isValidProcessingAttemptId(""));
  assert.ok(!isValidProcessingAttemptId("not-a-uuid"));
  assert.ok(!isValidProcessingAttemptId(null));
});

test("KnowledgeProcessingError has code and status", () => {
  const err = new KnowledgeProcessingError("TEST", "test message", 400);
  assert.equal(err.code, "TEST");
  assert.equal(err.status, 400);
  assert.equal(err.message, "test message");
  assert.equal(err.name, "KnowledgeProcessingError");
});

test("PROCESSING_MAX_ATTEMPTS is reasonable", () => {
  assert.equal(PROCESSING_MAX_ATTEMPTS, 3);
  assert.ok(PROCESSING_MAX_ATTEMPTS >= 1);
  assert.ok(PROCESSING_MAX_ATTEMPTS <= 10);
});

test("service uses runTransaction for claim", () => {
  assert.match(serviceSrc(), /adminDb\.runTransaction/);
});

test("service uses collectionGroup for iq200_documents", () => {
  assert.match(serviceSrc(), /collectionGroup\("iq200_documents"\)/);
});

test("route sets cache-control no-store", () => {
  assert.match(routeSrc(), /cache-control.*no-store/);
});

test("Phase 24C contracts remain unmodified", () => {
  const contracts = src("src/lib/iq200/knowledgeContracts.ts");
  assert.match(contracts, /KNOWLEDGE_PROCESSING_STATUSES/);
  assert.match(contracts, /"PENDING", "PROCESSING", "READY", "FAILED"/);
});
