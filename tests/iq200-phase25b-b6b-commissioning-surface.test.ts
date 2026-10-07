import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

const dataModule = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const firebaseEnvironmentUrl = pathToFileURL(resolve("src/lib/firebaseEnvironment.ts")).href;

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "firebase/auth") {
            return {
                url: dataModule(`export function getAuth(){return {authStateReady:async()=>{},currentUser:{getIdToken:async()=>"mock-id-token"}}}`),
                shortCircuit: true,
            };
        }
        if (specifier === "@/lib/iq200/service") {
            return { url: dataModule(`export async function getIQ200JobContext(_context,jobId){return {job:{id:jobId,number:"J-TEST"},currentUser:{name:"Test caller"}}}`), shortCircuit: true };
        }
        if (specifier === "@/lib/serverAuth") {
            return {
                url: dataModule(`export async function authenticateServerRequest(){return {uid:"user-test",companyId:"comp_001",companyUser:{active:true},token:{}}} export function safeServerErrorResponse(){return Response.json({error:{code:"INTERNAL"}},{status:500})}`),
                shortCircuit: true,
            };
        }
        if (specifier === "@/lib/firebaseEnvironment") return { url: firebaseEnvironmentUrl, shortCircuit: true };
        return nextResolve(specifier, context);
    },
});

const client = await import("../src/lib/iq200/client.ts");
const contextRoute = await import("../src/app/api/iq200/jobs/[jobId]/context/route.ts");
const pageSource = readFileSync("src/app/jobs/[id]/iq200/page.tsx", "utf8");

const citation = {
    evidenceReference: `TECHNICAL_DOCUMENT_${"a".repeat(64)}`,
    documentId: "8184cfaf-45c7-4447-9f32-8afed0bdbacf",
    documentTitle: "IQ200 Staging Ownership Remediation Verification",
    documentContentHash: "b".repeat(64),
    pageId: "page-000001",
    pageIndex: 0,
    displayPageNumber: "1",
    textContentHash: "c".repeat(64),
    originalFilename: "verification.pdf",
    processingAttemptId: "attempt-current",
    processingInvocationId: "invocation-current",
    excerpt: "Hosted PDF parsing and rendering after the byte-ownership remediation.",
    relevanceReasons: ["PAGE_TEXT_MATCH:2"],
    supportingPageReference: { documentId: "8184cfaf-45c7-4447-9f32-8afed0bdbacf", pageId: "page-000001" },
    evidenceCategory: "TECHNICAL_DOCUMENT" as const,
};

const retrievalResponse = {
    results: [{ relevance: [0, 0, 0, 0, 1, 2], citation }],
    evidence: [{ category: "TECHNICAL_DOCUMENT" as const, reference: citation.evidenceReference, excerpt: citation.excerpt, citation }],
    coverage: {
        candidateDocumentsConsidered: 1,
        candidatePagesConsidered: 1,
        resultsReturned: 1,
        truncated: false,
        coverageLimited: false,
        invalidCandidates: 0,
        emptyTextPages: 0,
        reasoningEvidenceLength: 75,
    },
    continuationCursor: null,
};

async function withFetch<T>(fetcher: typeof fetch, work: () => Promise<T>): Promise<T> {
    const original = globalThis.fetch;
    globalThis.fetch = fetcher;
    try {
        return await work();
    } finally {
        globalThis.fetch = original;
    }
}

async function withServerEnvironment<T>(environment: Record<string, string | undefined>, work: () => Promise<T>): Promise<T> {
    const keys = ["FLEETFIX_ENVIRONMENT", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT", "FIREBASE_CONFIG", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"];
    const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) {
        const value = environment[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    try {
        return await work();
    } finally {
        for (const key of keys) {
            const value = prior[key];
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

test("server commissioning flag is true only for the validated staging Firebase project", () => {
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", GOOGLE_CLOUD_PROJECT: "fleetfix-pro-staging" }), true);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", GCLOUD_PROJECT: "fleetfix-pro-staging" }), true);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", FIREBASE_CONFIG: JSON.stringify({ projectId: "fleetfix-pro-staging" }) }), true);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "production", GOOGLE_CLOUD_PROJECT: "fleetfix-pro" }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "production", GOOGLE_CLOUD_PROJECT: "fleetfix-pro-staging" }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "unknown", GOOGLE_CLOUD_PROJECT: "fleetfix-pro-staging" }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({}), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging" }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", GOOGLE_CLOUD_PROJECT: "unknown-project" }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fleetfix-pro-staging" }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", FIREBASE_CONFIG: "not-json" }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", FIREBASE_CONFIG: "{}" }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", FIREBASE_CONFIG: JSON.stringify({ other: "fleetfix-pro-staging" }) }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", FIREBASE_CONFIG: JSON.stringify({ projectId: "" }) }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", FIREBASE_CONFIG: "not-json", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fleetfix-pro-staging" }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", FIREBASE_CONFIG: "{}", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fleetfix-pro-staging" }), false);
    assert.equal(contextRoute.commissioningSurfaceAvailableFor({ FLEETFIX_ENVIRONMENT: "staging", GOOGLE_CLOUD_PROJECT: "fleetfix-pro" }), false);
});

