import assert from "node:assert/strict";
import test from "node:test";

import { planCompleteReconciliation } from "../src/lib/jobStatusReconciliation.ts";
import type { JobStatusDocument } from "../src/lib/jobStatusContract.ts";

function explicitStatus(id: string, systemKey: string, extra?: Record<string, unknown>): JobStatusDocument {
  return { id, name: systemKey, systemKey, active: true, startStatus: false, sortOrder: 0, ...extra };
}
function legacyStatus(id: string, name: string, extra?: Record<string, unknown>): JobStatusDocument {
  return { id, name, active: true, startStatus: false, sortOrder: 0, ...extra };
}
function customStatus(id: string, name: string, extra?: Record<string, unknown>): JobStatusDocument {
  return { id, name, active: true, startStatus: false, sortOrder: 0, ...extra };
}

// 1. legacy Job Booked identity assignment
test("1. legacy Job Booked only → 1 update + 3 creates", () => {
  const plan = planCompleteReconciliation([legacyStatus("s1", "Job Booked")]);
  assert.equal(plan.hasErrors, false);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.creates.length, 3);
  assert.equal(plan.updates[0].systemKey, "job_booked");
  assert.equal(plan.updates[0].documentId, "s1");
});

// 2. all four explicit canonical statuses → zero mutations
test("2. all four explicit → zero mutations", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), explicitStatus("s2", "onroute"),
    explicitStatus("s3", "start_work"), explicitStatus("s4", "job_complete"),
  ]);
  assert.equal(plan.hasErrors, false);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
  assert.ok(plan.classifications.every((c) => c.classification === "EXPLICIT"));
});

// 3. missing job_booked → create with startStatus=true
test("3. missing job_booked → create with startStatus=true", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s2", "onroute"), explicitStatus("s3", "start_work"), explicitStatus("s4", "job_complete"),
  ]);
  assert.equal(plan.hasErrors, false);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].systemKey, "job_booked");
  assert.equal(plan.creates[0].startStatus, true);
});

// 4. missing onroute → create with startStatus=false
test("4. missing onroute → create with startStatus=false", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), explicitStatus("s3", "start_work"), explicitStatus("s4", "job_complete"),
  ]);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].systemKey, "onroute");
  assert.equal(plan.creates[0].startStatus, false);
});

// 5. missing start_work → create with startStatus=false
test("5. missing start_work → create with startStatus=false", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), explicitStatus("s2", "onroute"), explicitStatus("s4", "job_complete"),
  ]);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].systemKey, "start_work");
  assert.equal(plan.creates[0].startStatus, false);
});

// 6. missing job_complete → create with startStatus=false
test("6. missing job_complete → create with startStatus=false", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), explicitStatus("s2", "onroute"), explicitStatus("s3", "start_work"),
  ]);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].systemKey, "job_complete");
  assert.equal(plan.creates[0].startStatus, false);
});

// 7. all four missing → four creates
test("7. all four missing → four creates", () => {
  const plan = planCompleteReconciliation([]);
  assert.equal(plan.hasErrors, false);
  assert.equal(plan.creates.length, 4);
  assert.deepEqual(plan.creates.map((c) => c.systemKey), ["job_booked", "onroute", "start_work", "job_complete"]);
});

// 8. duplicate explicit job_booked → fail closed
test("8. duplicate explicit job_booked → fail closed", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), explicitStatus("s2", "job_booked"),
    explicitStatus("s3", "onroute"), explicitStatus("s4", "start_work"), explicitStatus("s5", "job_complete"),
  ]);
  assert.equal(plan.hasErrors, true);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
});

// 9. duplicate explicit onroute → fail closed
test("9. duplicate explicit onroute → fail closed", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), explicitStatus("s2", "onroute"),
    explicitStatus("s3", "onroute"), explicitStatus("s4", "start_work"), explicitStatus("s5", "job_complete"),
  ]);
  assert.equal(plan.hasErrors, true);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
});

// 10. duplicate explicit start_work → fail closed
test("10. duplicate explicit start_work → fail closed", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), explicitStatus("s2", "onroute"),
    explicitStatus("s3", "start_work"), explicitStatus("s4", "start_work"), explicitStatus("s5", "job_complete"),
  ]);
  assert.equal(plan.hasErrors, true);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
});

// 11. duplicate explicit job_complete → fail closed
test("11. duplicate explicit job_complete → fail closed", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), explicitStatus("s2", "onroute"),
    explicitStatus("s3", "start_work"), explicitStatus("s4", "job_complete"), explicitStatus("s5", "job_complete"),
  ]);
  assert.equal(plan.hasErrors, true);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
});

// 12. ambiguous legacy alias → fail closed
test("12. ambiguous legacy alias → fail closed", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), legacyStatus("s2", "On Route"), legacyStatus("s3", "En Route"),
    explicitStatus("s4", "start_work"), explicitStatus("s5", "job_complete"),
  ]);
  assert.equal(plan.hasErrors, true);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
});

// 13. explicit canonical + separate legacy alias → fail closed
test("13. explicit canonical + separate legacy alias → fail closed", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), explicitStatus("s2", "onroute"),
    legacyStatus("s3", "On Route"),
    explicitStatus("s4", "start_work"), explicitStatus("s5", "job_complete"),
  ]);
  assert.equal(plan.hasErrors, true);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
});

