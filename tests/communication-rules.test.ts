import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { planCommunication, validateCommunicationRule } from "../src/lib/communicationRules/core.ts";

const rule = (overrides: Record<string, unknown> = {}) => validateCommunicationRule({
  name: "Customer booked", description: "Dry plan", category: "customer-job", trigger: "job-booked", recipientType: "customer-contact",
  recipientConfiguration: { destinationId: "", preference: "inherit" }, channel: "whatsapp", templateId: "template-a", active: true,
  timing: { type: "immediate", delayAmount: 0, delayUnit: "minutes", repeat: { enabled: false, intervalAmount: 0, intervalUnit: "minutes", maximumRepeats: 0 }, stopCondition: "job-onroute" },
  ...overrides,
});
const template = (overrides: Record<string, unknown> = {}) => ({ id: "template-a", name: "Booked", description: "", category: "jobs", recipientType: "customer-contact", purpose: "job-booked", channel: "whatsapp" as const, active: true, subject: "", body: "Job {{jobNumber}} queue {{queueNumber}} EDT {{estimatedDispatchTime}} {{trackingLink}}", ...overrides });
const recipient = { display: "John Smith", destination: "+27823206967", preference: "both" };
const variables = { jobNumber: "NJ00001", queueNumber: "3", estimatedDispatchTime: "10:45", trackingLink: "https://example.test/track/NJ00001" };

test("rule validation supports requested triggers, recipients, stop conditions, and repeat metadata", () => {
  const value = rule({ timing: { type: "delayed", delayAmount: 90, delayUnit: "minutes", repeat: { enabled: true, intervalAmount: 2, intervalUnit: "hours", maximumRepeats: 3 }, stopCondition: "job-no-longer-pending" } });
  assert.equal(value.timing.delayAmount, 90); assert.equal(value.timing.repeat.maximumRepeats, 3); assert.equal(value.timing.stopCondition, "job-no-longer-pending");
});

test("immediate plan is READY now and never sends", () => {
  const now = new Date("2026-09-05T08:00:00.000Z"); const plan = planCommunication({ rule: rule(), template: template(), recipient, variables, now });
  assert.equal(plan.status, "READY"); assert.equal(plan.scheduledAt, now.toISOString()); assert.equal(plan.sent, false);
});

test("minutes, hours, and days produce deterministic delayed plans", () => {
  const now = new Date("2026-09-05T08:00:00.000Z");
  for (const [unit, expected] of [["minutes", "2026-09-05T08:02:00.000Z"], ["hours", "2026-09-05T10:00:00.000Z"], ["days", "2026-09-07T08:00:00.000Z"]] as const) {
    const planned = planCommunication({ rule: rule({ timing: { type: "delayed", delayAmount: 2, delayUnit: unit, repeat: { enabled: false, intervalAmount: 0, intervalUnit: "minutes", maximumRepeats: 0 }, stopCondition: "job-status-changed" } }), template: template(), recipient, variables, now });
    assert.equal(planned.scheduledAt, expected); assert.equal(planned.stopCondition, "job-status-changed");
  }
});

test("inactive rule is skipped and inactive template is blocked", () => {
  assert.deepEqual(planCommunication({ rule: rule({ active: false }), template: template(), recipient, variables }), { status: "SKIPPED", reason: "RULE_INACTIVE", sent: false });
  assert.equal(planCommunication({ rule: rule(), template: template({ active: false }), recipient, variables }).reason, "TEMPLATE_INACTIVE");
});

test("missing rule, recipient, and template fail safely", () => {
  assert.equal(planCommunication({ rule: null, template: null, recipient: null, variables }).reason, "NO_RULE");
  assert.equal(planCommunication({ rule: rule(), template: template(), recipient: null, variables }).reason, "NO_RECIPIENT");
  assert.equal(planCommunication({ rule: rule(), template: null, recipient, variables }).reason, "MISSING_TEMPLATE");
});

test("recipient preference opt-out and channel preference skip the plan", () => {
  assert.equal(planCommunication({ rule: rule(), template: template(), recipient: { ...recipient, preference: "do-not-contact" }, variables }).reason, "RECIPIENT_OPTED_OUT");
  assert.equal(planCommunication({ rule: rule(), template: template(), recipient: { ...recipient, preference: "email" }, variables }).reason, "RECIPIENT_OPTED_OUT");
});

