import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { buildKnowledgePageId, hashProcessingContent } from "../src/lib/iq200/knowledgePageProcessingCore.ts";
import { createRetrievalCitation, evidenceReferenceFor, retrieveKnowledgePages, scoreRetrievalCandidate, validateRetrievalCandidate, validateRetrievalCitation } from "../src/lib/iq200/knowledgeRetrievalCore.ts";
import { MAX_REASONING_EVIDENCE_LENGTH, type RetrievalCandidate } from "../src/lib/iq200/knowledgeRetrievalContracts.ts";

function fixture(id = "doc-a", text = "Inspect fuel pressure sensor voltage P0087.", index = 0): RetrievalCandidate {
  return { document: { companyId: "company-a", documentId: id, title: "Fuel pressure diagnostic", originalFilename: "manual.pdf", contentHash: hashProcessingContent(id), processingStatus: "READY", approvalStatus: "APPROVED", publishedProcessingAttemptId: "attempt-a", publishedProcessingInvocationId: "invocation-a" },
    page: { documentId: id, pageId: buildKnowledgePageId(index), pageIndex: index, displayPageNumber: String(index + 1), extractedText: text, textContentHash: hashProcessingContent(text), processingAttemptId: "attempt-a", processingInvocationId: "invocation-a" } };
}
const query = { question: "fuel pressure", faultCodes: ["P0087"] };
const citation = () => createRetrievalCitation("company-a", fixture(), query)!;