// 14. malformed systemKey → fail closed
test("14. malformed systemKey on existing document → fail closed", () => {
  const plan = planCompleteReconciliation([
    { id: "s1", name: "Bad", systemKey: "not_a_real_key" },
  ]);
  assert.equal(plan.hasErrors, true);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
});

// 15. conflicting canonical identity (explicit key on differently-named doc)
test("15. explicit canonical key on differently-named doc → classified EXPLICIT", () => {
  const plan = planCompleteReconciliation([
    { id: "s1", name: "Custom Name", systemKey: "job_booked" },
    explicitStatus("s2", "onroute"), explicitStatus("s3", "start_work"), explicitStatus("s4", "job_complete"),
  ]);
  assert.equal(plan.hasErrors, false);
  assert.equal(plan.classifications.find((c) => c.key === "job_booked")!.classification, "EXPLICIT");
  assert.equal(plan.classifications.find((c) => c.key === "job_booked")!.existingDocumentId, "s1");
});

// 16. custom statuses preserved and not classified
test("16. custom statuses preserved and not classified", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), explicitStatus("s2", "onroute"),
    explicitStatus("s3", "start_work"), explicitStatus("s4", "job_complete"),
    customStatus("c1", "Waiting for Parts"), customStatus("c2", "Sublet Out"),
  ]);
  assert.equal(plan.hasErrors, false);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
  const ids = plan.classifications.map((c) => c.existingDocumentId);
  assert.ok(!ids.includes("c1"));
  assert.ok(!ids.includes("c2"));
});

// 17. inactive existing canonical still classified and updated
test("17. inactive existing canonical still classified as LEGACY_ALIAS", () => {
  const plan = planCompleteReconciliation([
    { id: "s1", name: "Job Booked", active: false, startStatus: true, sortOrder: 1 },
    explicitStatus("s2", "onroute"), explicitStatus("s3", "start_work"), explicitStatus("s4", "job_complete"),
  ]);
  assert.equal(plan.hasErrors, false);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].documentId, "s1");
});

// 18. update only specifies documentId + systemKey (unrelated fields preserved)
test("18. update only specifies documentId + systemKey", () => {
  const plan = planCompleteReconciliation([
    { id: "s1", name: "Job Booked", active: true, startStatus: true, sortOrder: 1, color: "#f00" },
    explicitStatus("s2", "onroute"), explicitStatus("s3", "start_work"), explicitStatus("s4", "job_complete"),
  ]);
  assert.equal(plan.updates.length, 1);
  assert.deepEqual(Object.keys(plan.updates[0]).sort(), ["documentId", "systemKey"]);
});

// 19. new sortOrder values follow maximum existing valid numeric sortOrder
test("19. sort order appends after max existing", () => {
  const plan = planCompleteReconciliation([legacyStatus("s1", "Job Booked", { sortOrder: 100 })]);
  assert.equal(plan.hasErrors, false);
  const sorts = plan.creates.map((c) => c.sortOrder);
  assert.ok(sorts.every((s) => s > 100));
  assert.equal(sorts[0], 101);
});

// 20. existing sortOrder values unchanged
test("20. existing sort orders not renumbered", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked", { sortOrder: 10 }),
    explicitStatus("s2", "onroute", { sortOrder: 20 }),
    explicitStatus("s3", "start_work", { sortOrder: 25 }),
    explicitStatus("s4", "job_complete", { sortOrder: 35 }),
  ]);
  assert.equal(plan.hasErrors, false);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
});

// 21. created non-start canonical statuses use startStatus=false
test("21. created non-start canonical have startStatus=false", () => {
  const plan = planCompleteReconciliation([]);
  for (const key of ["onroute", "start_work", "job_complete"]) {
    assert.equal(plan.creates.find((c) => c.systemKey === key)!.startStatus, false);
  }
});

// 22. created job_booked uses startStatus=true
test("22. created job_booked has startStatus=true (when missing)", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s2", "onroute"), explicitStatus("s3", "start_work"), explicitStatus("s4", "job_complete"),
  ]);
  assert.equal(plan.creates.find((c) => c.systemKey === "job_booked")!.startStatus, true);
});

// 23. unsafe multiple-active-start condition fails closed
test("23. multiple active start statuses would result → fail closed", () => {
  const plan = planCompleteReconciliation([
    { id: "s0", name: "Custom Start", active: true, startStatus: true, sortOrder: 1 },
    explicitStatus("s2", "onroute"), explicitStatus("s3", "start_work"), explicitStatus("s4", "job_complete"),
  ]);
  assert.equal(plan.hasErrors, true);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
});

// 24. no delete operations
test("24. planner contains no delete operations", () => {
  const plan = planCompleteReconciliation([]) as unknown as Record<string, unknown>;
  assert.ok(!("deletes" in plan));
  assert.ok(!("delete" in plan));
});

// 25. modeled second reconciliation → zero mutations
test("25. second-run model → zero mutations", () => {
  const plan = planCompleteReconciliation([
    explicitStatus("s1", "job_booked"), explicitStatus("s2", "onroute"),
    explicitStatus("s3", "start_work"), explicitStatus("s4", "job_complete"),
  ]);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.creates.length, 0);
});