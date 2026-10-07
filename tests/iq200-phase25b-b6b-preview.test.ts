import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
        return nextResolve(specifier);
    },
});

const { getKnowledgeDocumentPreview } = await import("../src/lib/iq200/knowledgePreviewService.ts");
const { ServerAccessError } = await import("../src/lib/serverAuthCore.ts");
const client = await import("../src/lib/iq200/knowledgeClient.ts");
const { hashProcessingContent, buildRenderedPageStoragePath } = await import("../src/lib/iq200/knowledgePageProcessingCore.ts");
const contracts = await import("../src/lib/iq200/knowledgeContracts.ts");

type Context = Parameters<typeof getKnowledgeDocumentPreview>[0];
type Store = NonNullable<NonNullable<Parameters<typeof getKnowledgeDocumentPreview>[2]>["store"]>;
type Snapshot = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type StoredPage = Record<string, unknown>;

const COMPANY = "comp_001";
const DOCUMENT = "doc-preview";
const ATTEMPT = "attempt-current";
const INVOCATION = "invocation-current";
const VIEW = "View IQ200 Knowledge";
const APPROVE = "Approve IQ200 Knowledge";

function context(permissions: Record<string, boolean> = { [VIEW]: true }, extra: Record<string, unknown> = {}): Context {
    return {
        uid: "caller-1",
        companyId: COMPANY,
        token: {},
        companyUser: { active: true, permissions, ...extra },
    } as unknown as Context;
}

function snapshot(id: string, data: Record<string, unknown> | null): Snapshot {
    return { id, exists: data !== null, data: () => data ?? undefined };
}

function documentData(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        companyId: COMPANY,
        documentId: DOCUMENT,
        processingStatus: "READY",
        approvalStatus: "DRAFT",
        processingAttemptId: ATTEMPT,
        processingInvocationAttemptId: ATTEMPT,
        processingInvocationId: INVOCATION,
        publishedProcessingAttemptId: ATTEMPT,
        publishedProcessingInvocationId: INVOCATION,
        ...extra,
    };
}

function pageData(pageIndex: number, extra: Record<string, unknown> = {}): StoredPage {
    const extractedText = `Technical details for page ${pageIndex + 1}: connector pin 4 carries the reference signal.`;
    return {
        documentId: DOCUMENT,
        processingAttemptId: ATTEMPT,
        processingInvocationId: INVOCATION,
        pageIndex,
        displayPageNumber: String(pageIndex + 1),
        extractedText,
        textContentHash: hashProcessingContent(extractedText),
        imageStorageRef: buildRenderedPageStoragePath({ companyId: COMPANY, documentId: DOCUMENT, processingAttemptId: ATTEMPT, processingInvocationId: INVOCATION }, pageIndex),
        imageWidth: 1200,
        imageHeight: 1600,
        ...extra,
    };
}

function fakeStore(
    document: Record<string, unknown> | null = documentData(),
    pages: StoredPage[] = [pageData(0)],
    snapshotIds: Map<number, string> = new Map(),
) {
    const calls: { companyId: string; documentId: string; cursor: string | null; limit: number }[] = [];
    const store: Store = {
        async readDocumentWindow(input) {
            calls.push(input);
            if (!document) return { document: null, cursorPage: null, pages: [] };
            const ordered = pages
                .map((data) => ({
                    id: snapshotIds.get(Number(data.pageIndex)) ?? `page-${String(Number(data.pageIndex) + 1).padStart(6, "0")}`,
                    data,
                }))
                .sort((left, right) => Number(left.data.pageIndex) - Number(right.data.pageIndex));
            const cursorEntry = input.cursor ? ordered.find((entry) => entry.id === input.cursor) : undefined;
            if (input.cursor && !cursorEntry) {
                return { document: snapshot(DOCUMENT, document), cursorPage: null, pages: [] };
            }
            const afterCursor = cursorEntry
                ? ordered.filter((entry) => Number(entry.data.pageIndex) > Number(cursorEntry.data.pageIndex))
                : ordered;
            return {
                document: snapshot(DOCUMENT, document),
                cursorPage: cursorEntry ? snapshot(cursorEntry.id, cursorEntry.data) : null,
                pages: afterCursor.slice(0, input.limit).map((entry) => snapshot(entry.id, entry.data)),
            };
        },
    };
    return { store, calls };
}

