import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchTokens, normalizeSearchValue, searchToken } from "../../src/lib/whatsapp/search.ts";
import { normalizedPhoneValues } from "../../src/lib/whatsapp/phoneIndex.ts";
import { assertEmulatorTarget } from "../../scripts/seed_whatsapp_emulator.mjs";
import { userHasPermission } from "../../src/lib/whatsapp/permissions.ts";
import { formatPhoneForDisplay } from "../../src/lib/whatsapp/phoneNumbers.ts";
import { appendOlderMessagePage, sortMessagePageNewestFirst } from "../../src/lib/whatsapp/messageCore.ts";
import { createCleanupBag, mergeLiveMessagePage } from "../../src/lib/whatsapp/liveUpdatesCore.ts";

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

test("WhatsApp message pages display newest messages first", () => {
  const messages = sortMessagePageNewestFirst([
    { id: "old", timestamp: "2026-09-02T13:02:00.000Z" },
    { id: "new", timestamp: "2026-09-02T15:23:00.000Z" },
    { id: "middle", timestamp: "2026-09-02T13:56:00.000Z" },
  ]);
  assert.deepEqual(messages.map((message) => message.id), ["new", "middle", "old"]);
});

test("same-timestamp WhatsApp messages use descending document ID order", () => {
  const timestamp = "2026-09-02T15:23:00.000Z";
  const messages = sortMessagePageNewestFirst([
    { id: "message-a", timestamp },
    { id: "message-c", timestamp },
    { id: "message-b", timestamp },
  ]);
  assert.deepEqual(messages.map((message) => message.id), ["message-c", "message-b", "message-a"]);
});

test("older cursor pages append without duplicating or skipping messages", () => {
  const current = [{ id: "message-5" }, { id: "message-4" }, { id: "message-3" }];
  const older = [{ id: "message-3" }, { id: "message-2" }, { id: "message-1" }];
  const merged = appendOlderMessagePage(current, older);
  assert.deepEqual(merged.map((message) => message.id), ["message-5", "message-4", "message-3", "message-2", "message-1"]);
});

test("live message pages replace changed messages and retain loaded history", () => {
  const current = [{ id: "new", status: "sent" }, { id: "old", status: "received" }];
  const live = [{ id: "newer", status: "received" }, { id: "new", status: "delivered" }];
  assert.deepEqual(mergeLiveMessagePage(live, current), [
    { id: "newer", status: "received" },
    { id: "new", status: "delivered" },
    { id: "old", status: "received" },
  ]);
});

test("live update cleanup releases every resource exactly once", () => {
  const calls: string[] = [];
  const cleanups = createCleanupBag();
  cleanups.add(() => { calls.push("first"); });
  cleanups.add(() => { calls.push("failing"); throw new Error("cleanup failed"); });
  cleanups.add(() => { calls.push("last"); });
  cleanups.close();
  cleanups.close();
  cleanups.add(() => { calls.push("late"); });
  assert.deepEqual(calls, ["first", "failing", "last", "late"]);
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
