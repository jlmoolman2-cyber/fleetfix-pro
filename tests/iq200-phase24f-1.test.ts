import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { KnowledgeProcessingError } from "../src/lib/iq200/knowledgeProcessingCore.ts";
import { MAX_IQ200_KNOWLEDGE_UPLOAD_BYTES, buildStoragePath } from "../src/lib/iq200/knowledgeUploadCore.ts";
import {
  buildKnowledgePageId,
  buildProcessingPageRecord,
  buildRenderedPageStoragePath,
  createKnowledgeProcessingAdapters,
  hashProcessingContent,
  processClaimedKnowledgeDocumentCore,
  type KnowledgePageProcessingDependencies,
  type ProcessingInvocation,
  type ProcessingAssetStore,
  type ProcessingDocumentData,
  type ProcessingPageRecord,
  type ProcessingStateStore,
  type ProcessingTransaction,
} from "../src/lib/iq200/knowledgePageProcessingCore.ts";

const claim: ProcessingInvocation = {
  companyId: "company-a",
  documentId: "document-a",
  processingAttemptId: "11111111-1111-4111-8111-111111111111",
  processingInvocationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const duplicateClaim: ProcessingInvocation = { ...claim, processingInvocationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const newerClaim: ProcessingInvocation = {
  ...claim,
  processingAttemptId: "22222222-2222-4222-8222-222222222222",
  processingInvocationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};
const trustedPath = buildStoragePath(claim.companyId, claim.documentId);
const parsedPages = [0, 1, 2].map((pageIndex) => ({ pageIndex, widthPoints: 100, heightPoints: 200, rotation: 0, nativeText: `page text ${pageIndex}`, nativeTextAvailable: true }));
const renderedPage = (pageIndex: number) => ({ pageIndex, widthPixels: 417, heightPixels: 834, dpi: 300, mimeType: "image/png" as const, pngBytes: new Uint8Array([0x89, 0x50, pageIndex]) });

function ownedDocument(activeClaim: ProcessingInvocation = claim): ProcessingDocumentData {
  return {
    companyId: activeClaim.companyId,
    documentId: activeClaim.documentId,
    storagePath: trustedPath,
    processingStatus: "PROCESSING",
    processingAttemptId: activeClaim.processingAttemptId,
    processingInvocationAttemptId: activeClaim.processingAttemptId,
    processingInvocationId: activeClaim.processingInvocationId,
  };
}

function fakePorts(initialDocument: ProcessingDocumentData = ownedDocument()) {
  let document = { ...initialDocument };
  const pages = new Map<string, ProcessingPageRecord>();
  const assets = new Map<string, Uint8Array>([[trustedPath, new Uint8Array([0x25, 0x50, 0x44, 0x46])]]);
  const events: string[] = [];
  let deleteFailure = false;

  const state: ProcessingStateStore = {
    serverTimestamp: () => "timestamp",
    async runTransaction<T>(work: (transaction: ProcessingTransaction) => Promise<T>) {
      const transaction: ProcessingTransaction = {
        getDocument: async () => ({ ...document }),
        getPage: async (_claim, pageId) => pages.get(pageId),
        setPage: (_claim, pageId, record) => { events.push(`set:${pageId}`); pages.set(pageId, record); },
        deletePage: (_claim, pageId) => { events.push(`delete-page:${pageId}`); pages.delete(pageId); },
        updateDocument: (_claim, fields) => { events.push(`update:${String(fields.processingStatus || "document")}`); document = { ...document, ...fields }; },
      };
      return work(transaction);
    },
  };
  const assetStore: ProcessingAssetStore = {
    async download(path) { events.push(`download:${path}`); const value = assets.get(path); if (!value) throw new Error("missing"); return value; },
    async save(path, bytes) { events.push(`save:${path}`); assets.set(path, new Uint8Array(bytes)); },
    async delete(path) { events.push(`delete-asset:${path}`); if (deleteFailure) throw new Error("delete failed"); assets.delete(path); },
  };

  return {
    state,
    assetStore,
    pages,
    assets,
    events,
    adapters: createKnowledgeProcessingAdapters(state, assetStore),
    document: () => document,
    setDocument: (value: ProcessingDocumentData) => { document = { ...value }; },
    setDeleteFailure: (value: boolean) => { deleteFailure = value; },
  };
}

function orchestration(overrides: Partial<KnowledgePageProcessingDependencies> = {}) {
  const events: string[] = [];
  const persisted: Array<Parameters<KnowledgePageProcessingDependencies["persistPage"]>[0]> = [];
  const compensated: Array<{ pageIds: string[]; assetPaths: string[] }> = [];
  const failures: string[] = [];
  const value: KnowledgePageProcessingDependencies = {
    acquireSource: async () => { events.push("acquire"); return new Uint8Array([0x25, 0x50, 0x44, 0x46]); },
    parse: async () => { events.push("parse"); return { pageCount: 3, pages: parsedPages }; },
    renderPage: async (_bytes, pageIndex) => { events.push(`render:${pageIndex}`); return renderedPage(pageIndex); },
    persistPage: async (args) => { events.push(`persist:${args.record.pageIndex}`); persisted.push(args); },
    complete: async (_claim, count) => { events.push(`complete:${count}`); },
    compensate: async (_claim, pageIds, assetPaths) => { events.push("compensate"); compensated.push({ pageIds: [...pageIds], assetPaths: [...assetPaths] }); },
    fail: async (_claim, code) => { events.push(`fail:${code}`); failures.push(code); },
    ...overrides,
  };
  return { value, events, persisted, compensated, failures };
}

test("1. trusted path mismatch is rejected before download", async () => {
  const ports = fakePorts({ ...ownedDocument(), storagePath: "companies/company-b/iq200/documents/foreign/original/source.pdf" });
  await assert.rejects(() => ports.adapters.acquireSource(claim), (error: unknown) => error instanceof KnowledgeProcessingError && error.code === "SOURCE_UNAVAILABLE");
  assert.equal(ports.events.some((event) => event.startsWith("download:")), false);
});

test("2. source download enforces the existing byte bound", async () => {
  const ports = fakePorts();
  ports.assets.set(trustedPath, new Uint8Array(MAX_IQ200_KNOWLEDGE_UPLOAD_BYTES + 1));
  await assert.rejects(() => ports.adapters.acquireSource(claim), (error: unknown) => error instanceof KnowledgeProcessingError && error.code === "SOURCE_UNAVAILABLE");
});

test("3. source acquisition accepts only the owned processing attempt", async () => {
  const ports = fakePorts();
  assert.deepEqual(await ports.adapters.acquireSource(claim), ports.assets.get(trustedPath));
});

test("4. stale attempt cannot transactionally publish page metadata", async () => {
  const ports = fakePorts(ownedDocument(newerClaim));
  const path = buildRenderedPageStoragePath(claim, 0);
  const record = buildProcessingPageRecord(claim, parsedPages[0], renderedPage(0), path);
  await assert.rejects(() => ports.adapters.persistPage({ invocation: claim, pageId: buildKnowledgePageId(0), assetPath: path, pngBytes: renderedPage(0).pngBytes, record }), /no longer current/);
  assert.equal(ports.pages.size, 0);
  assert.equal(ports.assets.has(path), false);
});

test("5. current attempt persists asset and metadata together in order", async () => {
  const ports = fakePorts();
  const path = buildRenderedPageStoragePath(claim, 0);
  const record = buildProcessingPageRecord(claim, parsedPages[0], renderedPage(0), path);
  await ports.adapters.persistPage({ invocation: claim, pageId: buildKnowledgePageId(0), assetPath: path, pngBytes: renderedPage(0).pngBytes, record });
  assert.ok(ports.assets.has(path));
  assert.equal(ports.pages.get("page-000001")?.processingAttemptId, claim.processingAttemptId);
});

test("6. stale attempt cannot transition document to READY", async () => {
  const ports = fakePorts(ownedDocument(newerClaim));
  await assert.rejects(() => ports.adapters.complete(claim, 1), /no longer current/);
  assert.equal(ports.document().processingStatus, "PROCESSING");
});

test("7. owned complete publishes the exact attempt", async () => {
  const ports = fakePorts();
  for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
    const path = buildRenderedPageStoragePath(claim, pageIndex);
    ports.pages.set(buildKnowledgePageId(pageIndex), buildProcessingPageRecord(claim, parsedPages[pageIndex], renderedPage(pageIndex), path));
  }
  await ports.adapters.complete(claim, 3);
  assert.equal(ports.document().processingStatus, "READY");
  assert.equal(ports.document().publishedProcessingAttemptId, claim.processingAttemptId);
  assert.equal(ports.document().pageCount, 3);
});

test("8. compensation race preserves newer page metadata", async () => {
  const ports = fakePorts(ownedDocument(newerClaim));
  const pageId = buildKnowledgePageId(0);
  const newerPath = buildRenderedPageStoragePath(newerClaim, 0);
  const newerRecord = buildProcessingPageRecord(newerClaim, parsedPages[0], renderedPage(0), newerPath);
  ports.pages.set(pageId, newerRecord);
  ports.assets.set(newerPath, renderedPage(0).pngBytes);
  const oldPath = buildRenderedPageStoragePath(claim, 0);
  ports.assets.set(oldPath, renderedPage(0).pngBytes);
  await ports.adapters.compensate(claim, [pageId], [oldPath]);
  assert.equal(ports.pages.get(pageId)?.processingAttemptId, newerClaim.processingAttemptId);
  assert.ok(ports.assets.has(newerPath));
  assert.equal(ports.assets.has(oldPath), false);
});

test("9. stale failure handling preserves newer lifecycle", async () => {
  const ports = fakePorts(ownedDocument(newerClaim));
  await ports.adapters.fail(claim, "RENDER_FAILED");
  assert.equal(ports.document().processingStatus, "PROCESSING");
  assert.equal(ports.document().processingAttemptId, newerClaim.processingAttemptId);
  assert.equal(ports.document().processingFailureCode, undefined);
});

test("10. Storage deletion failure cannot delete newer metadata or create READY", async () => {
  const ports = fakePorts(ownedDocument(newerClaim));
  const pageId = buildKnowledgePageId(0);
  const newerPath = buildRenderedPageStoragePath(newerClaim, 0);
  ports.pages.set(pageId, buildProcessingPageRecord(newerClaim, parsedPages[0], renderedPage(0), newerPath));
  ports.setDeleteFailure(true);
  await ports.adapters.compensate(claim, [pageId], [buildRenderedPageStoragePath(claim, 0)]);
  assert.equal(ports.pages.get(pageId)?.processingAttemptId, newerClaim.processingAttemptId);
  assert.equal(ports.document().processingStatus, "PROCESSING");
});

test("11. incomplete parsed page set cannot become READY", async () => {
  const state = orchestration({ parse: async () => ({ pageCount: 3, pages: parsedPages.slice(0, 2) }) });
  await assert.rejects(() => processClaimedKnowledgeDocumentCore(claim, state.value), /page count/);
  assert.equal(state.events.some((event) => event.startsWith("complete:")), false);
});

test("12. password parser failure maps to bounded password code", async () => {
  const error = Object.assign(new Error("raw private password detail"), { name: "PdfParserError", code: "PDF_PASSWORD_REQUIRED" });
  const state = orchestration({ parse: async () => { throw error; } });
  await assert.rejects(() => processClaimedKnowledgeDocumentCore(claim, state.value));
  assert.deepEqual(state.failures, ["PASSWORD_PROTECTED_PDF"]);
});

test("13. duplicate invocation after READY fails before download or persistence", async () => {
  const ports = fakePorts({ ...ownedDocument(), processingStatus: "READY" });
  await assert.rejects(() => ports.adapters.acquireSource(claim), /no longer current/);
  assert.equal(ports.events.some((event) => event.startsWith("download:") || event.startsWith("save:")), false);
});

test("14. render and persist alternate page by page", async () => {
  const state = orchestration();
  await processClaimedKnowledgeDocumentCore(claim, state.value);
  assert.deepEqual(state.events, ["acquire", "parse", "render:0", "persist:0", "render:1", "persist:1", "render:2", "persist:2", "complete:3"]);
});

test("15. unclassified pages omit hasDiagrams instead of fabricating false", () => {
  const path = buildRenderedPageStoragePath(claim, 0);
  const record = buildProcessingPageRecord(claim, parsedPages[0], renderedPage(0), path);
  assert.equal("hasDiagrams" in record, false);
});

test("16. deterministic page identity is stable", () => {
  assert.equal(buildKnowledgePageId(0), "page-000001");
  assert.equal(buildKnowledgePageId(12), "page-000013");
});

test("17. rendered assets use invocation-specific protected tenant paths", () => {
  const path = buildRenderedPageStoragePath(claim, 0);
  assert.equal(path, `companies/company-a/iq200/documents/document-a/processing/${claim.processingAttemptId}/${claim.processingInvocationId}/pages/page-000001.png`);
  assert.doesNotMatch(path, /https?:/);
});

test("18. page record persists canonical text hash and dimensions", () => {
  const record = buildProcessingPageRecord(claim, parsedPages[0], renderedPage(0), buildRenderedPageStoragePath(claim, 0));
  assert.equal(record.textContentHash, hashProcessingContent(parsedPages[0].nativeText));
  assert.deepEqual([record.imageWidth, record.imageHeight], [417, 834]);
});

test("19. page record does not expand canonical image integrity fields", () => {
  const record = buildProcessingPageRecord(claim, parsedPages[0], renderedPage(0), buildRenderedPageStoragePath(claim, 0));
  assert.equal("imageContentHash" in record, false);
  assert.equal("imageContentType" in record, false);
});

test("20. parser is invoked before any rendering", async () => {
  const state = orchestration();
  await processClaimedKnowledgeDocumentCore(claim, state.value);
  assert.ok(state.events.indexOf("parse") < state.events.indexOf("render:0"));
});

test("21. renderer failure compensates only completed pages and prevents READY", async () => {
  const state = orchestration({ renderPage: async (_bytes, index) => { if (index === 1) throw Object.assign(new Error("detail"), { name: "PdfRenderError" }); return renderedPage(index); } });
  await assert.rejects(() => processClaimedKnowledgeDocumentCore(claim, state.value));
  assert.deepEqual(state.compensated[0].pageIds, ["page-000001"]);
  assert.deepEqual(state.failures, ["RENDER_FAILED"]);
  assert.equal(state.events.some((event) => event.startsWith("complete:")), false);
});

test("22. first-page persistence failure has no published completed pages", async () => {
  const state = orchestration({ persistPage: async () => { throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "bounded", 500); } });
  await assert.rejects(() => processClaimedKnowledgeDocumentCore(claim, state.value));
  assert.deepEqual(state.compensated[0].pageIds, []);
});

