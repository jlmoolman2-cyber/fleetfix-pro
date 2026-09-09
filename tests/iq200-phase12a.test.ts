import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { knownFixApprovalReadiness, knownFixTransitionAllowed, validateKnownFixInput } from "../src/lib/iq200/knownFixCore.ts";
import { effectivePermissions } from "../src/lib/permissions.ts";
import { hostedExecutionAllowed, hostedReasoningConfig, IQ200_HOSTED_COMMISSIONING_ARMED, IQ200_PHASE7_COMMISSIONING_ARMED, IQ200_PHASE7_MODEL } from "../src/lib/iq200/hostedConfig.ts";

const source = (path: string) => readFileSync(path, "utf8");
const complete = (overrides: Record<string, unknown> = {}) => ({
  title: "Hot restart verification",
  category: "Fuel system",
  vehicleMake: "Scania",
  symptoms: ["Cranks but does not start hot"],
  faultCodes: [],
  diagnosticProcedure: "Measure rail pressure during the current fault.",
  expectedValues: "Compare measured pressure with the approved manufacturer specification.",
  findingsConditions: "Confirm pressure remains outside specification during cranking before repair.",
  repairProcedure: "Repair the verified pressure fault, then repeat the test.",
  sourceReference: "Scania workshop procedure FUEL-17",
  safetyWarnings: "Depressurize the fuel system before opening it.",
  ...overrides,
});

test("P12A.1 Draft validation remains permissive", () => {
  assert.equal(validateKnownFixInput({ title: "Work in progress" }).title, "Work in progress");
});

test("P12A.2 title-only Draft is not approval-ready", () => {
  const result = knownFixApprovalReadiness({ title: "Work in progress" });
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, ["category", "applicability", "faultContext", "diagnosticProcedure", "findingsConditions", "repairProcedure", "sourceReference", "safetyHandling", "verificationCriteria"]);
});

for (const [requirement, overrides] of [
  ["category", { category: "" }],
  ["applicability", { vehicleMake: "" }],
  ["faultContext", { symptoms: [], findingsConditions: "" }],
  ["diagnosticProcedure", { diagnosticProcedure: "" }],
  ["findingsConditions", { findingsConditions: "" }],
  ["repairProcedure", { repairProcedure: "" }],
  ["sourceReference", { sourceReference: "" }],
  ["safetyHandling", { safetyWarnings: "", technicalCautions: "" }],
] as const) test(`P12A readiness requires ${requirement}`, () => {
  assert.ok(knownFixApprovalReadiness(complete(overrides)).missing.includes(requirement));
});

test("P12A verification criteria may be expected values or findings/conditions", () => {
  assert.equal(knownFixApprovalReadiness(complete({ expectedValues: "" })).ready, true);
  assert.ok(knownFixApprovalReadiness(complete({ expectedValues: "", findingsConditions: "" })).missing.includes("verificationCriteria"));
});

test("P12A a complete Draft is approval-ready", () => {
  assert.deepEqual(knownFixApprovalReadiness(complete()), { ready: true, missing: [] });
  assert.equal(knownFixApprovalReadiness(complete({ safetyWarnings: "", technicalCautions: "Verify isolation before testing." })).ready, true);
});

test("P12A lifecycle permits only Draft approval and Approved inactivation", () => {
  assert.equal(knownFixTransitionAllowed("DRAFT", "approve"), true);
  assert.equal(knownFixTransitionAllowed("APPROVED", "approve"), false);
  assert.equal(knownFixTransitionAllowed("INACTIVE", "approve"), false);
  assert.equal(knownFixTransitionAllowed("APPROVED", "inactivate"), true);
  assert.equal(knownFixTransitionAllowed("DRAFT", "inactivate"), false);
});

