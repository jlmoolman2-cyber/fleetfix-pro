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

const { approveKnowledgeDocument } = await import("../src/lib/iq200/knowledgeApprovalService.ts");
const { ServerAccessError } = await import("../src/lib/serverAuthCore.ts");
const client = await import("../src/lib/iq200/knowledgeClient.ts");

type Context = Parameters<typeof approveKnowledgeDocument>[0];
type Store = NonNullable<Parameters<typeof approveKnowledgeDocument>[2]>;
type Transaction = Parameters<Parameters<Store["runTransaction"]>[0]>[0];
type StoredDocument = Record<string, unknown>;

const APPROVE = "Approve IQ200 Knowledge";
const readyDraft = (): StoredDocument => ({
  documentId: "doc-a",
  companyId: "comp_001",
  processingStatus: "READY",
  approvalStatus: "DRAFT",
  processingAttemptId: "attempt-a",
  processingInvocationId: "invocation-a",
  storagePath: "must-not-change",
});

function context(permissions: Record<string, boolean> = { [APPROVE]: true }, extra: Record<string, unknown> = {}) {
  return {
    uid: "actor-1",
    companyId: "comp_001",
    token: {},
    companyUser: { active: true, permissions, ...extra },
  } as unknown as Context;
}

function fakeStore(initial: StoredDocument | null) {
  let current = initial ? { ...initial } : null;
  let time = 0;
  const updates: Record<string, unknown>[] = [];
  const paths: string[] = [];
  const store: Store = {
    doc(path) {
      paths.push(path);
      return path;
    },
    serverTimestamp() {
      time++;
      return `server-time-${time}`;
    },
    async runTransaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
      return work({
        async get(reference) {
          assert.equal(reference, paths.at(-1));
          return { exists: current !== null, data: () => current ? { ...current } : undefined };
        },
        update(reference, fields) {
          assert.equal(reference, paths.at(-1));
          updates.push({ ...fields });
          current = { ...(current || {}), ...fields };
        },
      });
    },
  };
  return {
    store,
    updates,
    paths,
    current: () => current,
  };
}

const codeIs = (code: string, status: number) => (error: unknown) =>
  error instanceof ServerAccessError && error.code === code && error.status === status;

test("READY/DRAFT approval succeeds in the caller's company transaction", async () => {
  const fake = fakeStore(readyDraft());
  const result = await approveKnowledgeDocument(context(), "doc-a", fake.store);
  assert.deepEqual(fake.paths, ["companies/comp_001/iq200_documents/doc-a"]);
  assert.deepEqual(result, { documentId: "doc-a", processingStatus: "READY", approvalStatus: "APPROVED" });
  assert.equal(fake.current()?.approvalStatus, "APPROVED");
});

test("approval writes only approval status and server-owned audit timestamps/actor", async () => {
  const fake = fakeStore(readyDraft());
  await approveKnowledgeDocument(context(), "doc-a", fake.store);
  assert.deepEqual(Object.keys(fake.updates[0]).sort(), ["approvalStatus", "approvedAt", "approvedBy", "updatedAt"]);
  assert.equal(fake.updates[0].approvalStatus, "APPROVED");
  assert.equal(fake.updates[0].approvedBy, "actor-1");
  assert.equal(fake.updates[0].approvedAt, "server-time-1");
  assert.equal(fake.updates[0].updatedAt, "server-time-1");
  assert.equal(fake.current()?.processingStatus, "READY");
  assert.equal(fake.current()?.processingAttemptId, "attempt-a");
  assert.equal(fake.current()?.processingInvocationId, "invocation-a");
  assert.equal(fake.current()?.storagePath, "must-not-change");
});

test("missing authentication is denied", async () => {
  const fake = fakeStore(readyDraft());
  await assert.rejects(
    approveKnowledgeDocument(null as unknown as Context, "doc-a", fake.store),
    codeIs("AUTH_REQUIRED", 401),
  );
  assert.equal(fake.updates.length, 0);
});

test("inactive company membership is denied", async () => {
  const fake = fakeStore(readyDraft());
  await assert.rejects(
    approveKnowledgeDocument(context({ [APPROVE]: true }, { active: false }), "doc-a", fake.store),
    codeIs("FORBIDDEN", 403),
  );
  assert.equal(fake.updates.length, 0);
});

