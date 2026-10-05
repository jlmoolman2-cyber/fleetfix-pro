import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
        return nextResolve(specifier, context);
    },
});

const { listKnowledgeDocuments, KNOWLEDGE_LIST_LIMIT } = await import("../src/lib/iq200/knowledgeListService.ts");
const client = await import("../src/lib/iq200/knowledgeClient.ts");

type Context = Parameters<typeof listKnowledgeDocuments>[0];
type CodedError = { code: string; status: number; message: string };
const ctx = (permissions: Record<string, boolean>, extra: Record<string, unknown> = {}) =>
    ({ uid: "u1", companyId: "comp_001", token: {}, companyUser: { permissions, ...extra } }) as unknown as Context;

const VIEW = "View IQ200 Knowledge";
const UPLOAD = "Upload IQ200 Knowledge";

const stored = (id: string, uploadedAt: string, extra: Record<string, unknown> = {}) => ({
    id,
    data: {
        title: `t-${id}`, description: "d", originalFilename: `${id}.pdf`, mimeType: "application/pdf", sizeBytes: 10,
        uploadedAt: { toDate: () => new Date(uploadedAt) }, processingStatus: "PENDING", approvalStatus: "DRAFT", pageCount: 0,
        storagePath: "secret/path", contentHash: "hash", uploadedBy: "uid", processingAttemptId: "a", processingInvocationId: "i",
        processingLease: { owner: "x" }, ...extra,
    },
});

test("upload without view returns capabilities and no documents", async () => {
    let loaded = false;
    const result = await listKnowledgeDocuments(ctx({ [UPLOAD]: true }, { primaryRole: "Other" }), async () => { loaded = true; return []; });
    assert.deepEqual(result.capabilities, { view: false, upload: true, manage: false, approve: false });
    assert.deepEqual(result.documents, []);
    assert.equal(loaded, false);
});

test("manage or approve without view also withholds documents", async () => {
    for (const permission of ["Manage IQ200 Knowledge", "Approve IQ200 Knowledge"]) {
        let loaded = false;
        const result = await listKnowledgeDocuments(ctx({ [permission]: true }), async () => { loaded = true; return []; });
        assert.equal(result.capabilities.view, false);
        assert.equal(loaded, false);
    }
});

test("view without upload loads documents", async () => {
    const result = await listKnowledgeDocuments(ctx({ [VIEW]: true }, { primaryRole: "Other" }), async () => [stored("a", "2026-01-01T00:00:00Z")]);
    assert.equal(result.capabilities.view, true);
    assert.equal(result.capabilities.upload, false);
    assert.equal(result.documents.length, 1);
});

test("none of the four permissions is forbidden", async () => {
    await assert.rejects(
        listKnowledgeDocuments(ctx({ "View jobs": true }, { primaryRole: "Other" }), async () => []),
        (error: CodedError) => error.status === 403 && error.code === "FORBIDDEN",
    );
});

test("role name alone does not grant capabilities beyond effective permissions", async () => {
    const technician = await listKnowledgeDocuments(ctx({ [VIEW]: false, [UPLOAD]: true }, { primaryRole: "Administrator" }), async () => []);
    assert.equal(technician.capabilities.view, false);
    await assert.rejects(
        listKnowledgeDocuments(ctx({}, { primaryRole: "Driver" }), async () => []),
        (error: CodedError) => error.status === 403,
    );
});

test("company comes from authenticated context and limit is 50", async () => {
    let seen: [string, number] | null = null;
    await listKnowledgeDocuments({ ...ctx({ [VIEW]: true }), companyId: "comp_xyz" }, async (companyId, limit) => { seen = [companyId, limit]; return []; });
    assert.deepEqual(seen, ["comp_xyz", 50]);
    assert.equal(KNOWLEDGE_LIST_LIMIT, 50);
});

test("results are capped at 50 and ordered by uploadedAt descending", async () => {
    const many = Array.from({ length: 60 }, (_, i) => stored(`d${i}`, new Date(2026, 0, 1 + i).toISOString()));
    const result = await listKnowledgeDocuments(ctx({ [VIEW]: true }), async () => many);
    assert.equal(result.documents.length, 50);
    assert.equal(result.documents[0].documentId, "d59");
    const times = result.documents.map((d) => Date.parse(d.uploadedAt!));
    assert.deepEqual([...times].sort((a, b) => b - a), times);
});

test("response allowlist excludes internal fields", async () => {
    const result = await listKnowledgeDocuments(ctx({ [VIEW]: true }), async () => [stored("a", "2026-01-01T00:00:00Z")]);
    assert.deepEqual(Object.keys(result.documents[0]).sort(), [
        "approvalStatus", "description", "documentId", "mimeType", "originalFilename", "pageCount", "processingStatus", "sizeBytes", "title", "uploadedAt",
    ]);
    const json = JSON.stringify(result);
    for (const forbidden of ["storagePath", "contentHash", "uploadedBy", "processingAttemptId", "processingInvocationId", "processingLease", "secret/path"]) {
        assert.equal(json.includes(forbidden), false, forbidden);
    }
    assert.equal(result.documents[0].uploadedAt, "2026-01-01T00:00:00.000Z");
});

// ─── Client ──────────────────────────────────────────────────────────────────

function makeDeps(responder: () => Response | Promise<Response>, signedIn = true) {
    const calls: { path: string; init: RequestInit }[] = [];
    const deps = {
        getAuth: () => ({ authStateReady: async () => { }, currentUser: signedIn ? { getIdToken: async () => "TOKEN-VALUE" } : null }),
        fetch: (async (path: string, init: RequestInit) => { calls.push({ path, init }); return responder(); }) as unknown as typeof fetch,
    };
    return { deps, calls };
}

