import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { normalizeE164 } from "../../src/lib/whatsapp/phoneNumbers.ts";
import { readBearerToken, selectActiveCompany } from "../../src/lib/whatsapp/authCore.ts";
import { userHasPermission } from "../../src/lib/whatsapp/permissions.ts";
import { verifyWebhookChallenge, verifyWebhookSignature } from "../../src/lib/whatsapp/webhookSecurity.ts";
import { chooseJobLink, extractJobNumberCandidates, isActiveJob, preferExistingConversation, uniqueEntityMatch } from "../../src/lib/whatsapp/linkingCore.ts";
import { incrementUnreadOnce, safeIncomingMessageText } from "../../src/lib/whatsapp/messageCore.ts";
import { shouldProcessWebhook } from "../../src/lib/whatsapp/idempotencyState.ts";
import { requireEnabledWhatsAppConfig } from "../../src/lib/whatsapp/settingsCore.ts";
import { mayApplyDeliveryStatus, serviceWindowExpiry } from "../../src/lib/whatsapp/statusCore.ts";

test("South African local mobile numbers normalize to E.164", () => {
  assert.equal(normalizeE164("082 493 4056", "+27"), "+27824934056");
});

test("invalid phone numbers are rejected", () => {
  assert.throws(() => normalizeE164("123", "+27"), /valid international number/);
});

test("valid Meta webhook signature is accepted", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const signature = `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`;
  assert.equal(verifyWebhookSignature(body, signature, "test-secret"), true);
});

test("invalid Meta webhook signature is rejected", () => {
  assert.equal(verifyWebhookSignature("{}", `sha256=${"0".repeat(64)}`, "test-secret"), false);
});

test("webhook verification challenge requires the configured token", () => {
  const url = "https://example.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345";
  assert.equal(verifyWebhookChallenge(url, "verify-me"), "12345");
  assert.throws(() => verifyWebhookChallenge(url, "wrong"), /verification failed/);
});

test("missing WhatsApp permission is denied by the permission predicate", () => {
  assert.equal(userHasPermission({ primaryRole: "Technician", permissions: {} }, "View inbox"), false);
  assert.equal(userHasPermission({ primaryRole: "Technician", permissions: { "View inbox": true } }, "View inbox"), true);
});

test("authenticated server request extracts its Firebase bearer token", () => {
  const request = new Request("https://example.test", { headers: { authorization: "Bearer firebase-token" } });
  assert.equal(readBearerToken(request), "firebase-token");
});

test("unauthenticated server request is rejected", () => {
  assert.throws(() => readBearerToken(new Request("https://example.test")), /Authentication is required/);
});

test("incorrect company access is rejected", () => {
  assert.throws(
    () => selectActiveCompany([{ companyId: "company-a", active: true }], "company-b"),
    /selected company membership is not valid/,
  );
});

test("duplicate webhook keys are stable for idempotent storage", async () => {
  const { idempotencyKey } = await import("../../src/lib/whatsapp/idempotencyCore.ts");
  const seen = new Set<string>();
  const first = idempotencyKey("wamid.duplicate");
  const second = idempotencyKey("wamid.duplicate");
  assert.equal(seen.has(first), false);
  seen.add(first);
  assert.equal(seen.has(second), true);
});

test("incoming text messages are preserved and unsupported types are represented safely", () => {
  assert.equal(safeIncomingMessageText({ type: "text", text: { body: "Please help with NJ2515932" } }), "Please help with NJ2515932");
  assert.equal(safeIncomingMessageText({ type: "image" }), "[Unsupported WhatsApp message type: image]");
});

test("FleetFix job-number candidates are extracted while invalid text is ignored", () => {
  assert.deepEqual(extractJobNumberCandidates("Job NJ2515932 please"), ["NJ2515932"]);
  assert.deepEqual(extractJobNumberCandidates("Reference 123 and hello"), []);
});

