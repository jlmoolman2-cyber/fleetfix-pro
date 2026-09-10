import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { knownFixApprovalReadiness, knownFixEditBehavior, knownFixTransitionAllowed, normalizeKnownFixRevision, validateKnownFixInput } from "../src/lib/iq200/knownFixCore.ts";
import { effectivePermissions } from "../src/lib/permissions.ts";
import { hostedExecutionAllowed, hostedReasoningConfig, IQ200_HOSTED_COMMISSIONING_ARMED, IQ200_PHASE7_COMMISSIONING_ARMED, IQ200_PHASE7_MODEL } from "../src/lib/iq200/hostedConfig.ts";

const source = (path: string) => readFileSync(path, "utf8");
const service = () => source("src/lib/iq200/knownFixService.ts");
const core = () => source("src/lib/iq200/knownFixCore.ts");
const page = () => source("src/app/admin/iq200-known-fixes/page.tsx");

test("P12B.1 DRAFT edit remains DRAFT", () => {
  assert.equal(knownFixEditBehavior("DRAFT"), "allowed");
  const svc = service();
  assert.match(svc, /status:"DRAFT"/);
});

test("P12B.2 DRAFT edit does not increment revision", () => {
  assert.equal(knownFixEditBehavior("DRAFT"), "allowed");
  const svc = service();
  assert.match(svc, /shouldIncrementRevision\?currentRevision\+1:currentRevision/);
});

test("P12B.3 APPROVED edit becomes DRAFT", () => {
  assert.equal(knownFixEditBehavior("APPROVED"), "revision");
  const svc = service();
  assert.match(svc, /status:"DRAFT"/);
});

test("P12B.4 APPROVED edit increments revision exactly once", () => {
  assert.equal(knownFixEditBehavior("APPROVED"), "revision");
  const svc = service();
  assert.match(svc, /currentRevision\+1/);
  assert.doesNotMatch(svc, /currentRevision\+2|revision\+2/);
});

test("P12B.5 APPROVED edit clears approvedBy", () => {
  const svc = service();
  assert.match(svc, /approvedBy:null/);
});

test("P12B.6 APPROVED edit clears approvedAt", () => {
  const svc = service();
  assert.match(svc, /approvedAt:null/);
});

test("P12B.7 APPROVED edit sets active false", () => {
  const svc = service();
  assert.match(svc, /active:false/);
});

test("P12B.8 INACTIVE edit is rejected", () => {
  assert.equal(knownFixEditBehavior("INACTIVE"), "denied");
  const svc = service();
  assert.match(svc, /INACTIVE_KNOWN_FIX_LOCKED/);
  assert.match(svc, /editBehavior==="denied"/);
});

test("P12B.9 INACTIVE edit cannot become DRAFT", () => {
  assert.equal(knownFixEditBehavior("INACTIVE"), "denied");
  const svc = service();
  assert.match(svc, /if\(editBehavior==="denied"\) throw/);
});

test("P12B.10 INACTIVE edit cannot become APPROVED", () => {
  assert.equal(knownFixTransitionAllowed("INACTIVE", "approve"), false);
  assert.equal(knownFixEditBehavior("INACTIVE"), "denied");
});

test("P12B.11 INACTIVE cannot become active", () => {
  assert.equal(knownFixEditBehavior("INACTIVE"), "denied");
  const svc = service();
  assert.match(svc, /editBehavior==="denied"\) throw new ServerAccessError\("INACTIVE_KNOWN_FIX_LOCKED"/);
});

test("P12B.12 INACTIVE revision is not altered by rejected edit", () => {
  assert.equal(knownFixEditBehavior("INACTIVE"), "denied");
  const svc = service();
  const updateFn = svc.slice(svc.indexOf("export async function updateKnownFix"), svc.indexOf("export async function changeKnownFixStatus"));
  assert.match(updateFn, /if\(editBehavior==="denied"\) throw/);
  assert.doesNotMatch(updateFn, /revision.*INACTIVE|INACTIVE.*revision/);
});

test("P12B.13 only DRAFT can approve", () => {
  assert.equal(knownFixTransitionAllowed("DRAFT", "approve"), true);
  assert.equal(knownFixTransitionAllowed("APPROVED", "approve"), false);
  assert.equal(knownFixTransitionAllowed("INACTIVE", "approve"), false);
  assert.equal(knownFixTransitionAllowed("UNKNOWN_STATUS_XYZ", "approve"), false);
});

test("P12B.14 only APPROVED can inactivate", () => {
  assert.equal(knownFixTransitionAllowed("APPROVED", "inactivate"), true);
  assert.equal(knownFixTransitionAllowed("DRAFT", "inactivate"), false);
  assert.equal(knownFixTransitionAllowed("INACTIVE", "inactivate"), false);
  assert.equal(knownFixTransitionAllowed("UNKNOWN_STATUS_XYZ", "inactivate"), false);
});