test("23. middle-page persistence failure compensates earlier pages", async () => {
  let count = 0;
  const state = orchestration({ persistPage: async () => { if (++count === 2) throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "bounded", 500); } });
  await assert.rejects(() => processClaimedKnowledgeDocumentCore(claim, state.value));
  assert.deepEqual(state.compensated[0].pageIds, ["page-000001"]);
});

test("24. final READY failure compensates every progressively persisted page", async () => {
  const state = orchestration({ complete: async () => { throw new KnowledgeProcessingError("STALE_ATTEMPT", "stale", 409); } });
  await assert.rejects(() => processClaimedKnowledgeDocumentCore(claim, state.value));
  assert.deepEqual(state.compensated[0].pageIds, ["page-000001", "page-000002", "page-000003"]);
});

test("25. source read failure is bounded and never renders", async () => {
  const state = orchestration({ acquireSource: async () => { throw new KnowledgeProcessingError("SOURCE_UNAVAILABLE", "unavailable", 404); } });
  await assert.rejects(() => processClaimedKnowledgeDocumentCore(claim, state.value));
  assert.equal(state.events.some((event) => event.startsWith("render:")), false);
});

test("26. parser failure maps to bounded extraction failure", async () => {
  const error = Object.assign(new Error("private"), { name: "PdfParserError", code: "PDF_PARSE_FAILED" });
  const state = orchestration({ parse: async () => { throw error; } });
  await assert.rejects(() => processClaimedKnowledgeDocumentCore(claim, state.value));
  assert.deepEqual(state.failures, ["TEXT_EXTRACTION_FAILED"]);
});