const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "a.pdf", { type: "application/pdf" });
const uploadBody = (status: number, retry: boolean) => Response.json(
    { documentId: "doc1", originalFilename: "a.pdf", processingStatus: "PENDING", approvalStatus: "DRAFT", idempotentRetry: retry, storagePath: "x" },
    { status },
);

test("multipart upload sends FormData with internal auth and idempotency key and no content-type", async () => {
    const { deps, calls } = makeDeps(() => uploadBody(201, false));
    const key = client.createKnowledgeIdempotencyKey();
    const outcome = await client.uploadKnowledgePdf({ file: pdf(), title: "T", description: "D" }, key, deps);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/api/iq200/knowledge/documents/upload");
    assert.equal(calls[0].init.method, "POST");
    assert.ok(calls[0].init.body instanceof FormData);
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.authorization, "Bearer TOKEN-VALUE");
    assert.equal(headers["Idempotency-Key"], key);
    assert.equal(Object.keys(headers).some((name) => name.toLowerCase() === "content-type"), false);
    const form = calls[0].init.body as FormData;
    assert.equal(form.get("title"), "T");
    assert.equal(form.get("description"), "D");
    assert.ok(form.get("file"));
    assert.equal(outcome.created, true);
    assert.equal(outcome.idempotentRetry, false);
    assert.equal(JSON.stringify(outcome).includes("TOKEN-VALUE"), false);
    assert.equal("storagePath" in outcome.document, false);
});

test("200 response is an idempotent retry", async () => {
    const { deps } = makeDeps(() => uploadBody(200, true));
    const outcome = await client.uploadKnowledgePdf({ file: pdf() }, client.createKnowledgeIdempotencyKey(), deps);
    assert.equal(outcome.created, false);
    assert.equal(outcome.idempotentRetry, true);
    assert.equal(outcome.document.documentId, "doc1");
});

test("structured errors map code and message, with exactly one fetch and no token leakage", async () => {
    const { deps, calls } = makeDeps(() => Response.json({ error: { code: "DUPLICATE_DOCUMENT", message: "Duplicate." } }, { status: 409 }));
    await assert.rejects(
        client.uploadKnowledgePdf({ file: pdf() }, client.createKnowledgeIdempotencyKey(), deps),
        (error: CodedError) => error.code === "DUPLICATE_DOCUMENT" && error.message === "Duplicate." && error.status === 409 && !JSON.stringify(error).includes("TOKEN-VALUE"),
    );
    assert.equal(calls.length, 1);
});

test("network failure is not retried", async () => {
    const { deps, calls } = makeDeps(() => { throw new Error("boom TOKEN-VALUE"); });
    await assert.rejects(
        client.uploadKnowledgePdf({ file: pdf() }, client.createKnowledgeIdempotencyKey(), deps),
        (error: CodedError) => error.code === "NETWORK" && !error.message.includes("TOKEN-VALUE"),
    );
    assert.equal(calls.length, 1);
});

test("no signed-in user fails before any fetch", async () => {
    const { deps, calls } = makeDeps(() => uploadBody(201, false), false);
    await assert.rejects(client.uploadKnowledgePdf({ file: pdf() }, client.createKnowledgeIdempotencyKey(), deps), (error: CodedError) => error.code === "AUTH_REQUIRED");
    assert.equal(calls.length, 0);
});

test("idempotency keys are server compatible and unique per generation", () => {
    const a = client.createKnowledgeIdempotencyKey();
    const b = client.createKnowledgeIdempotencyKey();
    assert.match(a, /^[A-Za-z0-9_-]{1,128}$/);
    assert.notEqual(a, b);
});

test("library fetch attaches auth internally with a single GET", async () => {
    const { deps, calls } = makeDeps(() => Response.json({ capabilities: { view: true, upload: false, manage: false, approve: false }, documents: [] }));
    const result = await client.fetchKnowledgeLibrary(deps);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, "GET");
    assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer TOKEN-VALUE");
    assert.equal(result.documents.length, 0);
});

test("PDF validation", () => {
    const max = 20 * 1024 * 1024;
    assert.ok(client.validateKnowledgePdf(null));
    assert.ok(client.validateKnowledgePdf({ size: 0, type: "application/pdf" }));
    assert.ok(client.validateKnowledgePdf({ size: 10, type: "image/png" }));
    assert.equal(client.validateKnowledgePdf({ size: max, type: "application/pdf" }), null);
    assert.ok(client.validateKnowledgePdf({ size: max + 1, type: "application/pdf" }));
});

test("surface capabilities gate list and upload independently", () => {
    assert.deepEqual(client.knowledgeSurfaceFor(null), { showList: false, showUpload: false, showNoViewMessage: false });
    assert.deepEqual(client.knowledgeSurfaceFor({ view: false, upload: true, manage: false, approve: false }), { showList: false, showUpload: true, showNoViewMessage: true });
    assert.deepEqual(client.knowledgeSurfaceFor({ view: true, upload: false, manage: false, approve: false }), { showList: true, showUpload: false, showNoViewMessage: false });
});

test("existing iq200Api and processing files are not touched by this surface", () => {
    assert.match(readFileSync("src/lib/iq200/client.ts", "utf8"), /"content-type": "application\/json"/);
    const route = readFileSync("src/app/api/iq200/knowledge/documents/route.ts", "utf8");
    assert.match(route, /force-dynamic/);
    assert.match(route, /no-store/);
    assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(route), false);
    assert.equal(/request\.url|searchParams|companyId/.test(route), false);
});
