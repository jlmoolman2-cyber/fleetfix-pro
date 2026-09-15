// ═══════════════════════════════════════════════════════════════════════════
// PHASE 14 — INTEGRATION / SECURITY REGRESSION SUITE
// Proves that the IQ200 protections from Phases 1–13D-2 continue to hold
// together as one system:
//   - tenant / company isolation (P14-A)
//   - permission enforcement (P14-B)
//   - browser DTO privacy (P14-C)
//   - Known Fix integration (P14-D)
//   - historical evidence integrity (P14-E)
//   - strict ReasoningResponse validation (P14-F)
//   - advisory safety boundary (P14-G)
//   - provider boundary (P14-H)
//   - session / assessment integration (P14-I)
//   - client concurrency (P14-J)
//   - cache / side-effect boundaries (P14-K)
//   - commissioning / retry safety (P14-L)
//   - production separation (P14-M)
//
// LOCAL DETERMINISTIC TESTS ONLY. No network, no provider credential, no
// Firebase remote access, no hosted reasoning invocation.
// ═══════════════════════════════════════════════════════════════════════════

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  IQ200ApiError,
  applySubmissionFailure,
  applySubmissionSuccess,
  createRequestCorrelation,
  isCurrentRequest,
  nextRequestToken,
} from "../src/lib/iq200/client.ts";
import { canUseIQ200 } from "../src/lib/iq200/permissions.ts";
import { knownFixMatch, type JobApplicability, type KnownFixSearch } from "../src/lib/iq200/knownFixCore.ts";
import {
  rankHistoricalJobs,
  type HistoryFilters,
  type NormalizedHistoryJob,
} from "../src/lib/iq200/historyCore.ts";
import {
  buildHostedProviderRequest,
  validateHostedAdvisoryResponse,
} from "../src/lib/iq200/hostedEvidence.ts";
import {
  IQ200_HOSTED_COMMISSIONING_ARMED,
  IQ200_PHASE7_COMMISSIONING_ARMED,
  IQ200_PHASE7_MODEL,
  hostedCommissioningReadiness,
  hostedExecutionAllowed,
  hostedReasoningConfig,
  phase7ScopeAllowed,
} from "../src/lib/iq200/hostedConfig.ts";
import {
  HostedRunError,
  runHostedExecutionCore,
  type HostedExecutionControls,
  type HostedExecutionScope,
} from "../src/lib/iq200/hostedReasoningCore.ts";
import {
  ProviderValidationError,
  REASONING_HISTORY_MAX,
  REASONING_KNOWN_FIX_MAX,
  buildTestReasoningResponse,
  containsUnsafeShortcut,
  deriveSafetyWarnings,
  evidenceReferenceSet,
  mergeRequiredSafetyWarnings,
  reasoningEnabled,
  validateReasoningResponse,
  type ReasoningEvidence,
  type ReasoningResponse,
} from "../src/lib/iq200/reasoningCore.ts";

const source = (path: string) => readFileSync(path, "utf8");
const section = (value: string, start: string, end: string) => {
  const startIndex = value.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = value.indexOf(end, startIndex + start.length);
  if (endIndex < 0) return "";
  return value.slice(startIndex, endIndex);
};

const serviceSrc = () => source("src/lib/iq200/service.ts");
const reasoningServiceSrc = () => source("src/lib/iq200/reasoningService.ts");
const hostedReasoningServiceSrc = () => source("src/lib/iq200/hostedReasoningService.ts");
const historyServiceSrc = () => source("src/lib/iq200/historyService.ts");
const knownFixServiceSrc = () => source("src/lib/iq200/knownFixService.ts");
const pageSrc = () => source("src/app/jobs/[id]/iq200/page.tsx");
const clientSrc = () => source("src/lib/iq200/client.ts");

// ═══════════════════════════════════════════════════════════════════════════
// Shared fixtures (phase-14 specific values, distinct from earlier phases)
// ═══════════════════════════════════════════════════════════════════════════

const scope: HostedExecutionScope = {
  companyId: "company-a",
  userId: "user-a",
  jobId: "job-a",
  sessionId: "session-a",
  question: "Check rail pressure during cranking",
};

const baseEvidence: ReasoningEvidence = {
  question: scope.question,
  currentJob: {
    jobNumber: "J200",
    status: "OPEN",
    vehicle: { make: "Scania", model: "R500", type: "Truck", engineFamily: "DC13", descriptor: "REG-2 / FLEET-2" },
    complaint: "Low rail pressure during crank",
    faultCodes: ["P0087"],
    notes: [],
    diagnostics: [],
  },
  relatedHistory: [{
    reference: "HISTORY_1",
    description: "Similar complaint required a pressure verification.",
    faultCodes: ["P0087"],
    findings: ["Low pressure"],
    repairs: ["Verified then replaced the sender"],
    relevanceReasons: ["same fault code"],
  }],
  approvedKnownFixes: [{
    reference: "KNOWN_FIX_1",
    title: "Rail pressure verification",
    applicability: "DC13",
    faultCodes: ["P0087"],
    diagnosticProcedure: "Measure rail pressure during crank.",
    expectedValues: "180-260 bar",
    safetyWarnings: "Depressurize before service.",
    technicalCautions: "",
    relevanceReasons: ["same engine and code"],
  }],
  recentInteractions: [],
};

function validResponse(): ReasoningResponse {
  return {
    summary: "Verify the measured pressure before deciding on repair.",
    observations: ["Rail pressure is below the supplied expected range."],
    hypotheses: [{
      title: "Fuel pressure supply fault",
      explanation: "The current measurement supports testing the supply circuit.",
      confidence: "LOW",
      evidenceReferences: ["CURRENT_JOB", "KNOWN_FIX_1"],
      contradictions: ["History alone does not establish the current fault."],
      recommendedChecks: ["Repeat the pressure measurement with approved equipment."],
    }],
    checks: [{
      description: "Repeat the rail-pressure test during crank.",
      purpose: "Confirm the current pressure deficit.",
      expectedResult: "Compare with the approved 180-260 bar range.",
      safetyNote: "Depressurize before service.",
      evidenceSource: "CURRENT_JOB",
    }],
    safetyWarnings: ["Preserve the provider warning.", "Depressurize before service."],
    missingInformation: ["Current low-pressure supply reading."],
    evidenceUsed: [
      { category: "CURRENT_JOB", reference: "CURRENT_JOB", detail: "Current low-pressure measurement" },
      { category: "KNOWN_FIX", reference: "KNOWN_FIX_1", detail: "Approved pressure test" },
    ],
    confidence: "LOW",
    limitations: ["Advisory only; physical testing is required."],
  };
}

