import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { ServerAccessError } from "../src/lib/serverAuthCore.ts";
import { buildKnowledgePageId, hashProcessingContent } from "../src/lib/iq200/knowledgePageProcessingCore.ts";
import { retrieveKnowledgePages } from "../src/lib/iq200/knowledgeRetrievalCore.ts";
import {
    handleCommissioningKnowledgeRequest,
    parseKnowledgeInput,
    resolveCommissioningImage,
    resolveCommissioningPage,
    searchCommissioningKnowledge,
    type KnowledgeAccessContext,
    type KnowledgeReadDependencies,
    type ServicePage,
} from "../src/lib/iq200/knowledgeRetrievalServiceCore.ts";
import type { RetrievalDocument } from "../src/lib/iq200/knowledgeRetrievalContracts.ts";

const moduleUrl = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const authBridgeKey = "__iq200CommissioningClientAuth";
const routeCallKey = "__iq200CommissioningRouteCalls";
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "server-only") return { url: moduleUrl("export {}"), shortCircuit: true };
        if (specifier === "firebase/auth") return { url: moduleUrl(`export function getAuth(){return {authStateReady:async()=>{},get currentUser(){return Reflect.get(globalThis,${JSON.stringify(authBridgeKey)})||null}}}`), shortCircuit: true };
        if (specifier === "@/lib/iq200/stagingCommissioningGuard") return { url: new URL("../src/lib/iq200/stagingCommissioningGuard.ts", import.meta.url).href, shortCircuit: true };
        if (specifier === "@/lib/iq200/knowledgeRetrievalService") return { url: moduleUrl(`export async function commissioningKnowledgeRequest(){Reflect.get(globalThis,${JSON.stringify(routeCallKey)}).push("service");return Response.json({ok:true})}`), shortCircuit: true };
        return nextResolve(specifier, context);
    }
});

const { stagingCommissioningAvailableFor } = await import("../src/lib/iq200/stagingCommissioningGuard.ts");
const { isJobKnowledgeResponse } = await import("../src/lib/iq200/client.ts");
const commissioningRetrieveRoute = await import("../src/app/api/iq200/knowledge/commissioning/retrieve/route.ts");

const question = "What remediation was this verification document created to verify?";
const pageText = "Hosted PDF parsing and rendering after per-getDocument byte-ownership remediation.";
const companyId = "comp_001";
const documentId = "verification-doc";
const pageId = buildKnowledgePageId(0);

function context(overrides: Partial<{ active: boolean; permissions: Record<string, boolean> }> = {}): KnowledgeAccessContext {
    return {
        companyId, companyUser: {
            active: overrides.active ?? true,
            primaryRole: "Other",
            permissions: overrides.permissions ?? { "Use IQ200 Technician Assist": true, "View IQ200 Knowledge": true },
        }
    };
}

function document(overrides: Partial<RetrievalDocument> = {}): RetrievalDocument {
    return {
        companyId,
        documentId,
        title: "IQ200 Staging Ownership Remediation Verification",
        description: "Hosted PDF parsing and rendering verification",
        originalFilename: "verification.pdf",
        contentHash: hashProcessingContent("document bytes"),
        processingStatus: "READY",
        approvalStatus: "APPROVED",
        publishedProcessingAttemptId: "attempt-1",
        publishedProcessingInvocationId: "invocation-1",
        ...overrides,
    };
}

function page(overrides: Partial<ServicePage> = {}): ServicePage {
    return {
        documentId,
        pageId,
        pageIndex: 0,
        displayPageNumber: "1",
        extractedText: pageText,
        textContentHash: hashProcessingContent(pageText),
        processingAttemptId: "attempt-1",
        processingInvocationId: "invocation-1",
        imageStorageRef: `companies/${companyId}/iq200/documents/${documentId}/processing/attempt-1/invocation-1/pages/${pageId}.png`,
        imageWidth: 2,
        imageHeight: 2,
        ...overrides,
    };
}