test("27. route derives processing identity only from the server claim", () => {
  const route = readFileSync("src/app/api/iq200/knowledge/documents/process/route.ts", "utf8");
  assert.match(route, /processClaimedKnowledgeDocument\(claim\)/);
  assert.doesNotMatch(route, /request\.json|searchParams|body\.companyId|body\.documentId|storagePath/);
});

test("28. no public URL mechanism is introduced", () => {
  const value = readFileSync("src/lib/iq200/knowledgeDocumentProcessor.ts", "utf8") + readFileSync("src/lib/iq200/knowledgePageProcessingCore.ts", "utf8");
  assert.doesNotMatch(value, /getDownloadURL|getSignedUrl|signedUrl|makePublic/);
});

test("29. no provider reasoning OCR search or communications execution is introduced", () => {
  const value = readFileSync("src/lib/iq200/knowledgeDocumentProcessor.ts", "utf8") + readFileSync("src/lib/iq200/knowledgePageProcessingCore.ts", "utf8");
  assert.doesNotMatch(value, /openai|gemini|generateContent|chatCompletion|reasoningService|tesseract|vectorSearch|semanticSearch|whatsapp/i);
});

test("30. production processor uses existing parser and single-page renderer", () => {
  const value = readFileSync("src/lib/iq200/knowledgeDocumentProcessor.ts", "utf8");
  assert.match(value, /parse: parsePdf/);
  assert.match(value, /renderPage: renderPdfPageToPng/);
  assert.doesNotMatch(value, /renderPdfPagesToPng/);
});

