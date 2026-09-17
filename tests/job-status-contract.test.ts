import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_JOB_STATUS_KEYS,
  CANONICAL_JOB_STATUS_LABELS,
  canonicalJobStatusLabel,
  canonicalKeyFromSafeAlias,
  isCanonicalJobStatusKey,
  normalizeJobStatusName,
  resolveJobStatusIdentity,
} from "../src/lib/jobStatusContract.ts";

test("canonical key set is closed and display labels are exact", () => {
  assert.deepEqual(CANONICAL_JOB_STATUS_KEYS, [
    "job_booked",
    "onroute",
    "start_work",
    "job_complete",
  ]);
  assert.deepEqual(CANONICAL_JOB_STATUS_LABELS, {
    job_booked: "Job Booked",
    onroute: "Onroute",
    start_work: "Start Work",
    job_complete: "Job Complete",
  });
  assert.equal(canonicalJobStatusLabel("start_work"), "Start Work");
  assert.equal(isCanonicalJobStatusKey("job_complete"), true);
  assert.equal(isCanonicalJobStatusKey("closed"), false);
});

test("normalization is Unicode-aware and deterministic", () => {
  assert.equal(normalizeJobStatusName("  ＯＮ＿ＳＩＴＥ  "), "on site");
  assert.equal(normalizeJobStatusName("START-WORK"), "start work");
  assert.equal(normalizeJobStatusName("Work\t  In\nProgress"), "work in progress");
  assert.equal(normalizeJobStatusName(null), "");
});

test("every approved safe alias resolves by complete normalized value", () => {
  const aliases = {
    job_booked: ["job booked"],
    onroute: ["onroute", "on route", "enroute", "en route", "traveling", "travelling", "dispatched"],
    start_work: ["start work", "work in progress", "working", "repair progress", "repair in progress", "on site", "onsite", "on_site"],
    job_complete: ["job complete", "completed"],
  } as const;

  for (const [key, values] of Object.entries(aliases)) {
    for (const value of values) assert.equal(canonicalKeyFromSafeAlias(value), key, value);
  }
});

test("unsafe aliases and substrings do not resolve", () => {
  for (const value of ["booked", "arrived", "arrival", "complete", "closed", "job booked today", "dispatched to site", "completed job"]) {
    assert.equal(canonicalKeyFromSafeAlias(value), undefined, value);
  }
});

test("unique explicit metadata resolves before a matching legacy name", () => {
  assert.deepEqual(resolveJobStatusIdentity({
    statuses: [{ id: "route-id", name: "Custom route label", systemKey: "onroute" }],
    statusId: "route-id",
    status: "Custom route label",
  }), { kind: "canonical", key: "onroute", source: "explicit" });
});

test("referenced status ID takes precedence over a noncanonical stored name", () => {
  assert.deepEqual(resolveJobStatusIdentity({
    statuses: [{ id: "work-id", name: "Start Work" }],
    statusId: "work-id",
    statusName: "Old custom label",
  }), { kind: "canonical", key: "start_work", source: "legacy_alias" });
});

test("referenced legacy alias resolves when unique", () => {
  assert.deepEqual(resolveJobStatusIdentity({
    statuses: [{ id: "route-id", name: " En-Route " }],
    statusId: "route-id",
  }), { kind: "canonical", key: "onroute", source: "legacy_alias" });
});

test("stored name is used only when the status ID is absent or unresolved", () => {
  for (const statusId of [undefined, "deleted-id"]) {
    assert.deepEqual(resolveJobStatusIdentity({
      statuses: [],
      statusId,
      statusName: "on_site",
    }), { kind: "canonical", key: "start_work", source: "stored_name_alias" });
  }
});

test("duplicate explicit canonical keys fail globally without selecting a candidate", () => {
  assert.deepEqual(resolveJobStatusIdentity({
    statuses: [
      { id: "route-a", name: "Onroute", systemKey: "onroute" },
      { id: "route-b", name: "Dispatched", systemKey: "onroute" },
    ],
    statusId: "route-a",
  }), { kind: "ambiguous", reason: "duplicate_explicit_system_key" });
});

test("multiple untagged aliases for the same concept fail safely", () => {
  assert.deepEqual(resolveJobStatusIdentity({
    statuses: [
      { id: "route-a", name: "On route" },
      { id: "route-b", name: "Dispatched" },
    ],
    statusId: "route-a",
  }), { kind: "ambiguous", reason: "duplicate_legacy_alias" });
});

test("conflicting referenced document and stored-name concepts fail safely", () => {
  assert.deepEqual(resolveJobStatusIdentity({
    statuses: [{ id: "route-id", name: "Onroute", systemKey: "onroute" }],
    statusId: "route-id",
    statusName: "Start Work",
  }), { kind: "ambiguous", reason: "conflicting_status_identity" });
});

test("unsupported and malformed explicit metadata is invalid", () => {
  for (const systemKey of ["closed", "ONROUTE", "", null, 7, true]) {
    assert.deepEqual(resolveJobStatusIdentity({
      statuses: [{ id: "bad", name: "Onroute", systemKey }],
      statusId: "bad",
    }), { kind: "invalid", reason: "invalid_system_key" });
  }
});

test("a resolved ordinary status is custom while an unknown status is unresolved", () => {
  assert.deepEqual(resolveJobStatusIdentity({
    statuses: [{ id: "parts", name: "Waiting for parts" }],
    statusId: "parts",
  }), { kind: "custom" });
  assert.deepEqual(resolveJobStatusIdentity({
    statuses: [{ id: "parts", name: "Waiting for parts" }],
    statusId: "deleted",
    statusName: "Unknown old status",
  }), { kind: "unresolved" });
  assert.deepEqual(resolveJobStatusIdentity({ statuses: [] }), { kind: "unresolved" });
});

test("workflow and completion flags never establish canonical identity", () => {
  const behavioralFields = {
    startStatus: true,
    startTimer: true,
    stopTimer: true,
    endTimer: true,
    jobCompleted: true,
    isCompleted: true,
    completedAt: "2026-09-17T00:00:00.000Z",
  };
  assert.deepEqual(resolveJobStatusIdentity({
    statuses: [{ id: "custom", name: "Operational custom", ...behavioralFields }],
    statusId: "custom",
  }), { kind: "custom" });
});