function fixture() {
    const sourceDocument = document();
    const sourcePage = page();
    const calls: string[] = [];
    const png = new Uint8Array(33);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer);
    view.setUint32(8, 13);
    png.set([73, 72, 68, 82], 12);
    view.setUint32(16, 2);
    view.setUint32(20, 2);
    const deps: KnowledgeReadDependencies = {
        async authorizeJob() { calls.push("job"); throw new Error("No job authorization is available to this harness"); },
        async documents(requestCompany, cursor, limit) { calls.push("documents"); assert.equal(requestCompany, companyId); assert.equal(cursor, undefined); assert.equal(limit, 51); return [sourceDocument]; },
        async pages(requestCompany, requestDocument, limit) { calls.push("pages"); assert.equal(requestCompany, companyId); assert.equal(requestDocument, documentId); assert.equal(limit, 201); return [sourcePage]; },
        async currentPage(requestCompany, requestDocument, requestPage) { calls.push("current"); assert.equal(requestCompany, companyId); return requestDocument === documentId && requestPage === pageId ? { document: sourceDocument, page: sourcePage } : null; },
        async assetMetadata(path) { calls.push("metadata"); assert.equal(path, sourcePage.imageStorageRef); return { size: png.byteLength, contentType: "image/png", generation: "123" }; },
        async imageBytes(path, generation, maximum) { calls.push("image"); assert.equal(path, sourcePage.imageStorageRef); assert.equal(generation, "123"); assert.equal(maximum, 16 * 1024 * 1024); return png; },
    };
    return { sourceDocument, sourcePage, calls, deps };
}

async function withFetch<T>(fetcher: typeof fetch, work: () => Promise<T>): Promise<T> {
    const original = globalThis.fetch;
    globalThis.fetch = fetcher;
    try { return await work(); }
    finally { globalThis.fetch = original; }
}

