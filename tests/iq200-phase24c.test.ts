import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  KNOWLEDGE_DOCUMENT_TYPES, KNOWLEDGE_PROCESSING_STATUSES, KNOWLEDGE_APPROVAL_STATUSES,
  KNOWLEDGE_TRUST_LABELS, KNOWLEDGE_VERIFICATION_STATES, KNOWLEDGE_EVIDENCE_CATEGORY,
  canApproveKnowledgeDocument, canInactivateKnowledgeDocument, canRejectKnowledgeDocument,
  isKnowledgeDocumentRetrievable, isKnowledgeDocumentType, isKnowledgeProcessingStatus,
  isKnowledgeApprovalStatus, isKnowledgeTrustLabel, isKnowledgeVerificationState,
  trustLabelForEvidenceCategory,
} from "../src/lib/iq200/knowledgeContracts.ts";
import {
  KNOWLEDGE_ID, KNOWLEDGE_EXCERPT_MAX,
  validatePageIndex, validatePageIdentity, validateKnowledgeDocumentMetadata,
  validateTechnicalCitation, validateWiringEvidence, validatePhysicalCheckPoint,
} from "../src/lib/iq200/knowledgeValidation.ts";

const src = (p: string) => readFileSync(p, "utf8");
const validCitation = () => ({ documentId: "doc-1", documentTitle: "Volvo FH16 Workshop Manual", publicationNumber: "VOLVO-FH16-WM-2024", documentVersion: "3.1", manufacturer: "Volvo", pageIndex: 127, displayPageNumber: "4-32", excerpt: "Measure rail pressure at the test port.", sourceReference: "Volvo FH16 Manual, Section 4.3, Page 4-32", evidenceCategory: "TECHNICAL_DOCUMENT" as const, trustLabel: "VERIFIED_SOURCE" as const, approvalStatus: "APPROVED" as const });
const validMetadata = (o: Record<string, unknown> = {}) => ({ title: "Volvo FH16 Manual", description: "Workshop manual", manufacturer: "Volvo", vehicleMake: "Volvo", vehicleModel: "FH16", vehicleSeries: "", system: "Engine", subsystem: "", component: "", documentType: "workshop_manual", documentVersion: "3.1", publicationNumber: "VOLVO-FH16", referenceNumber: "", language: "en", sourceFileName: "manual.pdf", mimeType: "application/pdf", fileSize: 52428800, pageCount: 450, approvalStatus: "DRAFT", processingStatus: "PENDING", storageReference: "companies/comp_001/iq200/documents/doc-1/original/manual.pdf", contentHash: "sha256-abc123", ...o });

test("knowledge document types are exactly the expected set", () => {
  assert.deepEqual([...KNOWLEDGE_DOCUMENT_TYPES], ["workshop_manual", "wiring_diagram", "electrical_manual", "fault_code_doc", "service_procedure", "technical_bulletin", "component_manual", "technical_reference"]);
});
test("valid document types accepted, unknown rejected", () => {
  for (const t of KNOWLEDGE_DOCUMENT_TYPES) assert.equal(isKnowledgeDocumentType(t), true);
  assert.equal(isKnowledgeDocumentType("recipe_book"), false);
  assert.equal(isKnowledgeDocumentType(""), false);
  assert.equal(isKnowledgeDocumentType(null), false);
});
test("processing states exact set, unknown rejected", () => {
  assert.deepEqual([...KNOWLEDGE_PROCESSING_STATUSES], ["PENDING", "PROCESSING", "READY", "FAILED"]);
  assert.equal(isKnowledgeProcessingStatus("COMPLETE"), false);
});
test("approval states exact set, unknown rejected", () => {
  assert.deepEqual([...KNOWLEDGE_APPROVAL_STATUSES], ["DRAFT", "APPROVED", "REJECTED", "INACTIVE"]);
  assert.equal(isKnowledgeApprovalStatus("PUBLISHED"), false);
});
test("DRAFT + READY can approve", () => { assert.equal(canApproveKnowledgeDocument({ processingStatus: "READY", approvalStatus: "DRAFT" }), true); });
test("DRAFT + PENDING cannot approve", () => { assert.equal(canApproveKnowledgeDocument({ processingStatus: "PENDING", approvalStatus: "DRAFT" }), false); });
test("DRAFT + PROCESSING cannot approve", () => { assert.equal(canApproveKnowledgeDocument({ processingStatus: "PROCESSING", approvalStatus: "DRAFT" }), false); });
test("DRAFT + FAILED cannot approve", () => { assert.equal(canApproveKnowledgeDocument({ processingStatus: "FAILED", approvalStatus: "DRAFT" }), false); });
test("APPROVED cannot approve again", () => { assert.equal(canApproveKnowledgeDocument({ processingStatus: "READY", approvalStatus: "APPROVED" }), false); });
test("REJECTED cannot approve directly", () => { assert.equal(canApproveKnowledgeDocument({ processingStatus: "READY", approvalStatus: "REJECTED" }), false); });
test("INACTIVE cannot approve directly", () => { assert.equal(canApproveKnowledgeDocument({ processingStatus: "READY", approvalStatus: "INACTIVE" }), false); });
test("only APPROVED can be inactivated", () => {
  assert.equal(canInactivateKnowledgeDocument({ processingStatus: "READY", approvalStatus: "APPROVED" }), true);
  assert.equal(canInactivateKnowledgeDocument({ processingStatus: "READY", approvalStatus: "DRAFT" }), false);
});
test("only DRAFT can be rejected", () => {
  assert.equal(canRejectKnowledgeDocument({ processingStatus: "READY", approvalStatus: "DRAFT" }), true);
  assert.equal(canRejectKnowledgeDocument({ processingStatus: "READY", approvalStatus: "APPROVED" }), false);
});
test("READY + APPROVED retrievable", () => { assert.equal(isKnowledgeDocumentRetrievable({ processingStatus: "READY", approvalStatus: "APPROVED" }), true); });
test("READY + DRAFT not retrievable", () => { assert.equal(isKnowledgeDocumentRetrievable({ processingStatus: "READY", approvalStatus: "DRAFT" }), false); });
test("PROCESSING + APPROVED not retrievable", () => { assert.equal(isKnowledgeDocumentRetrievable({ processingStatus: "PROCESSING", approvalStatus: "APPROVED" }), false); });
test("FAILED + APPROVED not retrievable", () => { assert.equal(isKnowledgeDocumentRetrievable({ processingStatus: "FAILED", approvalStatus: "APPROVED" }), false); });
test("READY + REJECTED not retrievable", () => { assert.equal(isKnowledgeDocumentRetrievable({ processingStatus: "READY", approvalStatus: "REJECTED" }), false); });

