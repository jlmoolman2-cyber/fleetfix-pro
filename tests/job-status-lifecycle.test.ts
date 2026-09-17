import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  selectAdvancedBookingTarget,
  selectContextualReopenStatus,
  selectLifecycleStartStatus,
} from "../src/lib/jobStatusLifecycle.ts";

const status = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  active: true,
  ...extra,
});

test("a unique active configured start status remains workflow authority", () => {
  for (const candidate of [
    status("custom", "Awaiting Inspection", { startStatus: true }),
    status("explicit", "Booked display", { startStatus: true, systemKey: "job_booked" }),
    status("legacy", "Job Booked", { startStatus: true }),
  ]) {
    const result = selectLifecycleStartStatus([candidate]);
    assert.deepEqual(result, {
      kind: "selected",
      statusId: candidate.id,
      statusName: candidate.name,
      source: "configured_start",
    });
    assert.equal("systemKey" in result, false);
  }
});

test("multiple active configured starts fail closed", () => {
  const result = selectLifecycleStartStatus([
    status("one", "One", { startStatus: true }),
    status("two", "Two", { startStatus: true }),
  ]);
  assert.deepEqual(result, { kind: "failed", reason: "multiple_active_start_statuses" });
});

test("inactive configured starts are ineligible", () => {
  const result = selectLifecycleStartStatus([
    status("inactive", "Custom Start", { startStatus: true, active: false }),
  ]);
  assert.deepEqual(result, { kind: "failed", reason: "canonical_target_missing" });
});

test("zero configured starts safely falls back to explicit or legacy Job Booked", () => {
  const explicit = selectLifecycleStartStatus([
    status("explicit", "Booked display", { systemKey: "job_booked" }),
  ]);
  assert.deepEqual(explicit, {
    kind: "selected",
    statusId: "explicit",
    statusName: "Booked display",
    source: "canonical_fallback",
  });

  const legacy = selectLifecycleStartStatus([status("legacy", "Job Booked")]);
  assert.deepEqual(legacy, {
    kind: "selected",
    statusId: "legacy",
    statusName: "Job Booked",
    source: "canonical_fallback",
  });
});

test("broad booked and missing canonical targets fail closed", () => {
  for (const statuses of [[], [status("broad", "Booked")]]) {
    assert.deepEqual(
      selectLifecycleStartStatus(statuses),
      { kind: "failed", reason: "canonical_target_missing" },
    );
  }
});

test("duplicate explicit and duplicate legacy Job Booked identities fail closed", () => {
  const duplicateExplicit = selectLifecycleStartStatus([
    status("one", "One", { systemKey: "job_booked" }),
    status("two", "Two", { systemKey: "job_booked" }),
  ]);
  assert.deepEqual(duplicateExplicit, { kind: "failed", reason: "ambiguous_canonical_fallback" });

  const duplicateLegacy = selectLifecycleStartStatus([
    status("one", "Job Booked"),
    status("two", "job booked"),
  ]);
  assert.deepEqual(duplicateLegacy, { kind: "failed", reason: "ambiguous_canonical_fallback" });
});

test("invalid canonical metadata and inactive canonical targets fail closed", () => {
  assert.deepEqual(
    selectLifecycleStartStatus([status("invalid", "Job Booked", { systemKey: "booked" })]),
    { kind: "failed", reason: "invalid_canonical_metadata" },
  );
  assert.deepEqual(
    selectLifecycleStartStatus([status("inactive", "Job Booked", { active: false })]),
    { kind: "failed", reason: "canonical_target_inactive" },
  );
});

test("inactive statuses remain in complete canonical ambiguity validation", () => {
  const result = selectLifecycleStartStatus([
    status("active", "Active booked", { systemKey: "job_booked" }),
    status("inactive", "Inactive booked", { systemKey: "job_booked", active: false }),
  ]);
  assert.deepEqual(result, { kind: "failed", reason: "ambiguous_canonical_fallback" });
});