test("READY APPROVED and matching tenant/published ownership accepted", () => assert.equal(validateRetrievalCandidate("company-a", fixture()), true));
for (const processing of ["PENDING", "PROCESSING", "FAILED", "UNKNOWN", undefined]) test(`processing ${processing} fails closed`, () => { const c = fixture(); c.document.processingStatus = processing; assert.equal(validateRetrievalCandidate("company-a", c), false); });
for (const approval of ["DRAFT", "REJECTED", "INACTIVE", "UNKNOWN", undefined]) test(`approval ${approval} fails closed`, () => { const c = fixture(); c.document.approvalStatus = approval; assert.equal(validateRetrievalCandidate("company-a", c), false); });
test("cross-company and forged document company cannot create evidence", () => { const c = fixture(); assert.equal(createRetrievalCitation("company-b", c, query), null); c.document.companyId = "company-b"; assert.equal(createRetrievalCitation("company-a", c, query), null); });
test("canonical page 1 and displayed number", () => { assert.equal(citation().pageId, "page-000001"); assert.equal(citation().pageIndex, 0); assert.equal(citation().displayPageNumber, "1"); });
for (const [field, value] of [["pageId", "page-0001"], ["displayPageNumber", "0"], ["pageIndex", -1], ["pageIndex", 0.5], ["documentId", "doc-other"]] as const) test(`reject malformed page ${field}=${value}`, () => { const c = fixture(); Object.assign(c.page, { [field]: value }); assert.equal(validateRetrievalCandidate("company-a", c), false); });
for (const field of ["processingAttemptId", "processingInvocationId"] as const) test(`reject stale ${field}`, () => { const c = fixture(); c.page[field] = "old"; assert.equal(validateRetrievalCandidate("company-a", c), false); });
for (const field of ["publishedProcessingAttemptId", "publishedProcessingInvocationId"] as const) test(`reject missing ${field}`, () => { const c = fixture(); c.document[field] = ""; assert.equal(validateRetrievalCandidate("company-a", c), false); });
test("changed text old hash and malformed document hash rejected", () => { const c = fixture(); c.page.extractedText += " forged"; assert.equal(validateRetrievalCandidate("company-a", c), false); c.page.textContentHash = hashProcessingContent(c.page.extractedText); c.document.contentHash = "invalid"; assert.equal(validateRetrievalCandidate("company-a", c), false); });
test("excerpt is exact source substring and forged excerpt rejected", () => { const c = fixture(); const value = citation(); assert.ok(c.page.extractedText.includes(value.excerpt)); assert.equal(validateRetrievalCitation("company-a", c, query, value), true); assert.equal(validateRetrievalCitation("company-a", c, query, { ...value, excerpt: "Invented repair" }), false); });
for (const field of ["documentId", "pageId"] as const) test(`supporting reference forged ${field} rejected`, () => { const value = citation(); value.supportingPageReference[field] = "other"; assert.equal(validateRetrievalCitation("company-a", fixture(), query, value), false); });
test("citation identity and extra Storage authority rejected", () => { assert.equal(validateRetrievalCitation("company-a", fixture(), query, { ...citation(), documentTitle: "Fabricated" }), false); assert.equal(validateRetrievalCitation("company-a", fixture(), query, { ...citation(), storagePath: "companies/other/secret" }), false); assert.equal(validateRetrievalCitation("company-a", fixture(), query, null), false); });
test("all relevance categories explicit, bounded, and ordered", () => { const c = fixture(); Object.assign(c.document, { vehicleMake: "Volvo", system: "Fuel" }); const s = scoreRetrievalCandidate(c, { ...query, vehicleMake: "Volvo", system: "Fuel" })!; assert.deepEqual(s.relevance, [1, 1, 1, 2, 2, 2]); assert.equal(s.reasons.length, 6); });
test("fault matching uses exact lexical boundaries", () => { const c = fixture("a", "P00870 unrelated content"); c.document.title = ""; assert.equal(scoreRetrievalCandidate(c, { faultCodes: ["P0087"] }), null); });
test("explicit vehicle applicability conflict excludes", () => { const c = fixture(); c.document.vehicleMake = "Volvo"; assert.equal(scoreRetrievalCandidate(c, { ...query, vehicleMake: "Scania" }), null); });
test("blank vehicle metadata is not a match or conflict", () => assert.equal(scoreRetrievalCandidate(fixture(), { ...query, vehicleMake: "Volvo" })!.relevance[1], 0));
test("filename-only relevance rejected", () => { const c = fixture("a", "Unrelated content"); c.document.title = ""; c.document.originalFilename = "fuel-pressure.pdf"; assert.equal(scoreRetrievalCandidate(c, { question: "fuel pressure" }), null); });
test("vehicle-only and unrelated results rejected", () => { const c = fixture("a", "Unrelated content"); c.document.title = ""; c.document.vehicleMake = "Volvo"; assert.equal(scoreRetrievalCandidate(c, { vehicleMake: "Volvo" }), null); assert.equal(scoreRetrievalCandidate(c, { question: "brake circuit" }), null); });
test("single generic token does not qualify", () => { const c = fixture("a", "The manual vehicle page"); c.document.title = ""; assert.equal(scoreRetrievalCandidate(c, { question: "manual vehicle" }), null); });
test("empty text remains valid limitation, no invented excerpt", () => { const c = fixture("a", ""); c.document.system = "Fuel"; const result = retrieveKnowledgePages("company-a", [c], { system: "Fuel" }); assert.equal(result.results[0].citation.excerpt, ""); assert.equal(result.coverage.emptyTextPages, 1); });
test("fault category precedes other stronger category counts", () => { const fault = fixture("z", "P0087"); const other = fixture("a", "fuel pressure sensor voltage"); Object.assign(other.document, { vehicleMake: "Volvo", system: "Fuel" }); const result = retrieveKnowledgePages("company-a", [other, fault], { ...query, vehicleMake: "Volvo", system: "Fuel" }); assert.equal(result.results[0].citation.documentId, "z"); });
test("stable document and page tie breaks independent of input order", () => { const a = fixture("a"), b = fixture("b"), page = fixture("a", a.page.extractedText, 1); const input = [b, page, a]; const result = retrieveKnowledgePages("company-a", input, query); assert.deepEqual(result.results.map(r => [r.citation.documentId, r.citation.pageIndex]), [["a", 0], ["a", 1], ["b", 0]]); assert.deepEqual(result, retrieveKnowledgePages("company-a", input.toReversed(), query)); assert.deepEqual(result, retrieveKnowledgePages("company-a", input, query)); });
test("same content hash/index deduplicates stable winner, different pages remain", () => { const a = fixture("a"), b = fixture("b"), page = fixture("b", bText(), 1); b.document.contentHash = a.document.contentHash; page.document.contentHash = a.document.contentHash; const result = retrieveKnowledgePages("company-a", [b, page, a], query); assert.deepEqual(result.results.map(r => r.citation.documentId), ["a", "b"]); assert.deepEqual(result, retrieveKnowledgePages("company-a", [a, page, b], query)); });
function bText() { return fixture().page.extractedText; }
test("50 document cap reports coverage", () => { const result = retrieveKnowledgePages("company-a", Array.from({ length: 51 }, (_, i) => fixture(`doc-${String(i).padStart(3, "0")}`)), query); assert.equal(result.coverage.candidateDocumentsConsidered, 50); assert.equal(result.coverage.candidatePagesConsidered, 50); assert.equal(result.coverage.coverageLimited, true); });
test("200 page cap reports coverage", () => { const result = retrieveKnowledgePages("company-a", Array.from({ length: 201 }, (_, i) => fixture("a", "P0087", i)), query); assert.equal(result.coverage.candidatePagesConsidered, 200); assert.equal(result.coverage.coverageLimited, true); });
test("5 results, 1200 excerpts, 6000 evidence cap", () => { const result = retrieveKnowledgePages("company-a", Array.from({ length: 6 }, (_, i) => fixture(`doc-${i}`, "P0087 " + "fuel pressure ".repeat(200))), query); assert.equal(result.results.length, 5); assert.ok(result.results.every(r => r.citation.excerpt.length === 1200)); assert.equal(result.coverage.reasoningEvidenceLength, MAX_REASONING_EVIDENCE_LENGTH); assert.equal(result.coverage.truncated, true); assert.ok(result.evidence.every(e => e.reference === e.citation.evidenceReference && e.excerpt === e.citation.excerpt)); });
test("upstream coverage signal preserved and exhausted small result not truncated", () => { assert.equal(retrieveKnowledgePages("company-a", [fixture()], query, true).coverage.coverageLimited, true); assert.equal(retrieveKnowledgePages("company-a", [fixture()], query).coverage.truncated, false); });
test("invalid evidence omitted and accounted", () => { const c = fixture(); c.page.pageId = "wrong"; const result = retrieveKnowledgePages("company-a", [c], query); assert.equal(result.coverage.invalidCandidates, 1); assert.equal(result.results.length, 0); });
test("reference is SHA256 of exact fixed-order validated identity", () => { const c = fixture(); const identity = [c.document.companyId, c.document.documentId, c.document.contentHash, c.page.pageId, c.page.pageIndex, c.page.textContentHash, c.page.processingAttemptId, c.page.processingInvocationId]; const expected = "TECHNICAL_DOCUMENT_" + createHash("sha256").update(JSON.stringify(identity), "utf8").digest("hex"); assert.equal(evidenceReferenceFor(c), expected); assert.equal(citation().evidenceReference, expected); assert.equal(evidenceReferenceFor(c), evidenceReferenceFor(structuredClone(c))); assert.notEqual(evidenceReferenceFor(c), evidenceReferenceFor(fixture("other"))); assert.notEqual(evidenceReferenceFor(c), evidenceReferenceFor(fixture("doc-a", c.page.extractedText, 1))); assert.ok(!expected.includes("companies/")); });
test("inputs not mutated and live history/known fix/reasoning imports unnecessary", () => { const input = [fixture()]; const before = structuredClone(input); retrieveKnowledgePages("company-a", input, query); assert.deepEqual(input, before); });

