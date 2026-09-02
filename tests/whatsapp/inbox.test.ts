import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchTokens, normalizeSearchValue, searchToken } from "../../src/lib/whatsapp/search.ts";
import { normalizedPhoneValues } from "../../src/lib/whatsapp/phoneIndex.ts";
import { assertEmulatorTarget } from "../../scripts/seed_whatsapp_emulator.mjs";
import { userHasPermission } from "../../src/lib/whatsapp/permissions.ts";
import { formatPhoneForDisplay } from "../../src/lib/whatsapp/phoneNumbers.ts";

test("inbox search creates bounded normalized prefix tokens", () => {
  const tokens = buildSearchTokens(["Demo Logistics", "JOB-1001", "+27 82 123 4567"]);
  assert.ok(tokens.includes("demo"));
  assert.ok(tokens.includes("job-1001"));
  assert.equal(searchToken("  DEMO Logistics "), "demo logistics");
  assert.equal(normalizeSearchValue(" A   B "), "a b");
  assert.ok(tokens.length <= 120);
});

test("phone indexing deduplicates normalized values", () => {
  assert.deepEqual(normalizedPhoneValues(["082 123 4567", "+27 82 123 4567", ""]), ["+27821234567"]);
});

test("South African WhatsApp numbers are formatted for display without changing their stored value", () => {
  const normalized = "+27823206967";
  assert.equal(formatPhoneForDisplay(normalized), "+27 82 320 6967");
  assert.equal(normalized, "+27823206967");
  assert.equal(formatPhoneForDisplay("+12025550123"), "+12025550123");
});

test("all inbox mutations remain explicitly permission-gated", () => {
  const companyUser = { permissions: { "View inbox": true, "View conversations": true, "Manage conversations": false, "Assign conversations": true, "Close conversations": false } };
  assert.equal(userHasPermission(companyUser, "View inbox"), true);
  assert.equal(userHasPermission(companyUser, "View conversations"), true);
  assert.equal(userHasPermission(companyUser, "Manage conversations"), false);
  assert.equal(userHasPermission(companyUser, "Assign conversations"), true);
  assert.equal(userHasPermission(companyUser, "Close conversations"), false);
});

test("seed guard accepts only an emulator host and isolated project", () => {
  assert.throws(() => assertEmulatorTarget({ GCLOUD_PROJECT: "demo-fleetfix" }), /FIRESTORE_EMULATOR_HOST/);
  assert.throws(() => assertEmulatorTarget({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", GCLOUD_PROJECT: "fleetfix-pro" }), /demo-/);
  assert.equal(assertEmulatorTarget({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", GCLOUD_PROJECT: "demo-fleetfix" }), "demo-fleetfix");
});