test("31. simultaneous same-attempt duplicate is rejected before writes", async () => {
  const unowned = ownedDocument();
  delete unowned.processingInvocationAttemptId;
  delete unowned.processingInvocationId;
  const ports = fakePorts(unowned);

  await ports.adapters.acquireSource(claim);
  await assert.rejects(() => ports.adapters.acquireSource(duplicateClaim), /already owned/);

  assert.equal(ports.document().processingInvocationId, claim.processingInvocationId);
  assert.equal(ports.events.filter((event) => event.startsWith("download:")).length, 1);
  assert.equal(ports.events.some((event) => event.startsWith("save:")), false);
});

test("32. A READY survives a same-attempt duplicate failure path", async () => {
  const ports = fakePorts();
  const pageId = buildKnowledgePageId(0);
  const aPath = buildRenderedPageStoragePath(claim, 0);
  const aRecord = buildProcessingPageRecord(claim, parsedPages[0], renderedPage(0), aPath);
  await ports.adapters.persistPage({ invocation: claim, pageId, assetPath: aPath, pngBytes: renderedPage(0).pngBytes, record: aRecord });
  await ports.adapters.complete(claim, 1);

  await assert.rejects(() => ports.adapters.acquireSource(duplicateClaim), /no longer current/);
  await ports.adapters.compensate(duplicateClaim, [pageId], [buildRenderedPageStoragePath(duplicateClaim, 0)]);
  await ports.adapters.fail(duplicateClaim, "PERSISTENCE_FAILED");

  assert.equal(ports.document().processingStatus, "READY");
  assert.equal(ports.pages.get(pageId)?.processingInvocationId, claim.processingInvocationId);
  assert.ok(ports.assets.has(aPath));
});

