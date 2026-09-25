import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type { ProcessingTaskRequest } from "../src/lib/iq200/knowledgeProcessingOrchestrator.ts";
import type { ProcessingClaimStore, ProcessingClaimTransaction } from "../src/lib/iq200/knowledgeProcessingService.ts";
import type { ProcessingGenerationStore, ProcessingGenerationTransaction } from "../src/lib/iq200/knowledgeProcessingService.ts";
import type { KnowledgeUploadRouteDependencies } from "../src/lib/iq200/knowledgeUploadRouteCore.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      return { url: new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL && context.parentURL.includes("/src/") && !context.parentURL.includes("/node_modules/") && !specifier.endsWith(".js") && !specifier.endsWith(".ts")) {
      return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

process.env.NEXT_PUBLIC_FLEETFIX_ENVIRONMENT = "staging";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "fleetfix-pro-staging";

const orchestrator = await import("../src/lib/iq200/knowledgeProcessingOrchestrator.ts");
const uploadRouteCore = await import("../src/lib/iq200/knowledgeUploadRouteCore.ts");
const processingCore = await import("../src/lib/iq200/knowledgeProcessingCore.ts");
const processingService = await import("../src/lib/iq200/knowledgeProcessingService.ts");
const processingOidc = await import("../src/lib/iq200/knowledgeProcessingOidc.ts");
const processingPageCore = await import("../src/lib/iq200/knowledgePageProcessingCore.ts");

const environment = {
  IQ200_CLOUD_TASKS_PROJECT: "fleetfix-pro-staging",
  IQ200_CLOUD_TASKS_LOCATION: "europe-west4",
  IQ200_CLOUD_TASKS_QUEUE: "iq200-processing",
  IQ200_PROCESSING_TARGET_URL: "https://fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app/api/iq200/knowledge/documents/process",
  IQ200_PROCESSING_TARGET_ORIGIN: "https://fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app",
  IQ200_PROCESSING_OIDC_SERVICE_ACCOUNT: "iq200-processing-task-invoker@fleetfix-pro-staging.iam.gserviceaccount.com",
  IQ200_PROCESSING_OIDC_AUDIENCE: "https://fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app/api/iq200/knowledge/documents/process",
};
const identity = { companyId: "company_001", documentId: "document_001", enqueueGeneration: 1 };

function fakeTransport(createTask?: (request: ProcessingTaskRequest) => Promise<unknown>) {
  const requests: ProcessingTaskRequest[] = [];
  return {
    requests,
    queuePath(project: string, location: string, queue: string) {
      return `projects/${project}/locations/${location}/queues/${queue}`;
    },
    async createTask(request: ProcessingTaskRequest) {
      requests.push(request);
      return createTask ? createTask(request) : {};
    },
  };
}

test("orchestrator constructs one OIDC POST task with a JSON descriptor", async () => {
  const transport = fakeTransport();
  const result = await orchestrator.enqueueKnowledgeProcessingTask(identity, { environment, transport });
  assert.deepEqual(result, { enqueued: true, duplicate: false });
  assert.equal(transport.requests.length, 1);
  const request = transport.requests[0];
  assert.equal(request.task.httpRequest.httpMethod, "POST");
  assert.equal(new URL(request.task.httpRequest.url).pathname, orchestrator.PROCESSING_TASK_PATH);
  assert.equal(request.task.httpRequest.headers["Content-Type"], "application/json");
  const decodedBody = JSON.parse(Buffer.from(request.task.httpRequest.body, "base64").toString("utf8"));
  assert.deepEqual(decodedBody, {
    companyId: identity.companyId,
    documentId: identity.documentId,
    processingEnqueueGeneration: identity.enqueueGeneration,
  });
  assert.equal("enqueueGeneration" in decodedBody, false);
  assert.equal("processingAttemptId" in decodedBody, false);
  assert.equal("processingInvocationId" in decodedBody, false);
  assert.deepEqual(request.task.httpRequest.oidcToken, {
    serviceAccountEmail: environment.IQ200_PROCESSING_OIDC_SERVICE_ACCOUNT,
    audience: environment.IQ200_PROCESSING_OIDC_AUDIENCE,
  });
});