test("TECHNICAL_DOCUMENT + APPROVED maps to VERIFIED_SOURCE", () => { assert.equal(trustLabelForEvidenceCategory("TECHNICAL_DOCUMENT", "APPROVED"), "VERIFIED_SOURCE"); });
test("AI_INFERENCE never maps to VERIFIED_SOURCE", () => { assert.notEqual(trustLabelForEvidenceCategory("AI_INFERENCE"), "VERIFIED_SOURCE"); assert.notEqual(trustLabelForEvidenceCategory("AI_INFERENCE", "APPROVED"), "VERIFIED_SOURCE"); });
test("KNOWN_FIX + APPROVED maps to APPROVED_KNOWN_FIX", () => { assert.equal(trustLabelForEvidenceCategory("KNOWN_FIX", "APPROVED"), "APPROVED_KNOWN_FIX"); });
test("RELATED_HISTORY maps to HISTORICAL_JOB", () => { assert.equal(trustLabelForEvidenceCategory("RELATED_HISTORY"), "HISTORICAL_JOB"); });
test("unknown category maps to NOT_VERIFIED", () => { assert.equal(trustLabelForEvidenceCategory("UNKNOWN"), "NOT_VERIFIED"); });
test("trust labels exact set", () => { assert.deepEqual([...KNOWLEDGE_TRUST_LABELS], ["VERIFIED_SOURCE", "APPROVED_KNOWN_FIX", "HISTORICAL_JOB", "AI_INFERENCE", "NOT_VERIFIED"]); });
test("verification states exact set", () => { assert.deepEqual([...KNOWLEDGE_VERIFICATION_STATES], ["SOURCE_VERIFIED", "SOURCE_PARTIAL", "UNVERIFIED"]); });
test("unknown verification state rejected", () => { assert.equal(isKnowledgeVerificationState("GUESSED"), false); });
test("pageIndex 0 accepted", () => { assert.equal(validatePageIndex(0), 0); });
test("negative pageIndex rejected", () => { assert.throws(() => validatePageIndex(-1)); });
test("non-integer pageIndex rejected", () => { assert.throws(() => validatePageIndex(1.5)); });
test("non-number pageIndex rejected", () => { assert.throws(() => validatePageIndex("3")); });
test("nonnumeric displayPageNumber accepted", () => { assert.equal(validatePageIdentity({ documentId: "doc-1", pageIndex: 5, displayPageNumber: "iv", contentHash: "abc" }).displayPageNumber, "iv"); });
test("displayPageNumber A-3 accepted", () => { assert.equal(validatePageIdentity({ documentId: "doc-1", pageIndex: 10, displayPageNumber: "A-3", contentHash: "abc" }).displayPageNumber, "A-3"); });
test("valid citation accepted", () => { const c = validateTechnicalCitation(validCitation()); assert.equal(c.evidenceCategory, "TECHNICAL_DOCUMENT"); assert.equal(c.trustLabel, "VERIFIED_SOURCE"); assert.equal(c.approvalStatus, "APPROVED"); });
test("citation preserves pageIndex separately from displayPageNumber", () => { const c = validateTechnicalCitation({ ...validCitation(), pageIndex: 0, displayPageNumber: "cover" }); assert.equal(c.pageIndex, 0); assert.equal(c.displayPageNumber, "cover"); });
test("citation requires TECHNICAL_DOCUMENT category", () => { assert.throws(() => validateTechnicalCitation({ ...validCitation(), evidenceCategory: "CURRENT_JOB" })); });
test("citation requires APPROVED source state", () => { assert.throws(() => validateTechnicalCitation({ ...validCitation(), approvalStatus: "DRAFT" })); });
test("oversized excerpt rejected", () => { assert.throws(() => validateTechnicalCitation({ ...validCitation(), excerpt: "x".repeat(KNOWLEDGE_EXCERPT_MAX + 1) })); });
test("malformed documentId rejected", () => { assert.throws(() => validateTechnicalCitation({ ...validCitation(), documentId: "../escape" })); });
test("WiringEvidence allows absent optional fields", () => { const w = validateWiringEvidence({ sourceCitation: validCitation(), verificationState: "SOURCE_VERIFIED" }); assert.equal(w.wireColour, undefined); assert.equal(w.connectorPin, undefined); });
test("WiringEvidence does not default wireColour", () => { assert.equal("wireColour" in validateWiringEvidence({ sourceCitation: validCitation(), verificationState: "SOURCE_VERIFIED" }), false); });
test("WiringEvidence does not default connectorPin", () => { assert.equal("connectorPin" in validateWiringEvidence({ sourceCitation: validCitation(), verificationState: "SOURCE_VERIFIED" }), false); });
test("unknown verification state rejected in wiring", () => { assert.throws(() => validateWiringEvidence({ sourceCitation: validCitation(), verificationState: "GUESSED" })); });
test("PhysicalCheckPoint allows absent expectedValue", () => { assert.equal(validatePhysicalCheckPoint({ checkDescription: "Check voltage", sourceCitation: validCitation(), verificationState: "SOURCE_VERIFIED" }).expectedValue, undefined); });
test("PhysicalCheckPoint does not default expectedValue", () => { assert.equal("expectedValue" in validatePhysicalCheckPoint({ checkDescription: "Check", sourceCitation: validCitation(), verificationState: "UNVERIFIED" }), false); });
test("PhysicalCheckPoint requires source citation", () => { assert.throws(() => validatePhysicalCheckPoint({ checkDescription: "Check", verificationState: "SOURCE_VERIFIED" })); });
test("valid metadata accepted", () => { const m = validateKnowledgeDocumentMetadata(validMetadata()); assert.equal(m.documentType, "workshop_manual"); });
test("unknown document type rejected in metadata", () => { assert.throws(() => validateKnowledgeDocumentMetadata(validMetadata({ documentType: "novel" }))); });
test("unknown processing state rejected", () => { assert.throws(() => validateKnowledgeDocumentMetadata(validMetadata({ processingStatus: "DONE" }))); });
test("unknown approval state rejected", () => { assert.throws(() => validateKnowledgeDocumentMetadata(validMetadata({ approvalStatus: "PUBLISHED" }))); });


