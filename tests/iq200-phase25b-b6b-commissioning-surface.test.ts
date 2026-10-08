import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

const dataModule = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "firebase/auth") {
            return {
                url: dataModule(`export function getAuth(){return {authStateReady:async()=>{},currentUser:{getIdToken:async()=>"mock-id-token"}}}`),
                shortCircuit: true,
            };
        }
        return nextResolve(specifier, context);
    },
});

const client = await import("../src/lib/iq200/client.ts");
const pageSource = readFileSync("src/app/jobs/[id]/iq200/page.tsx", "utf8");
const commissioningPanelSource = readFileSync("src/app/admin/iq200-knowledge/CommissioningPanel.tsx", "utf8");

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

test("commissioning is absent from job IQ200 while normal session/reasoning actions remain", () => {
    assert.doesNotMatch(pageSource, /commissioningSurfaceAvailable|runKnowledgeRetrieval|fetchJobKnowledge|Run Knowledge Retrieval/);
    const normalHandlerStart = pageSource.indexOf("async function startSession");
    const normalHandlerEnd = pageSource.indexOf("async function searchHistory", normalHandlerStart);
    const normalHandler = pageSource.slice(normalHandlerStart, normalHandlerEnd);
    assert.match(normalHandler, /\/sessions/);
    assert.match(normalHandler, /\/reason/);
    assert.match(pageSource, /KnownFixesSection fixes=\{knownFixes\}/);
});

test("admin commissioning component cleans object URLs and rejects stale citation responses", () => {
    assert.match(commissioningPanelSource, /useEffect\(\(\) => \(\) => urlRegistryRef\.current\.revokeAll\(\), \[\]\)/);
    assert.match(commissioningPanelSource, /function clearResults\(\)/);
    assert.match(commissioningPanelSource, /generationRef\.current\.invalidate\(\)/);
    assert.match(commissioningPanelSource, /urlRegistryRef\.current\.revokeAll\(\)/);
    assert.match(commissioningPanelSource, /generationRef\.current\.capture\(key\)/);
    assert.match(commissioningPanelSource, /generationRef\.current\.isCurrent\(activeCitation\)/);
    assert.match(commissioningPanelSource, /urlRegistryRef\.current\.create\(key, blob\)/);
});