test("33. compensation race cannot remove another invocation's page before READY", async () => {
  const ports = fakePorts();
  const pageId = buildKnowledgePageId(0);
  const aPath = buildRenderedPageStoragePath(claim, 0);
  const bPath = buildRenderedPageStoragePath(duplicateClaim, 0);
  const aRecord = buildProcessingPageRecord(claim, parsedPages[0], renderedPage(0), aPath);
  await ports.adapters.persistPage({ invocation: claim, pageId, assetPath: aPath, pngBytes: renderedPage(0).pngBytes, record: aRecord });
  ports.assets.set(bPath, renderedPage(0).pngBytes);

  await ports.adapters.compensate(duplicateClaim, [pageId], [bPath]);
  await ports.adapters.complete(claim, 1);

  assert.equal(ports.document().processingStatus, "READY");
  assert.equal(ports.pages.get(pageId)?.processingInvocationId, claim.processingInvocationId);
  assert.ok(ports.assets.has(aPath));
  assert.equal(ports.assets.has(bPath), false);
});

test("34. failed old invocation cannot damage a newer winning invocation", async () => {
  const ports = fakePorts(ownedDocument(newerClaim));
  const pageId = buildKnowledgePageId(0);
  const newerPath = buildRenderedPageStoragePath(newerClaim, 0);
  ports.pages.set(pageId, buildProcessingPageRecord(newerClaim, parsedPages[0], renderedPage(0), newerPath));
  ports.assets.set(newerPath, renderedPage(0).pngBytes);

  await ports.adapters.compensate(claim, [pageId], [buildRenderedPageStoragePath(claim, 0)]);
  await ports.adapters.fail(claim, "RENDER_FAILED");
  await ports.adapters.complete(newerClaim, 1);

  assert.equal(ports.document().processingStatus, "READY");
  assert.equal(ports.pages.get(pageId)?.processingInvocationId, newerClaim.processingInvocationId);
  assert.ok(ports.assets.has(newerPath));
});