// ─── Security Boundary Tests ─────────────────────────────────────────────────

test("knowledge contracts module has no Firebase/Storage/API imports", () => {
  const contracts = src("src/lib/iq200/knowledgeContracts.ts");
  const importLines = contracts.split("\n").filter(line => line.trim().startsWith("import"));
  const joined = importLines.join("\n");
  assert.doesNotMatch(joined, /firebase|firestore|adminDb|adminStorage|getAuth/i);
});
test("knowledge validation module has no Firebase/Storage/API imports", () => {
  const validation = src("src/lib/iq200/knowledgeValidation.ts");
  assert.doesNotMatch(validation, /firebase|firestore|adminDb|adminStorage|getAuth|import.*route/i);
});
test("existing IQ200 reasoning evidence categories not weakened", () => {
  const reasoning = src("src/lib/iq200/reasoningCore.ts");
  assert.match(reasoning, /CURRENT_JOB/);
  assert.match(reasoning, /KNOWN_FIX/);
  assert.match(reasoning, /RELATED_HISTORY/);
});
test("knowledge permissions additive — existing IQ200 permissions preserved", () => {
  const perms = src("src/lib/permissions.ts");
  assert.match(perms, /Use IQ200 Technician Assist/);
  assert.match(perms, /View IQ200 Known Fixes/);
  assert.match(perms, /Manage IQ200 Known Fixes/);
  assert.match(perms, /Approve IQ200 Known Fixes/);
  assert.match(perms, /View IQ200 Knowledge/);
  assert.match(perms, /Upload IQ200 Knowledge/);
  assert.match(perms, /Manage IQ200 Knowledge/);
  assert.match(perms, /Approve IQ200 Knowledge/);
});
test("knowledge ID pattern matches existing IQ200 conventions", () => {
  assert.ok(KNOWLEDGE_ID instanceof RegExp);
  assert.ok(KNOWLEDGE_ID.test("valid-id-123"));
  assert.ok(!KNOWLEDGE_ID.test("../escape"));
  assert.ok(!KNOWLEDGE_ID.test(""));
});

test("READY + INACTIVE not retrievable", () => { assert.equal(isKnowledgeDocumentRetrievable({ processingStatus: "READY", approvalStatus: "INACTIVE" }), false); });
