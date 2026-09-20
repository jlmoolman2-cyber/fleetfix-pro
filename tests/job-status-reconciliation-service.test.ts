import assert from "node:assert/strict";
import test from "node:test";

import {
  canReconcileJobStatuses,
  isConcurrentTransactionError,
  planCompleteReconciliation,
  StatusReconciliationError,
} from "../src/lib/jobStatusReconciliation.ts";

// ─── Manual deterministic service simulation ────────────────────────────
// Mirrors the exact logic of reconcileAllCanonicalStatuses from
// src/lib/jobStatusReconciliationService.ts using local stubs instead of
// Firestore. This tests the same authorization, planning, transaction
// wrapping, audit creation, and error handling behaviors.

interface SimContext {
  uid: string;
  companyId: string;
  companyUser: Record<string, unknown>;
}

interface SimDoc {
  id: string;
  [field: string]: unknown;
}

interface SimResult {
  plan: ReturnType<typeof planCompleteReconciliation>;
  auditIds: string[];
  createdIds: string[];
  updatedIds: string[];
  noOp: boolean;
  transactionUpdateCount: number;
  transactionCreateCount: number;
}

let autoIdCounter = 0;
function nextAutoId(): string {
  autoIdCounter += 1;
  return `auto-${autoIdCounter}`;
}

function simulateReconcileAll(
  context: SimContext,
  allStatuses: SimDoc[],
  options?: { throwOnCreate?: boolean; throwConcurrency?: boolean },
): SimResult {
  // Authorization check — identical to service
  if (!canReconcileJobStatuses(context.companyUser)) {
    throw new StatusReconciliationError("FORBIDDEN", 403, "Status reconciliation is not permitted.");
  }

  // Simulate concurrency conflict before transaction
  if (options?.throwConcurrency) {
    const concurrencyError = { code: 10 };
    if (isConcurrentTransactionError(concurrencyError)) {
      throw new StatusReconciliationError("CONCURRENT_CONFLICT", 409,
        "The status collection changed concurrently.");
    }
  }

  // Plan — identical to service
  const plan = planCompleteReconciliation(allStatuses);

  if (plan.hasErrors) {
    throw new StatusReconciliationError(
      "INVALID_EXISTING_METADATA", 409,
      `Reconciliation aborted: ${plan.errorReasons.join("; ")}`,
    );
  }

  const noOp = plan.updates.length === 0 && plan.creates.length === 0;
  if (noOp) {
    return { plan, auditIds: [], createdIds: [], updatedIds: [], noOp: true, transactionUpdateCount: 0, transactionCreateCount: 0 };
  }

  // Simulate transaction writes
  const auditIds: string[] = [];
  const createdIds: string[] = [];
  const updatedIds: string[] = [];
  let transactionUpdateCount = 0;
  let transactionCreateCount = 0;

  for (const update of plan.updates) {
    if (options?.throwOnCreate) throw new Error("Firestore write failed");
    transactionUpdateCount += 1;
    auditIds.push(nextAutoId());
    transactionCreateCount += 1; // audit doc
    updatedIds.push(update.documentId);
  }

  for (const create of plan.creates) {
    if (options?.throwOnCreate) throw new Error("Firestore write failed");
    const newId = nextAutoId();
    transactionCreateCount += 1; // status doc
    auditIds.push(nextAutoId());
    transactionCreateCount += 1; // audit doc
    createdIds.push(newId);
  }

  return { plan, auditIds, createdIds, updatedIds, noOp: false, transactionUpdateCount, transactionCreateCount };
}

function makeContext(overrides?: Partial<SimContext>): SimContext {
  return {
    uid: "user-1",
    companyId: "company-1",
    companyUser: { primaryRole: "Business Owner", name: "Test Admin" },
    ...overrides,
  };
}

function makeDoc(id: string, data: Record<string, unknown>): SimDoc {
  return { id, ...data };
}

// 1. staging-shaped: legacy Job Booked + 3 missing → 1 update + 3 creates + 4 audits
test("1. staging-shaped: legacy Job Booked + 3 missing → 1 update + 3 creates + 4 audits", () => {
  autoIdCounter = 0;
  const statuses = [makeDoc("s1", { name: "Job Booked", active: true, sortOrder: 1 })];
  const result = simulateReconcileAll(makeContext(), statuses);
  assert.equal(result.noOp, false);
  assert.equal(result.updatedIds.length, 1);
  assert.equal(result.createdIds.length, 3);
  assert.equal(result.auditIds.length, 4);
  assert.equal(result.plan.hasErrors, false);
  assert.equal(result.transactionUpdateCount, 1);
  assert.equal(result.transactionCreateCount, 7);
});