test("authenticated job context response includes the server-derived staging flag", async () => {
    await withServerEnvironment({ FLEETFIX_ENVIRONMENT: "staging", GOOGLE_CLOUD_PROJECT: "fleetfix-pro-staging" }, async () => {
        const response = await contextRoute.GET(new Request("https://staging.test/api/iq200/jobs/job-1/context"), { params: Promise.resolve({ jobId: "job-1" }) });
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.job.id, "job-1");
        assert.equal(payload.commissioningSurfaceAvailable, true);
    });
});

test("standalone B5 helper sends one authenticated POST with only question and optional cursor", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const response = await withFetch((async (input, init) => {
        calls.push({ url: String(input), init });
        return Response.json(retrievalResponse, { status: 200 });
    }) as typeof fetch, () => client.fetchJobKnowledge("job_123", "  What remediation was verified?  ", "doc_cursor"));

    assert.equal(response.httpStatus, 200);
    assert.equal(response.data.results[0].citation.documentId, citation.documentId);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/iq200/jobs/job_123/knowledge");
    assert.equal(calls[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { question: "What remediation was verified?", cursor: "doc_cursor" });
    assert.equal((calls[0].init?.headers as Record<string, string>).authorization, "Bearer mock-id-token");
    assert.equal(JSON.stringify(calls[0].init?.body).includes("companyId"), false);
});

test("standalone B5 helper omits cursor and bounds invalid question/job input before fetch", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    await withFetch((async (input, init) => {
        calls.push({ url: String(input), init });
        return Response.json(retrievalResponse);
    }) as typeof fetch, async () => {
        await client.fetchJobKnowledge("job_123", "What remediation was verified?");
        await assert.rejects(client.fetchJobKnowledge("bad/job", "Question"));
        await assert.rejects(client.fetchJobKnowledge("job_123", " "));
        await assert.rejects(client.fetchJobKnowledge("job_123", "x".repeat(2001)));
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { question: "What remediation was verified?" });
});

test("actual B5 response contract preserves valid citation, coverage, and continuation cursor", async () => {
    const payload = { ...structuredClone(retrievalResponse), continuationCursor: "next-document" };
    const result = await withFetch((async () => Response.json(payload)) as unknown as typeof fetch, () => client.fetchJobKnowledge("job_123", "Question grounded in Knowledge"));
    assert.equal(result.data.results[0].citation.pageId, "page-000001");
    assert.equal(result.data.evidence[0].reference, citation.evidenceReference);
    assert.equal(result.data.coverage.candidatePagesConsidered, 1);
    assert.equal(result.data.continuationCursor, "next-document");
});

test("malformed B5 top-level shape is rejected", async () => {
    const malformed = structuredClone(retrievalResponse) as Record<string, unknown>;
    delete malformed.coverage;
    await withFetch((async () => Response.json(malformed)) as unknown as typeof fetch, async () => {
        await assert.rejects(client.fetchJobKnowledge("job_123", "Question"), /response was invalid/i);
    });
});

test("malformed nested B5 citation and fabricated identity are rejected", async () => {
    const malformedCases = [
        (payload: typeof retrievalResponse) => { (payload.results[0].citation as unknown as Record<string, unknown>).documentId = {}; },
        (payload: typeof retrievalResponse) => { (payload.results[0].citation as unknown as Record<string, unknown>).displayPageNumber = "0"; },
        (payload: typeof retrievalResponse) => { delete (payload.results[0].citation as unknown as Record<string, unknown>).pageId; },
        (payload: typeof retrievalResponse) => { (payload.evidence[0] as unknown as Record<string, unknown>).reference = "TECHNICAL_DOCUMENT_fabricated"; },
        (payload: typeof retrievalResponse) => { (payload.evidence[0].citation as unknown as Record<string, unknown>).excerpt = "different evidence"; },
        (payload: typeof retrievalResponse) => { (payload.results[0] as unknown as Record<string, unknown>).unexpected = { fabricated: true }; },
    ];
    for (const mutate of malformedCases) {
        const payload = structuredClone(retrievalResponse);
        mutate(payload);
        await withFetch((async () => Response.json(payload)) as unknown as typeof fetch, async () => {
            await assert.rejects(client.fetchJobKnowledge("job_123", "Question"), /response was invalid/i);
        });
    }
});