test("P12A service fails closed before approval writes and returns fixed safe errors", () => {
  const service = source("src/lib/iq200/knownFixService.ts");
  const transition = service.indexOf("knownFixTransitionAllowed(data.status,action)");
  const readiness = service.indexOf("knownFixApprovalReadiness(data)");
  const write = service.indexOf('status:"APPROVED",active:true');
  assert.ok(transition > 0 && readiness > transition && write > readiness);
  assert.match(service, /INVALID_KNOWN_FIX_TRANSITION/);
  assert.match(service, /KNOWN_FIX_NOT_READY_FOR_APPROVAL/);
  assert.match(service, /approvedBy:context\.uid,approvedAt:FieldValue\.serverTimestamp\(\)/);
  assert.match(service, /adminDb\.runTransaction/);
  assert.match(service, /transaction\.get\(ref\)/);
  assert.match(service, /transaction\.update\(ref,\{status:"APPROVED"/);
});

test("P12A edit of Approved remains Draft, inactive, revision-incrementing, and unapproved", () => {
  const service = source("src/lib/iq200/knownFixService.ts");
  assert.match(service, /approved=snap\.data\(\)\?\.status==="APPROVED"/);
  assert.match(service, /status:"DRAFT",active:false,revision:Number\(snap\.data\(\)\?\.revision\|\|1\)\+\(approved\?1:0\)/);
  assert.match(service, /approvedBy:null,approvedAt:null/);
});

test("P12A permissions remain separate and company scope remains server-owned", () => {
  const manageOnly = effectivePermissions({ primaryRole: "Other", permissions: { "Manage IQ200 Known Fixes": true, "Approve IQ200 Known Fixes": false } });
  assert.equal(manageOnly["Manage IQ200 Known Fixes"], true);
  assert.equal(manageOnly["Approve IQ200 Known Fixes"], false);
  const service = source("src/lib/iq200/knownFixService.ts");
  assert.match(service, /action==="approve"\) requirePermission\(context,"Approve IQ200 Known Fixes"\)/);
  assert.match(service, /companies\/\$\{companyId\}\/iq200_known_fixes/);
  assert.doesNotMatch(service, /body\.companyId|searchParams\.get\("companyId"\)/);
});

test("P12A technician retrieval remains Approved plus active and bounded", () => {
  const service = source("src/lib/iq200/knownFixService.ts");
  const search = service.slice(service.indexOf("export async function searchKnownFixesForJob"), service.indexOf("export async function listKnownFixes"));
  assert.match(search, /where\("status", "==", "APPROVED"\)/);
  assert.match(search, /active === true/);
  assert.match(search, /limit\(KNOWN_FIX_MAX_CANDIDATES\)/);
});

test("P12A UI exposes only valid lifecycle actions and safely surfaces API messages", () => {
  const page = source("src/app/admin/iq200-known-fixes/page.tsx");
  assert.match(page, /caps\.approve&&fix\.status==="DRAFT"/);
  assert.match(page, /caps\.manage&&fix\.status==="APPROVED"/);
  assert.match(page, /setError\(e instanceof Error\?e\.message:"Action failed"\)/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});

test("P12A hosted commissioning and Retry 5 safety boundaries remain closed", () => {
  assert.equal(IQ200_HOSTED_COMMISSIONING_ARMED, false);
  assert.equal(IQ200_PHASE7_COMMISSIONING_ARMED, false);
  const config = hostedReasoningConfig({ FLEETFIX_ENVIRONMENT: "staging", IQ200_PHASE7_COMMISSIONING_ENABLED: "false", IQ200_REASONING_ENABLED: "true", IQ200_HOSTED_PROVIDER_ENABLED: "true", IQ200_HOSTED_PROVIDER: "openai", IQ200_HOSTED_MODEL: IQ200_PHASE7_MODEL, IQ200_HOSTED_CREDENTIAL_PRESENT: "true", IQ200_PHASE7_COMPANY_ID: "company-a", IQ200_PHASE7_JOB_ID: "job-a", IQ200_PHASE7_SESSION_ID: "session-a", IQ200_RATE_USER_PER_HOUR: "1", IQ200_RATE_COMPANY_PER_HOUR: "1", IQ200_RATE_SESSION_PER_HOUR: "1", IQ200_COMPANY_PERIOD_REQUESTS: "1", IQ200_LIMIT_PERIOD_SECONDS: "3600", IQ200_MAX_INPUT_CHARS: "20000", IQ200_MAX_OUTPUT_CHARS: "10000", IQ200_MAX_OUTPUT_TOKENS: "4096" });
  assert.equal(config.commissioningEnabled, false);
  assert.equal(hostedExecutionAllowed(config), false);
  const hosted = source("src/lib/iq200/hostedReasoningService.ts");
  assert.match(hosted, /ledger:"phase7_retry5",idempotencyNamespace:"phase7_retry5"/);
  assert.doesNotMatch(hosted, /retry6/i);
});

test("P12A introduces no provider, network, or automatic FleetFix action", () => {
  const self = source("tests/iq200-phase12a.test.ts");
  const imports = self.slice(0, self.indexOf("const source"));
  assert.doesNotMatch(imports, /hostedProvider|openaiTransport|OpenAIReasoningTransport|firebase|serverAuth/);
  const changedRuntime = source("src/lib/iq200/knownFixCore.ts") + source("src/lib/iq200/knownFixService.ts") + source("src/app/admin/iq200-known-fixes/page.tsx");
  assert.doesNotMatch(changedRuntime, /sendWhatsApp|sendEmail|orderParts|changeJobStatus|createPurchaseOrder|fetch\(|OpenAI\(/i);
});