test("production task body round-trips through the production descriptor parser", async () => {
  const transport = fakeTransport();
  await orchestrator.enqueueKnowledgeProcessingTask(identity, { environment, transport });
  const body = JSON.parse(Buffer.from(transport.requests[0].task.httpRequest.body, "base64").toString("utf8"));
  assert.deepEqual(processingCore.parseProcessingTaskDescriptor(body), {
    companyId: identity.companyId,
    documentId: identity.documentId,
    processingEnqueueGeneration: identity.enqueueGeneration,
  });
});

test("task contains no static worker credential or ownership identifiers", async () => {
  const transport = fakeTransport();
  await orchestrator.enqueueKnowledgeProcessingTask(identity, { environment, transport });
  const request = transport.requests[0];
  const http = JSON.stringify(request.task.httpRequest);
  assert.equal("Authorization" in request.task.httpRequest.headers, false);
  assert.doesNotMatch(http, /worker-secret|processingAttemptId|processingInvocationId|Firebase|idToken/);
});

test("deterministic identity is stable, opaque, and distinct across documents and generations", () => {
  const first = orchestrator.deterministicProcessingTaskId(identity);
  assert.equal(first, orchestrator.deterministicProcessingTaskId(identity));
  assert.notEqual(first, orchestrator.deterministicProcessingTaskId({ ...identity, enqueueGeneration: 2 }));
  assert.notEqual(first, orchestrator.deterministicProcessingTaskId({ ...identity, documentId: "document_002" }));
  assert.match(first, /^iq200-process-[0-9a-f]{32}$/);
  assert.equal(first.includes(identity.companyId), false);
  assert.equal(first.includes(identity.documentId), false);
});

test("duplicate task creation is accepted without a second ownership identity", async () => {
  const transport = fakeTransport(async () => { throw { code: 6 }; });
  const result = await orchestrator.enqueueKnowledgeProcessingTask(identity, { environment, transport });
  assert.deepEqual(result, { enqueued: false, duplicate: true });
  assert.equal(transport.requests.length, 1);
});

test("a later recovery generation creates a new task identity despite an old retained name", async () => {
  const firstTransport = fakeTransport();
  const recoveryTransport = fakeTransport();
  await orchestrator.enqueueKnowledgeProcessingTask(identity, { environment, transport: firstTransport });
  await orchestrator.enqueueKnowledgeProcessingTask({ ...identity, enqueueGeneration: 2 }, { environment, transport: recoveryTransport });
  assert.notEqual(firstTransport.requests[0].task.name, recoveryTransport.requests[0].task.name);
});

function fakeProcessingGenerationStore(data: Record<string, unknown> | undefined, exists = data !== undefined): ProcessingGenerationStore & { updates: Array<{ path: unknown; fields: Record<string, unknown> }> } {
  const updates: Array<{ path: unknown; fields: Record<string, unknown> }> = [];
  const ref = { path: "companies/company_001/iq200_documents/document_001" };
  return {
    updates,
    doc(path: string) {
      assert.equal(path, "companies/company_001/iq200_documents/document_001");
      return ref;
    },
    async runTransaction<T>(work: (transaction: ProcessingGenerationTransaction) => Promise<T>) {
      return work({
        async get(reference) {
          assert.equal(reference, ref);
          return { exists, data: () => data };
        },
        update(reference, fields) {
          assert.equal(reference, ref);
          updates.push({ path: reference, fields });
        },
      });
    },
  };
}

test("recovery advances only a valid PENDING document generation", async () => {
  const store = fakeProcessingGenerationStore({
    companyId: identity.companyId,
    documentId: identity.documentId,
    processingStatus: "PENDING",
    processingEnqueueGeneration: 1,
  });
  assert.equal(await processingService.advanceProcessingEnqueueGeneration(identity.companyId, identity.documentId, store), 2);
  assert.deepEqual(store.updates, [{ path: store.updates[0].path, fields: { processingEnqueueGeneration: 2, updatedAt: store.updates[0].fields.updatedAt } }]);
  assert.notEqual(orchestrator.deterministicProcessingTaskId(identity), orchestrator.deterministicProcessingTaskId({ ...identity, enqueueGeneration: 2 }));
});

for (const status of ["PROCESSING", "READY", "FAILED"]) {
  test(`recovery rejects ${status} documents`, async () => {
    const store = fakeProcessingGenerationStore({
      companyId: identity.companyId,
      documentId: identity.documentId,
      processingStatus: status,
      processingEnqueueGeneration: 1,
    });
    await assert.rejects(
      () => processingService.advanceProcessingEnqueueGeneration(identity.companyId, identity.documentId, store),
      (error: unknown) => error instanceof processingCore.KnowledgeProcessingError,
    );
    assert.equal(store.updates.length, 0);
  });
}