test("supporting page resolution is authenticated and bound to returned citation identity", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    await withFetch((async (input, init) => {
        calls.push({ url: String(input), init });
        return Response.json({ citation, imageWidth: 2481, imageHeight: 3508 });
    }) as typeof fetch, async () => {
        const resolved = await client.resolveJobKnowledgePage("job_123", "What remediation was verified?", citation);
        assert.equal(resolved.citation.evidenceReference, citation.evidenceReference);
        assert.equal(resolved.imageWidth, 2481);
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `/api/iq200/jobs/job_123/knowledge/${citation.documentId}/pages/${citation.pageId}`);
    assert.equal(calls[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { question: "What remediation was verified?", evidenceReference: citation.evidenceReference });
});

test("supporting image resolution is explicit, authenticated, and returns only PNG data", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const blob = await withFetch((async (input, init) => {
        calls.push({ url: String(input), init });
        return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
    }) as typeof fetch, () => client.resolveJobKnowledgeImage("job_123", "What remediation was verified?", citation));
    assert.equal(blob.type, "image/png");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `/api/iq200/jobs/job_123/knowledge/${citation.documentId}/pages/${citation.pageId}/image`);
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { question: "What remediation was verified?", evidenceReference: citation.evidenceReference });
});

test("supporting resolvers reject citation data that is not internally consistent", async () => {
    let calls = 0;
    await withFetch((async () => { calls++; return Response.json({}); }) as typeof fetch, async () => {
        await assert.rejects(client.resolveJobKnowledgePage("job_123", "question", { ...citation, supportingPageReference: { documentId: "other", pageId: citation.pageId } }));
        await assert.rejects(client.resolveJobKnowledgeImage("job_123", "question", { ...citation, evidenceReference: "not-a-citation" }));
    });
    assert.equal(calls, 0);
});

test("object URL registry revokes replacements and every active URL exactly once", () => {
    const revoked: string[] = [];
    let created = 0;
    const registry = client.createObjectUrlRegistry(() => `blob:test-${++created}`, (url) => revoked.push(url));
    const first = registry.create("citation-a", new Blob(["first"]));
    const replacement = registry.create("citation-a", new Blob(["replacement"]));
    const otherCitation = registry.create("citation-b", new Blob(["other"]));
    assert.deepEqual(revoked, [first]);
    registry.revokeAll();
    assert.deepEqual(revoked, [first, replacement, otherCitation]);
    registry.revokeAll();
    assert.deepEqual(revoked, [first, replacement, otherCitation]);
});

test("same-job B5 result reset invalidates an in-flight image citation before object URL creation", async () => {
    const generations = client.createCommissioningResultGeneration();
    let createUrlCount = 0;
    const registry = client.createObjectUrlRegistry(() => `blob:stale-${++createUrlCount}`, () => { });
    generations.activate([citation.evidenceReference]);
    const captured = generations.capture(citation.evidenceReference);
    assert.ok(captured);
    const lateImage = Promise.resolve(new Blob(["stale supporting image"]));

    generations.invalidate();
    const blob = await lateImage;
    let storedInUi = false;
    let createdUrl: string | null = null;
    if (generations.isCurrent(captured)) {
        createdUrl = registry.create(citation.evidenceReference, blob);
        storedInUi = true;
    }

    assert.equal(createdUrl, null);
    assert.equal(storedInUi, false);
    assert.equal(createUrlCount, 0);
});