test("numeric/missing identity and missing page fail closed", () => {
  const c = fixture();
  Object.assign(c.document, { documentId: 123 });
  assert.equal(validateRetrievalCandidate("company-a", c), false);
  assert.equal(validateRetrievalCandidate("company-a", { document: fixture().document } as RetrievalCandidate), false);
  assert.equal(retrieveKnowledgePages("company-a", [{ document: fixture().document } as RetrievalCandidate], query).coverage.invalidCandidates, 1);
});
test("malformed evidence cannot receive a reference", () => {
  const c = fixture(); c.page.textContentHash = "invalid";
  assert.throws(() => evidenceReferenceFor(c), /INVALID_TECHNICAL_EVIDENCE/);
});
test("property insertion order cannot change duplicate winner", () => {
  const a = fixture(), b = fixture(); b.document.title = "Other fuel pressure title";
  const reverseKeys = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
  const reversed = { document: reverseKeys(a.document), page: reverseKeys(a.page) };
  assert.deepEqual(retrieveKnowledgePages("company-a", [a, b], query), retrieveKnowledgePages("company-a", [b, reversed], query));
});
test("excerpt centers actual fault context without paraphrasing", () => {
  const text = "Introductory material. ".repeat(100) + "P0087 fuel pressure sensor verification.";
  const c = fixture("a", text); const value = createRetrievalCitation("company-a", c, query)!;
  assert.ok(value.excerpt.includes("P0087")); assert.ok(text.includes(value.excerpt)); assert.ok(value.excerpt.length <= 1200);
});

test("non-string and cyclic citation fields fail closed without serialization", () => {
  const value = citation();
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.equal(validateRetrievalCitation("company-a", fixture(), query, { ...value, documentId: cyclic }), false);
  assert.equal(validateRetrievalCitation("company-a", fixture(), query, { ...value, relevanceReasons: [cyclic] }), false);
});

