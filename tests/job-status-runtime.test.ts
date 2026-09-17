import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveRuntimeStatus,
  runtimeStatusIs,
  runtimeStatusIsContextualArrival,
  runtimeStatusIsOnRoute,
  runtimeStatusIsStartWork,
} from "../src/lib/jobStatusRuntime.ts";

test("explicit canonical identities resolve for all four system concepts", () => {
  for (const [key, name] of [
    ["onroute", "Route display"],
    ["start_work", "Work display"],
    ["job_complete", "Complete display"],
    ["job_booked", "Booked display"],
  ] as const) {
    const status = { id: key, name, systemKey: key };
    assert.deepEqual(resolveRuntimeStatus({ statuses: [status], statusId: status.id, status: name }), {
      kind: "canonical",
      key,
      source: "explicit",
    });
  }
});

test("unique legacy aliases resolve for all four system concepts", () => {
  for (const [key, name] of [
    ["onroute", "On Route"],
    ["start_work", "Start Work"],
    ["job_complete", "Job Complete"],
    ["job_booked", "Job Booked"],
  ] as const) {
    const status = { id: key, name };
    assert.deepEqual(resolveRuntimeStatus({ statuses: [status], statusId: status.id }), {
      kind: "canonical",
      key,
      source: "legacy_alias",
    });
  }
});

test("custom and unsafe broad names remain noncanonical", () => {
  for (const name of ["Waiting for parts", "booked", "complete", "closed", "On Hold"]) {
    const status = { id: name, name };
    assert.deepEqual(resolveRuntimeStatus({ statuses: [status], statusId: status.id }), { kind: "custom" });
  }
  assert.equal(runtimeStatusIsContextualArrival("Arrived at customer"), true);
  assert.equal(runtimeStatusIs({ statuses: [], status: "arrived" }, "start_work"), false);
});

test("duplicate explicit and legacy identities fail closed", () => {
  const explicit = [
    { id: "a", name: "Route A", systemKey: "onroute" },
    { id: "b", name: "Route B", systemKey: "onroute" },
  ];
  assert.deepEqual(resolveRuntimeStatus({ statuses: explicit, statusId: "a" }), {
    kind: "ambiguous",
    reason: "duplicate_explicit_system_key",
  });
  assert.equal(runtimeStatusIsOnRoute({ statuses: explicit, statusId: "a" }), false);

  const legacy = [
    { id: "a", name: "On Route" },
    { id: "b", name: "Dispatched", active: false },
  ];
  assert.deepEqual(resolveRuntimeStatus({ statuses: legacy, statusId: "a" }), {
    kind: "ambiguous",
    reason: "duplicate_legacy_alias",
  });
  assert.equal(runtimeStatusIsOnRoute({ statuses: legacy, statusId: "a" }), false);
});

test("invalid metadata and ID/name conflicts fail closed", () => {
  const invalid = [{ id: "bad", name: "Onroute", systemKey: "route" }];
  assert.deepEqual(resolveRuntimeStatus({ statuses: invalid, statusId: "bad" }), {
    kind: "invalid",
    reason: "invalid_system_key",
  });
  assert.equal(runtimeStatusIsOnRoute({ statuses: invalid, statusId: "bad" }), false);

  const route = [{ id: "route", name: "Onroute", systemKey: "onroute" }];
  assert.deepEqual(resolveRuntimeStatus({ statuses: route, statusId: "route", status: "Start Work" }), {
    kind: "ambiguous",
    reason: "conflicting_status_identity",
  });
});

test("status ID is primary and missing documents use only safe stored-name fallback", () => {
  const custom = [{ id: "custom", name: "Custom route-like process" }];
  assert.deepEqual(resolveRuntimeStatus({ statuses: custom, statusId: "custom", status: "On Route" }), {
    kind: "custom",
  });
  assert.deepEqual(resolveRuntimeStatus({ statuses: custom, statusId: "missing", status: "On Route" }), {
    kind: "canonical",
    key: "onroute",
    source: "stored_name_alias",
  });
  assert.deepEqual(resolveRuntimeStatus({ statuses: custom, statusId: "missing", status: "arrived" }), {
    kind: "unresolved",
  });
});

test("predicates classify explicit and legacy route and start-work identities", () => {
  const explicitRoute = { id: "route", name: "Travel", systemKey: "onroute" };
  assert.equal(runtimeStatusIsOnRoute({ statuses: [explicitRoute], statusId: "route" }), true);
  const legacyRoute = { id: "route", name: "En Route" };
  assert.equal(runtimeStatusIsOnRoute({ statuses: [legacyRoute], statusId: "route" }), true);
  const work = { id: "work", name: "Working" };
  assert.equal(runtimeStatusIsStartWork({ statuses: [work], statusId: "work" }), true);
  const custom = { id: "custom", name: "Travel preparations" };
  assert.equal(runtimeStatusIsOnRoute({ statuses: [custom], statusId: "custom" }), false);
});

test("runtime identity does not derive behavior or persistence", () => {
  const status = {
    id: "complete",
    name: "Job Complete",
    systemKey: "job_complete",
    startTimer: false,
    stopTimer: false,
    endTimer: false,
    jobCompleted: false,
    closeJob: false,
  };
  const before = structuredClone(status);
  const result = resolveRuntimeStatus({ statuses: [status], statusId: status.id });
  assert.deepEqual(status, before);
  assert.equal("persistencePatch" in result, false);
  assert.equal("startTimer" in result, false);
  assert.equal("jobCompleted" in result, false);
  assert.equal("closeJob" in result, false);
});

test("queue and job-detail sources wire complete context without changing the public API", () => {
  const runtimeSource = readFileSync(new URL("../src/lib/jobStatusRuntime.ts", import.meta.url), "utf8");
  const queueSource = readFileSync(new URL("../src/lib/jobQueue.ts", import.meta.url), "utf8");
  const detailSource = readFileSync(new URL("../src/app/jobs/[id]/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(runtimeSource, /firebase|firestore|react|window\.|document\./i);
  assert.match(runtimeSource, /statuses: readonly JobStatusDocument\[\]/);
  assert.match(queueSource, /export async function recalculateActiveJobQueue\(\): Promise<void>/);
  assert.match(queueSource, /Promise\.all\(\[[\s\S]*getDocs\(jobsCollection\)[\s\S]*getDocs\(statusesCollection\)/);
  assert.match(queueSource, /statusSnapshot\.docs\.map/);
  assert.doesNotMatch(queueSource, /on\\s\*route|en\\s\*route|travell\?ing|dispatched/);
  assert.match(detailSource, /setAllStatuses\(completeStatuses\)/);
  assert.match(detailSource, /const list = completeStatuses\.filter/);
  assert.match(detailSource, /setStatuses\(list\)/);
});