async function preview(
    ctx: Context = context(),
    document: Record<string, unknown> | null = documentData(),
    pages: StoredPage[] = [pageData(0)],
    cursor?: string,
) {
    const fake = fakeStore(document, pages);
    const result = await getKnowledgeDocumentPreview(ctx, DOCUMENT, { ...(cursor ? { cursor } : {}), store: fake.store });
    return { result, fake };
}

function errorIs(code: string, status: number) {
    return (error: unknown) => error instanceof ServerAccessError && error.code === code && error.status === status;
}

const pageId = (pageIndex: number) => `page-${String(pageIndex + 1).padStart(6, "0")}`;

test("authorized same-tenant View user gets a read-only READY/DRAFT preview", async () => {
    const { result, fake } = await preview();
    assert.equal(result.documentId, DOCUMENT);
    assert.equal(result.processingStatus, "READY");
    assert.equal(result.approvalStatus, "DRAFT");
    assert.equal(result.pages[0].publishedOwnershipVerified, true);
    assert.deepEqual(fake.calls[0], { companyId: COMPANY, documentId: DOCUMENT, cursor: null, limit: 9 });
    assert.deepEqual(Object.keys(fake.store), ["readDocumentWindow"]);
});

test("missing authentication is denied", async () => {
    await assert.rejects(preview(null as unknown as Context), errorIs("AUTH_REQUIRED", 401));
});

test("inactive membership is denied", async () => {
    await assert.rejects(preview(context({ [VIEW]: true }, { active: false })), errorIs("FORBIDDEN", 403));
});

test("missing View IQ200 Knowledge is denied", async () => {
    await assert.rejects(preview(context({})), errorIs("FORBIDDEN", 403));
});

test("Approve-only permission does not grant preview", async () => {
    await assert.rejects(preview(context({ [APPROVE]: true })), errorIs("FORBIDDEN", 403));
});

test("Technician Assist only does not grant preview", async () => {
    await assert.rejects(preview(context({ "Use IQ200 Technician Assist": true })), errorIs("FORBIDDEN", 403));
});

test("cross-tenant document fails as not found", async () => {
    await assert.rejects(preview(context(), documentData({ companyId: "company-other" })), errorIs("NOT_FOUND", 404));
});

test("missing document fails as not found", async () => {
    await assert.rejects(preview(context(), null), errorIs("NOT_FOUND", 404));
});

test("unknown approval state is denied", async () => {
    await assert.rejects(preview(context(), documentData({ approvalStatus: "UNKNOWN" })), errorIs("KNOWLEDGE_PREVIEW_UNAVAILABLE", 409));
});

for (const approvalStatus of ["DRAFT", "APPROVED", "REJECTED", "INACTIVE"] as const) {
    test(`READY + ${approvalStatus} preview is allowed`, async () => {
        const { result } = await preview(context(), documentData({ approvalStatus }));
        assert.equal(result.approvalStatus, approvalStatus);
    });
}

for (const processingStatus of ["PENDING", "PROCESSING", "FAILED", "UNKNOWN"] as const) {
    test(`${processingStatus} preview is denied`, async () => {
        await assert.rejects(preview(context(), documentData({ processingStatus })), errorIs("KNOWLEDGE_PREVIEW_UNAVAILABLE", 409));
    });
}

test("page results are capped at eight and continue from the eighth canonical page", async () => {
    const pages = Array.from({ length: 11 }, (_, index) => pageData(index));
    const { result } = await preview(context(), documentData(), pages);
    assert.equal(result.pages.length, 8);
    assert.equal(result.nextCursor, pageId(7));
});

test("each excerpt is capped at 1500 characters", async () => {
    const text = "x".repeat(2000);
    const { result } = await preview(context(), documentData(), [pageData(0, { extractedText: text, textContentHash: hashProcessingContent(text) })]);
    assert.equal(result.pages[0].extractedText.length, 1500);
});

test("total excerpt text is bounded to 12000 characters", async () => {
    const pages = Array.from({ length: 8 }, (_, index) => {
        const text = "y".repeat(1500);
        return pageData(index, { extractedText: text, textContentHash: hashProcessingContent(text) });
    });
    const { result } = await preview(context(), documentData(), pages);
    assert.equal(result.pages.reduce((sum, page) => sum + page.extractedText.length, 0), 12000);
});

test("canonical page identity is validated", async () => {
    await assert.rejects(preview(context(), documentData(), [pageData(0, { pageIndex: 1 })]), errorIs("NOT_FOUND", 404));
});