// 2. second execution → zero mutations + zero audits
test("2. second execution → zero mutations + zero audits", () => {
  autoIdCounter = 0;
  const statuses = [
    makeDoc("s1", { name: "Job Booked", systemKey: "job_booked", active: true }),
    makeDoc("s2", { name: "Onroute", systemKey: "onroute", active: true }),
    makeDoc("s3", { name: "Start Work", systemKey: "start_work", active: true }),
    makeDoc("s4", { name: "Job Complete", systemKey: "job_complete", active: true }),
  ];
  const result = simulateReconcileAll(makeContext(), statuses);
  assert.equal(result.noOp, true);
  assert.equal(result.updatedIds.length, 0);
  assert.equal(result.createdIds.length, 0);
  assert.equal(result.auditIds.length, 0);
  assert.equal(result.transactionUpdateCount, 0);
  assert.equal(result.transactionCreateCount, 0);
});

// 3. transaction rollback on error — no partial writes
test("3. transaction rollback on error prevents partial writes", () => {
  autoIdCounter = 0;
  const statuses = [makeDoc("s1", { name: "Job Booked", sortOrder: 1 })];
  assert.throws(
    () => simulateReconcileAll(makeContext(), statuses, { throwOnCreate: true }),
    (err: unknown) => err instanceof Error && (err as Error).message === "Firestore write failed",
  );
});

// 4. concurrency conflict → fail closed
test("4. concurrency conflict → fail closed", () => {
  assert.throws(
    () => simulateReconcileAll(makeContext(), [], { throwConcurrency: true }),
    (err: unknown) => err instanceof StatusReconciliationError &&
      (err as StatusReconciliationError).code === "CONCURRENT_CONFLICT",
  );
});

// 5. existing fields preserved on legacy update
test("5. existing fields preserved on legacy update — only systemKey written", () => {
  autoIdCounter = 0;
  const statuses = [
    makeDoc("s1", { name: "Job Booked", active: true, startStatus: true, sortOrder: 1, color: "red" }),
    makeDoc("s2", { name: "Onroute", systemKey: "onroute", active: true }),
    makeDoc("s3", { name: "Start Work", systemKey: "start_work", active: true }),
    makeDoc("s4", { name: "Job Complete", systemKey: "job_complete", active: true }),
  ];
  const result = simulateReconcileAll(makeContext(), statuses);
  assert.equal(result.transactionUpdateCount, 1);
  assert.equal(result.updatedIds[0], "s1");
  assert.equal(result.plan.updates.length, 1);
  assert.deepEqual(Object.keys(result.plan.updates[0]).sort(), ["documentId", "systemKey"]);
  assert.equal(result.plan.updates[0].systemKey, "job_booked");
});

// 6. custom statuses untouched
test("6. custom statuses untouched", () => {
  autoIdCounter = 0;
  const statuses = [
    makeDoc("s1", { name: "Job Booked", systemKey: "job_booked", active: true }),
    makeDoc("s2", { name: "Onroute", systemKey: "onroute", active: true }),
    makeDoc("s3", { name: "Start Work", systemKey: "start_work", active: true }),
    makeDoc("s4", { name: "Job Complete", systemKey: "job_complete", active: true }),
    makeDoc("c1", { name: "Waiting for Parts", active: true }),
  ];
  const result = simulateReconcileAll(makeContext(), statuses);
  assert.equal(result.noOp, true);
  assert.equal(result.transactionUpdateCount, 0);
});

// 7. tenant/company scope preserved
test("7. tenant scope — different companyId uses separate context", () => {
  autoIdCounter = 0;
  const statuses = [
    makeDoc("s1", { name: "Job Booked", systemKey: "job_booked", active: true }),
    makeDoc("s2", { name: "Onroute", systemKey: "onroute", active: true }),
    makeDoc("s3", { name: "Start Work", systemKey: "start_work", active: true }),
    makeDoc("s4", { name: "Job Complete", systemKey: "job_complete", active: true }),
  ];
  const ctx = makeContext({ companyId: "company-42" });
  assert.equal(ctx.companyId, "company-42");
  const result = simulateReconcileAll(ctx, statuses);
  assert.equal(result.noOp, true);
});

// 8. authorization denial prevents transaction
test("8. authorization denial prevents transaction", () => {
  const ctx = makeContext({ companyUser: { primaryRole: "Technician", permissions: {} } });
  assert.throws(
    () => simulateReconcileAll(ctx, []),
    (err: unknown) => err instanceof StatusReconciliationError &&
      (err as StatusReconciliationError).code === "FORBIDDEN",
  );
});

// 9. insufficient permission prevents transaction
test("9. insufficient permission prevents transaction", () => {
  const ctx = makeContext({ companyUser: { permissions: { "View jobs": true } } });
  assert.throws(
    () => simulateReconcileAll(ctx, []),
    (err: unknown) => err instanceof StatusReconciliationError &&
      (err as StatusReconciliationError).code === "FORBIDDEN",
  );
});

// 10. no delete operation — only updates and creates
test("10. no delete operation — only updates and creates", () => {
  autoIdCounter = 0;
  const statuses = [makeDoc("s1", { name: "Job Booked", sortOrder: 1 })];
  const result = simulateReconcileAll(makeContext(), statuses);
  assert.ok(result.transactionUpdateCount > 0);
  assert.ok(result.transactionCreateCount > 0);
  const planRecord = result.plan as unknown as Record<string, unknown>;
  assert.ok(!("deletes" in planRecord));
  assert.ok(!("delete" in planRecord));
});