import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertManualOutboundEnabled,
  classifySendFailure,
  defaultOutboundJobId,
  outboundFlags,
  shouldAttemptSend,
  validateManualSendBody,
} from "../../src/lib/whatsapp/outboundCore.ts";
import { WhatsAppError } from "../../src/lib/whatsapp/errors.ts";
import { assertServiceWindowOpen } from "../../src/lib/whatsapp/serviceWindow.ts";

test("all outbound modes default disabled and remain independent", () => {
  assert.deepEqual(outboundFlags({}), { manual: false, automation: false, templates: false });
  assert.deepEqual(outboundFlags({ WHATSAPP_MANUAL_OUTBOUND_ENABLED: "true" }), { manual: true, automation: false, templates: false });
});

test("production always denies manual outbound even if its flag is true", () => {
  assert.throws(() => assertManualOutboundEnabled({ FLEETFIX_ENVIRONMENT: "production", WHATSAPP_MANUAL_OUTBOUND_ENABLED: "true" }), /disabled/);
});

test("staging requires an explicit manual flag", () => {
  assert.throws(() => assertManualOutboundEnabled({ FLEETFIX_ENVIRONMENT: "staging" }), /disabled/);
  assert.doesNotThrow(() => assertManualOutboundEnabled({ FLEETFIX_ENVIRONMENT: "staging", WHATSAPP_MANUAL_OUTBOUND_ENABLED: "true" }));
});

test("manual request accepts only trimmed text, request ID, and optional job", () => {
  assert.deepEqual(validateManualSendBody({ text: "  hello  ", clientRequestId: "request_123", jobId: null }), { text: "hello", clientRequestId: "request_123", jobId: null });
  assert.throws(() => validateManualSendBody({ text: "hello", clientRequestId: "request_123", recipient: "+2782" }), /unsupported/);
});

test("empty, non-text, oversized text, and invalid request IDs are rejected", () => {
  assert.throws(() => validateManualSendBody({ text: " ", clientRequestId: "request_123" }), /between 1 and 4096/);
  assert.throws(() => validateManualSendBody({ text: 123, clientRequestId: "request_123" }), /text is invalid/);
  assert.throws(() => validateManualSendBody({ text: "x".repeat(4097), clientRequestId: "request_123" }), /4096/);
  assert.throws(() => validateManualSendBody({ text: "hello", clientRequestId: "short" }), /request ID/);
});

test("single job may default visibly while multiple jobs never auto-select", () => {
  assert.equal(defaultOutboundJobId(["job-1"]), "job-1");
  assert.equal(defaultOutboundJobId(["job-1", "job-2"]), null);
  assert.equal(defaultOutboundJobId([]), null);
});

test("service window permits active replies and rejects expired replies", () => {
  assert.doesNotThrow(() => assertServiceWindowOpen(new Date("2026-09-04T00:00:00Z"), new Date("2026-09-03T00:00:00Z")));
  assert.throws(() => assertServiceWindowOpen(new Date("2026-09-02T00:00:00Z"), new Date("2026-09-03T00:00:00Z")), /window is closed/);
});

test("duplicate and concurrent requests never receive another send attempt", () => {
  assert.equal(shouldAttemptSend(null), true);
  for (const state of ["processing", "accepted", "failed", "outcome_unknown"] as const) assert.equal(shouldAttemptSend(state), false);
});

test("definitive Meta 400, 401, 403, and 429 failures are terminal", () => {
  for (const status of [400, 401, 403, 429]) {
    const error = new WhatsAppError("META_ERROR", "rejected", 502, { metaStatus: status });
    assert.deepEqual(classifySendFailure(error), { state: "failed", reason: `META_${status}`, retryable: status === 429 });
  }
});

test("Meta 5xx, network timeouts, and uncertain responses are outcome_unknown", () => {
  assert.equal(classifySendFailure(new WhatsAppError("META_ERROR", "server", 502, { metaStatus: 503 })).state, "outcome_unknown");
  assert.equal(classifySendFailure(new Error("timeout")).state, "outcome_unknown");
});

test("local validation and rate-limit failures are definitive without a Meta retry", () => {
  assert.deepEqual(classifySendFailure(new WhatsAppError("RATE_LIMITED", "slow down", 429)), { state: "failed", reason: "RATE_LIMITED", retryable: true });
});

test("server service derives routing, validates linked jobs, audits, and preserves accepted IDs", () => {
  const source = readFileSync(new URL("../../src/lib/whatsapp/outboundService.ts", import.meta.url), "utf8");
  assert.match(source, /conversationData\.phoneNumberNormalized/);
  assert.match(source, /settings\.phoneNumberId !== process\.env\.META_WHATSAPP_PHONE_NUMBER_ID/);
  assert.match(source, /selected job is not linked/i);
  assert.match(source, /MESSAGE_SEND_REQUESTED/);
  assert.match(source, /MESSAGE_SEND_ACCEPTED/);
  assert.match(source, /MESSAGE_SEND_OUTCOME_UNKNOWN/);
  assert.match(source, /metaMessageId/);
  assert.match(source, /messagePersisted/);
});

test("early receipts are reconciled and persistence remains SSE compatible", () => {
  const source = readFileSync(new URL("../../src/lib/whatsapp/outboundService.ts", import.meta.url), "utf8");
  assert.match(source, /whatsappDeliveryStatuses/);
  assert.match(source, /reconciledAt/);
  assert.match(source, /whatsappMessages/);
  assert.match(source, /lastMessageAt/);
});

test("manual API has no template, bulk, or automation action", () => {
  const route = readFileSync(new URL("../../src/app/api/whatsapp/conversations/[id]/messages/route.ts", import.meta.url), "utf8");
  assert.match(route, /sendManualText/);
  assert.doesNotMatch(route, /sendTemplate|sendBulk|sendAutomation/);
});

test("composer remains disabled when server manual capability is false", () => {
  const page = readFileSync(new URL("../../src/app/communications/whatsapp/page.tsx", import.meta.url), "utf8");
  assert.match(page, /capabilities\.manualOutbound \?/);
  assert.match(page, /Preview mode · Manual outbound sending disabled/);
});