test("recovery rejects missing documents, identity mismatches, and invalid identifiers", async () => {
  await assert.rejects(
    () => processingService.advanceProcessingEnqueueGeneration(identity.companyId, identity.documentId, fakeProcessingGenerationStore(undefined, false)),
    (error: unknown) => error instanceof processingCore.KnowledgeProcessingError,
  );
  for (const field of ["companyId", "documentId"] as const) {
    const data = { companyId: identity.companyId, documentId: identity.documentId, processingStatus: "PENDING", processingEnqueueGeneration: 1 };
    data[field] = "other";
    await assert.rejects(
      () => processingService.advanceProcessingEnqueueGeneration(identity.companyId, identity.documentId, fakeProcessingGenerationStore(data)),
      (error: unknown) => error instanceof processingCore.KnowledgeProcessingError,
    );
  }
  await assert.rejects(
    () => processingService.advanceProcessingEnqueueGeneration("bad/path", identity.documentId, fakeProcessingGenerationStore(undefined, false)),
    (error: unknown) => error instanceof processingCore.KnowledgeProcessingError,
  );
});

for (const generation of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
  test(`recovery rejects invalid generation ${String(generation)}`, async () => {
    const store = fakeProcessingGenerationStore({
      companyId: identity.companyId,
      documentId: identity.documentId,
      processingStatus: "PENDING",
      processingEnqueueGeneration: generation,
    });
    await assert.rejects(
      () => processingService.advanceProcessingEnqueueGeneration(identity.companyId, identity.documentId, store),
      (error: unknown) => error instanceof processingCore.KnowledgeProcessingError,
    );
    assert.equal(store.updates.length, 0);
  });
}

test("same logical upload retry reuses its server-owned enqueue generation", async () => {
  const transport = fakeTransport();
  const first = await orchestrator.enqueueKnowledgeProcessingTask(identity, { environment, transport });
  const second = await orchestrator.enqueueKnowledgeProcessingTask(identity, { environment, transport });
  assert.deepEqual(first, { enqueued: true, duplicate: false });
  assert.deepEqual(second, { enqueued: true, duplicate: false });
  assert.equal(transport.requests[0].task.name, transport.requests[1].task.name);
});

test("Cloud Tasks delivery attempts are explicitly bounded at three", () => {
  assert.equal(orchestrator.CLOUD_TASKS_MAX_DELIVERY_ATTEMPTS, 3);
});

for (const missing of Object.keys(environment)) {
  test(`missing configuration ${missing} fails closed`, () => {
    const candidate = { ...environment, [missing]: "" };
    assert.throws(() => orchestrator.readProcessingTaskConfig(candidate), (error: unknown) =>
      error instanceof orchestrator.KnowledgeProcessingEnqueueError && error.code === "CONFIG_MISSING");
  });
}

for (const target of [
  "http://fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app/api/iq200/knowledge/documents/process",
  "https://arbitrary.example.test/api/iq200/knowledge/documents/process",
  "https://fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app.evil.test/api/iq200/knowledge/documents/process",
  "https://evil-fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app/api/iq200/knowledge/documents/process",
  "https://user:pass@fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app/api/iq200/knowledge/documents/process",
  "https://fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app:8443/api/iq200/knowledge/documents/process",
  "https://fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app/api/iq200/knowledge/documents/process?x=1",
  "https://fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app/api/iq200/knowledge/documents/process#fragment",
  "https://fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app/api/iq200/knowledge/documents/upload",
  "https://fleetfix-pro-staging--fleetfix-pro-staging.europe-west4.hosted.app/api/iq200/knowledge/documents/%70rocess",
  "not-a-url",
]) {
  test(`malformed processing target fails closed: ${target}`, () => {
    assert.throws(() => orchestrator.readProcessingTaskConfig({ ...environment, IQ200_PROCESSING_TARGET_URL: target }),
      (error: unknown) => error instanceof orchestrator.KnowledgeProcessingEnqueueError && error.code === "CONFIG_INVALID");
  });
}

test("exact trusted target origin and processing path are accepted", () => {
  const config = orchestrator.readProcessingTaskConfig(environment);
  assert.equal(config.targetOrigin, environment.IQ200_PROCESSING_TARGET_ORIGIN);
  assert.equal(new URL(config.targetUrl).pathname, orchestrator.PROCESSING_TASK_PATH);
});