test("commissioning UI is server-flag gated, manually submitted, and isolated from session/reasoning flow", () => {
    assert.match(pageSource, /context\.commissioningSurfaceAvailable === true/);
    assert.match(pageSource, /Knowledge Retrieval Commissioning/);
    assert.match(pageSource, /Run Knowledge Retrieval/);
    assert.match(pageSource, /Job ID: \{context\.job\.id\}/);
    assert.equal((pageSource.match(/fetchJobKnowledge\(/g) ?? []).length, 1);
    const handlerStart = pageSource.indexOf("async function runKnowledgeRetrieval");
    const handlerEnd = pageSource.indexOf("async function resolveSupportingPage", handlerStart);
    const handler = pageSource.slice(handlerStart, handlerEnd);
    assert.match(handler, /await fetchJobKnowledge\(requestJobId, commissioningQuestion\)/);
    assert.doesNotMatch(handler, /createIQ200Session|\/sessions\/|\/reason|runHostedReasoning|provider/i);
    const panel = pageSource.slice(pageSource.indexOf("context.commissioningSurfaceAvailable === true"));
    for (const field of ["citation.documentId", "citation.documentTitle", "citation.pageId", "citation.displayPageNumber", "citation.excerpt", "citation.textContentHash", "relevance.join", "coverage", "continuationCursor"]) {
        assert.ok(panel.includes(field), `missing response field ${field}`);
    }
    assert.match(panel, /Resolve supporting page/);
    assert.match(panel, /Resolve supporting image/);
});

test("existing IQ200 normal question action remains separate from the standalone commissioning handler", () => {
    const handlerStart = pageSource.indexOf("async function runKnowledgeRetrieval");
    const handlerEnd = pageSource.indexOf("async function resolveSupportingPage", handlerStart);
    const standaloneHandler = pageSource.slice(handlerStart, handlerEnd);
    const normalHandlerStart = pageSource.indexOf("async function startSession");
    const normalHandlerEnd = pageSource.indexOf("async function searchHistory", normalHandlerStart);
    const normalHandler = pageSource.slice(normalHandlerStart, normalHandlerEnd);
    assert.match(normalHandler, /\/sessions/);
    assert.match(normalHandler, /\/reason/);
    assert.doesNotMatch(standaloneHandler, /\/sessions|\/reason/);
});

test("context route derives the flag server-side from the validated project and fails closed", () => {
    const routeSource = readFileSync("src/app/api/iq200/jobs/[jobId]/context/route.ts", "utf8");
    assert.match(routeSource, /resolveServerFirebaseProject\(trustedEnvironment\)/);
    assert.match(routeSource, /catch\s*\{\s*return false/);
    assert.match(routeSource, /commissioningSurfaceAvailable: commissioningSurfaceAvailableFor\(\)/);
    assert.doesNotMatch(routeSource, /window\.location|searchParams|localStorage|NEXT_PUBLIC_FLEETFIX_ENVIRONMENT\s*===/);
});

test("object URL cleanup is wired to result reset, job changes, and component unmount", () => {
    const cleanupStart = pageSource.indexOf("function clearCommissioningOutput");
    const effectStart = pageSource.indexOf("useEffect(() => {");
    const effectEnd = pageSource.indexOf("}, [id]);", effectStart);
    const retrievalStart = pageSource.indexOf("async function runKnowledgeRetrieval");
    const retrievalEnd = pageSource.indexOf("async function resolveSupportingPage", retrievalStart);
    const cleanup = pageSource.slice(cleanupStart, effectStart);
    const jobEffect = pageSource.slice(effectStart, effectEnd);
    const retrieval = pageSource.slice(retrievalStart, retrievalEnd);
    const imageHandlerStart = pageSource.indexOf("async function resolveSupportingImage");
    const imageHandlerEnd = pageSource.indexOf("async function startSession", imageHandlerStart);
    const imageHandler = pageSource.slice(imageHandlerStart, imageHandlerEnd);
    assert.match(cleanup, /objectUrlRegistryRef\.current\.revokeAll\(\)/);
    assert.match(cleanup, /commissioningResultGenerationRef\.current\.invalidate\(\)/);
    assert.match(retrieval, /clearCommissioningOutput\(\)/);
    assert.match(jobEffect, /jobObjectUrlRegistry\.revokeAll\(\)/);
    assert.match(jobEffect, /const jobObjectUrlRegistry = objectUrlRegistryRef\.current/);
    assert.match(jobEffect, /jobObjectUrlRegistry\.revokeAll\(\)/);
    assert.match(imageHandler, /objectUrlRegistryRef\.current\.create\(key, blob\)/);
    assert.match(imageHandler, /activeJobIdRef\.current !== requestJobId/);
    assert.match(imageHandler, /commissioningResultGenerationRef\.current\.capture\(key\)/);
    assert.match(imageHandler, /commissioningResultGenerationRef\.current\.isCurrent\(resultCitation\)/);
    assert.match(retrieval, /commissioningResultGenerationRef\.current\.activate\(/);
});