test("advanced activation retains a valid active persisted ID target", () => {
  const statuses = [
    status("custom", "Custom Scheduled Start"),
    status("fallback", "Job Booked", { startStatus: true }),
  ];
  assert.deepEqual(
    selectAdvancedBookingTarget(statuses, { statusId: "custom", statusName: "Old Name" }),
    {
      kind: "selected",
      statusId: "custom",
      statusName: "Custom Scheduled Start",
      source: "persisted_target",
    },
  );
});

test("advanced activation falls back through the shared safe start selector", () => {
  const fallback = status("fallback", "Custom Start", { startStatus: true });
  assert.deepEqual(
    selectAdvancedBookingTarget([fallback], { statusId: "missing", statusName: "Job Booked" }),
    {
      kind: "selected",
      statusId: "fallback",
      statusName: "Custom Start",
      source: "configured_start",
    },
  );
});

test("Re-opened and Reopened are bounded contextual targets", () => {
  for (const name of ["Re-opened", "Reopened"]) {
    const result = selectContextualReopenStatus([status("reopen", name)]);
    assert.deepEqual(result, {
      kind: "selected",
      statusId: "reopen",
      statusName: name,
      source: "contextual_reopen",
    });
    assert.equal("systemKey" in result, false);
  }
});

test("contextual reopen selection rejects ambiguity, inactivity, and unrelated names", () => {
  assert.deepEqual(
    selectContextualReopenStatus([status("one", "Re-opened"), status("two", "Reopened")]),
    { kind: "failed", reason: "multiple_active_reopen_statuses" },
  );
  for (const statuses of [
    [status("inactive", "Re-opened", { active: false })],
    [status("other", "Reopening Soon")],
  ]) {
    assert.deepEqual(
      selectContextualReopenStatus(statuses),
      { kind: "failed", reason: "reopen_target_missing" },
    );
  }
});

test("authorized lifecycle surfaces use the shared selectors and preserve schemas", () => {
  const creation = readFileSync("src/app/jobs/new/page.tsx", "utf8");
  const activation = readFileSync("src/app/components/AdvancedBookingActivator.tsx", "utf8");
  const restore = readFileSync("src/components/jobs/JobLifecyclePage.tsx", "utf8");
  const detail = readFileSync("src/app/jobs/[id]/page.tsx", "utf8");
  const queue = readFileSync("src/lib/jobQueue.ts", "utf8");

  assert.match(creation, /selectLifecycleStartStatus\(statusDocs\)/);
  for (const field of ["status", "statusId", "bookedStatusId", "bookedStatusName"]) {
    assert.match(creation, new RegExp(`\\b${field}\\s*:`));
  }
  assert.match(creation, /requires correction before a job can be created/);

  assert.match(activation, /selectAdvancedBookingTarget\(statusDocuments/);
  assert.doesNotMatch(activation, /bookedStatusName\s*\|\|\s*["']Job Booked["']/);
  assert.match(activation, /target\.kind !== ["']selected["']/);

  assert.match(restore, /selectLifecycleStartStatus\(statuses\)/);
  assert.match(restore, /statusHistory:\s*arrayUnion\(/);
  assert.doesNotMatch(restore, /exitedAt|systemKey/);

  assert.match(detail, /selectContextualReopenStatus\(allStatuses\)/);
  assert.match(detail, /const reopenedStatus = contextualReopenStatus\(\)/);
  assert.match(queue, /export async function recalculateActiveJobQueue\(\): Promise<void>/);
});

test("the lifecycle helper is pure and returns no persistence instructions", () => {
  const source = readFileSync("src/lib/jobStatusLifecycle.ts", "utf8");
  assert.doesNotMatch(source, /firebase|firestore|react|window\.|document\.|updateDoc|setDoc|addDoc/i);
  assert.doesNotMatch(source, /exitedAt/);
  assert.doesNotMatch(source, /systemKey\s*:/);
});