test("OIDC verifier accepts exact verified invoker claims and rejects legacy secret-only requests", async () => {
  const verified = {
    iss: "https://accounts.google.com",
    aud: environment.IQ200_PROCESSING_OIDC_AUDIENCE,
    email: environment.IQ200_PROCESSING_OIDC_SERVICE_ACCOUNT,
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 300,
  };
  await processingOidc.requireProcessingOidc(
    new Request("https://test.invalid", { headers: { authorization: "Bearer signed-token" } }),
    async () => verified,
    environment,
  );
  await assert.rejects(
    () => processingOidc.requireProcessingOidc(
      new Request("https://test.invalid", { headers: { authorization: "Bearer old-worker-secret" } }),
      async () => { throw new Error("invalid token"); },
      environment,
    ),
    (error: unknown) => error instanceof processingCore.KnowledgeProcessingError && error.code === "AUTH_REQUIRED",
  );
});

test("OIDC verifier rejects wrong audience, issuer, identity, expiry, and missing token", async () => {
  const base = {
    iss: "https://accounts.google.com",
    aud: environment.IQ200_PROCESSING_OIDC_AUDIENCE,
    email: environment.IQ200_PROCESSING_OIDC_SERVICE_ACCOUNT,
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 300,
  };
  for (const claims of [
    { ...base, aud: "https://wrong.invalid" },
    { ...base, iss: "https://evil.invalid" },
    { ...base, email: "other@fleetfix-pro-staging.iam.gserviceaccount.com" },
    { ...base, exp: Math.floor(Date.now() / 1000) - 1 },
  ]) {
    await assert.rejects(() => processingOidc.requireProcessingOidc(
      new Request("https://test.invalid", { headers: { authorization: "Bearer signed-token" } }),
      async () => claims,
      environment,
    ));
  }
  await assert.rejects(() => processingOidc.requireProcessingOidc(new Request("https://test.invalid"), async () => base, environment));
});

function fakeClaimStore(data: Record<string, unknown> | undefined, exists = data !== undefined): ProcessingClaimStore & { updates: Record<string, unknown>[] } {
  const ref = { path: "companies/company_001/iq200_documents/document_001" };
  const updates: Record<string, unknown>[] = [];
  return {
    updates,
    doc(path: string) { assert.equal(path, ref.path); return ref; },
    async runTransaction<T>(work: (transaction: ProcessingClaimTransaction) => Promise<T>) {
      return work({
        async get(reference) { assert.equal(reference, ref); return { exists, data: () => data }; },
        update(reference, fields) { assert.equal(reference, ref); updates.push(fields); },
      });
    },
  };
}

test("document-specific claim cannot process a different document and fences stale generations", async () => {
  const descriptor = { companyId: identity.companyId, documentId: identity.documentId, processingEnqueueGeneration: 1 };
  const store = fakeClaimStore({ companyId: identity.companyId, documentId: identity.documentId, processingStatus: "PENDING", processingEnqueueGeneration: 1 });
  const claimed = await processingService.claimProcessingDocument(descriptor, store);
  assert.equal(claimed.kind, "claimed");
  assert.equal(claimed.claim.documentId, identity.documentId);
  const stale = await processingService.claimProcessingDocument({ ...descriptor, processingEnqueueGeneration: 2 }, fakeClaimStore({ companyId: identity.companyId, documentId: identity.documentId, processingStatus: "PENDING", processingEnqueueGeneration: 1 }));
  assert.deepEqual(stale, { kind: "handled", reason: "STALE_GENERATION" });
});

test("document-specific claim handles READY, terminal FAILED, active owner, and missing documents", async () => {
  for (const data of [
    { companyId: identity.companyId, documentId: identity.documentId, processingStatus: "READY", processingEnqueueGeneration: 1 },
    { companyId: identity.companyId, documentId: identity.documentId, processingStatus: "FAILED", processingEnqueueGeneration: 1 },
    { companyId: identity.companyId, documentId: identity.documentId, processingStatus: "PROCESSING", processingEnqueueGeneration: 1, processingLeaseExpiresAt: { toMillis: () => Date.now() + 10000 } },
  ]) {
    const result = await processingService.claimProcessingDocument({ companyId: identity.companyId, documentId: identity.documentId, processingEnqueueGeneration: 1 }, fakeClaimStore(data));
    assert.equal(result.kind, "handled");
  }
  assert.deepEqual(await processingService.claimProcessingDocument({ companyId: identity.companyId, documentId: identity.documentId, processingEnqueueGeneration: 1 }, fakeClaimStore(undefined, false)), { kind: "handled", reason: "MISSING" });
});