test("35. duplicate after READY performs no writes or cleanup", async () => {
  const ports = fakePorts();
  const pageId = buildKnowledgePageId(0);
  const aPath = buildRenderedPageStoragePath(claim, 0);
  ports.pages.set(pageId, buildProcessingPageRecord(claim, parsedPages[0], renderedPage(0), aPath));
  ports.assets.set(aPath, renderedPage(0).pngBytes);
  await ports.adapters.complete(claim, 1);
  const eventCount = ports.events.length;

  await assert.rejects(() => ports.adapters.acquireSource(duplicateClaim), /no longer current/);

  assert.equal(ports.events.length, eventCount);
  assert.ok(ports.pages.has(pageId));
  assert.ok(ports.assets.has(aPath));
});

test("36. cleanup rejects an asset path outside invocation ownership", async () => {
  const ports = fakePorts();
  const pageId = buildKnowledgePageId(0);
  const aPath = buildRenderedPageStoragePath(claim, 0);
  ports.pages.set(pageId, buildProcessingPageRecord(claim, parsedPages[0], renderedPage(0), aPath));
  ports.assets.set(aPath, renderedPage(0).pngBytes);

  await ports.adapters.compensate(duplicateClaim, [pageId], [aPath]);

  assert.ok(ports.pages.has(pageId));
  assert.ok(ports.assets.has(aPath));
  assert.equal(ports.events.includes(`delete-asset:${aPath}`), false);
});

test("37. same processingAttemptId alone does not authorize page deletion", async () => {
  const ports = fakePorts();
  const pageId = buildKnowledgePageId(0);
  const aPath = buildRenderedPageStoragePath(claim, 0);
  const bPath = buildRenderedPageStoragePath(duplicateClaim, 0);
  ports.pages.set(pageId, buildProcessingPageRecord(claim, parsedPages[0], renderedPage(0), aPath));
  ports.assets.set(aPath, renderedPage(0).pngBytes);
  ports.assets.set(bPath, renderedPage(0).pngBytes);

  await ports.adapters.compensate(duplicateClaim, [pageId], [bPath]);

  assert.equal(ports.pages.get(pageId)?.processingInvocationId, claim.processingInvocationId);
  assert.ok(ports.assets.has(aPath));
  assert.equal(ports.assets.has(bPath), false);
});
