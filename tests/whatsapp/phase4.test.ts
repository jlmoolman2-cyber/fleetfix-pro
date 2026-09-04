import test from "node:test";
import assert from "node:assert/strict";
import { localConfigurationChecks, validGraphVersion, validMetaId } from "../../src/lib/whatsapp/diagnosticsCore.ts";
import { assertServiceWindowOpen, isServiceWindowOpen, OUTBOUND_WHATSAPP_ENABLED } from "../../src/lib/whatsapp/serviceWindow.ts";
import { MEDIA_MAX_ATTEMPTS, mediaFailureState, mediaRetryDelayMilliseconds } from "../../src/lib/whatsapp/mediaQueueCore.ts";
import { readFileSync } from "node:fs";

test("Meta identifiers and explicit Graph versions are validated locally", () => {
  assert.equal(validMetaId("1234567890"), true);
  assert.equal(validMetaId("not-an-id"), false);
  assert.equal(validGraphVersion("v25.0"), true);
  assert.equal(validGraphVersion("latest"), false);
});

test("configuration readiness never reports ready with missing secrets or webhook URL", () => {
  const checks = localConfigurationChecks({ enabled: true, businessId: "123456", wabaId: "234567", phoneNumberId: "345678", displayPhoneNumber: "+27821234567", graphVersion: "v25.0", appSecret: true, accessToken: false, verifyToken: true, webhookUrl: "" });
  assert.equal(checks.find((check) => check.id === "access-token")?.passed, false);
  assert.equal(checks.find((check) => check.id === "webhook-url")?.passed, false);
  assert.equal(checks.find((check) => check.id === "outbound-disabled")?.passed, true);
});

test("service window is open only before its exact expiry", () => {
  const now = new Date("2026-08-31T10:00:00Z");
  assert.equal(isServiceWindowOpen(new Date("2026-08-31T10:00:01Z"), now), true);
  assert.equal(isServiceWindowOpen(new Date("2026-08-31T10:00:00Z"), now), false);
  assert.throws(() => assertServiceWindowOpen(new Date("2026-08-31T09:59:59Z"), now), /24-hour/);
});

test("outbound sending remains hard-disabled in Phase 4", () => assert.equal(OUTBOUND_WHATSAPP_ENABLED, false));

test("media queue retries exponentially and reaches a terminal failure", () => {
  assert.equal(mediaRetryDelayMilliseconds(1), 30_000);
  assert.equal(mediaRetryDelayMilliseconds(2), 60_000);
  assert.equal(mediaFailureState(MEDIA_MAX_ATTEMPTS - 1), "retryable");
  assert.equal(mediaFailureState(MEDIA_MAX_ATTEMPTS), "failed");
});

test("read-only Meta diagnostics remain authenticated, permission-gated, staging-only, and use no send path", () => {
  const route = readFileSync(new URL("../../src/app/api/whatsapp/diagnostics/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../../src/lib/whatsapp/diagnosticsService.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../src/app/communications/whatsapp/page.tsx", import.meta.url), "utf8");
  assert.match(route, /authenticateServerRequest/);
  assert.match(service, /Manage WhatsApp settings/);
  assert.match(service, /environment !== "staging"/);
  assert.match(page, /capabilities\.diagnostics/);
  assert.match(page, /\/api\/whatsapp\/diagnostics\?liveProbe=true/);
  assert.doesNotMatch(route + service, /sendText\(|\/messages/);
});
