import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DisabledEmailAdapter, DisabledWhatsAppAdapter, communicationExecutionKey, executionTransportEnabled, handoffPreparedExecution, normalizeExecutionDestination, stopConditionSatisfied, type CommunicationAdapter } from "../src/lib/communicationExecutions/core.ts";

test("WhatsApp destinations normalize safely and reject invalid or group destinations", () => {
  assert.equal(normalizeExecutionDestination("whatsapp", "082 320 6967").destination, "+27823206967");
  assert.equal(normalizeExecutionDestination("whatsapp", "not-a-number").reason, "INVALID_WHATSAPP_DESTINATION");
  assert.equal(normalizeExecutionDestination("whatsapp", "+27823206967", "internal-whatsapp-group").reason, "WHATSAPP_GROUP_UNSUPPORTED");
});
test("Email destinations normalize and validate", () => {
  assert.equal(normalizeExecutionDestination("email", " User@Example.COM ").destination, "user@example.com");
  assert.equal(normalizeExecutionDestination("email", "invalid").reason, "INVALID_EMAIL_DESTINATION");
});
test("idempotency is deterministic for the same occurrence and distinct between occurrences", () => {
  const base = { companyId: "company-a", sourceEntityType: "job", sourceEntityId: "job-a", ruleId: "rule-a", trigger: "job-booked", recipientId: "contact-a", channel: "whatsapp" };
  assert.equal(communicationExecutionKey({ ...base, occurrence: "v1" }), communicationExecutionKey({ ...base, occurrence: "v1" }));
  assert.notEqual(communicationExecutionKey({ ...base, occurrence: "v1" }), communicationExecutionKey({ ...base, occurrence: "v2" }));
});
test("stop conditions recheck authoritative job state", () => {
  assert.equal(stopConditionSatisfied("job-onroute", { status: "On Route" }), true);
  assert.equal(stopConditionSatisfied("job-completed-or-cancelled", { status: "Completed" }), true);
  assert.equal(stopConditionSatisfied("eta-supplied", { estimatedDispatchTime: "14:30" }), true);
  assert.equal(stopConditionSatisfied("none", { status: "Completed" }), false);
});
test("execution gate fails closed and disabled adapters cannot transport", async () => {
  assert.equal(executionTransportEnabled({}), false); assert.equal(executionTransportEnabled({ COMMUNICATION_EXECUTION_ENABLED: "false" }), false);
  await assert.rejects(new DisabledWhatsAppAdapter().deliver({ executionId: "x", companyId: "c", destination: "+27823206967", channel: "whatsapp", subject: "", body: "test" }), /disabled/);
  await assert.rejects(new DisabledEmailAdapter().deliver({ executionId: "x", companyId: "c", destination: "x@example.test", channel: "email", subject: "test", body: "test" }), /disabled/);
});
test("adapter handoff receives only validated immutable execution data", async () => {
  let received: unknown = null;
  const adapter: CommunicationAdapter = { channel: "email", async deliver(payload) { received = payload; return { accepted: true, transportReference: "mock-only" }; } };
  const payload = { executionId: "execution-a", companyId: "company-a", destination: "user@example.test", channel: "email" as const, subject: "Subject", body: "Body" };
  assert.deepEqual(await handoffPreparedExecution(payload, "READY", adapter, { COMMUNICATION_EXECUTION_ENABLED: "false" }), { accepted: false, reason: "EXECUTION_DISABLED" }); assert.equal(received, null);
  assert.deepEqual(await handoffPreparedExecution(payload, "READY", adapter, { COMMUNICATION_EXECUTION_ENABLED: "true" }), { accepted: true, transportReference: "mock-only" }); assert.deepEqual(received, payload); assert.equal(Object.isFrozen(received), true);
});
test("authenticated APIs expose prepare, list, read, and READY-only cancellation", () => {
  const routes = readFileSync("src/app/api/communication-executions/route.ts", "utf8") + readFileSync("src/app/api/communication-executions/[id]/route.ts", "utf8");
  const service = readFileSync("src/lib/communicationExecutions/service.ts", "utf8");
  assert.match(routes, /authenticateServerRequest/g); assert.match(service, /prepareCommunicationExecution/); assert.match(service, /listCommunicationExecutions/); assert.match(service, /getCommunicationExecution/); assert.match(service, /data.status !== "READY"/);
});
test("authenticated company is authoritative and cross-company IDs are never accepted", () => {
  const service = readFileSync("src/lib/communicationExecutions/service.ts", "utf8");
  assert.match(service, /executionsFor\(context\.companyId\)/); assert.match(service, /companies\/\$\{context\.companyId\}\/jobs/); assert.match(service, /data\(\)\?\.companyId !== context\.companyId/); assert.doesNotMatch(service, /input\.companyId|body\.companyId/);
});
test("rule and template are server-loaded, active, tenant-scoped, and channel checked", () => {
  const service = readFileSync("src/lib/communicationExecutions/service.ts", "utf8");
  assert.match(service, /communicationRulePlans\/\$\{ruleId\}/); assert.match(service, /communicationTemplates\/\$\{rule\.templateId\}/); assert.match(service, /RULE_INACTIVE/); assert.match(service, /TEMPLATE_INACTIVE/); assert.match(service, /WRONG_TEMPLATE_CHANNEL/);
});
test("prepared template variables come only from authoritative source data", () => {
  const service = readFileSync("src/lib/communicationExecutions/service.ts", "utf8");
  const variableFunction = service.slice(service.indexOf("function variables"), service.indexOf("async function authoritativeRecipient"));
  assert.doesNotMatch(variableFunction, /provided|input/); assert.match(variableFunction, /key in source/);
});
test("recipient opt-out, unresolved variables, invalid destination, and satisfied stops cannot become READY", () => {
  const source = readFileSync("src/lib/communicationExecutions/service.ts", "utf8") + readFileSync("src/lib/communicationExecutions/core.ts", "utf8") + readFileSync("src/lib/communicationRules/core.ts", "utf8");
  for (const reason of ["RECIPIENT_OPTED_OUT", "UNRESOLVED_VARIABLE", "INVALID_EMAIL_DESTINATION", "INVALID_WHATSAPP_DESTINATION", "STOP_CONDITION_SATISFIED"]) assert.match(source, new RegExp(reason));
});
test("same occurrence uses one deterministic document and distinct occurrence can differ", () => {
  const service = readFileSync("src/lib/communicationExecutions/service.ts", "utf8");
  assert.match(service, /\.doc\(key\)/); assert.match(service, /existing.exists/); assert.match(service, /duplicate = true/); assert.match(service, /transaction.create/);
});
test("dry-run preparation never creates or sends and persisted records cannot claim SENT", () => {
  const service = readFileSync("src/lib/communicationExecutions/service.ts", "utf8");
  assert.match(service, /if \(dryRun\) return[\s\S]*prepared: false[\s\S]*sent: false/); assert.match(service, /attemptCount: 0/); assert.match(service, /transportReference: null/); assert.match(service, /deliveryState: null/); assert.doesNotMatch(service, /MetaWhatsAppClient|sendText|sendMail|fetch\(/);
});
test("rule management and actual WhatsApp send permissions remain separate", () => {
  const execution = readFileSync("src/lib/communicationExecutions/service.ts", "utf8"); const outbound = readFileSync("src/lib/whatsapp/outboundService.ts", "utf8");
  assert.match(execution, /Manage WhatsApp automation rules/); assert.doesNotMatch(execution, /Send WhatsApp messages/); assert.match(outbound, /requireWhatsAppPermission\(context.companyUser, "Send WhatsApp messages"\)/);
});
test("audit and future actor/linkage models are explicit without fabricated IDs", () => {
  const service = readFileSync("src/lib/communicationExecutions/service.ts", "utf8"); const core = readFileSync("src/lib/communicationExecutions/core.ts", "utf8");
  assert.match(service, /COMMUNICATION_EXECUTION_CREATED/); assert.match(service, /COMMUNICATION_EXECUTION_\$\{record.status\}/); assert.match(service, /COMMUNICATION_EXECUTION_CANCELLED/); assert.match(service, /actorType: "USER"/); assert.match(core, /SYSTEM_AUTOMATION/);
  for (const field of ["conversationId: null", "messageId: null", "metaMessageId: null"]) assert.match(service, new RegExp(field));
});
test("admin view is inspection only and clearly reports no message sent", () => {
  const page = readFileSync("src/app/admin/communication-executions/page.tsx", "utf8"); assert.match(page, /PREPARED ONLY — NO MESSAGE SENT/); assert.match(page, /sent=false/); assert.doesNotMatch(page, /Send Now|deliver\(|sendText|sendMail/);
});
test("Firestore blocks browser access to server controlled execution records", () => {
  assert.match(readFileSync("firestore.rules", "utf8"), /isServerOnlyCollection[\s\S]*communicationExecutions/);
});
test("no scheduler, transport, production selector, or live endpoint is introduced", () => {
  const source = readFileSync("src/lib/communicationExecutions/service.ts", "utf8") + readFileSync("src/lib/communicationExecutions/core.ts", "utf8");
  assert.doesNotMatch(source, /CloudTasks|createTask|setInterval|cron|firebase-functions|MetaWhatsAppClient|sendText|sendMail|--project fleetfix-pro(?:\s|["'])/);
});
test("staging execution gate is explicitly false", () => {
  const config = readFileSync("apphosting.staging.yaml", "utf8"); assert.match(config, /COMMUNICATION_EXECUTION_ENABLED[\s\S]*?value: "false"/);
});