test("cross-channel template assignment is blocked by the planner", () => {
  assert.equal(planCommunication({ rule: rule(), template: template({ channel: "email" }), recipient, variables }).reason, "WRONG_TEMPLATE_CHANNEL");
});

test("unresolved required variables block planning visibly", () => {
  const plan = planCommunication({ rule: rule(), template: template(), recipient, variables: { jobNumber: "NJ00001" } });
  assert.equal(plan.reason, "UNRESOLVED_VARIABLE"); assert.ok("unresolved" in plan && plan.unresolved?.includes("queueNumber"));
});

test("authenticated company is authoritative and cross-company records are unavailable", () => {
  const service = readFileSync("src/lib/communicationRules/service.ts", "utf8");
  assert.match(service, /rulesFor\(context\.companyId\)/); assert.match(service, /data\(\)\?\.companyId !== context\.companyId/); assert.doesNotMatch(service, /request\.companyId|body\.companyId/);
});

test("APIs authenticate and every management action remains server-authorized", () => {
  const routes = readFileSync("src/app/api/communication-rules/route.ts", "utf8") + readFileSync("src/app/api/communication-rules/[id]/route.ts", "utf8") + readFileSync("src/app/api/communication-rules/simulate/route.ts", "utf8");
  const service = readFileSync("src/lib/communicationRules/service.ts", "utf8");
  assert.match(routes, /authenticateServerRequest/g); assert.match(service, /canManage\(context, input\.channel\)/); assert.match(service, /canView\(context, rule\.channel\)/);
});

test("event simulation matches authenticated tenant rules and returns plans only", () => {
  const service = readFileSync("src/lib/communicationRules/service.ts", "utf8");
  assert.match(service, /simulateCommunicationEvent/); assert.match(service, /!canView\(context, "email"\)[\s\S]*forbidden\(\)/); assert.match(service, /RULE_TRIGGERS[\s\S]*includes\(trigger\)/); assert.match(service, /rule\.trigger === trigger/); assert.match(service, /rulesFor\(context\.companyId\)/); assert.match(service, /plans[\s\S]*sent: false/);
});

test("generic Messages permissions cannot authorize WhatsApp rule management", () => {
  const service = readFileSync("src/lib/communicationRules/service.ts", "utf8");
  const manage = service.slice(service.indexOf("function canManage"), service.indexOf("function validated"));
  assert.match(manage, /channel === "whatsapp"[\s\S]*Manage WhatsApp automation rules/); assert.doesNotMatch(manage.split(": privileged")[0], /Manage automated communication/);
});

test("template selection is tenant-scoped and channel-enforced on the server", () => {
  const service = readFileSync("src/lib/communicationRules/service.ts", "utf8");
  assert.match(service, /templatesFor\(context\.companyId\)\.doc\(templateId\)/); assert.match(service, /data\?\.channel !== channel/);
});

test("create, update, duplicate, activate, deactivate, and audit actions exist", () => {
  const service = readFileSync("src/lib/communicationRules/service.ts", "utf8");
  for (const action of ["COMMUNICATION_RULE_CREATED", "COMMUNICATION_RULE_UPDATED", "COMMUNICATION_RULE_DUPLICATED", "COMMUNICATION_RULE_ACTIVATED", "COMMUNICATION_RULE_DEACTIVATED"]) assert.match(service, new RegExp(action));
});

test("planner and dry-run service have no transport, scheduler, queue, Email, or Meta dependency", () => {
  const source = readFileSync("src/lib/communicationRules/core.ts", "utf8") + readFileSync("src/lib/communicationRules/service.ts", "utf8");
  assert.doesNotMatch(source, /MetaWhatsAppClient|sendText|sendMail|whatsappSendRequests|CloudTasks|createTask|setInterval|fetch\(/); assert.match(source, /sent: false/);
});

test("communication rule plans are server-only in Firestore rules", () => {
  const rules = readFileSync("firestore.rules", "utf8"); assert.match(rules, /isServerOnlyCollection[\s\S]*communicationRulePlans/);
});

test("staging safety flags remain false and no production target is referenced", () => {
  const config = readFileSync("apphosting.staging.yaml", "utf8"); const tests = readFileSync("tests/communication-rules.test.ts", "utf8");
  assert.match(config, /WHATSAPP_ALLOW_META_READ_PROBE[\s\S]*?value: "false"/); assert.doesNotMatch(tests, /--project fleetfix-pro(?:\s|["'])/);
});