test("service rejects a snapshot ID that differs from the pageIndex-derived canonical ID", async () => {
    const fake = fakeStore(documentData(), [pageData(0)], new Map([[0, "page-000000"]]));
    await assert.rejects(
        getKnowledgeDocumentPreview(context(), DOCUMENT, { store: fake.store }),
        errorIs("NOT_FOUND", 404),
    );
});

test("page order is deterministic by pageIndex", async () => {
    const { result } = await preview(context(), documentData(), [pageData(2), pageData(0), pageData(1)]);
    assert.deepEqual(result.pages.map((page) => page.pageId), [pageId(0), pageId(1), pageId(2)]);
});

test("valid cursor returns pages after the cursor in the same document", async () => {
    const { result } = await preview(context(), documentData(), [pageData(0), pageData(1), pageData(2)], pageId(0));
    assert.deepEqual(result.pages.map((page) => page.pageId), [pageId(1), pageId(2)]);
});

test("invalid cursor is denied before any page read", async () => {
    const fake = fakeStore();
    await assert.rejects(getKnowledgeDocumentPreview(context(), DOCUMENT, { cursor: "../../other", store: fake.store }), errorIs("INVALID_INPUT", 400));
    assert.equal(fake.calls.length, 0);
});

test("missing cursor page fails closed", async () => {
    await assert.rejects(preview(context(), documentData(), [pageData(0)], pageId(3)), errorIs("NOT_FOUND", 404));
});

test("stale-generation cursor fails closed", async () => {
    const stale = pageData(0, { processingAttemptId: "attempt-old" });
    await assert.rejects(preview(context(), documentData(), [stale], pageId(0)), errorIs("NOT_FOUND", 404));
});

test("page from a non-published generation is never returned", async () => {
    await assert.rejects(preview(context(), documentData(), [pageData(0, { processingInvocationId: "invocation-old" })]), errorIs("NOT_FOUND", 404));
});

test("document published processing identity is enforced", async () => {
    await assert.rejects(preview(context(), documentData({ publishedProcessingAttemptId: "attempt-other" })), errorIs("NOT_FOUND", 404));
});

test("processingInvocationAttemptId must match the published attempt", async () => {
    await assert.rejects(preview(context(), documentData({ processingInvocationAttemptId: "attempt-other" })), errorIs("NOT_FOUND", 404));
});

test("document processingAttemptId must match its published attempt", async () => {
    await assert.rejects(preview(context(), documentData({ processingAttemptId: "attempt-other" })), errorIs("NOT_FOUND", 404));
});

test("page processingAttemptId must match its published attempt", async () => {
    await assert.rejects(preview(context(), documentData(), [pageData(0, { processingAttemptId: "attempt-other" })]), errorIs("NOT_FOUND", 404));
});

test("valid textContentHash is accepted", async () => {
    const { result } = await preview();
    assert.match(result.pages[0].textContentHash, /^[a-f0-9]{64}$/);
});

test("missing textContentHash fails closed", async () => {
    await assert.rejects(preview(context(), documentData(), [pageData(0, { textContentHash: undefined })]), errorIs("NOT_FOUND", 404));
});

test("malformed textContentHash fails closed", async () => {
    await assert.rejects(preview(context(), documentData(), [pageData(0, { textContentHash: "xyz" })]), errorIs("NOT_FOUND", 404));
});

test("textContentHash mismatch fails closed", async () => {
    await assert.rejects(preview(context(), documentData(), [pageData(0, { textContentHash: "0".repeat(64) })]), errorIs("NOT_FOUND", 404));
});

test("image metadata is returned safely", async () => {
    const { result } = await preview();
    assert.equal(result.pages[0].imagePresent, true);
    assert.equal(result.pages[0].imageWidth, 1200);
    assert.equal(result.pages[0].imageHeight, 1600);
});

test("invalid image metadata returns no image dimensions", async () => {
    const { result } = await preview(context(), documentData(), [pageData(0, { imageWidth: 0 })]);
    assert.equal(result.pages[0].imagePresent, false);
    assert.equal(result.pages[0].imageWidth, null);
    assert.equal(result.pages[0].imageHeight, null);
});

test("image metadata with a noncanonical Storage reference is not exposed as present", async () => {
    const { result } = await preview(context(), documentData(), [pageData(0, { imageStorageRef: "other-company/path.png" })]);
    assert.equal(result.pages[0].imagePresent, false);
    assert.equal(result.pages[0].imageWidth, null);
    assert.equal(result.pages[0].imageHeight, null);
});

