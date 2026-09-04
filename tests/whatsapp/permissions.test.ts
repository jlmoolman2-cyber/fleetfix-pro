import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { effectivePermissions, permissionsForRole } from "../../src/lib/permissions.ts";
import { requireWhatsAppPermission, userHasPermission, WHATSAPP_PERMISSIONS } from "../../src/lib/whatsapp/permissions.ts";

const source = (relativePath: string) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

test("WhatsApp permissions are independently namespaced and extensible", () => {
  assert.deepEqual(WHATSAPP_PERMISSIONS.slice(0, 5), [
    "View WhatsApp",
    "View WhatsApp conversations",
    "Send WhatsApp messages",
    "View WhatsApp media",
    "Send WhatsApp templates",
  ]);
  assert.equal(new Set(WHATSAPP_PERMISSIONS).size, WHATSAPP_PERMISSIONS.length);
  assert.equal(WHATSAPP_PERMISSIONS.includes("Send messages" as never), false);
});

test("authorised user can view the WhatsApp inbox and conversations", () => {
  const user = { permissions: { "View WhatsApp": true, "View WhatsApp conversations": true } };
  assert.equal(userHasPermission(user, "View WhatsApp"), true);
  assert.equal(userHasPermission(user, "View WhatsApp conversations"), true);
});

test("user without WhatsApp view cannot access the inbox", () => {
  assert.throws(
    () => requireWhatsAppPermission({ permissions: { "View messages": true } }, "View WhatsApp"),
    (error: unknown) => error instanceof Error && error.message.includes("do not have permission") && (error as { status?: number }).status === 403,
  );
});

test("general message permission never grants WhatsApp sending", () => {
  const generalMessagingUser = { permissions: { "Send messages": true } };
  assert.equal(userHasPermission(generalMessagingUser, "Send WhatsApp messages"), false);
  assert.throws(() => requireWhatsAppPermission(generalMessagingUser, "Send WhatsApp messages"));
  assert.equal(userHasPermission({ permissions: { "Send WhatsApp messages": true } }, "Send WhatsApp messages"), true);
});

test("new WhatsApp permissions default off for ordinary existing users", () => {
  const permissions = effectivePermissions({ primaryRole: "Other", permissions: { "View messages": true, "Send messages": true } });
  for (const permission of WHATSAPP_PERMISSIONS) assert.equal(permissions[permission], false, permission);
});

test("business owners and administrators retain WhatsApp role defaults", () => {
  for (const role of ["Business Owner", "Administrator"]) {
    const permissions = permissionsForRole(role);
    for (const permission of WHATSAPP_PERMISSIONS) assert.equal(permissions[permission], true, `${role}: ${permission}`);
  }
});

test("navigation and unread lookup require WhatsApp view", () => {
  const navigation = source("src/app/components/Navigation.tsx");
  assert.match(navigation, /"\/communications\/whatsapp": "View WhatsApp"/);
  assert.match(navigation, /permissions\["View WhatsApp"\] !== true/);
  assert.doesNotMatch(navigation, /"\/communications\/whatsapp": "View inbox"/);
});

test("every browser WhatsApp route authenticates before reaching a tenant-scoped service", () => {
  for (const route of [
    "src/app/api/whatsapp/conversations/route.ts",
    "src/app/api/whatsapp/conversations/[id]/route.ts",
    "src/app/api/whatsapp/conversations/[id]/messages/route.ts",
    "src/app/api/whatsapp/conversations/[id]/messages/[messageId]/media/route.ts",
    "src/app/api/whatsapp/association-options/route.ts",
    "src/app/api/whatsapp/summary/route.ts",
    "src/app/api/whatsapp/live/route.ts",
    "src/app/api/whatsapp/diagnostics/route.ts",
  ]) assert.match(source(route), /authenticateServerRequest\(request\)/, route);
});

test("WhatsApp data and media access remain company-scoped", () => {
  const inbox = source("src/lib/whatsapp/inboxService.ts");
  const live = source("src/lib/whatsapp/liveUpdatesService.ts");
  assert.match(inbox, /companies\/\$\{context\.companyId\}\/whatsappConversations/);
  assert.match(inbox, /companies\/\$\{context\.companyId\}\/whatsappMessages/);
  assert.match(inbox, /View WhatsApp media/);
  assert.match(inbox, /storagePath\.startsWith\(`companies\/\$\{context\.companyId\}\/whatsapp-media/);
  assert.match(live, /companies\/\$\{context\.companyId\}\/whatsappConversations/);
});

test("commissioned webhook transport remains signature-gated and unchanged", () => {
  const webhook = source("src/app/api/whatsapp/webhook/route.ts");
  assert.match(webhook, /verifyWebhookSignature/);
  assert.match(webhook, /processMetaWebhook/);
});

test("outbound remains staging-only, flag-gated, permission-gated, and isolated from tests", () => {
  const outbound = source("src/lib/whatsapp/outboundService.ts");
  const core = source("src/lib/whatsapp/outboundCore.ts");
  const stagingConfig = source("apphosting.staging.yaml");
  assert.match(outbound, /Send WhatsApp messages/);
  assert.match(core, /environment\.WHATSAPP_MANUAL_OUTBOUND_ENABLED === "true"/);
  assert.match(core, /fleetfixEnvironment !== "staging"/);
  assert.doesNotMatch(stagingConfig, /WHATSAPP_MANUAL_OUTBOUND_ENABLED:\s*true/);
  assert.doesNotMatch(stagingConfig, /fleetfix-pro(?!-staging)/);
});

test("media action is hidden without the server-provided media capability", () => {
  const page = source("src/app/communications/whatsapp/page.tsx");
  assert.match(page, /capabilities\.viewMedia && message\.mediaIngestionStatus === "stored"/);
});