function hostedControls(
  provider: HostedExecutionControls["provider"],
  onPersistSuccess?: () => void,
): HostedExecutionControls {
  return {
    acquireLease: async () => ({ token: "lease", ref: {} }),
    finishLease: async () => {},
    reserve: async () => ({ duplicate: false, inProgress: false, retryExhausted: false, retry: false, requestId: "request-1" }),
    loadPriorResult: async () => ({ exists: false, success: false, interactionId: null, response: null }),
    persistSuccess: async () => { onPersistSuccess?.(); return "interaction-1"; },
    persistFailure: async () => {},
    buildEvidence: async () => baseEvidence,
    provider,
    withTimeout: async (work) => work(new AbortController().signal),
    maxEvidenceChars: 20_000,
    timeoutMs: 1000,
    now: () => 1000,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// P14-A  TENANT BOUNDARY
// ═══════════════════════════════════════════════════════════════════════════

test("P14A.1 job authorization remains company scoped across every IQ200 realm", () => {
  const service = serviceSrc();
  // Every job-scoped read/write in the core service resolves the job under the
  // authenticated company and rejects a stored companyId mismatch.
  assert.match(service, /adminDb\.doc\(`companies\/\$\{context\.companyId\}\/jobs\/\$\{jobId\}`\)/);
  assert.match(service, /snapshot\.data\(\)\?\.companyId !== context\.companyId/);
  const assessment = section(service, "export async function getIQ200SessionAssessment", "return {");
  assert.match(assessment, /companies\/\$\{context\.companyId\}\/jobs\/\$\{jobId\}/);
  assert.match(assessment, /jobSnapshot\.data\(\)\?\.companyId !== context\.companyId/);
  // History is queried inside the company, never globally.
  assert.match(historyServiceSrc(), /companies\/\$\{companyId\}\/jobs/);
  // Technician Known Fix retrieval is company-collection scoped.
  assert.match(knownFixServiceSrc(), /companies\/\$\{companyId\}\/iq200_known_fixes/);
  assert.match(knownFixServiceSrc(), /collectionFor\(context\.companyId\)/);
});

test("P14A.2 no IQ200 service trusts a client-supplied companyId", () => {
  for (const file of ["src/lib/iq200/service.ts", "src/lib/iq200/historyService.ts", "src/lib/iq200/knownFixService.ts", "src/lib/iq200/reasoningService.ts", "src/lib/iq200/hostedReasoningService.ts"]) {
    const value = source(file);
    assert.doesNotMatch(value, /body\.companyId|searchParams\.get\("companyId"\)|input\.companyId/);
  }
});

test("P14A.3 session authorization remains job/company bound on every path", () => {
  const service = serviceSrc();
  const create = section(service, "export async function createIQ200Session", "/* ═");
  // Server-derived scope on creation; the browser cannot choose the tenant.
  assert.match(create, /companyId: context\.companyId/);
  assert.match(create, /jobId: snapshot\.id/);
  assert.match(create, /sessionId: ref\.id/);
  // Reasoning enforces the same session membership check.
  assert.match(reasoningServiceSrc(), /data\?\.companyId!==context\.companyId\|\|data\?\.jobId!==job\.id/);
  // Assessment retrieval enforces the same session membership check.
  const assessment = section(service, "export async function getIQ200SessionAssessment", "return {");
  assert.match(assessment, /data\?\.companyId !== context\.companyId/);
  assert.match(assessment, /data\?\.jobId !== jobSnapshot\.id/);
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-B  PERMISSION BOUNDARY
// ═══════════════════════════════════════════════════════════════════════════

test("P14B.1 missing Use IQ200 Technician Assist is rejected", () => {
  // Behavioural proof at the pure permission layer. The "Other" role has no
  // IQ200 defaults, so only explicit grants can unlock the permission.
  assert.equal(canUseIQ200({ primaryRole: "Other", permissions: { "View jobs": true } }), false);
  assert.equal(canUseIQ200({ primaryRole: "Other", permissions: { "Use IQ200 Technician Assist": true } }), false);
  assert.equal(canUseIQ200({ primaryRole: "Other" }), false);
  assert.equal(canUseIQ200({ primaryRole: "Other", permissions: { "View jobs": true, "Use IQ200 Technician Assist": true } }), true);
  // An explicit false override cannot be bypassed through the role default.
  assert.equal(canUseIQ200({ primaryRole: "Technician/Artisan/Tradesman", permissions: { "Use IQ200 Technician Assist": false } }), false);
  // Server enforcement maps the same guard to a fixed 403.
  const access = source("src/lib/iq200/access.ts");
  assert.match(access, /ServerAccessError\("FORBIDDEN", "IQ200 Technician Assist permission is required\.", 403\)/);
});

test("P14B.2 the permission cannot be bypassed through alternate IQ200 routes", () => {
  // Every public route authenticates; every job-scoped service entry funnels
  // through requireIQ200Access (via authorisedJob or directly).
  const routes = [
    "src/app/api/iq200/jobs/[jobId]/context/route.ts",
    "src/app/api/iq200/jobs/[jobId]/history/route.ts",
    "src/app/api/iq200/jobs/[jobId]/known-fixes/route.ts",
    "src/app/api/iq200/jobs/[jobId]/sessions/route.ts",
    "src/app/api/iq200/jobs/[jobId]/sessions/[sessionId]/reason/route.ts",
    "src/app/api/iq200/jobs/[jobId]/sessions/[sessionId]/assessment/route.ts",
    "src/app/api/iq200/known-fixes/route.ts",
    "src/app/api/iq200/known-fixes/[id]/route.ts",
  ];
  for (const route of routes) {
    assert.match(source(route), /authenticateServerRequest\(request\)/, route);
  }
  const service = serviceSrc();
  for (const entry of ["getIQ200JobContext", "listIQ200Sessions", "createIQ200Session", "getIQ200SessionAssessment"]) {
    const block = section(service, `export async function ${entry}`, "\n}");
    assert.ok(
      /authorisedJob\(context/.test(block) || /requireIQ200Access\(context\)/.test(block),
      `${entry} must enforce IQ200 access`,
    );
  }
  // The shared job-authorisation gate itself enforces the IQ200 permission.
  const authorised = section(serviceSrc(), "export async function authorisedJob", "async function linkedVehicle");
  assert.match(authorised, /requireIQ200Access\(context\)/);
  assert.match(historyServiceSrc(), /authorisedJob\(context, jobId\)/);
  assert.match(knownFixServiceSrc(), /authorisedJob\(context, jobId\)/);
  assert.match(reasoningServiceSrc(), /authorisedJob\(context,jobId\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-C  DTO PRIVACY — browser-facing surfaces use documented allowlists
// ═══════════════════════════════════════════════════════════════════════════

test("P14C.1 job context DTO exposes no internal/audit fields", () => {
  const contextFn = section(serviceSrc(), "export async function getIQ200JobContext", "export async function listIQ200Sessions");
  for (const field of ["companyId", "createdBy", "requestedBy", "requestId", "interactionId", "provider", "usage", "latencyMs", "assignedUsers", "previousJobNumber", "statusHistory", "bookingDateTime", "customerId"]) {
    assert.doesNotMatch(contextFn, new RegExp(`\\b${field}\\s*:`), field);
  }
  assert.doesNotMatch(contextFn, /return\s*\{\s*\.\.\./);
  assert.match(contextFn, /return\s*\{\s*job:/);
  assert.match(contextFn, /currentUser:\s*\{\s*name:/);
});

test("P14C.2 session DTO is an explicit allowlist", () => {
  const sessionFn = section(serviceSrc(), "function sessionEntry", "function validateJobId");
  for (const field of ["companyId", "createdBy", "openedBy", "requestedBy", "requestId", "interactionId", "provider", "model", "usage", "latencyMs", "updatedAt"]) {
    assert.doesNotMatch(sessionFn, new RegExp(`\\b${field}\\s*:`), field);
  }
  assert.match(sessionFn, /id,/);
  assert.match(sessionFn, /initialQuestion:/);
  assert.match(sessionFn, /state:/);
  assert.match(sessionFn, /responseStatus:/);
  assert.match(sessionFn, /createdAt:/);
});

test("P14C.3 technician Known Fix result excludes lifecycle and audit metadata", () => {
  const technician = section(knownFixServiceSrc(), "function technicianDto", "export async function searchKnownFixesForJob");
  for (const field of ["status", "active", "companyId", "createdBy", "requestedBy", "requestId", "interactionId", "provider", "usage", "latencyMs", "approvedBy", "approvedAt", "updatedBy", "updatedAt", "otherApplicability", "relatedHistoricalJobIds"]) {
    assert.doesNotMatch(technician, new RegExp(`\\b${field}:`), field);
  }
  assert.doesNotMatch(technician, /\.\.\./);
  // The browser-facing Known Fix type agrees with the server allowlist.
  const fixType = section(pageSrc(), "type KnownFix = {", "type ReasoningResponse = {");
  assert.doesNotMatch(fixType, /status|active|companyId|createdBy|approvedBy|updatedBy/);
});

test("P14C.4 history browser DTO remains explicitly projected", () => {
  const projection = section(historyServiceSrc(), ".map(({ candidate, match }) => ({", "return { results");
  for (const field of ["companyId", "vehicleId", "previousJobNumber", "createdBy", "updatedBy", "requestedBy", "requestId", "interactionId", "provider", "usage", "latencyMs"]) {
    assert.doesNotMatch(projection, new RegExp(`\\b${field}:`), field);
  }
  assert.doesNotMatch(projection, /\.\.\./);
  for (const field of ["id", "jobNumber", "date", "registration", "fleetNumber", "make", "model", "description", "faultCodes", "technicianFindings", "repairPerformed", "partsUsed", "status", "outcome", "cancelled", "incomplete", "reopened", "relevanceScore", "relevanceReasons"]) {
    assert.match(projection, new RegExp(`\\b${field}:`), field);
  }
});

test("P14C.5 assessment DTO excludes interaction/provider/audit metadata", () => {
  const retrieval = section(serviceSrc(), "export async function getIQ200SessionAssessment", "return {");
  for (const field of ["companyId", "createdBy", "requestedBy", "requestId", "interactionId", "provider", "model", "usage", "latencyMs"]) {
    assert.doesNotMatch(retrieval, new RegExp(`\\b${field}\\s*:`), field);
  }
  assert.doesNotMatch(retrieval, /interactions\.docs\[0\]\.id/);
  assert.doesNotMatch(retrieval, /\.\.\./);
});

test("P14C.6 reasoning browser response returns only the documented surface", () => {
  const reasoning = reasoningServiceSrc();
  // Hosted outcome is destructured so interactionId/kind/requestId/retried stay server-side.
  assert.match(reasoning, /const\{interactionId,kind,requestId,retried,\.\.\.safeOutcome\}=outcome/);
  assert.match(reasoning, /return\{featureState:safeOutcome\.featureState,message:safeOutcome\.message,response:safeOutcome\.response\?\?null\}/);
  // Each browser return expression carries only featureState/message/response.
  let found = 0;
  let index = reasoning.indexOf("return{featureState");
  while (index >= 0) {
    const block = reasoning.slice(index, index + 220);
    assert.doesNotMatch(block, /interactionId|requestId|provider|model|usage|latencyMs/);
    found += 1;
    index = reasoning.indexOf("return{featureState", index + 1);
  }
  assert.ok(found >= 1, "expected one or more browser-facing reasoning returns");
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-D  KNOWN FIX INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

test("P14D.1 technician retrieval pipeline = APPROVED + active + matcher", () => {
  const search = section(knownFixServiceSrc(), "export async function searchKnownFixesForJob", "export async function listKnownFixes");
  assert.match(search, /collectionFor\(context\.companyId\)\.where\("status", "==", "APPROVED"\)/);
  assert.match(search, /\.limit\(KNOWN_FIX_MAX_CANDIDATES\)/);
  assert.match(search, /doc\.data\(\)\.active === true/);
  assert.match(search, /parseStoredKnownFix\(doc\.data\(\), context\.companyId\)/);
  assert.match(search, /parseStoredKnownFix\(doc\.data\(\), context\.companyId\)[\s\S]*\.filter\(\(item\) => item\.data\)[\s\S]*knownFixMatch\(job, item\.data!, search\)/);
  assert.match(search, /knownFixMatch\(job, item\.data!, search\)[\s\S]*\.filter\(\(item\) => item\.match\)/);
  assert.match(search, /\.sort\(\(a, b\) => b\.match!\.score - a\.match!\.score\)\.slice\(0, search\.limit\)/);
  assert.match(search, /technicianDto\(item\.doc\.id, item\.data!, item\.match!\)/);
});

test("P14D.2 make/model alone cannot establish applicability", () => {
  const search: KnownFixSearch = { q: "", faultCode: "", component: "", limit: 10 };
  const job: JobApplicability = {
    make: "mercedes", model: "actros", vehicleType: "truck", engineFamily: "om471",
    faultCodes: [], text: "air conditioning not cooling the cabin",
  };
  const unrelated = {
    title: "Brake pad wear inspection", category: "", vehicleMake: "Mercedes", vehicleModel: "Actros",
    vehicleType: "Truck", engineFamily: "OM471", systemComponent: "brake calipers", symptoms: [],
    faultCodes: [], diagnosticProcedure: "", repairProcedure: "",
  };
  assert.equal(knownFixMatch(job, unrelated, search), null, "Vehicle applicability alone must not qualify an unrelated system");
});

test("P14D.3 exact technical evidence matching remains deterministic", () => {
  const search: KnownFixSearch = { q: "", faultCode: "", component: "", limit: 10 };
  const job: JobApplicability = {
    make: "mercedes", model: "actros", vehicleType: "truck", engineFamily: "om471",
    faultCodes: ["B10EE"], text: "air conditioning not cooling the cabin",
  };
  const fix = {
    title: "AC compressor clutch check", category: "", vehicleMake: "Mercedes", vehicleModel: "Actros",
    vehicleType: "Truck", engineFamily: "OM471", systemComponent: "air conditioning", symptoms: ["cabin not cooling"],
    faultCodes: ["B10EE"], diagnosticProcedure: "Measure vent temperature", repairProcedure: "",
  };
  const first = knownFixMatch(job, fix, search);
  const second = knownFixMatch(job, fix, search);
  assert.ok(first && first.score > 0, "exact code + component + make/model should match");
  assert.equal(second!.score, first!.score, "ranking must be deterministic");
  assert.ok(first!.reasons.some((reason) => /Exact fault code: B10EE/.test(reason)));
});

test("P14D.4 incompatible make rejects even with matching component evidence", () => {
  const search: KnownFixSearch = { q: "", faultCode: "", component: "", limit: 10 };
  const job: JobApplicability = {
    make: "iveco", model: "daily", vehicleType: "truck", engineFamily: "f1c",
    faultCodes: ["P0087"], text: "low fuel pressure",
  };
  const incompatible = {
    title: "Low fuel pressure check", category: "", vehicleMake: "Mercedes", vehicleModel: "Actros",
    vehicleType: "Truck", engineFamily: "OM471", systemComponent: "fuel", symptoms: [],
    faultCodes: ["P0087"], diagnosticProcedure: "Measure pressure", repairProcedure: "",
  };
  assert.equal(knownFixMatch(job, incompatible, search), null, "Conflicting vehicle applicability must reject otherwise matching evidence");
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-E  HISTORICAL EVIDENCE
// ═══════════════════════════════════════════════════════════════════════════

test("P14E.1 reasoning evidence maps ranked results into bounded references", () => {
  const reasoning = reasoningServiceSrc();
  assert.match(reasoning, new RegExp(`history\\.results\\.slice\\(0,REASONING_HISTORY_MAX\\)`, ""));
  assert.match(reasoning, /reference:`HISTORY_\$\{index\+1\}`/);
  assert.match(reasoning, new RegExp(`knownFixes\\.results\\.slice\\(0,REASONING_KNOWN_FIX_MAX\\)`, ""));
  assert.match(reasoning, /reference:`KNOWN_FIX_\$\{index\+1\}`/);
  assert.equal(REASONING_HISTORY_MAX, 5);
  assert.equal(REASONING_KNOWN_FIX_MAX, 5);
});

function historyJob(overrides: Partial<NormalizedHistoryJob> = {}): NormalizedHistoryJob {
  return {
    id: "old", jobNumber: "J-9", date: null, vehicleId: "veh-9", registration: "CA999", fleetNumber: "F9",
    make: "scania", model: "r500", vehicleType: "truck", description: "", faultCodes: [], findings: [],
    repairs: [], parts: [], components: [], status: "COMPLETE", outcome: "Returned to service",
    previousJobNumber: "", reopened: false, incomplete: false, cancelled: false, ...overrides,
  };
}

test("P14E.2 only eligible history is ranked and therefore referenceable as evidence", () => {
  const filters: HistoryFilters = { q: "", faultCode: "", vehicleOnly: false, limit: 10 };
  const current = historyJob({
    id: "job-current", jobNumber: "J-10", vehicleId: "veh-10", registration: "CA101",
    faultCodes: ["P0087"], description: "low rail pressure", incomplete: true,
  });
  const eligible = historyJob({ id: "old-1", jobNumber: "J-100", vehicleId: "veh-10", faultCodes: ["P0087"], description: "low rail pressure" });
  const ineligible = historyJob({ id: "old-2", jobNumber: "J-200", vehicleId: "veh-20", faultCodes: [], description: "brake noise on a different truck" });

  const ranked = rankHistoricalJobs(current, [ineligible, eligible], filters);
  assert.deepEqual(ranked.map((item) => item.candidate.id), ["old-1"], "ineligible history must not enter reasoning evidence");

  // The evidence contract is derived from the ranked results only.
  const evidence: ReasoningEvidence = {
    question: "Check the pressure",
    currentJob: {
      jobNumber: "J-10", status: "OPEN", vehicle: { make: "scania", model: "r500", type: "truck", engineFamily: "dc13", descriptor: "" },
      complaint: "low rail pressure", faultCodes: ["P0087"], notes: [], diagnostics: [],
    },
    relatedHistory: ranked.map((item, index) => ({
      reference: `HISTORY_${index + 1}`,
      description: `Job ${item.candidate.jobNumber}: ${item.candidate.description}`,
      faultCodes: item.candidate.faultCodes, findings: item.candidate.findings, repairs: item.candidate.repairs,
      relevanceReasons: item.match!.reasons,
    })),
    approvedKnownFixes: [], recentInteractions: [],
  };
  const allowed = evidenceReferenceSet(evidence);
  assert.ok(allowed.has("HISTORY_1"));
  assert.equal(allowed.has("HISTORY_2"), false, "unranked history must not be referenceable");

  const response = validResponse();
  const historySafe = {
    ...response,
    hypotheses: [{ ...response.hypotheses[0], evidenceReferences: ["CURRENT_JOB", "HISTORY_1"] }],
    checks: [{ ...response.checks[0], evidenceSource: "CURRENT_JOB" }],
    evidenceUsed: [{ category: "RELATED_HISTORY", reference: "HISTORY_1", detail: "related history" }],
  };
  assert.ok(validateReasoningResponse(historySafe, allowed));
  const forged = { ...historySafe, evidenceUsed: [{ category: "RELATED_HISTORY", reference: "HISTORY_2", detail: "forged" }] };
  assert.throws(
    () => validateReasoningResponse(forged, allowed),
    (error: unknown) => error instanceof ProviderValidationError && error.validationReason === "EVIDENCE_UNKNOWN",
  );
});

test("P14E.3 cross-company or ineligible history cannot become reasoning evidence", () => {
  // The only history source is the company-scoped service result.
  assert.match(historyServiceSrc(), /companies\/\$\{companyId\}\/jobs/);
  assert.match(historyServiceSrc(), /authorisedJob\(context, jobId\)/);
  // reasoningService builds its relatedHistory exclusively from that service result.
  const evidenceBlock = section(reasoningServiceSrc(), "export async function evidencePackage", "\n}");
  assert.match(evidenceBlock, /searchIQ200History\(context,jobId/);
  assert.doesNotMatch(evidenceBlock, /searchIQ200History\(context\.companyId/);
  assert.doesNotMatch(evidenceBlock, /\.collection\(`companies\/.*false/);
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-F  REASONING RESPONSE — strict canonical validation
// ═══════════════════════════════════════════════════════════════════════════

test("P14F.1 strict validation rejects the full malformed-response matrix", () => {
  const allowed = evidenceReferenceSet(baseEvidence);
  const cases: Array<{ label: string; value: unknown; reason: string }> = [
    { label: "unknown evidence reference", value: { ...validResponse(), evidenceUsed: [{ category: "CURRENT_JOB", reference: "HISTORY_2", detail: "unknown" }] }, reason: "EVIDENCE_UNKNOWN" },
    { label: "wrong evidence category", value: { ...validResponse(), evidenceUsed: [{ category: "RELATED_HISTORY", reference: "KNOWN_FIX_1", detail: "mismatch" }] }, reason: "EVIDENCE_CATEGORY_MISMATCH" },
    { label: "duplicate evidence", value: { ...validResponse(), evidenceUsed: [validResponse().evidenceUsed[0], validResponse().evidenceUsed[0]] }, reason: "EVIDENCE_DUPLICATE" },
    { label: "additional top-level field", value: { ...validResponse(), provider: "openai" }, reason: "RESPONSE_SHAPE" },
    { label: "additional nested hypothesis field", value: { ...validResponse(), hypotheses: [{ ...validResponse().hypotheses[0], extra: "hidden" }] }, reason: "RESPONSE_SHAPE" },
    { label: "additional nested check field", value: { ...validResponse(), checks: [{ ...validResponse().checks[0], ownerId: "hidden" }] }, reason: "RESPONSE_SHAPE" },
    { label: "malformed minimal object", value: { summary: "only a summary" }, reason: "RESPONSE_SHAPE" },
    { label: "unsafe markup", value: { ...validResponse(), summary: "Safe <script>alert(1)</script>" }, reason: "UNSAFE_MARKUP" },
  ];
  for (const item of cases) {
    assert.throws(
      () => validateReasoningResponse(item.value, allowed),
      (error: unknown) => error instanceof ProviderValidationError && error.validationReason === item.reason,
      item.label,
    );
  }
});

test("P14F.2 integrated hosted execution rejects every invalid provider payload without persisting success", async () => {
  const invalidPayloads: Array<{ label: string; build: () => unknown }> = [
    { label: "unknown evidence reference", build: () => ({ ...validResponse(), evidenceUsed: [{ category: "CURRENT_JOB", reference: "HISTORY_2", detail: "unknown" }] }) },
    { label: "wrong evidence category", build: () => ({ ...validResponse(), evidenceUsed: [{ category: "RELATED_HISTORY", reference: "KNOWN_FIX_1", detail: "mismatch" }] }) },
    { label: "duplicate evidence", build: () => ({ ...validResponse(), evidenceUsed: [validResponse().evidenceUsed[0], validResponse().evidenceUsed[0]] }) },
    { label: "additional top-level field", build: () => ({ ...validResponse(), model: "gpt-5.6-terra" }) },
    { label: "additional nested field", build: () => ({ ...validResponse(), checks: [{ ...validResponse().checks[0], requestId: "hidden" }] }) },
    { label: "malformed response", build: () => ({ summary: "not a canonical response" }) },
    { label: "unsafe markup", build: () => ({ ...validResponse(), missingInformation: ["<img src=x onerror=alert(1)>"] }) },
  ];
  for (const item of invalidPayloads) {
    let successCalls = 0;
    const provider: HostedExecutionControls["provider"] = async () => ({ response: item.build() as ReasoningResponse, provider: "openai", model: "gate-model", usage: { inputUnits: 1, outputUnits: 1 } });
    await assert.rejects(
      () => runHostedExecutionCore(hostedControls(provider, () => { successCalls += 1; }), scope),
      (error: unknown) => error instanceof HostedRunError && error.code === "INVALID_PROVIDER_RESPONSE",
      item.label,
    );
    assert.equal(successCalls, 0, `${item.label} must never persist a success`);
  }
});

test("P14F.3 a fully valid response survives the integrated hosted pipeline", async () => {
  const provider = async () => ({ response: validResponse(), provider: "openai", model: "gate-model", usage: { inputUnits: 1, outputUnits: 1 } });
  const outcome = await runHostedExecutionCore(hostedControls(provider), scope);
  assert.equal(outcome.kind, "SUCCEEDED");
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-G  SAFETY BOUNDARY
// ═══════════════════════════════════════════════════════════════════════════

test("P14G.1 prohibited FleetFix action claims are rejected", () => {
  for (const summary of [
    "I emailed the customer about the delay.",
    "I contacted the customer to arrange collection.",
    "Order parts for the AC compressor.",
    "Create a PO for the compressor.",
    "Mark the job complete for the technician.",
    "Send a WhatsApp to the driver.",
  ]) {
    assert.throws(
      () => validateHostedAdvisoryResponse({ summary }),
      (error: unknown) => {
        if (!(error instanceof Error)) return false;
        const safety = (error as { safetyReason?: unknown }).safetyReason;
        return error.message === "SAFETY_VALIDATION_FAILED" && safety === "PROHIBITED_ACTION";
      },
      summary,
    );
  }
});

test("P14G.2 unqualified positive repair commands are rejected", () => {
  for (const summary of [
    "Replace the rail pressure sender now.",
    "Remove the valve cover.",
    "Install the new starter motor immediately.",
    "Replace the compressor.",
  ]) {
    assert.throws(
      () => validateHostedAdvisoryResponse({ summary }),
      (error: unknown) => {
        if (!(error instanceof Error)) return false;
        const safety = (error as { safetyReason?: unknown }).safetyReason;
        return error.message === "SAFETY_VALIDATION_FAILED" && safety === "UNQUALIFIED_REPAIR_ACTION";
      },
      summary,
    );
  }
});

test("P14G.3 verification-led conditional wording and action-linked negations remain allowed", () => {
  for (const summary of [
    "Confirm the fault with a pressure test before replacing the sender.",
    "After verifying the interlock is engaged, remove the cover to finish the test.",
    "Do not replace the control unit based on history alone.",
    "Never install a replacement sensor without first confirming the reading.",
    "Inspect and verify before removing the component.",
  ]) {
    assert.doesNotThrow(() => validateHostedAdvisoryResponse({ summary }), summary);
  }
});

test("P14G.4 unsafe shortcut questions suppress repair steps and force the bypass warning", () => {
  const unsafe = buildTestReasoningResponse({ ...baseEvidence, question: "Can we bypass the interlock to test the starter?" });
  assert.equal(containsUnsafeShortcut("Can we bypass the interlock to test the starter?"), true);
  assert.equal(unsafe.hypotheses.length, 0);
  assert.equal(unsafe.checks.length, 0);
  assert.ok(unsafe.safetyWarnings.some((warning) => /Do not bypass protective systems/.test(warning)));

  const safe = buildTestReasoningResponse({ ...baseEvidence, question: "Verify the interlock is engaged before removing the cover." });
  assert.equal(containsUnsafeShortcut("Verify the interlock is engaged before removing the cover."), false);
  assert.ok(safe.checks.length > 0, "verification-led questions retain checks");
});

test("P14G.5 required safety warnings are derived and cannot be suppressed", () => {
  const highRisk = { ...baseEvidence, question: "", currentJob: { ...baseEvidence.currentJob, complaint: "common rail low fuel pressure", diagnostics: ["battery voltage 8.1V"] } };
  const warnings = deriveSafetyWarnings(highRisk);
  assert.ok(warnings.some((warning) => /high-pressure fuel/.test(warning)));
  assert.ok(warnings.some((warning) => /Isolate electrical/i.test(warning)));
  const merged = mergeRequiredSafetyWarnings({ ...validResponse(), safetyWarnings: [] }, highRisk);
  assert.ok(merged.safetyWarnings.some((warning) => /high-pressure fuel/.test(warning)));
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-H  PROVIDER BOUNDARY — static/local only, no credentials, no network
// ═══════════════════════════════════════════════════════════════════════════

test("P14H.1 provider transport is server-only and the only OpenAI importer", () => {
  const transport = source("src/lib/iq200/openaiTransport.ts");
  assert.match(transport, /import "server-only";/);
  const libFiles = [
    "service.ts", "client.ts", "historyCore.ts", "historyService.ts", "hostedConfig.ts",
    "hostedControlCore.ts", "hostedControls.ts", "hostedEvidence.ts", "hostedProvider.ts",
    "hostedReasoningCore.ts", "hostedReasoningService.ts", "hostedServerConfig.ts",
    "hostedTransportCore.ts", "knownFixCore.ts", "knownFixLifecycleUiCore.ts", "knownFixService.ts",
    "openaiTransport.ts", "openaiTransportCore.ts", "permissions.ts", "reasoningCore.ts",
    "reasoningProvider.ts", "reasoningService.ts",
  ];
  const importers = libFiles.filter((file) => /import OpenAI from "openai"/.test(source(`src/lib/iq200/${file}`)));
  assert.deepEqual(importers, ["openaiTransport.ts"]);
});

test("P14H.2 browser client has no provider-transport import path", () => {
  const page = pageSrc();
  assert.doesNotMatch(page, /openaiTransport|hostedProvider|hostedReasoningService|from "openai"|OPENAI_API_KEY/);
  const client = clientSrc();
  assert.doesNotMatch(client, /openai|hostedProvider|hostedReasoning|\bOpenAI\b/);
  assert.match(client, /from "firebase\/auth"/);
});

test("P14H.3 tools remain disabled and store remains false", () => {
  const request = buildHostedProviderRequest(baseEvidence, 1024);
  assert.deepEqual(request.output.tools, []);
  assert.equal(request.output.store, false);
  assert.equal(request.output.webSearch, false);
  assert.equal(request.output.multimodal, false);
  // The provider request body keeps tools and tool_choice disabled and store off.
  const core = source("src/lib/iq200/openaiTransportCore.ts");
  assert.match(core, /store: false, tools: \[\], tool_choice: "none"/);
  assert.match(core, /text: \{ format: \{ type: "json_schema"/);
});

test("P14H.4 OpenAI SDK retries remain zero", () => {
  const transport = source("src/lib/iq200/openaiTransport.ts");
  assert.match(transport, /new OpenAI\(\s*\{\s*apiKey,\s*maxRetries:\s*0\s*\}\s*\)/);
  assert.match(transport, /function createOpenAIResponsesClient/);
});

test("P14H.5 provider/internal metadata never reaches technician DTO outputs", () => {
  // Assessment retrieval and reasoning responses exclude provider/model/usage/latency.
  const retrieval = section(serviceSrc(), "export async function getIQ200SessionAssessment", "return {");
  assert.doesNotMatch(retrieval, /provider:|model:|usage:|latencyMs|requestId|interactionId/);
  // Interaction persistence only carries provider metadata server-side into the
  // server-only batch, never into the browser return object.
  const hosted = hostedReasoningServiceSrc();
  const success = section(hosted, "persistSuccess:", "persistFailure:");
  assert.match(success, /provider,model,usage,requestId,success:true,latencyMs/);
  assert.doesNotMatch(hostedReasoningServiceSrc(), /return \{[\s\S]*provider|return \{[\s\S]*model|return \{[\s\S]*usage/);
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-I  SESSION / ASSESSMENT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

test("P14I.1 session listing remains job-scoped and bounded", () => {
  const sessions = section(serviceSrc(), "export async function listIQ200Sessions", "export async function createIQ200Session");
  assert.match(sessions, /authorisedJob\(context, jobId\)/);
  assert.match(sessions, /iq200_sessions"\)\.orderBy\("updatedAt", "desc"\)\.limit\(50\)/);
  assert.match(sessions, /return \{ sessions: sessions\.docs[\s\S]*\.map/);
});

test("P14I.2 assessment retrieval enforces the session identity, success-only, bounded contract", () => {
  const retrieval = section(serviceSrc(), "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /data\?\.companyId !== context\.companyId/);
  assert.match(retrieval, /data\?\.jobId !== jobSnapshot\.id/);
  assert.match(retrieval, /where\("success", "==", true\)/);
  assert.match(retrieval, /orderBy\("createdAt", "desc"\)/);
  assert.match(retrieval, /\.limit\(IQ200_ASSESSMENT_CANDIDATE_LIMIT\)/);
  assert.match(serviceSrc(), /const IQ200_ASSESSMENT_CANDIDATE_LIMIT = 20;/);
  assert.match(retrieval, /let assessment.*= null/);
  assert.match(retrieval, /catch \{/);
  assert.match(retrieval, /continue;/);
  assert.match(retrieval, /assessment = \{/);
  assert.doesNotMatch(retrieval, /provider:|model:|usage:|latencyMs|interactionId|requestId/);
});

test("P14I.3 reasoning and assessment verify the same session membership gate", () => {
  const reasoning = reasoningServiceSrc();
  assert.match(reasoning, /session\.exists\|\|data\?\.companyId!==context\.companyId\|\|data\?\.jobId!==job\.id/);
  assert.match(reasoning, /NOT_FOUND","IQ200 session not found\."/);
  const retrieval = section(serviceSrc(), "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /session\.exists \|\| data\?\.companyId !== context\.companyId \|\| data\?\.jobId !== jobSnapshot\.id/);
  assert.match(retrieval, /"IQ200 session not found\."/);
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-J  CLIENT CONCURRENCY
// ═══════════════════════════════════════════════════════════════════════════

test("P14J.1 selecting B supersedes A and stale A cannot update B", () => {
  const correlation = createRequestCorrelation();
  const tokenA = nextRequestToken(correlation);
  const tokenB = nextRequestToken(correlation);
  assert.equal(isCurrentRequest(correlation, tokenA), false, "A must be stale after B is selected");
  assert.equal(isCurrentRequest(correlation, tokenB), true);

  const staleA = applySubmissionSuccess(correlation, tokenA, { summary: "A stale" }, "TEST_ENABLED", "generated");
  assert.equal(staleA.stale, true);
  assert.equal(staleA.update.assessment, null, "stale A must not overwrite B's state");

  const currentB = applySubmissionSuccess(correlation, tokenB, { summary: "B current" }, "TEST_ENABLED", "generated");
  assert.equal(currentB.stale, false);
  assert.equal((currentB.update.assessment as { summary: string }).summary, "B current");
});

test("P14J.2 abort never displays a normal error", () => {
  const correlation = createRequestCorrelation();
  const token = nextRequestToken(correlation);
  const aborted = applySubmissionFailure(correlation, token, new IQ200ApiError("abort", "Request was cancelled"));
  assert.equal(aborted.stale, false);
  assert.equal(aborted.update.submissionError, "");
  assert.equal(aborted.update.reasoningMessage, "");
  assert.equal(aborted.update.permissionBlocked, false);
  const network = applySubmissionFailure(correlation, token, new IQ200ApiError("network", "Network request failed"));
  assert.equal(network.update.permissionBlocked, false);
  assert.ok(network.update.submissionError.length > 0);
});

test("P14J.3 job navigation invalidates the previous request across every async flow", () => {
  const page = pageSrc();
  const cleanup = section(page, "return () => {", "  }, [id])");
  assert.match(cleanup, /abortController\.abort\(\)/);
  assert.match(cleanup, /submissionAbortRef\.current\?\.abort\(\)/);
  assert.match(cleanup, /historyAbortRef\.current\?\.abort\(\)/);
  assert.match(cleanup, /retrievalAbortRef\.current\?\.abort\(\)/);
  assert.match(cleanup, /nextRequestToken\(submissionCorrelationRef\.current\)/);
  assert.match(cleanup, /nextRequestToken\(historyCorrelationRef\.current\)/);
  assert.match(cleanup, /nextRequestToken\(retrievalCorrelationRef\.current\)/);
  assert.match(cleanup, /jobGenerationRef\.current \+= 1/);

  const load = section(page, "useEffect(() =>", "async function startSession");
  for (const reset of [
    "setLoadedJobId(null)", "setContext(null)", "setSessions([])", "setHistory([])", "setKnownFixes([])",
    "setAssessment(null)", "setReasoningMessage(\"\")", "setError(\"\")", "setPermissionBlocked(false)",
    "setSelectedSessionId(null)", "setAssessmentRetrievalLoading(false)", "setAssessmentRetrievalError(\"\")",
  ]) {
    assert.match(load, new RegExp(reset.replace(/[()[\]{}"]/g, "\\$&")));
  }
});

test("P14J.4 no auto retry, no polling, no auto reasoning, no bulk retrieval", () => {
  const page = pageSrc();
  assert.doesNotMatch(page, /setInterval/);
  const load = section(page, "useEffect(() =>", "async function startSession");
  assert.doesNotMatch(load, /reasonAboutIQ200Session|\/reason/);
  assert.doesNotMatch(load, /fetchSessionAssessment|sessions\.map.*selectSession|sessions\.map.*fetchSession/);
  const select = section(page, "async function selectSession", "if (loading");
  assert.doesNotMatch(select, /setTimeout|\.retry\(|retryCount/);
  // An abort in the retrieval path is silently swallowed, not rendered as an error.
  assert.match(select, /reason instanceof IQ200ApiError && reason\.isAbort/);
  assert.match(select, /return;/);
});

test("P14J.5 every async flow captures requestJobId and generation for isCurrentJob", () => {
  const page = pageSrc();
  const submit = section(page, "async function startSession", "async function searchHistory");
  assert.match(submit, /requestJobId = id[\s\S]*generation = jobGenerationRef\.current[\s\S]*isCurrentJob/);
  const history = section(page, "async function searchHistory", "async function selectSession");
  assert.match(history, /requestJobId = id[\s\S]*generation = jobGenerationRef\.current[\s\S]*isCurrentJob/);
  const select = section(page, "async function selectSession", "if (loading");
  assert.match(select, /requestJobId = id[\s\S]*generation = jobGenerationRef\.current[\s\S]*isCurrentJob/);
  assert.match(select, /retrievalAbortRef\.current\?\.abort\(\)/);
  assert.match(select, /const token = nextRequestToken\(retrievalCorrelationRef\.current\)/);
  assert.match(select, /if \(!isCurrentJob\(\) \|\| !isCurrentRequest\(retrievalCorrelationRef\.current, token\)\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-K  CACHE / SIDE EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

test("P14K.1 sensitive IQ200 GET routes retain no-store", () => {
  const routes = [
    "src/app/api/iq200/jobs/[jobId]/context/route.ts",
    "src/app/api/iq200/jobs/[jobId]/history/route.ts",
    "src/app/api/iq200/jobs/[jobId]/known-fixes/route.ts",
    "src/app/api/iq200/jobs/[jobId]/sessions/route.ts",
    "src/app/api/iq200/jobs/[jobId]/sessions/[sessionId]/assessment/route.ts",
    "src/app/api/iq200/jobs/[jobId]/sessions/[sessionId]/reason/route.ts",
    "src/app/api/iq200/known-fixes/route.ts",
  ];
  for (const route of routes) {
    assert.match(source(route), /"cache-control"\s*:\s*"no-store"/, route);
  }
});

test("P14K.2 assessment retrieval is read-only", () => {
  const assessmentRoute = source("src/app/api/iq200/jobs/[jobId]/sessions/[sessionId]/assessment/route.ts");
  assert.match(assessmentRoute, /export async function GET/);
  assert.doesNotMatch(assessmentRoute, /export async function (POST|PATCH|PUT|DELETE)/);
  const retrieval = section(serviceSrc(), "export async function getIQ200SessionAssessment", "return {");
  assert.doesNotMatch(retrieval, /\.update\(|\.set\(|\.create\(|\.delete\(|adminDb\.batch\(|serverTimestamp\(\)/);
});

test("P14K.3 no communication / WhatsApp / email execution path in IQ200", () => {
  const iq200LibFiles = [
    "src/lib/iq200/service.ts", "src/lib/iq200/reasoningService.ts", "src/lib/iq200/hostedReasoningService.ts",
    "src/lib/iq200/hostedReasoningCore.ts", "src/lib/iq200/hostedProvider.ts", "src/lib/iq200/hostedControls.ts",
    "src/lib/iq200/hostedEvidence.ts", "src/lib/iq200/historyService.ts", "src/lib/iq200/knownFixService.ts",
    "src/lib/iq200/openaiTransportCore.ts",
  ];
  for (const file of iq200LibFiles) {
    const value = source(file);
    assert.doesNotMatch(value, /sendWhatsApp|sendEmail|nodemailer|communicationExecutions|executeWhatApp|whatsappSendRequests|Twilio/i, file);
    assert.doesNotMatch(value, /@\/lib\/communicationExecutions|@\/lib\/whatsapp/i, file);
  }
  assert.doesNotMatch(pageSrc(), /sendWhatsApp|sendEmail|orderParts|changeJobStatus|updateJob\b/i);
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-L  COMMISSIONING / RETRY SAFETY — static/local only
// ═══════════════════════════════════════════════════════════════════════════

test("P14L.1 phase7_retry5 remains the commissioning ledger namespace", () => {
  const hosted = hostedReasoningServiceSrc();
  assert.match(hosted, /PHASE7_RECOVERY_COMMISSIONING=\{phase:"PHASE_7" as const,maxRequests:1 as const,ledger:"phase7_retry5",idempotencyNamespace:"phase7_retry5"\}/);
  assert.match(hosted, /PHASE7_RECOVERY_LEDGER_PATH="iq200_hosted_commissioning\/phase7_retry5"/);
  assert.match(hosted, /reserveHostedRequest\([^)]*Date\.now\(\),1,PHASE7_RECOVERY_COMMISSIONING/);
  assert.match(source("src/lib/iq200/hostedControlCore.ts"), /if\(Number\(count\)>=1\)throw new Error\("COMMISSIONING_LIMIT"\)/);
});

test("P14L.2 no phase7_retry6 / Retry 6 exists anywhere in IQ200 source", () => {
  const files = [
    "src/lib/iq200/service.ts", "src/lib/iq200/client.ts", "src/lib/iq200/reasoningService.ts",
    "src/lib/iq200/hostedReasoningService.ts", "src/lib/iq200/hostedReasoningCore.ts",
    "src/lib/iq200/hostedProvider.ts", "src/lib/iq200/hostedControls.ts", "src/lib/iq200/hostedControlCore.ts",
    "src/lib/iq200/hostedServerConfig.ts", "src/lib/iq200/hostedConfig.ts", "src/lib/iq200/openaiTransport.ts",
    "src/lib/iq200/openaiTransportCore.ts",
  ];
  for (const file of files) {
    assert.doesNotMatch(source(file), /retry6|retry_6|Retry 6/i, file);
  }
});

test("P14L.3 commissioning gates fail closed under normal test configuration", () => {
  assert.equal(IQ200_HOSTED_COMMISSIONING_ARMED, false);
  assert.equal(IQ200_PHASE7_COMMISSIONING_ARMED, false);
  assert.equal(hostedExecutionAllowed(hostedReasoningConfig({})), false);
  assert.equal(phase7ScopeAllowed(hostedReasoningConfig({}), scope), false);
  assert.equal(hostedCommissioningReadiness({}).liveCommissioningAllowed, false);
  assert.equal(reasoningEnabled({ IQ200_REASONING_ENABLED: "true", IQ200_REASONING_PROVIDER: "deterministic-test" }), false, "test-env-only provider must fail closed without NODE_ENV=test");
});

// ═══════════════════════════════════════════════════════════════════════════
// P14-M  PRODUCTION SEPARATION — config unit tests only
// ═══════════════════════════════════════════════════════════════════════════

const completeHostingEnv: Record<string, string> = {
  FLEETFIX_ENVIRONMENT: "staging",
  IQ200_PHASE7_COMMISSIONING_ENABLED: "true",
  IQ200_REASONING_ENABLED: "true",
  IQ200_HOSTED_PROVIDER_ENABLED: "true",
  IQ200_HOSTED_PROVIDER: "openai",
  IQ200_HOSTED_MODEL: IQ200_PHASE7_MODEL,
  IQ200_HOSTED_CREDENTIAL_PRESENT: "true",
  IQ200_PHASE7_COMPANY_ID: "company-a",
  IQ200_PHASE7_JOB_ID: "job-a",
  IQ200_PHASE7_SESSION_ID: "session-a",
  IQ200_RATE_USER_PER_HOUR: "1",
  IQ200_RATE_COMPANY_PER_HOUR: "1",
  IQ200_RATE_SESSION_PER_HOUR: "1",
  IQ200_COMPANY_PERIOD_REQUESTS: "1",
  IQ200_LIMIT_PERIOD_SECONDS: "3600",
  IQ200_MAX_INPUT_CHARS: "20000",
  IQ200_MAX_OUTPUT_CHARS: "10000",
  IQ200_MAX_OUTPUT_TOKENS: "4096",
};

test("P14M.1 hosted configuration cannot authorize production execution", () => {
  const production = hostedReasoningConfig({ ...completeHostingEnv, FLEETFIX_ENVIRONMENT: "production" });
  assert.equal(production.environment, "production");
  assert.equal(hostedExecutionAllowed(production), false, "production must always fail closed");
  assert.equal(phase7ScopeAllowed(production, scope), false);
});

test("P14M.2 commissioning scope fails closed for any off-target scope and invalid environment", () => {
  const config = hostedReasoningConfig(completeHostingEnv);
  assert.equal(config.environment, "staging");
  assert.equal(config.provider, "openai");
  assert.equal(config.model, IQ200_PHASE7_MODEL);
  assert.ok(config.limits && config.commissioningTarget);
  // Arming flags remain off, so no configuration can authorize a live run.
  assert.equal(hostedExecutionAllowed(config), false);
  assert.equal(phase7ScopeAllowed(config, { companyId: "company-b", jobId: "job-a", sessionId: "session-a" }), false);
  assert.equal(phase7ScopeAllowed(config, { companyId: "company-a", jobId: "job-b", sessionId: "session-a" }), false);
  const invalid = hostedReasoningConfig({ ...completeHostingEnv, FLEETFIX_ENVIRONMENT: "local" });
  assert.equal(invalid.environment, "invalid");
  assert.equal(hostedExecutionAllowed(invalid), false);
});

test("P14M.3 hosted configuration exists only on the server", () => {
  const serverConfig = source("src/lib/iq200/hostedServerConfig.ts");
  assert.match(serverConfig, /import "server-only";/);
  assert.match(serverConfig, /process\.env/);
  assert.match(serverConfig, /OPENAI_API_KEY/);
  assert.doesNotMatch(serverConfig, /request|body|searchParams|headers|cookies/);
  assert.doesNotMatch(pageSrc(), /hostedReasoningConfig|getHostedReasoningServerConfig|OPENAI_API_KEY/);
});

test("P14-Z phase14 suite itself is static/local and self-contained", () => {
  const self = source("tests/iq200-phase14.test.ts");
  const firstImport = self.indexOf("import assert");
  const imports = self.slice(firstImport, self.indexOf("const source ="));
  // Only pure/schema modules are imported; the SDK wrapper, hosted provider,
  // hosting services, Firebase packages, and server auth are forbidden.
  assert.doesNotMatch(imports, /from\s+["'][^"']*\/(?:openaiTransport|hostedProvider|hostedReasoningService|reasoningService)(?:\.ts)?["']/i);
  assert.doesNotMatch(imports, /firebase-admin|serverAuth|from\s+["']openai["']/i);
  assert.doesNotMatch(imports, /fetch\(|new OpenAI|apiKey|authorization|process\.env/i);
  assert.doesNotMatch(self, /runHostedReasoning\(/);
  assert.doesNotMatch(self, /new OpenAI\(/);
});