test("response excludes storage paths and generation identifiers", async () => {
    const { result } = await preview();
    const serialized = JSON.stringify(result);
    for (const forbidden of ["imageStorageRef", "companies/", ATTEMPT, INVOCATION, "processingAttemptId", "processingInvocationId"]) {
        assert.equal(serialized.includes(forbidden), false, forbidden);
    }
});

test("response excludes company, user, and authorization internals", async () => {
    const { result } = await preview();
    const serialized = JSON.stringify(result);
    for (const forbidden of [COMPANY, "caller-1", "companyId", "uid", "companyUser", "token"]) {
        assert.equal(serialized.includes(forbidden), false, forbidden);
    }
});

test("preview reads use only the authenticated company and bounded nested-page window", async () => {
    const fake = fakeStore();
    await getKnowledgeDocumentPreview(context(), DOCUMENT, { store: fake.store });
    assert.deepEqual(fake.calls[0], { companyId: COMPANY, documentId: DOCUMENT, cursor: null, limit: 9 });
});

test("client uses authenticated GET without companyId and safely encodes cursor", async () => {
    const calls: { path: string; init: RequestInit }[] = [];
    const body = {
        documentId: DOCUMENT,
        processingStatus: "READY",
        approvalStatus: "DRAFT",
        pages: [{
            pageId: pageId(0), pageNumber: "1", extractedText: "text", textContentHash: hashProcessingContent("text"),
            imagePresent: false, imageWidth: null, imageHeight: null, publishedOwnershipVerified: true,
        }],
        nextCursor: null,
    };
    const dependencies = {
        getAuth: () => ({ authStateReady: async () => { }, currentUser: { getIdToken: async () => "test-token" } }),
        fetch: (async (path: string, init: RequestInit) => {
            calls.push({ path, init });
            return Response.json(body);
        }) as unknown as typeof fetch,
    };
    const result = await client.fetchKnowledgeDocumentPreview(DOCUMENT, pageId(0), dependencies);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, `/api/iq200/knowledge/documents/${DOCUMENT}/preview?cursor=${pageId(0)}`);
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.body, undefined);
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.authorization, "Bearer test-token");
    assert.equal(JSON.stringify(calls[0]).includes("companyId"), false);
    assert.equal(result.pages[0].pageId, "page-000001");
    assert.equal(result.pages[0].pageNumber, "1");
});

test("client rejects page-000000 even when pageNumber is zero", async () => {
    const body = {
        documentId: DOCUMENT,
        processingStatus: "READY",
        approvalStatus: "DRAFT",
        pages: [{
            pageId: "page-000000", pageNumber: "0", extractedText: "text", textContentHash: hashProcessingContent("text"),
            imagePresent: false, imageWidth: null, imageHeight: null, publishedOwnershipVerified: true,
        }],
        nextCursor: null,
    };
    const dependencies = {
        getAuth: () => ({ authStateReady: async () => { }, currentUser: { getIdToken: async () => "test-token" } }),
        fetch: (async () => Response.json(body)) as unknown as typeof fetch,
    };
    await assert.rejects(client.fetchKnowledgeDocumentPreview(DOCUMENT, undefined, dependencies), /preview response was invalid/i);
});

test("client rejects a one-based pageNumber that contradicts pageId", async () => {
    const body = {
        documentId: DOCUMENT,
        processingStatus: "READY",
        approvalStatus: "DRAFT",
        pages: [{
            pageId: "page-000001", pageNumber: "0", extractedText: "text", textContentHash: hashProcessingContent("text"),
            imagePresent: false, imageWidth: null, imageHeight: null, publishedOwnershipVerified: true,
        }],
        nextCursor: null,
    };
    const dependencies = {
        getAuth: () => ({ authStateReady: async () => { }, currentUser: { getIdToken: async () => "test-token" } }),
        fetch: (async () => Response.json(body)) as unknown as typeof fetch,
    };
    await assert.rejects(client.fetchKnowledgeDocumentPreview(DOCUMENT, undefined, dependencies), /preview response was invalid/i);
});

test("client rejects malformed and oversized preview payloads", async () => {
    const invalidBody = {
        documentId: DOCUMENT,
        processingStatus: "READY",
        approvalStatus: "DRAFT",
        pages: Array.from({ length: 9 }, (_, index) => ({
            pageId: pageId(index), pageNumber: String(index + 1), extractedText: "", textContentHash: "0".repeat(64),
            imagePresent: false, imageWidth: null, imageHeight: null, publishedOwnershipVerified: true,
        })),
        nextCursor: null,
    };
    const dependencies = {
        getAuth: () => ({ authStateReady: async () => { }, currentUser: { getIdToken: async () => "token" } }),
        fetch: (async () => Response.json(invalidBody)) as unknown as typeof fetch,
    };
    await assert.rejects(client.fetchKnowledgeDocumentPreview(DOCUMENT, undefined, dependencies), /preview response was invalid/i);
});

