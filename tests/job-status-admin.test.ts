import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  adminStatusPolicy,
  validateCustomStatusName,
} from "../src/lib/jobStatusAdmin.ts";

test("explicit and unique legacy statuses receive distinct protected display states", () => {
  const explicit = { id: "booked", name: "Job Booked", systemKey: "job_booked" };
  const legacy = { id: "route", name: "En Route" };
  const statuses = [explicit, legacy];

  const explicitPolicy = adminStatusPolicy(statuses, explicit);
  assert.equal(explicitPolicy.state, "SYSTEM");
  assert.equal(explicitPolicy.key, "job_booked");
  assert.equal(explicitPolicy.canRename, false);
  assert.equal(explicitPolicy.canDelete, false);
  assert.equal(explicitPolicy.canDisable, false);

  const legacyPolicy = adminStatusPolicy(statuses, legacy);
  assert.equal(legacyPolicy.state, "LEGACY_SYSTEM");
  assert.equal(legacyPolicy.key, "onroute");
  assert.equal(legacyPolicy.canRename, false);
  assert.equal(legacyPolicy.canDelete, false);
  assert.equal(legacyPolicy.canDisable, false);
  assert.equal("persistencePatch" in legacyPolicy, false);
  assert.equal("systemKey" in legacyPolicy, false);
});

test("ordinary custom statuses retain rename, delete, and active-toggle behavior", () => {
  const custom = { id: "parts", name: "Waiting for parts", active: true };
  const policy = adminStatusPolicy([custom], custom);
  assert.equal(policy.state, "CUSTOM");
  assert.equal(policy.canRename, true);
  assert.equal(policy.canDelete, true);
  assert.equal(policy.canDisable, true);
  assert.equal(policy.canEnable, true);
  assert.deepEqual(validateCustomStatusName("Awaiting customer"), { valid: true });
});

test("canonical labels and safe aliases are rejected for custom create or rename", () => {
  for (const name of ["Job Booked", "Onroute", "En Route", "Dispatched", "Start Work", "on_site", "Job Complete", "Completed"]) {
    const result = validateCustomStatusName(name);
    assert.equal(result.valid, false, name);
    if (!result.valid) assert.equal(result.reason, "reserved_system_name");
  }
  for (const name of ["booked", "complete", "closed", "arrived", "arrival"]) {
    assert.deepEqual(validateCustomStatusName(name), { valid: true }, name);
  }
});

test("duplicate explicit and legacy identities fail closed", () => {
  const duplicateExplicit = [
    { id: "route-a", name: "Onroute", systemKey: "onroute" },
    { id: "route-b", name: "Dispatch", systemKey: "onroute" },
  ];
  const explicitPolicy = adminStatusPolicy(duplicateExplicit, duplicateExplicit[0]);
  assert.equal(explicitPolicy.state, "AMBIGUOUS");
  assert.equal(explicitPolicy.canRename, false);
  assert.equal(explicitPolicy.canDelete, false);
  assert.equal(explicitPolicy.canDisable, false);

  const duplicateLegacy = [
    { id: "route-a", name: "On Route" },
    { id: "route-b", name: "Dispatched" },
  ];
  const legacyPolicy = adminStatusPolicy(duplicateLegacy, duplicateLegacy[0]);
  assert.equal(legacyPolicy.state, "AMBIGUOUS");
  assert.equal(legacyPolicy.canRename, false);
  assert.equal(legacyPolicy.canDelete, false);
  assert.equal(legacyPolicy.canDisable, false);
});

test("invalid metadata fails closed", () => {
  const invalid = { id: "bad", name: "Ordinary", systemKey: "closed" };
  const policy = adminStatusPolicy([invalid], invalid);
  assert.equal(policy.state, "INVALID");
  assert.equal(policy.canRename, false);
  assert.equal(policy.canDelete, false);
  assert.equal(policy.canDisable, false);
});

test("inactive protected statuses can be enabled but active ones cannot be disabled", () => {
  const active = { id: "complete", name: "Job Complete", systemKey: "job_complete", active: true };
  const inactive = { ...active, active: false };
  const activePolicy = adminStatusPolicy([active], active);
  const inactivePolicy = adminStatusPolicy([inactive], inactive);
  assert.equal(activePolicy.canDisable, false);
  assert.equal(inactivePolicy.canEnable, true);
});

test("identity policy neither derives workflow flags nor controls ordering", () => {
  const system = {
    id: "work",
    name: "Start Work",
    systemKey: "start_work",
    startTimer: false,
    stopTimer: true,
    endTimer: true,
    jobCompleted: false,
    sortOrder: 42,
  };
  const before = structuredClone(system);
  const policy = adminStatusPolicy([system], system);
  assert.equal(policy.state, "SYSTEM");
  assert.deepEqual(system, before);
  assert.equal(system.startTimer, false);
  assert.equal(system.stopTimer, true);
  assert.equal(system.jobCompleted, false);
  assert.equal(system.sortOrder, 42);
  assert.equal("startTimer" in policy, false);
  assert.equal("jobCompleted" in policy, false);
  assert.equal("sortOrder" in policy, false);
});

test("Admin Status pages wire the pure policy at mutation boundaries", () => {
  const listSource = readFileSync(new URL("../src/app/admin/statuses/page.tsx", import.meta.url), "utf8");
  const newSource = readFileSync(new URL("../src/app/admin/statuses/new/page.tsx", import.meta.url), "utf8");
  const editSource = readFileSync(new URL("../src/app/admin/statuses/[id]/page.tsx", import.meta.url), "utf8");

  assert.match(newSource, /validateCustomStatusName\(statusName\)[\s\S]*addDoc\(/);
  assert.match(listSource, /adminStatusPolicy\(statuses, status\)/);
  assert.match(listSource, /policy\.canDelete/);
  assert.match(listSource, /policy\.canDisable/);
  assert.match(editSource, /adminStatusPolicy\(allStatuses, persistedStatus\)/);
  assert.match(editSource, /policy\.canRename/);
  assert.match(editSource, /policy\.canDisable/);
  assert.doesNotMatch(editSource, /systemKey\s*:/);
});