test("R1 all general query and page tokens beyond old cutoff are evaluated", () => {
  const noise = Array.from({ length: 30 }, (_, i) => `alpha${String(i).padStart(2, "0")}`).join(" ");
  const candidate = fixture("tokens", noise + " zpressure zsensor");
  candidate.document.title = "";
  const result = retrieveKnowledgePages("company-a", [candidate], { question: noise.replaceAll("alpha", "beta") + " zpressure zsensor" });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].relevance[4], 2);
  assert.equal(result.results[0].relevance[5], 2);
  assert.equal(result.coverage.coverageLimited, false);
});
test("R1 matching fault beyond 24 codes is evaluated without silent omission", () => {
  const candidate = fixture("faults", "Verify genuine Z9999 condition.");
  candidate.document.title = "";
  const faults = [...Array.from({ length: 30 }, (_, i) => `A${String(i).padStart(4, "0")}`), "Z9999"];
  const result = retrieveKnowledgePages("company-a", [candidate], { faultCodes: faults });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].relevance[0], 1);
  assert.equal(result.coverage.coverageLimited, false);
});
test("R1 oversized supplied terms have deterministic normalization and coverage", () => {
  const words = Array.from({ length: 35 }, (_, i) => `token${i}`);
  const faults = Array.from({ length: 35 }, (_, i) => `P${String(i).padStart(4, "0")}`);
  const candidate = fixture("oversized", words.join(" ") + " P0034");
  const input = { question: words.join(" "), faultCodes: faults };
  const result = retrieveKnowledgePages("company-a", [candidate], input);
  assert.deepEqual(result, retrieveKnowledgePages("company-a", [candidate], input));
  assert.deepEqual(result, retrieveKnowledgePages("company-a", [candidate], { question: words.toReversed().join(" "), faultCodes: [...faults.toReversed(), faults[0]] }));
  assert.equal(result.coverage.coverageLimited, false);
});
test("R1 excerpt anchors genuine fault, not earlier nonmatching prefix", () => {
  const text = "Invalid prefix P00870. " + "Unrelated introductory material. ".repeat(100) + "Genuine P0087 verification.";
  const candidate = fixture("boundary", text);
  const score = scoreRetrievalCandidate(candidate, { faultCodes: ["P0087"] })!;
  assert.equal(score.relevance[0], 1);
  assert.equal(score.anchor, text.indexOf("P0087 verification"));
  const result = createRetrievalCitation("company-a", candidate, { faultCodes: ["P0087"] })!;
  assert.ok(result.excerpt.includes("Genuine P0087 verification."));
  assert.ok(!result.excerpt.includes("P00870"));
  assert.ok(text.includes(result.excerpt));
  assert.ok(result.excerpt.length <= 1200);
});
for (const invalid of ["P00870", "XP0087", "P0087A"]) test(`R1 invalid fault boundary ${invalid} cannot qualify or anchor`, () => {
  const candidate = fixture("invalid", invalid); candidate.document.title = "";
  assert.equal(scoreRetrievalCandidate(candidate, { faultCodes: ["P0087"] }), null);
});
test("R1 punctuation, whitespace, and hyphen boundaries preserve existing semantics", () => {
  for (const text of ["(P0087)", " P0087 ", "P0087,", "p0087."]) {
    const candidate = fixture("valid", text);
    const score = scoreRetrievalCandidate(candidate, { faultCodes: ["P0087"] })!;
    assert.equal(score.relevance[0], 1);
    assert.equal(score.anchor, text.toUpperCase().indexOf("P0087"));
  }
  for (const text of ["P0087-1", "X-P0087"]) {
    const candidate = fixture("invalid", text); candidate.document.title = "";
    assert.equal(scoreRetrievalCandidate(candidate, { faultCodes: ["P0087"] }), null);
  }
});
test("R1 earliest valid occurrence across multiple qualifying codes anchors excerpt", () => {
  const text = "Z9999 first. " + "Unrelated material. ".repeat(100) + "P0087 later. Z9999 repeated.";
  const candidate = fixture("multiple", text);
  const score = scoreRetrievalCandidate(candidate, { faultCodes: ["P0087", "Z9999"] })!;
  assert.equal(score.relevance[0], 2);
  assert.equal(score.anchor, 0);
  assert.ok(createRetrievalCitation("company-a", candidate, { faultCodes: ["P0087", "Z9999"] })!.excerpt.startsWith("Z9999 first."));
});