test("P12B.15 admin Edit button hidden for INACTIVE", () => {
  const pg = page();
  assert.match(pg, /caps\.manage&&fix\.status!=="INACTIVE"&&<button onClick=\{.*edit\(fix\)/);
});

test("P12B.16 admin Edit button remains available for DRAFT", () => {
  const pg = page();
  assert.match(pg, /caps\.manage&&fix\.status!=="INACTIVE"&&<button onClick=\{.*edit\(fix\)/);
  assert.doesNotMatch(pg, /fix\.status==="DRAFT"&&<button onClick=\{.*edit\(fix\)/);
});

test("P12B.17 admin Edit button remains available for APPROVED", () => {
  const pg = page();
  assert.match(pg, /caps\.manage&&fix\.status!=="INACTIVE"&&<button onClick=\{.*edit\(fix\)/);
  assert.doesNotMatch(pg, /fix\.status==="APPROVED"&&<button onClick=\{.*edit\(fix\)/);
});

test("P12B.18 API/service rejection uses fixed sanitized lifecycle error", () => {
  const svc = service();
  assert.match(svc, /INACTIVE_KNOWN_FIX_LOCKED/);
  assert.match(svc, /409/);
  assert.match(svc, /This Known Fix is inactive and cannot be edited\./);
  const errorLine = svc.split('\n').find(line => line.includes('INACTIVE_KNOWN_FIX_LOCKED'));
  assert.ok(errorLine, 'Error code should exist in service');
  assert.doesNotMatch(errorLine, /doc\.id|snap\.id/);
});

test("P12B.19 technician retrieval remains APPROVED + active", () => {
  const svc = service();
  const searchFn = svc.slice(svc.indexOf("export async function searchKnownFixesForJob"), svc.indexOf("export async function listKnownFixes"));
  assert.match(searchFn, /where\("status", "==", "APPROVED"\)/);
  assert.match(searchFn, /active === true/);
});

test("P12B.20 commissioning flags remain false", () => {
  assert.equal(IQ200_HOSTED_COMMISSIONING_ARMED, false);
  assert.equal(IQ200_PHASE7_COMMISSIONING_ARMED, false);
  const config = hostedReasoningConfig({ FLEETFIX_ENVIRONMENT: "staging", IQ200_PHASE7_COMMISSIONING_ENABLED: "false", IQ200_REASONING_ENABLED: "true", IQ200_HOSTED_PROVIDER_ENABLED: "true", IQ200_HOSTED_PROVIDER: "openai", IQ200_HOSTED_MODEL: IQ200_PHASE7_MODEL, IQ200_HOSTED_CREDENTIAL_PRESENT: "true", IQ200_PHASE7_COMPANY_ID: "company-a", IQ200_PHASE7_JOB_ID: "job-a", IQ200_PHASE7_SESSION_ID: "session-a", IQ200_RATE_USER_PER_HOUR: "1", IQ200_RATE_COMPANY_PER_HOUR: "1", IQ200_RATE_SESSION_PER_HOUR: "1", IQ200_COMPANY_PERIOD_REQUESTS: "1", IQ200_LIMIT_PERIOD_SECONDS: "3600", IQ200_MAX_INPUT_CHARS: "20000", IQ200_MAX_OUTPUT_CHARS: "10000", IQ200_MAX_OUTPUT_TOKENS: "4096" });
  assert.equal(config.commissioningEnabled, false);
  assert.equal(hostedExecutionAllowed(config), false);
});

test("P12B.21 Retry identity remains phase7_retry5", () => {
  const hosted = source("src/lib/iq200/hostedReasoningService.ts");
  assert.match(hosted, /ledger:"phase7_retry5",idempotencyNamespace:"phase7_retry5"/);
  assert.match(hosted, /iq200_hosted_commissioning\/phase7_retry5/);
});

test("P12B.22 no retry6 exists", () => {
  const hosted = source("src/lib/iq200/hostedReasoningService.ts");
  assert.doesNotMatch(hosted, /retry6/i);
});

test("P12B edit behavior unknown status is denied", () => {
  assert.equal(knownFixEditBehavior("UNKNOWN"), "denied");
  assert.equal(knownFixEditBehavior(undefined), "denied");
  assert.equal(knownFixEditBehavior(null), "denied");
  assert.equal(knownFixEditBehavior(""), "denied");
});

test("P12B service uses atomic transaction for update", () => {
  const svc = service();
  const updateFn = svc.slice(svc.indexOf("export async function updateKnownFix"), svc.indexOf("export async function changeKnownFixStatus"));
  assert.match(updateFn, /adminDb\.runTransaction/);
  assert.match(updateFn, /transaction\.get\(ref\)/);
  assert.match(updateFn, /transaction\.update\(ref/);
});

test("P12B service reads status from transaction snapshot", () => {
  const svc = service();
  const updateFn = svc.slice(svc.indexOf("export async function updateKnownFix"), svc.indexOf("export async function changeKnownFixStatus"));
  assert.match(updateFn, /const snap=await transaction\.get\(ref\)/);
  assert.match(updateFn, /currentData=snap\.data\(\)/);
  assert.match(updateFn, /knownFixEditBehavior\(currentStatus\)/);
});

test("P12B no Reactivate button exists in admin UI", () => {
  const pg = page();
  assert.doesNotMatch(pg, /[Rr]eactivate/);
});

test("P12B no INACTIVE to DRAFT workflow in UI", () => {
  const pg = page();
  assert.doesNotMatch(pg, /reactivate|re-draft|reActivate/i);
  assert.doesNotMatch(pg, /status\s*===\s*["']INACTIVE["'][\s\S]{0,100}status\s*:\s*["']DRAFT["']/i);
});

test("P12B core helper does not weaken transition rules", () => {
  assert.equal(knownFixTransitionAllowed("DRAFT", "approve"), true);
  assert.equal(knownFixTransitionAllowed("APPROVED", "inactivate"), true);
  assert.equal(knownFixTransitionAllowed("INACTIVE", "approve"), false);
  assert.equal(knownFixTransitionAllowed("INACTIVE", "inactivate"), false);
  assert.equal(knownFixTransitionAllowed("APPROVED", "approve"), false);
  assert.equal(knownFixTransitionAllowed("DRAFT", "inactivate"), false);
});

test("P12B draft validation remains title-only", () => {
  assert.equal(validateKnownFixInput({ title: "Minimal draft" }).title, "Minimal draft");
});

test("P12B approval readiness unchanged from Phase 12A", () => {
  const result = knownFixApprovalReadiness({ title: "Work in progress" });
  assert.equal(result.ready, false);
  assert.ok(result.missing.includes("category"));
});

test("P12B no provider, network, or automatic FleetFix action introduced", () => {
  const self = source("tests/iq200-phase12b.test.ts");
  const imports = self.slice(0, self.indexOf("const source"));
  assert.doesNotMatch(imports, /hostedProvider|openaiTransport|OpenAIReasoningTransport|firebase|serverAuth/);
  const changedRuntime = source("src/lib/iq200/knownFixCore.ts") + source("src/lib/iq200/knownFixService.ts") + source("src/app/admin/iq200-known-fixes/page.tsx");
  assert.doesNotMatch(changedRuntime, /sendWhatsApp|sendEmail|orderParts|changeJobStatus|createPurchaseOrder|fetch\(|OpenAI\(/i);
});

test("P12B revision normalization rejects missing and malformed values", () => {
  for (const value of [undefined, null, Number.NaN, Infinity, -Infinity, 0, -5, 1.5, "malformed", "2"]) {
    assert.equal(normalizeKnownFixRevision(value), 1);
  }
});

test("P12B revision normalization preserves valid safe positive integers", () => {
  assert.equal(normalizeKnownFixRevision(1), 1);
  assert.equal(normalizeKnownFixRevision(2), 2);
  assert.equal(normalizeKnownFixRevision(123456), 123456);
  assert.equal(normalizeKnownFixRevision(Number.MAX_SAFE_INTEGER - 1), Number.MAX_SAFE_INTEGER - 1);
});

test("P12B revision normalization prevents approved-edit overflow", () => {
  assert.equal(normalizeKnownFixRevision(Number.MAX_SAFE_INTEGER), 1);
  assert.equal(normalizeKnownFixRevision(Number.MAX_SAFE_INTEGER + 1), 1);
  assert.equal(normalizeKnownFixRevision(Number.MAX_SAFE_INTEGER) + 1, 2);
});

test("P12B invalid stored revisions produce safe edit revisions", () => {
  const invalidRevision = normalizeKnownFixRevision("not-a-revision");
  const approvedRevision = knownFixEditBehavior("APPROVED") === "revision" ? invalidRevision + 1 : invalidRevision;
  const draftRevision = knownFixEditBehavior("DRAFT") === "revision" ? invalidRevision + 1 : invalidRevision;
  assert.equal(approvedRevision, 2);
  assert.equal(draftRevision, 1);
});

test("P12B revision calculations cannot produce invalid numbers", () => {
  const values: unknown[] = [undefined, null, Number.NaN, Infinity, -Infinity, 0, -5, 1.5, "bad", {}, [], Number.MAX_SAFE_INTEGER];
  for (const value of values) {
    const normalized = normalizeKnownFixRevision(value);
    const incremented = normalized + 1;
    for (const revision of [normalized, incremented]) {
      assert.equal(Number.isSafeInteger(revision), true);
      assert.ok(revision >= 1);
      assert.equal(Number.isFinite(revision), true);
    }
  }
});

test("P12B update transaction uses the pure normalized revision", () => {
  const svc = service();
  const updateFn = svc.slice(svc.indexOf("export async function updateKnownFix"), svc.indexOf("export async function changeKnownFixStatus"));
  assert.match(updateFn, /currentRevision=normalizeKnownFixRevision\(currentData\.revision\)/);
  assert.match(updateFn, /revision:shouldIncrementRevision\?currentRevision\+1:currentRevision/);
  assert.doesNotMatch(updateFn, /Number\(currentData\.revision/);
});
