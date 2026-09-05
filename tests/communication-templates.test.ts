import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMMUNICATION_VARIABLES, exampleVariableValues, renderCommunicationTemplate, validateCommunicationTemplate, variablesUsed } from "../src/lib/communicationTemplates/core.ts";
import { userHasPermission } from "../src/lib/whatsapp/permissions.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const email = { name: "Job booked email", description: "", category: "jobs", recipientType: "customer-contact", channel: "email", purpose: "job-booked", active: true, subject: "Job {{jobNumber}}", body: "Hello {{contactName}}" };
const whatsapp = { ...email, name: "Job booked WhatsApp", channel: "whatsapp", subject: "", body: "Job {{jobNumber}} is booked." };

test("Email and WhatsApp channels validate independently", () => {
  assert.equal(validateCommunicationTemplate(email).channel, "email");
  assert.equal(validateCommunicationTemplate(whatsapp).channel, "whatsapp");
  assert.throws(() => validateCommunicationTemplate({ ...email, channel: "sms" }), /channel is invalid/);
});

test("Email requires a subject while WhatsApp does not", () => {
  assert.throws(() => validateCommunicationTemplate({ ...email, subject: "" }), /require a subject/);
  assert.doesNotThrow(() => validateCommunicationTemplate(whatsapp));
});

test("approved variables render from the registry", () => {
  const values = exampleVariableValues();
  const result = renderCommunicationTemplate("{{customerName}} / {{jobNumber}} / {{vehicleRegistration}}", values);
  assert.equal(result.rendered, "ABC Logistics / NJ00001 / ABC1234");
  assert.deepEqual(result.unresolved, []);
  assert.ok(COMMUNICATION_VARIABLES.some((item) => item.key === "trackingLink" && item.description && item.example));
  assert.deepEqual(variablesUsed(email), ["jobNumber", "contactName"]);
});

test("unknown variables remain visibly unresolved", () => {
  assert.deepEqual(renderCommunicationTemplate("Hello {{unknownValue}}", {}).unresolved, ["unknownValue"]);
  assert.equal(renderCommunicationTemplate("Hello {{unknownValue}}", {}).rendered, "Hello [Unresolved: unknownValue]");
});

test("template expressions are never evaluated", () => {
  (globalThis as Record<string, unknown>).__templateExecuted = false;
  const expression = "{{constructor.constructor('globalThis.__templateExecuted=true')()}}";
  assert.match(renderCommunicationTemplate(expression, {}).rendered, /^\[Unresolved:/);
  assert.equal((globalThis as Record<string, unknown>).__templateExecuted, false);
  delete (globalThis as Record<string, unknown>).__templateExecuted;
});

test("WhatsApp template management cannot be granted by generic Messages permissions", () => {
  assert.equal(userHasPermission({ permissions: { "Manage message templates": true, "Send messages": true } }, "Manage WhatsApp templates"), false);
  assert.equal(userHasPermission({ permissions: { "Manage WhatsApp templates": true } }, "Manage WhatsApp templates"), true);
});

test("Email templates reuse the existing message-template permission", () => {
  const service = source("src/lib/communicationTemplates/service.ts");
  assert.match(service, /permissions\?\.\["Manage message templates"\]/);
  assert.doesNotMatch(service, /Manage communication templates/);
});

test("template APIs authenticate server-side", () => {
  for (const path of ["src/app/api/communication-templates/route.ts", "src/app/api/communication-templates/[id]/route.ts"]) assert.match(source(path), /authenticateServerRequest\(request\)/);
});

test("service derives tenant paths and actor metadata from authenticated context", () => {
  const service = source("src/lib/communicationTemplates/service.ts");
  assert.match(service, /companies\/\$\{companyId\}\/communicationTemplates/);
  assert.match(service, /companyId: context\.companyId/);
  assert.match(service, /createdBy: context\.uid/);
  assert.match(service, /updatedBy: context\.uid/);
  assert.doesNotMatch(service, /input\.companyId|request\.companyId/);
});

test("own-company lookup prevents cross-company reads and modifications", () => {
  const service = source("src/lib/communicationTemplates/service.ts");
  assert.match(service, /snapshot\.data\(\)\?\.companyId !== context\.companyId/);
  assert.match(service, /ownedTemplate\(context, id\)/);
});

test("preview and CRUD contain no communication transport or Meta calls", () => {
  const service = source("src/lib/communicationTemplates/service.ts");
  const routes = source("src/app/api/communication-templates/route.ts") + source("src/app/api/communication-templates/[id]/route.ts");
  assert.doesNotMatch(service + routes, /sendText|sendEmail|MetaWhatsAppClient|\/messages|fetch\(/);
  assert.match(service, /sent: false/);
});

test("duplicate, activation and audit actions are explicit", () => {
  const service = source("src/lib/communicationTemplates/service.ts");
  assert.match(service, /name: `\$\{existing\.name\} \(Copy\)`/);
  assert.match(service, /active: false/);
  for (const action of ["TEMPLATE_CREATED", "TEMPLATE_UPDATED", "TEMPLATE_DUPLICATED", "TEMPLATE_ACTIVATED", "TEMPLATE_DEACTIVATED"]) assert.match(service, new RegExp(action));
});

test("communication templates remain server-only in Firestore rules", () => {
  const rules = source("firestore.rules");
  assert.match(rules, /'communicationTemplates'/);
  assert.match(rules, /!isServerOnlyCollection\(collectionId\)/);
});

test("staging safety configuration keeps probes off and contains no production target", () => {
  const config = source("apphosting.staging.yaml");
  assert.match(config, /WHATSAPP_ALLOW_META_READ_PROBE[\s\S]*?value: "false"/);
  assert.doesNotMatch(config, /fleetfix-pro(?!-staging)/);
});