test("durable failure confirmation distinguishes recorded, stale, and thrown persistence", async () => {
  const invocation = {
    companyId: identity.companyId,
    documentId: identity.documentId,
    processingAttemptId: "11111111-1111-4111-8111-111111111111",
    processingInvocationId: "22222222-2222-4222-8222-222222222222",
  };
  const baseDependencies = {
    async acquireSource() { return new Uint8Array([1]); },
    async parse() { throw new Error("parse failed"); },
    async renderPage() { throw new Error("unreachable"); },
    async persistPage() { },
    async complete() { },
    async compensate() { },
  };

  await assert.rejects(
    () => processingPageCore.processClaimedKnowledgeDocumentCore(invocation, {
      ...baseDependencies,
      async fail() { return { recorded: true }; },
    }),
    (error: unknown) => error instanceof processingPageCore.ProcessingApplicationFailureError,
  );
  await assert.rejects(
    () => processingPageCore.processClaimedKnowledgeDocumentCore(invocation, {
      ...baseDependencies,
      async fail() { return { recorded: false }; },
    }),
    (error: unknown) => !(error instanceof processingPageCore.ProcessingApplicationFailureError),
  );
  await assert.rejects(
    () => processingPageCore.processClaimedKnowledgeDocumentCore(invocation, {
      ...baseDependencies,
      async fail() { throw new Error("failure persistence unavailable"); },
    }),
    /parse failed/,
  );
});

test("enqueue failure exposes only a bounded sanitized classification", async () => {
  const transport = fakeTransport(async () => { throw new Error("transport failed"); });
  let caught: unknown;
  try { await orchestrator.enqueueKnowledgeProcessingTask(identity, { environment, transport }); } catch (error) { caught = error; }
  assert.ok(caught instanceof orchestrator.KnowledgeProcessingEnqueueError);
  const diagnostic = orchestrator.processingEnqueueDiagnostic(caught);
  assert.deepEqual(diagnostic, { event: "iq200_processing_enqueue_failed", code: "ENQUEUE_FAILED" });
  assert.equal(JSON.stringify(diagnostic).includes("transport failed"), false);
});

test("orchestrator does not import communications or hosted provider execution", () => {
  const source = readFileSync("src/lib/iq200/knowledgeProcessingOrchestrator.ts", "utf8");
  assert.doesNotMatch(source, /communicationExecution|hostedProvider|openai|gemini/);
});

function uploadResult() {
  return {
    documentId: identity.documentId,
    contentHash: "a".repeat(64),
    storagePath: `companies/${identity.companyId}/iq200/documents/${identity.documentId}/original/source.pdf`,
    originalFilename: "commissioning.pdf",
    mimeType: "application/pdf",
    sizeBytes: 8,
    processingStatus: "PENDING" as const,
    approvalStatus: "DRAFT" as const,
    uploadedAt: "2026-09-25T00:00:00.000Z",
    idempotentRetry: false,
    processingEnqueueGeneration: 1,
  };
}

function uploadRequest(withFile = true) {
  const form = new FormData();
  if (withFile) form.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "commissioning.pdf", { type: "application/pdf" }));
  return new Request("https://staging.example.test/api/iq200/knowledge/documents/upload", {
    method: "POST",
    headers: { "Idempotency-Key": "commissioning-001" },
    body: form,
  });
}

function routeHarness(overrides: Partial<KnowledgeUploadRouteDependencies> = {}) {
  const events: string[] = [];
  const context = { uid: "user_001", companyId: identity.companyId, companyUser: {}, token: {} } as never;
  const dependencies: KnowledgeUploadRouteDependencies = {
    async authenticate() { events.push("authenticated"); return context; },
    async upload() { events.push("durable-pending"); return uploadResult(); },
    async enqueue(received) { events.push("enqueued"); assert.deepEqual(received, identity); },
    safeError() { return Response.json({ error: { code: "SAFE" } }, { status: 403 }); },
    logEnqueueFailure() { events.push("enqueue-failure-logged"); },
    ...overrides,
  };
  return { events, post: uploadRouteCore.createKnowledgeUploadPost(dependencies) };
}