async function withServerEnvironment<T>(environment: Record<string, string | undefined>, work: () => Promise<T>): Promise<T> {
    const keys = ["FLEETFIX_ENVIRONMENT", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT", "FIREBASE_CONFIG"];
    const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) {
        const value = environment[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    try { return await work(); }
    finally {
        for (const key of keys) {
            const value = prior[key];
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

const stagingEnv = { FLEETFIX_ENVIRONMENT: "staging", GOOGLE_CLOUD_PROJECT: "fleetfix-pro-staging" };

test("staging guard authorizes only explicit staging and trusted staging project identity", () => {
    assert.equal(stagingCommissioningAvailableFor(stagingEnv), true);
    assert.equal(stagingCommissioningAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", GCLOUD_PROJECT: "fleetfix-pro-staging" }), true);
    assert.equal(stagingCommissioningAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", FIREBASE_CONFIG: JSON.stringify({ projectId: "fleetfix-pro-staging" }) }), true);
    assert.equal(stagingCommissioningAvailableFor({}), false);
    assert.equal(stagingCommissioningAvailableFor({ GOOGLE_CLOUD_PROJECT: "fleetfix-pro-staging" }), false);
    assert.equal(stagingCommissioningAvailableFor({ ...stagingEnv, FLEETFIX_ENVIRONMENT: "production" }), false);
    assert.equal(stagingCommissioningAvailableFor({ ...stagingEnv, GOOGLE_CLOUD_PROJECT: "fleetfix-pro" }), false);
    assert.equal(stagingCommissioningAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fleetfix-pro-staging" }), false);
    assert.equal(stagingCommissioningAvailableFor({ ...stagingEnv, FIREBASE_CONFIG: "not-json" }), false);
    assert.equal(stagingCommissioningAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", FIREBASE_CONFIG: "{}" }), false);
    assert.equal(stagingCommissioningAvailableFor({ ...stagingEnv, FIREBASE_CONFIG: JSON.stringify({ projectId: 1 }) }), false);
});

test("commissioning retrieve route returns 404 outside staging without dispatching its service", async () => {
    const calls: string[] = [];
    Reflect.set(globalThis, routeCallKey, calls);
    try {
        await withServerEnvironment({ FLEETFIX_ENVIRONMENT: "production", GOOGLE_CLOUD_PROJECT: "fleetfix-pro" }, async () => {
            const response = await commissioningRetrieveRoute.POST(new Request("https://local/api/iq200/knowledge/commissioning/retrieve", { method: "POST", body: JSON.stringify({ question }) }));
            assert.equal(response.status, 404);
        });
        assert.deepEqual(calls, []);
        await withServerEnvironment(stagingEnv, async () => {
            const response = await commissioningRetrieveRoute.POST(new Request("https://local/api/iq200/knowledge/commissioning/retrieve", { method: "POST", body: JSON.stringify({ question }) }));
            assert.equal(response.status, 200);
        });
        assert.deepEqual(calls, ["service"]);
    } finally { Reflect.deleteProperty(globalThis, routeCallKey); }
});

test("commissioning request parser permits only bounded question and cursor", () => {
    assert.deepEqual(parseKnowledgeInput({ question: ` ${question}  ` }), { question });
    assert.equal(parseKnowledgeInput({ question: "q".repeat(2000) }).question.length, 2000);
    for (const body of [null, [], {}, { question: " " }, { question: "q".repeat(2001) }]) assert.throws(() => parseKnowledgeInput(body));
    for (const key of ["companyId", "jobId", "documentId", "pageId", "storagePath", "provider", "reasoningOptions"]) {
        assert.throws(() => parseKnowledgeInput({ question, [key]: "untrusted" }), ServerAccessError);
    }
});

test("no-job commissioning search uses explicit question and returns the same retrieval contract", async () => {
    const f = fixture();
    const result = await searchCommissioningKnowledge(context(), { question }, f.deps);
    const expected = retrieveKnowledgePages(companyId, [{ document: f.sourceDocument, page: f.sourcePage }], { question });
    assert.deepEqual(result.results, expected.results);
    assert.deepEqual(result.evidence, expected.evidence);
    assert.equal(result.coverage.resultsReturned, 1);
    assert.equal(result.continuationCursor, null);
    assert.equal(f.calls.includes("job"), false);
    assert.equal(isJobKnowledgeResponse(result), true);
    assert.equal(result.results[0].citation.documentId, documentId);
});

test("active membership and both narrow permissions are required without View jobs or Approve", async () => {
    const f = fixture();
    assert.equal((await searchCommissioningKnowledge(context(), { question }, f.deps)).results.length, 1);
    const deniedPermissions: Array<Record<string, boolean>> = [
        { "View IQ200 Knowledge": true },
        { "Use IQ200 Technician Assist": true },
    ];
    for (const permissions of deniedPermissions) await assert.rejects(() => searchCommissioningKnowledge(context({ permissions }), { question }, f.deps), ServerAccessError);
    await assert.rejects(() => searchCommissioningKnowledge(context({ active: false }), { question }, f.deps), ServerAccessError);
    assert.equal(f.calls.includes("documents"), true);
});

test("READY and APPROVED eligibility is shared; DRAFT, FAILED, and INACTIVE are excluded", async () => {
    const f = fixture();
    for (const status of ["DRAFT", "REJECTED", "INACTIVE"]) {
        f.sourceDocument.approvalStatus = status;
        assert.equal((await searchCommissioningKnowledge(context(), { question }, f.deps)).results.length, 0);
    }
    f.sourceDocument.approvalStatus = "APPROVED";
    for (const status of ["PENDING", "PROCESSING", "FAILED"]) {
        f.sourceDocument.processingStatus = status;
        assert.equal((await searchCommissioningKnowledge(context(), { question }, f.deps)).results.length, 0);
    }
    assert.equal(f.calls.includes("job"), false);
});

test("page citation resolution reruns shared retrieval and validates current published generation", async () => {
    const f = fixture();
    const search = await searchCommissioningKnowledge(context(), { question }, f.deps);
    const citation = search.results[0].citation;
    const resolution = await resolveCommissioningPage(context(), documentId, pageId, { question, evidenceReference: citation.evidenceReference }, f.deps);
    assert.deepEqual(resolution.citation, citation);
    assert.equal(resolution.imageWidth, 2);
    assert.deepEqual(f.calls.filter((call) => call === "job"), []);
    await assert.rejects(() => resolveCommissioningPage(context(), documentId, pageId, { question, evidenceReference: `TECHNICAL_DOCUMENT_${"0".repeat(64)}` }, f.deps), ServerAccessError);
    await assert.rejects(() => resolveCommissioningPage(context(), "other", pageId, { question, evidenceReference: citation.evidenceReference }, f.deps), ServerAccessError);
    await assert.rejects(() => resolveCommissioningPage(context(), documentId, "page-000002", { question, evidenceReference: citation.evidenceReference }, f.deps), ServerAccessError);
});

test("published generation, approval, and hashes are revalidated; arbitrary Storage paths cannot be supplied", async () => {
    const f = fixture();
    const citation = (await searchCommissioningKnowledge(context(), { question }, f.deps)).results[0].citation;
    for (const body of [
        { question, evidenceReference: citation.evidenceReference, storagePath: "arbitrary" },
        { question, evidenceReference: citation.evidenceReference, companyId },
        { question, evidenceReference: citation.evidenceReference, documentId },
    ]) await assert.rejects(() => resolveCommissioningPage(context(), documentId, pageId, body, f.deps), ServerAccessError);
    f.sourceDocument.approvalStatus = "INACTIVE";
    await assert.rejects(() => resolveCommissioningPage(context(), documentId, pageId, { question, evidenceReference: citation.evidenceReference }, f.deps), ServerAccessError);
    f.sourceDocument.approvalStatus = "APPROVED";
    f.sourcePage.processingInvocationId = "stale-generation";
    await assert.rejects(() => resolveCommissioningPage(context(), documentId, pageId, { question, evidenceReference: citation.evidenceReference }, f.deps), ServerAccessError);
});

test("image route derives owned Storage path, pins current generation, and remains read-only", async () => {
    const f = fixture();
    const citation = (await searchCommissioningKnowledge(context(), { question }, f.deps)).results[0].citation;
    const response = await resolveCommissioningImage(context(), documentId, pageId, { question, evidenceReference: citation.evidenceReference }, f.deps);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(f.calls.filter((call) => ["documents", "pages", "current", "metadata", "image"].includes(call)), ["documents", "pages", "documents", "pages", "current", "metadata", "image"]);
    assert.equal(f.calls.includes("job"), false);
});

test("bounded commissioning handler authenticates and rejects missing/unknown request data before reads", async () => {
    const f = fixture();
    const dependencies = () => f.deps;
    const authenticate = async () => context();
    const errorResponse = (error: unknown) => error instanceof ServerAccessError
        ? Response.json({ error: { code: error.code } }, { status: error.status })
        : Response.json({ error: { code: "INTERNAL" } }, { status: 500 });
    const request = (body: unknown) => new Request("https://local/commissioning", { method: "POST", body: JSON.stringify(body) });
    const valid = await handleCommissioningKnowledgeRequest(request({ question }), {}, "search", authenticate, dependencies, errorResponse);
    assert.equal(valid.status, 200);
    for (const body of [{ companyId, question }, { jobId: "job-a", question }, { documentId, question }, { pageId, question }, { storagePath: "x", question }, { question: "" }, { question: "q".repeat(2001) }]) {
        const response = await handleCommissioningKnowledgeRequest(request(body), {}, "search", authenticate, dependencies, errorResponse);
        assert.equal(response.status, 400);
    }
    const denied = await handleCommissioningKnowledgeRequest(request({ question }), {}, "search", async () => { throw new ServerAccessError("AUTH_REQUIRED", "Required", 401); }, dependencies, errorResponse);
    assert.equal(denied.status, 401);
});

test("admin client sends authenticated no-job request and reuses strict B5 response validation", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    Reflect.set(globalThis, authBridgeKey, { getIdToken: async () => "mock-staging-token" });
    try {
        const response = await withFetch((async (input, init) => {
            calls.push({ url: String(input), init });
            return Response.json({ ...retrieveKnowledgePages(companyId, [{ document: document(), page: page() }], { question }), continuationCursor: null });
        }) as typeof fetch, () => import("../src/lib/iq200/client.ts").then((client) => client.fetchCommissioningKnowledge(question, "next-document")));
        assert.equal(response.data.results[0].citation.documentId, documentId);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, "/api/iq200/knowledge/commissioning/retrieve");
        assert.equal(calls[0].init?.method, "POST");
        assert.equal((calls[0].init?.headers as Record<string, string>).authorization, "Bearer mock-staging-token");
        assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { question, cursor: "next-document" });
        assert.equal(isJobKnowledgeResponse(response.data), true);
    } finally { Reflect.deleteProperty(globalThis, authBridgeKey); }
});

test("admin client page and image helpers use citation identifiers and reject mismatched page DTOs", async () => {
    const citation = retrieveKnowledgePages(companyId, [{ document: document(), page: page() }], { question }).results[0].citation;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    Reflect.set(globalThis, authBridgeKey, { getIdToken: async () => "mock-staging-token" });
    try {
        const pageResult = await withFetch((async (input, init) => {
            calls.push({ url: String(input), init });
            return Response.json({ citation, imageWidth: 2, imageHeight: 2 });
        }) as typeof fetch, () => import("../src/lib/iq200/client.ts").then((client) => client.resolveCommissioningKnowledgePage(question, citation)));
        assert.equal(pageResult.citation.evidenceReference, citation.evidenceReference);
        assert.equal(calls[0].url, `/api/iq200/knowledge/commissioning/${documentId}/pages/${pageId}`);
        assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { question, evidenceReference: citation.evidenceReference });

        await withFetch((async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
        }) as typeof fetch, async () => {
            const client = await import("../src/lib/iq200/client.ts");
            const image = await client.resolveCommissioningKnowledgeImage(question, citation);
            assert.equal(image.type, "image/png");
        });
        assert.equal(calls[1].url, `/api/iq200/knowledge/commissioning/${documentId}/pages/${pageId}/image`);
        assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { question, evidenceReference: citation.evidenceReference });

        await withFetch((async () => Response.json({ citation: { ...citation, pageId: "page-000002" }, imageWidth: 2, imageHeight: 2 })) as typeof fetch, async () => {
            const client = await import("../src/lib/iq200/client.ts");
            await assert.rejects(() => client.resolveCommissioningKnowledgePage(question, citation), /invalid|did not match/i);
        });
    } finally { Reflect.deleteProperty(globalThis, authBridgeKey); }
});

test("production B5 remains job-bound and commissioning source has no mutation/provider/session path", () => {
    const b5Route = readFileSync("src/app/api/iq200/jobs/[jobId]/knowledge/route.ts", "utf8");
    const retrievalService = readFileSync("src/lib/iq200/knowledgeRetrievalService.ts", "utf8");
    const commissioningRoutes = [
        "src/app/api/iq200/knowledge/commissioning/retrieve/route.ts",
        "src/app/api/iq200/knowledge/commissioning/[documentId]/pages/[pageId]/route.ts",
        "src/app/api/iq200/knowledge/commissioning/[documentId]/pages/[pageId]/image/route.ts",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    assert.match(b5Route, /technicalKnowledgeRequest\(request, await params, "search"\)/);
    assert.match(retrievalService, /async authorizeJob\(_context, jobId\)/);
    assert.match(retrievalService, /authorisedJob\(context, jobId\)/);
    assert.match(commissioningRoutes, /stagingCommissioningAvailableFor\(\)/);
    assert.doesNotMatch(commissioningRoutes + retrievalService, /runHostedReasoning|HostedReasoningProvider|createTask|communicationQueue|createIQ200Session|\/reason|\.save\(|\.delete\(/i);
    assert.doesNotMatch(retrievalService, /8184cfaf-45c7-4447-9f32-8afed0bdbacf/);
});

test("admin action is gated by the authenticated server result and job page no longer has commissioning UI", () => {
    const adminPage = readFileSync("src/app/admin/iq200-knowledge/page.tsx", "utf8");
    const listRoute = readFileSync("src/app/api/iq200/knowledge/documents/route.ts", "utf8");
    const panel = readFileSync("src/app/admin/iq200-knowledge/CommissioningPanel.tsx", "utf8");
    const jobPage = readFileSync("src/app/jobs/[id]/iq200/page.tsx", "utf8");
    assert.match(listRoute, /stagingCommissioningAvailableFor\(\)/);
    assert.match(listRoute, /Use IQ200 Technician Assist/);
    assert.match(listRoute, /View IQ200 Knowledge/);
    assert.match(adminPage, /commissioningAvailable && <CommissioningPanel/);
    assert.match(adminPage, /setCommissioningAvailable\(false\)/);
    assert.match(panel, /STAGING COMMISSIONING/);
    assert.match(panel, /Run Knowledge Retrieval Commissioning/);
    assert.match(panel, /fetchCommissioningKnowledge/);
    assert.doesNotMatch(jobPage, /commissioningSurfaceAvailable|runKnowledgeRetrieval|Run Knowledge Retrieval/);
    assert.match(jobPage, /async function startSession/);
    assert.match(jobPage, /async function searchHistory/);
});

test("commissioning routes have no document-specific bypass and production support routes remain job-bound", () => {
    const routes = [
        "src/app/api/iq200/knowledge/commissioning/retrieve/route.ts",
        "src/app/api/iq200/knowledge/commissioning/[documentId]/pages/[pageId]/route.ts",
        "src/app/api/iq200/knowledge/commissioning/[documentId]/pages/[pageId]/image/route.ts",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    const productionPage = readFileSync("src/app/api/iq200/jobs/[jobId]/knowledge/[documentId]/pages/[pageId]/route.ts", "utf8");
    const productionImage = readFileSync("src/app/api/iq200/jobs/[jobId]/knowledge/[documentId]/pages/[pageId]/image/route.ts", "utf8");
    assert.doesNotMatch(routes, /8184cfaf-45c7-4447-9f32-8afed0bdbacf|companyId\s*:/);
    assert.match(productionPage, /technicalKnowledgeRequest\(request, await params, "page"\)/);
    assert.match(productionImage, /technicalKnowledgeRequest\(request, await params, "image"\)/);
});
