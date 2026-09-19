import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canReconcileJobStatuses,
  isConcurrentTransactionError,
  parseStatusReconciliationRequest,
  planStatusReconciliation,
  StatusReconciliationError,
} from "../src/lib/jobStatusReconciliation.ts";
import type { JobStatusDocument } from "../src/lib/jobStatusContract.ts";

const request = {
  statusId: "target",
  systemKey: "job_booked" as const,
  confirmedStatusName: "Job Booked",
  confirmation: true as const,
};
const custom = { id: "custom", name: "Waiting", active: true, startTimer: true };

function code(fn: () => unknown, expected: string) {
  assert.throws(fn, (error) => error instanceof StatusReconciliationError && error.code === expected);
}

test("1 valid explicit assignment", () => {
  assert.deepEqual(planStatusReconciliation([{ id: "target", name: "Job Booked" }], request), {
    result: "assigned",
    status: { id: "target", name: "Job Booked", systemKey: "job_booked" },
  });
});

test("2 inactive explicit assignment does not activate", () => {
  const target = { id: "target", name: "Job Booked", active: false };
  planStatusReconciliation([target], request);
  assert.equal(target.active, false);
});

test("3 same key is an idempotent no-op", () => {
  assert.equal(planStatusReconciliation([{ ...request, id: "target", name: "Job Booked" }], request).result, "already_assigned");
});

test("4 invalid requested key", () => code(
  () => parseStatusReconciliationRequest({ ...request, systemKey: "other" }),
  "INVALID_SYSTEM_KEY",
));

test("5 invalid status ID", () => code(
  () => parseStatusReconciliationRequest({ ...request, statusId: "bad/path" }),
  "INVALID_STATUS_ID",
));

test("6 missing target", () => code(() => planStatusReconciliation([], request), "STATUS_NOT_FOUND"));

test("7 confirmed name mismatch", () => code(
  () => planStatusReconciliation([{ id: "target", name: "Renamed" }], request),
  "CONFIRMED_NAME_MISMATCH",
));

test("8 target has different key", () => code(
  () => planStatusReconciliation([{ id: "target", name: "Job Booked", systemKey: "onroute" }], request),
  "TARGET_HAS_DIFFERENT_KEY",
));

test("9 duplicate explicit key", () => code(
  () => {
    code(() => planStatusReconciliation([
      { id: "target", name: "Job Booked", systemKey: "job_booked" },
      { id: "other", name: "Booked", systemKey: "job_booked" },
    ], request), "DUPLICATE_EXPLICIT_KEY");
    return planStatusReconciliation([
      { id: "target", name: "Job Booked" },
      { id: "other", name: "Booked", systemKey: "job_booked" },
    ], request);
  },
  "DUPLICATE_EXPLICIT_KEY",
));

test("10 duplicate legacy alias ambiguity", () => code(
  () => planStatusReconciliation([
    { id: "target", name: "Job Booked" },
    { id: "other", name: "job-booked" },
  ], request),
  "AMBIGUOUS_LEGACY_ALIAS",
));

test("11 invalid existing metadata", () => code(
  () => planStatusReconciliation([
    { id: "target", name: "Job Booked" },
    { id: "invalid", name: "Bad", systemKey: "bad" },
  ], request),
  "INVALID_EXISTING_METADATA",
));

test("12 custom statuses remain untouched", () => {
  const before = structuredClone(custom);
  planStatusReconciliation([{ id: "target", name: "Job Booked" }, custom], request);
  assert.deepEqual(custom, before);
});

test("13 workflow flags are neither inferred nor changed", () => {
  const target = { id: "target", name: "Job Booked", startTimer: false, closeJob: true };
  planStatusReconciliation([target], request);
  assert.deepEqual(target, { id: "target", name: "Job Booked", startTimer: false, closeJob: true });
});

test("14 policy performs no job, history, or status-ID rewrite", () => {
  const statuses = [{ id: "target", name: "Job Booked", history: ["old"], jobId: "job-1" }];
  const before = structuredClone(statuses);
  planStatusReconciliation(statuses, request);
  assert.deepEqual(statuses, before);
});

test("15 authorization is required", () => assert.equal(canReconcileJobStatuses({}), false));
test("16 Manage job settings is accepted", () => assert.equal(canReconcileJobStatuses({ permissions: { "Manage job settings": true } }), true));
test("17 privileged roles use existing semantics", () => {
  for (const primaryRole of ["Business Owner", "Administrator", "Super Admin"]) {
    assert.equal(canReconcileJobStatuses({ primaryRole }), true);
  }
  assert.equal(canReconcileJobStatuses({ primaryRole: "Technician" }), false);
});

test("18 service binds all status and audit paths to authenticated company context", () => {
  const source = readFileSync("src/lib/jobStatusReconciliationService.ts", "utf8");
  assert.match(source, /doc\(context\.companyId\)\.collection\("statuses"\)/);
  assert.match(source, /doc\(context\.companyId\)\.collection\("audit_log"\)/);
});

test("19 client companyId is rejected", () => code(
  () => parseStatusReconciliationRequest({ ...request, companyId: "company-b" }),
  "INVALID_REQUEST",
));

test("20 concurrency conflict mapping is closed", () => {
  assert.equal(isConcurrentTransactionError({ code: "aborted", message: "secret path" }), true);
  assert.equal(isConcurrentTransactionError({ code: "permission-denied" }), false);
});

test("21 service creates the audit entry in the assignment transaction", () => {
  const source = readFileSync("src/lib/jobStatusReconciliationService.ts", "utf8");
  assert.match(source, /runTransaction/);
  assert.match(source, /transaction\.create\(audit/);
  assert.match(source, /STATUS_CANONICAL_IDENTITY_ASSIGNED/);
});

test("22 idempotent no-op returns null audit before writes", () => {
  const source = readFileSync("src/lib/jobStatusReconciliationService.ts", "utf8");
  const noOp = source.indexOf('plan.result === "already_assigned"');
  assert.ok(noOp >= 0 && noOp < source.indexOf("transaction.update") && noOp < source.indexOf("transaction.create"));
  assert.match(source.slice(noOp, source.indexOf("transaction.update")), /auditId: null/);
});

test("23 unrelated legacy aliases remain valid runtime-compatible status data", () => {
  const statuses: JobStatusDocument[] = [
    { id: "target", name: "Job Booked" },
    { id: "legacy", name: "On Route", active: false },
  ];
  assert.equal(planStatusReconciliation(statuses, request).result, "assigned");
  assert.equal(statuses[1].systemKey, undefined);
});