test("missing company membership is denied", async () => {
  const fake = fakeStore(readyDraft());
  await assert.rejects(
    approveKnowledgeDocument({ uid: "actor-1", companyId: "comp_001", companyUser: null } as unknown as Context, "doc-a", fake.store),
    codeIs("FORBIDDEN", 403),
  );
  assert.equal(fake.updates.length, 0);
});

test("missing Approve IQ200 Knowledge permission is denied", async () => {
  const fake = fakeStore(readyDraft());
  await assert.rejects(approveKnowledgeDocument(context({}), "doc-a", fake.store), codeIs("FORBIDDEN", 403));
  assert.equal(fake.updates.length, 0);
});

test("View IQ200 Knowledge alone is insufficient", async () => {
  const fake = fakeStore(readyDraft());
  await assert.rejects(
    approveKnowledgeDocument(context({ "View IQ200 Knowledge": true }), "doc-a", fake.store),
    codeIs("FORBIDDEN", 403),
  );
  assert.equal(fake.updates.length, 0);
});

test("Use IQ200 Technician Assist alone is insufficient", async () => {
  const fake = fakeStore(readyDraft());
  await assert.rejects(
    approveKnowledgeDocument(context({ "Use IQ200 Technician Assist": true, "View jobs": true }), "doc-a", fake.store),
    codeIs("FORBIDDEN", 403),
  );
  assert.equal(fake.updates.length, 0);
});

test("cross-tenant document ownership fails closed as not found", async () => {
  const fake = fakeStore({ ...readyDraft(), companyId: "company-other" });
  await assert.rejects(approveKnowledgeDocument(context(), "doc-a", fake.store), codeIs("NOT_FOUND", 404));
  assert.equal(fake.updates.length, 0);
});

test("nonexistent document fails closed as not found", async () => {
  const fake = fakeStore(null);
  await assert.rejects(approveKnowledgeDocument(context(), "doc-a", fake.store), codeIs("NOT_FOUND", 404));
  assert.equal(fake.updates.length, 0);
});

for (const status of ["PENDING", "PROCESSING", "FAILED"] as const) {
  test(`${status}/DRAFT cannot be approved`, async () => {
    const fake = fakeStore({ ...readyDraft(), processingStatus: status });
    await assert.rejects(
      approveKnowledgeDocument(context(), "doc-a", fake.store),
      codeIs("INVALID_KNOWLEDGE_DOCUMENT_TRANSITION", 409),
    );
    assert.equal(fake.updates.length, 0);
  });
}

for (const approvalStatus of ["APPROVED", "REJECTED", "INACTIVE"] as const) {
  test(`READY/${approvalStatus} cannot be approved`, async () => {
    const fake = fakeStore({ ...readyDraft(), approvalStatus });
    await assert.rejects(
      approveKnowledgeDocument(context(), "doc-a", fake.store),
      codeIs("INVALID_KNOWLEDGE_DOCUMENT_TRANSITION", 409),
    );
    assert.equal(fake.updates.length, 0);
  });
}

test("invalid document IDs fail closed before any transaction", async () => {
  const fake = fakeStore(readyDraft());
  await assert.rejects(approveKnowledgeDocument(context(), "../other", fake.store), codeIs("NOT_FOUND", 404));
  assert.equal(fake.paths.length, 0);
});

test("transaction validates the current state it reads before updating", async () => {
  const fake = fakeStore({ ...readyDraft(), processingStatus: "PROCESSING" });
  await assert.rejects(
    approveKnowledgeDocument(context(), "doc-a", fake.store),
    codeIs("INVALID_KNOWLEDGE_DOCUMENT_TRANSITION", 409),
  );
  assert.equal(fake.updates.length, 0);
});

test("approval client sends one authenticated empty-body POST and never retries", async () => {
  const calls: { path: string; init: RequestInit }[] = [];
  const dependencies = {
    getAuth: () => ({ authStateReady: async () => {}, currentUser: { getIdToken: async () => "test-token" } }),
    fetch: (async (path: string, init: RequestInit) => {
      calls.push({ path: String(path), init });
      return Response.json({ documentId: "doc-a", processingStatus: "READY", approvalStatus: "APPROVED" });
    }) as unknown as typeof fetch,
  };
  const result = await client.approveKnowledgeDocument("doc-a", dependencies);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/iq200/knowledge/documents/doc-a/approve");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, undefined);
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer test-token");
  assert.deepEqual(result, { documentId: "doc-a", processingStatus: "READY", approvalStatus: "APPROVED" });
  assert.equal(JSON.stringify(result).includes("test-token"), false);
});