test("single active job links automatically", () => {
  const job = { id: "job-a", jobNumber: "NJ2515932", customerId: "customer-a" };
  assert.deepEqual(chooseJobLink([job]), { job, needsJobAssignment: false, method: "single_active_job" });
});

test("known customer or contact phone has one unambiguous entity match", () => {
  const contact = { customerId: "customer-a", contactId: "contact-a" };
  assert.deepEqual(uniqueEntityMatch([contact]), contact);
});

test("unknown or multiply-owned phone number is not guessed", () => {
  assert.equal(uniqueEntityMatch([]), null);
  assert.equal(uniqueEntityMatch([{ customerId: "a" }, { customerId: "b" }]), null);
});

test("existing conversation wins and otherwise a new stable conversation is selected", () => {
  assert.equal(preferExistingConversation("conversation-existing", "conversation-new"), "conversation-existing");
  assert.equal(preferExistingConversation(null, "conversation-new"), "conversation-new");
});

test("multiple active jobs remain unassigned", () => {
  const result = chooseJobLink([
    { id: "job-a", jobNumber: "NJ2515932" },
    { id: "job-b", jobNumber: "NJ2515933" },
  ]);
  assert.equal(result.job, null);
  assert.equal(result.needsJobAssignment, true);
  assert.equal(result.method, "multiple_active_jobs");
});

test("validated explicit job overrides ambiguous active jobs", () => {
  const explicit = { id: "job-b", jobNumber: "NJ2515933", customerId: "customer-a" };
  const result = chooseJobLink([{ id: "job-a", jobNumber: "NJ2515932" }, explicit], explicit);
  assert.equal(result.job?.id, "job-b");
  assert.equal(result.method, "explicit_job_number");
});

test("closed, completed, archived and cancelled jobs are not active", () => {
  assert.equal(isActiveJob({ status: "Work Started" }), true);
  assert.equal(isActiveJob({ isClosed: true }), false);
  assert.equal(isActiveJob({ isCompleted: true }), false);
  assert.equal(isActiveJob({ archived: true }), false);
  assert.equal(isActiveJob({ status: "Cancelled" }), false);
});

test("delivery statuses advance and cannot regress", () => {
  assert.equal(mayApplyDeliveryStatus("pending", "sent"), true);
  assert.equal(mayApplyDeliveryStatus("sent", "delivered"), true);
  assert.equal(mayApplyDeliveryStatus("delivered", "read"), true);
  assert.equal(mayApplyDeliveryStatus("read", "delivered"), false);
  assert.equal(mayApplyDeliveryStatus("delivered", "sent"), false);
  assert.equal(mayApplyDeliveryStatus("sent", "failed"), true);
  assert.equal(mayApplyDeliveryStatus("delivered", "failed"), false);
});

test("service window expires exactly 24 hours after the inbound message", () => {
  const inbound = new Date("2026-08-31T10:00:00.000Z");
  assert.equal(serviceWindowExpiry(inbound).toISOString(), "2026-09-01T10:00:00.000Z");
});

test("duplicate incoming message does not increment unread twice", () => {
  assert.equal(incrementUnreadOnce(false, 4), 5);
  assert.equal(incrementUnreadOnce(true, 5), 5);
});

test("processed and actively leased webhook events are duplicates, retryable failures recover", () => {
  assert.equal(shouldProcessWebhook("processed", 0, 100), false);
  assert.equal(shouldProcessWebhook("processing", 200, 100), false);
  assert.equal(shouldProcessWebhook("processing", 50, 100), true);
  assert.equal(shouldProcessWebhook("retryable", 0, 100), true);
  assert.equal(shouldProcessWebhook("failed", 0, 100), true);
});

test("missing or disabled WhatsApp configuration is rejected", () => {
  assert.throws(() => requireEnabledWhatsAppConfig(false, undefined), /not enabled/);
  assert.throws(() => requireEnabledWhatsAppConfig(true, false), /not enabled/);
  assert.doesNotThrow(() => requireEnabledWhatsAppConfig(true, true));
});