test("authorized successful upload enqueues exactly once after durable completion", async () => {
  const harness = routeHarness();
  const response = await harness.post(uploadRequest());
  assert.equal(response.status, 201);
  assert.deepEqual(harness.events, ["authenticated", "durable-pending", "enqueued"]);
});

for (const scenario of ["unauthenticated", "inactive membership"] as const) {
  test(`${scenario} request enqueues zero tasks`, async () => {
    let enqueueCount = 0;
    const harness = routeHarness({
      async authenticate() { throw new Error(scenario); },
      async enqueue() { enqueueCount += 1; },
    });
    assert.equal((await harness.post(uploadRequest())).status, 403);
    assert.equal(enqueueCount, 0);
  });
}

test("missing upload permission enqueues zero tasks", async () => {
  let enqueueCount = 0;
  const harness = routeHarness({
    async upload() { throw new Error("forbidden"); },
    async enqueue() { enqueueCount += 1; },
  });
  assert.equal((await harness.post(uploadRequest())).status, 403);
  assert.equal(enqueueCount, 0);
});

test("validation failure enqueues zero tasks", async () => {
  let enqueueCount = 0;
  const harness = routeHarness({ async enqueue() { enqueueCount += 1; } });
  assert.equal((await harness.post(uploadRequest(false))).status, 400);
  assert.equal(enqueueCount, 0);
});

test("upload persistence failure enqueues zero tasks", async () => {
  let enqueueCount = 0;
  const harness = routeHarness({
    async upload() { throw new Error("persistence failed"); },
    async enqueue() { enqueueCount += 1; },
  });
  assert.equal((await harness.post(uploadRequest())).status, 403);
  assert.equal(enqueueCount, 0);
});

test("enqueue failure does not invalidate upload or expand its response", async () => {
  const harness = routeHarness({ async enqueue() { throw new Error("hidden credential"); } });
  const response = await harness.post(uploadRequest());
  const body = await response.text();
  assert.equal(response.status, 201);
  assert.equal(body.includes("hidden credential"), false);
  assert.equal(body.includes("processingEnqueueGeneration"), false);
  const { processingEnqueueGeneration: _generation, ...expectedResponse } = uploadResult();
  assert.deepEqual(JSON.parse(body), expectedResponse);
  assert.equal(harness.events.includes("enqueue-failure-logged"), true);
});

test("client form ownership fields cannot enter task identity", async () => {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "commissioning.pdf", { type: "application/pdf" }));
  for (const field of ["companyId", "documentId", "processingAttemptId", "processingInvocationId", "enqueueGeneration"]) form.set(field, `client-${field}`);
  let received: unknown;
  const harness = routeHarness({ async enqueue(value) { received = value; } });
  await harness.post(new Request("https://staging.example.test/api/iq200/knowledge/documents/upload", {
    method: "POST",
    headers: { "Idempotency-Key": "commissioning-001" },
    body: form,
  }));
  assert.deepEqual(received, identity);
});

test("repeated route uploads preserve the same enqueue generation and task identity", async () => {
  const identities: unknown[] = [];
  const harness = routeHarness({ async enqueue(value) { identities.push(value); } });
  await harness.post(uploadRequest());
  await harness.post(uploadRequest());
  assert.deepEqual(identities, [identity, identity]);
});

test("application processing attempt eligibility is bounded", () => {
  const now = Date.now();
  assert.equal(processingCore.isEligibleForClaim("PENDING", undefined, now, 2), true);
  assert.equal(processingCore.isEligibleForClaim("PENDING", undefined, now, 3), false);
  assert.equal(processingCore.isEligibleForClaim("PROCESSING", now - 1, now, 2), true);
  assert.equal(processingCore.isEligibleForClaim("PROCESSING", now - 1, now, 3), false);
  assert.equal(processingCore.isEligibleForClaim("READY", undefined, now, 0), false);
});

test("service preserves server ownership and terminalizes exhausted work", () => {
  const service = readFileSync("src/lib/iq200/knowledgeProcessingService.ts", "utf8");
  const processor = readFileSync("src/lib/iq200/knowledgeDocumentProcessor.ts", "utf8");
  assert.match(service, /generateProcessingAttemptId\(\)/);
  assert.match(processor, /processingInvocationId: randomUUID\(\)/);
  assert.match(service, /currentAttempts >= PROCESSING_MAX_ATTEMPTS/);
  assert.match(service, /processingStatus: "FAILED"/);
  assert.match(service, /processingFailureCode: "TIMEOUT"/);
});