test("client rejects invalid target IDs before fetch", async () => {
  let fetchCount = 0;
  const dependencies = {
    getAuth: () => ({ authStateReady: async () => {}, currentUser: { getIdToken: async () => "test-token" } }),
    fetch: (async () => { fetchCount++; return Response.json({}); }) as unknown as typeof fetch,
  };
  await assert.rejects(client.approveKnowledgeDocument("../other", dependencies));
  assert.equal(fetchCount, 0);
});

test("route authenticates, calls approval service, and does not parse client-controlled body fields", () => {
  const route = readFileSync("src/app/api/iq200/knowledge/documents/[documentId]/approve/route.ts", "utf8");
  assert.match(route, /export async function POST/);
  assert.match(route, /authenticateServerRequest\(_request\)/);
  assert.match(route, /approveKnowledgeDocument\(context, documentId\)/);
  assert.doesNotMatch(route, /request\.json\(|request\.text\(/);
});

for (const field of ["companyId", "approvalStatus", "approvedBy", "approvedAt"] as const) {
  test(`client cannot supply ${field}`, () => {
    const route = readFileSync("src/app/api/iq200/knowledge/documents/[documentId]/approve/route.ts", "utf8");
    const service = readFileSync("src/lib/iq200/knowledgeApprovalService.ts", "utf8");
    assert.doesNotMatch(route, /request\.json\(|request\.text\(/);
    const serverOwnedChecks: Record<typeof field, RegExp> = {
      companyId: /companies\/\$\{context\.companyId\}\/iq200_documents/,
      approvalStatus: /approvalStatus: "APPROVED"/,
      approvedBy: /approvedBy: context\.uid/,
      approvedAt: /approvedAt: timestamp/,
    };
    assert.match(service, serverOwnedChecks[field]);
  });
}

test("service uses only scoped Firestore transaction dependencies", () => {
  const service = readFileSync("src/lib/iq200/knowledgeApprovalService.ts", "utf8");
  assert.match(service, /companies\/\$\{context\.companyId\}\/iq200_documents\/\$\{documentId\}/);
  assert.match(service, /adminDb\.runTransaction/);
  assert.doesNotMatch(service, /knowledgeProcessingOrchestrator|enqueueKnowledgeProcessingTask|adminStorage|createReadStream|runHostedReasoning|CloudTasksClient|sendWhatsApp|sendEmail/i);
});

test("approval UI requires capability and READY/DRAFT state", () => {
  const page = readFileSync("src/app/admin/iq200-knowledge/page.tsx", "utf8");
  assert.match(page, /capabilities\?\.approve === true/);
  assert.match(page, /item\.processingStatus === "READY"/);
  assert.match(page, /item\.approvalStatus === "DRAFT"/);
  assert.match(page, /onClick=\{\(\) => void approve\(item\)\}/);
});

test("pending approval prevents duplicate clicks", () => {
  const page = readFileSync("src/app/admin/iq200-knowledge/page.tsx", "utf8");
  assert.match(page, /approvalInFlight\.current\.has\(documentId\)/);
  assert.match(page, /approvalInFlight\.current\.add\(documentId\)/);
  assert.match(page, /disabled=\{approvingDocuments\[item\.documentId\] === true\}/);
});

test("successful approval refreshes the document list", () => {
  const page = readFileSync("src/app/admin/iq200-knowledge/page.tsx", "utf8");
  assert.match(page, /await approveKnowledgeDocument\(documentId\);\s*await load\(\);/);
});

test("existing lifecycle contract remains the transition authority", () => {
  const service = readFileSync("src/lib/iq200/knowledgeApprovalService.ts", "utf8");
  assert.match(service, /canApproveKnowledgeDocument\(/);
  assert.match(service, /isKnowledgeProcessingStatus\(/);
  assert.match(service, /isKnowledgeApprovalStatus\(/);
});