test("Preview visibility requires View permission and READY state only", () => {
    assert.equal(client.knowledgePreviewVisible({ view: true, upload: false, manage: false, approve: false }, "READY"), true);
    assert.equal(client.knowledgePreviewVisible({ view: false, upload: true, manage: true, approve: true }, "READY"), false);
    assert.equal(client.knowledgePreviewVisible({ view: true, upload: false, manage: false, approve: false }, "PROCESSING"), false);
});

test("route is authenticated GET-only, rejects extra query fields, and has private no-store responses", () => {
    const route = readFileSync("src/app/api/iq200/knowledge/documents/[documentId]/preview/route.ts", "utf8");
    assert.match(route, /export async function GET/);
    assert.match(route, /authenticateServerRequest\(request\)/);
    assert.match(route, /getKnowledgeDocumentPreview\(context, documentId/);
    assert.match(route, /Array\.from\(url\.searchParams\.keys\(\)\)\.some/);
    assert.match(route, /url\.searchParams\.has\("cursor"\) && !cursors\[0\]/);
    assert.match(route, /private, no-store/);
    assert.doesNotMatch(route, /request\.json\(|request\.text\(/);
});

test("UI exposes loading, error, page result, and next-page states while keeping Preview separate from Approve", () => {
    const page = readFileSync("src/app/admin/iq200-knowledge/page.tsx", "utf8");
    assert.match(page, /knowledgePreviewVisible\(capabilities, item\.processingStatus\)/);
    assert.match(page, /Loading processed pages/);
    assert.match(page, /previewErrors\[item\.documentId\]/);
    assert.match(page, /page\.publishedOwnershipVerified/);
    assert.match(page, /page\.textContentHash/);
    assert.match(page, /page\.imagePresent/);
    assert.match(page, /loadPreview\(item\.documentId, preview\.nextCursor!, true\)/);
    assert.match(page, /fetchKnowledgeDocumentPreview\(documentId, cursor\)/);
    assert.match(page, /approveKnowledgeDocument\(documentId\)/);
    const previewHandler = page.split("const togglePreview =")[1]?.split("const approve =")[0] || "";
    assert.match(previewHandler, /loadPreview/);
    assert.match(previewHandler, /if \(opening\)/);
    assert.match(previewHandler, /loadPreview\(document\.documentId\)/);
    assert.doesNotMatch(previewHandler, /approveKnowledgeDocument|uploadKnowledgePdf/);
});

test("preview service has no persistence or external side-effect dependencies", () => {
    const service = readFileSync("src/lib/iq200/knowledgePreviewService.ts", "utf8");
    const route = readFileSync("src/app/api/iq200/knowledge/documents/[documentId]/preview/route.ts", "utf8");
    assert.doesNotMatch(service, /\.update\(|\.set\(|\.delete\(|adminStorage|CloudTasksClient|enqueueKnowledge|knowledgeProcessingOrchestrator|runHostedReasoning|sendWhatsApp|sendEmail/i);
    assert.doesNotMatch(route, /technicalKnowledgeRequest|resolveTechnicalPage|resolveTechnicalImage|runHostedReasoning|sendWhatsApp|sendEmail/i);
    assert.match(service, /readDocumentWindow/);
    assert.match(service, /adminDb\.runTransaction/);
});

test("preview client uses the existing no-retry authenticated request helper", () => {
    const source = readFileSync("src/lib/iq200/knowledgeClient.ts", "utf8");
    assert.match(source, /fetchKnowledgeDocumentPreview/);
    assert.match(source, /const authorization = await bearerHeader\(dependencies\)/);
    assert.match(source, /method: "GET"/);
    assert.doesNotMatch(source, /knowledgePreview.*retry|retry.*knowledgePreview/i);
});

test("preview contract exports the hard response limits", () => {
    assert.equal(contracts.KNOWLEDGE_PREVIEW_PAGE_LIMIT, 8);
    assert.equal(contracts.KNOWLEDGE_PREVIEW_EXCERPT_LIMIT, 1500);
    assert.equal(contracts.KNOWLEDGE_PREVIEW_TOTAL_TEXT_LIMIT, 12000);
});