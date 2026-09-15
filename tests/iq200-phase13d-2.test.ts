import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  IQ200ApiError,
  classifyIQ200Error,
  createRequestCorrelation,
  isCurrentRequest,
  nextRequestToken,
} from "../src/lib/iq200/client.ts";

const source = (path: string) => readFileSync(path, "utf8");
const service = () => source("src/lib/iq200/service.ts");
const route = () => source("src/app/api/iq200/jobs/[jobId]/sessions/[sessionId]/assessment/route.ts");
const client = () => source("src/lib/iq200/client.ts");
const page = () => source("src/app/jobs/[id]/iq200/page.tsx");

const section = (value: string, start: string, end: string) => {
  const startIndex = value.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = value.indexOf(end, startIndex + start.length);
  if (endIndex < 0) return "";
  return value.slice(startIndex, endIndex);
};

// ═══════════════════════════════════════════════════════════════
// SERVER AUTHORIZATION & RETRIEVAL
// ═══════════════════════════════════════════════════════════════

test("P13D2.1 authorized assessment retrieval uses established service boundary", () => {
  const value = service();
  assert.match(value, /export async function getIQ200SessionAssessment/);
  assert.match(value, /requireIQ200Access\(context\)/);
  assert.match(value, /validateJobId\(jobId\)/);
  assert.match(value, /validateSessionId\(sessionId\)/);
});

test("P13D2.2 authentication enforced via authenticateServerRequest", () => {
  const value = route();
  assert.match(value, /authenticateServerRequest\(request\)/);
});

test("P13D2.3 permission enforced via requireIQ200Access", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /requireIQ200Access\(context\)/);
});

test("P13D2.4 cross-company access blocked by company-scoped job query", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /companies\/\$\{context\.companyId\}\/jobs\/\$\{jobId\}/);
  assert.match(retrieval, /data\?\.companyId !== context\.companyId/);
});

test("P13D2.5 wrong-job session blocked by session job verification", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /data\?\.jobId !== jobSnapshot\.id/);
});

test("P13D2.6 missing session handled safely with 404", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /if \(!session\.exists/);
  assert.match(retrieval, /ServerAccessError\("NOT_FOUND"/);
});

test("P13D2.7 session with no structured assessment returns null", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /let assessment.*= null/);
  assert.match(retrieval, /catch \{/);
  assert.match(retrieval, /continue;/);
});

test("P13D2.8 most recent valid structured assessment selected via bounded desc query", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /orderBy\("createdAt", "desc"\)/);
  assert.match(retrieval, /\.limit\(IQ200_ASSESSMENT_CANDIDATE_LIMIT\)/);
  assert.doesNotMatch(retrieval, /\.limit\(1\)/);
});

test("P13D2.9 failed interaction excluded by success filter", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /where\("success", "==", true\)/);
});

test("P13D2.10 malformed assessment excluded by canonical shape validation", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(value, /import \{ validateReasoningResponse.*reasoningCore\.ts/);
  assert.match(retrieval, /validateReasoningResponse\(rawResponse\)/);
  assert.match(retrieval, /catch \{/);
  assert.match(retrieval, /continue;/);
});

test("P13D2.11 allowlisted DTO returns only session and assessment", () => {
  const value = service().replace(/\r\n/g, "\n");
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "};\n}");
  assert.ok(retrieval.length > 0, "assessment retrieval section must be found");
  assert.match(retrieval, /const validated = validateReasoningResponse\(rawResponse\)/);
  const projection = section(retrieval, "assessment = {", "      };");
  assert.ok(projection.length > 0, "validated assessment projection must be found");
  assert.match(projection, /summary: validated\.summary[\s\S]*observations: validated\.observations\.map[\s\S]*hypotheses: validated\.hypotheses\.map[\s\S]*checks: validated\.checks\.map[\s\S]*safetyWarnings: validated\.safetyWarnings\.map[\s\S]*missingInformation: validated\.missingInformation\.map[\s\S]*evidenceUsed: validated\.evidenceUsed\.map[\s\S]*confidence: validated\.confidence[\s\S]*limitations: validated\.limitations\.map/);
  assert.doesNotMatch(projection, /\.\.\.|rawResponse|interaction\.data/);
  const response = retrieval.slice(retrieval.lastIndexOf("return {")).trimStart();
  assert.match(response, /^return \{\s*session: sessionEntry\(session\.id, session\.data\(\) \|\| \{\}\),\s*assessment,\s*$/);
  assert.doesNotMatch(response, /\.\.\.|interactionId|provider|providerMetadata|companyId|jobId|createdBy|createdAt|updatedBy|updatedAt|approvedBy|approvedAt|rawResponse|interaction\.data/);
});

test("P13D2.12 interactionId excluded from DTO", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.doesNotMatch(retrieval, /interactionId/);
  assert.doesNotMatch(retrieval, /interactions\.docs\[0\]\.id/);
});

test("P13D2.13 provider metadata excluded from DTO", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.doesNotMatch(retrieval, /provider:/);
  assert.doesNotMatch(retrieval, /model:/);
  assert.doesNotMatch(retrieval, /usage:/);
  assert.doesNotMatch(retrieval, /latencyMs/);
});

test("P13D2.14 raw Firestore document not spread into DTO", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.doesNotMatch(retrieval, /\.\.\.session\.data\(\)/);
  assert.doesNotMatch(retrieval, /\.\.\.interactionData/);
});

test("P13D2.15 browser Firestore read not introduced", () => {
  const value = page();
  assert.doesNotMatch(value, /import.*from.*firebase.*firestore/);
  assert.doesNotMatch(value, /collection\(/);
  assert.doesNotMatch(value, /doc\(/);
});

test("P13D2.16 GET/read-only route has no POST/PATCH/DELETE", () => {
  const value = route();
  assert.match(value, /export async function GET/);
  assert.doesNotMatch(value, /export async function POST/);
  assert.doesNotMatch(value, /export async function PATCH/);
  assert.doesNotMatch(value, /export async function DELETE/);
});

test("P13D2.17 retrieval does not call reasoning service", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "}\n");
  assert.doesNotMatch(retrieval, /reasonAboutIQ200Session/);
  assert.doesNotMatch(retrieval, /runHostedReasoning/);
});

test("P13D2.18 retrieval does not call provider", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "}\n");
  assert.doesNotMatch(retrieval, /configuredReasoningProvider/);
  assert.doesNotMatch(retrieval, /provider\.reason/);
});

test("P13D2.19 explicit session selection via selectSession function", () => {
  const value = page();
  assert.match(value, /async function selectSession\(sessionId: string\)/);
  assert.match(value, /onClick=\{\(\) => selectSession\(session\.id\)\}/);
});

test("P13D2.20 previous assessment cleared on selection", () => {
  const value = page();
  const select = section(value, "async function selectSession", "if (loading");
  assert.match(select, /setAssessment\(null\)/);
  assert.match(select, /setAssessmentRetrievalError\(""\)/);
});

test("P13D2.21 selected session visually identifiable", () => {
  const value = page();
  assert.match(value, /selectedSessionId === session\.id/);
  assert.match(value, /border-blue-500 bg-blue-50 ring-2 ring-blue-300/);
  assert.match(value, /✓ Selected/);
});

test("P13D2.22 loading state displayed during retrieval", () => {
  const value = page();
  assert.match(value, /assessmentRetrievalLoading/);
  assert.match(value, /Loading assessment…/);
});

test("P13D2.23 no-assessment state displayed when assessment is null", () => {
  const value = page();
  assert.match(value, /selectedSessionId \? .*No assessment available/);
  assert.match(value, /This session does not have a stored structured assessment/);
});

test("P13D2.24 retrieval error state displayed on failure", () => {
  const value = page();
  assert.match(value, /assessmentRetrievalError \?/);
  assert.match(value, /Retrieval failed/);
});

test("P13D2.25 B supersedes A by aborting previous controller", () => {
  const value = page();
  const select = section(value, "async function selectSession", "if (loading");
  assert.match(select, /retrievalAbortRef\.current\?\.abort\(\)/);
  assert.match(select, /const abortController = new AbortController\(\)/);
  assert.match(select, /retrievalAbortRef\.current = abortController/);
});

test("P13D2.26 A controller aborted when B selected", () => {
  const value = page();
  const select = section(value, "async function selectSession", "if (loading");
  assert.match(select, /retrievalAbortRef\.current\?\.abort\(\)/);
});

test("P13D2.27 correlation advances on each selection", () => {
  const value = page();
  const select = section(value, "async function selectSession", "if (loading");
  assert.match(select, /const token = nextRequestToken\(retrievalCorrelationRef\.current\)/);
});

test("P13D2.28 stale A result ignored via correlation check", () => {
  const value = page();
  const select = section(value, "async function selectSession", "if (loading");
  assert.match(select, /if \(!isCurrentJob\(\) \|\| !isCurrentRequest\(retrievalCorrelationRef\.current, token\)\)/);
});

test("P13D2.29 B result accepted when correlation matches", () => {
  const value = page();
  const select = section(value, "async function selectSession", "if (loading");
  assert.match(select, /setAssessment\(result\.assessment as ReasoningResponse \| null\)/);
});

test("P13D2.30 route change aborts retrieval via cleanup", () => {
  const value = page();
  const cleanup = section(value, "return () => {", "  }, [id])");
  assert.match(cleanup, /retrievalAbortRef\.current\?\.abort\(\)/);
});

test("P13D2.31 Job A result cannot update Job B via generation check", () => {
  const value = page();
  const select = section(value, "async function selectSession", "if (loading");
  assert.match(select, /const isCurrentJob = \(\) => activeJobIdRef\.current === requestJobId && jobGenerationRef\.current === generation/);
  assert.match(select, /if \(!isCurrentJob\(\)/);
});

test("P13D2.32 abort not displayed as normal error", () => {
  const value = page();
  const select = section(value, "async function selectSession", "if (loading");
  assert.match(select, /if \(reason instanceof IQ200ApiError && reason\.isAbort\)/);
  assert.match(select, /return;/);
});

test("P13D2.33 network failure safely classified", () => {
  const value = page();
  const select = section(value, "async function selectSession", "if (loading");
  assert.match(select, /const classified = classifyIQ200Error\(reason\)/);
  assert.match(select, /setAssessmentRetrievalError\(classified\.message\)/);
});

test("P13D2.34 no automatic retry on retrieval failure", () => {
  const value = page();
  const select = section(value, "async function selectSession", "if (loading");
  assert.doesNotMatch(select, /setTimeout/);
  assert.doesNotMatch(select, /retry/);
});

test("P13D2.35 no polling via setInterval", () => {
  const value = page();
  assert.doesNotMatch(value, /setInterval/);
});

test("P13D2.36 no automatic reasoning on page load", () => {
  const value = page();
  const load = section(value, "useEffect(() =>", "async function startSession");
  assert.doesNotMatch(load, /reasonAboutIQ200Session/);
  assert.doesNotMatch(load, /\/reason/);
});

test("P13D2.37 no automatic retrieval of all session assessments", () => {
  const value = page();
  const load = section(value, "useEffect(() =>", "async function startSession");
  assert.doesNotMatch(load, /fetchSessionAssessment/);
  assert.doesNotMatch(load, /sessions\.map.*selectSession/);
});

test("P13D2.38 Phase 13D-1 reasoning submission guard preserved", () => {
  const value = page();
  assert.match(value, /submissionGuardRef/);
  assert.match(value, /tryAcquireSubmissionGuard\(guard\)/);
  assert.match(value, /releaseSubmissionGuard\(guard\)/);
});

test("P13D2.39 Phase 13B privacy boundary preserved in DTO", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.doesNotMatch(retrieval, /rawProviderResponse/);
  assert.doesNotMatch(retrieval, /providerEnvelope/);
  assert.doesNotMatch(retrieval, /systemPrompt/);
  assert.doesNotMatch(retrieval, /chain.?of.?thought/i);
});

test("P13D2.40 Phase 13D-1 route/correlation safety preserved", () => {
  const value = page();
  const cleanup = section(value, "return () => {", "  }, [id])");
  assert.match(cleanup, /submissionAbortRef\.current\?\.abort\(\)/);
  assert.match(cleanup, /historyAbortRef\.current\?\.abort\(\)/);
  assert.match(cleanup, /retrievalAbortRef\.current\?\.abort\(\)/);
  assert.match(cleanup, /nextRequestToken\(submissionCorrelationRef\.current\)/);
  assert.match(cleanup, /nextRequestToken\(historyCorrelationRef\.current\)/);
  assert.match(cleanup, /nextRequestToken\(retrievalCorrelationRef\.current\)/);
});

// ═══════════════════════════════════════════════════════════════
// CLIENT HELPER TESTS
// ═══════════════════════════════════════════════════════════════

test("P13D2.41 fetchSessionAssessment uses correct API path", () => {
  const value = client();
  assert.match(value, /export async function fetchSessionAssessment/);
  assert.match(value, /\/api\/iq200\/jobs\/.*\/sessions\/.*\/assessment/);
});

test("P13D2.42 fetchSessionAssessment accepts AbortSignal", () => {
  const value = client();
  assert.match(value, /signal\?: AbortSignal/);
  assert.match(value, /signal \? \{ signal \} : \{\}/);
});

test("P13D2.43 IQ200AssessmentResult type defined", () => {
  const value = client();
  assert.match(value, /export type IQ200AssessmentResult/);
  assert.match(value, /session: IQ200AssessmentSessionDTO/);
  assert.match(value, /assessment: unknown/);
});

test("P13D2.44 session selection clears reasoning message", () => {
  const value = page();
  const select = section(value, "async function selectSession", "if (loading");
  assert.match(select, /setReasoningMessage\(""\)/);
});

test("P13D2.45 route change clears selected session", () => {
  const value = page();
  const load = section(value, "useEffect(() =>", "async function startSession");
  assert.match(load, /setSelectedSessionId\(null\)/);
  assert.match(load, /setAssessmentRetrievalLoading\(false\)/);
  assert.match(load, /setAssessmentRetrievalError\(""\)/);
});

test("P13D2.46 session buttons disabled during retrieval", () => {
  const value = page();
  assert.match(value, /disabled=\{assessmentRetrievalLoading\}/);
});

test("P13D2.47 no Session ID exposed in UI", () => {
  const value = page();
  assert.doesNotMatch(value, /Session ID: \{session\.id\}/);
});

test("P13D2.48 retrieval uses fetchSessionAssessment from client", () => {
  const value = page();
  assert.match(value, /import\s*\{[\s\S]*fetchSessionAssessment[\s\S]*\}\s*from\s*"@\/lib\/iq200\/client"/);
  const select = section(value, "async function selectSession", "if (loading");
  assert.match(select, /await fetchSessionAssessment\(requestJobId, sessionId, abortController\.signal\)/);
});

test("P13D2.49 service validates session ID format", () => {
  const value = service();
  assert.match(value, /const SESSION_ID = \/\^\[A-Za-z0-9_-\]\{1,128\}\$\/;/);
  assert.match(value, /function validateSessionId\(sessionId: string\)/);
});

test("P13D2.50 assessment DTO shape matches ReasoningResponse", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /summary:/);
  assert.match(retrieval, /observations:/);
  assert.match(retrieval, /hypotheses:/);
  assert.match(retrieval, /checks:/);
  assert.match(retrieval, /safetyWarnings:/);
  assert.match(retrieval, /missingInformation:/);
  assert.match(retrieval, /evidenceUsed:/);
  assert.match(retrieval, /confidence:/);
  assert.match(retrieval, /limitations:/);
});
// ═══════════════════════════════════════════════════════════════
// PHASE 13D-2 REMEDIATION — BOUNDED, VALIDATED RETRIEVAL
// ═══════════════════════════════════════════════════════════════

test("P13D2.51 newest malformed success falls through to an older valid candidate", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /for \(const interaction of interactions\.docs\)/);
  assert.match(retrieval, /validateReasoningResponse\(/);
  assert.match(retrieval, /catch \{/);
  assert.match(retrieval, /continue;/);
  assert.match(retrieval, /break;/);
  assert.match(retrieval, /assessment = \{/);
});

test("P13D2.52 retrieval is bounded and no longer limited to a single candidate", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(value, /const IQ200_ASSESSMENT_CANDIDATE_LIMIT = 20;/);
  assert.match(retrieval, /\.limit\(IQ200_ASSESSMENT_CANDIDATE_LIMIT\)/);
  assert.doesNotMatch(retrieval, /\.limit\(1\)/);
  assert.doesNotMatch(retrieval, /interactions\.docs\[0\]/);
});

test("P13D2.53 all malformed successful interactions return assessment null", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /let assessment.*= null/);
  assert.match(retrieval, /catch \{/);
  assert.match(retrieval, /continue;/);
  assert.match(retrieval, /assessment = \{/);
});

test("P13D2.54 nested hypothesis/check/evidence shape is validated, not passed through", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(value, /import \{ validateReasoningResponse.*reasoningCore\.ts/);
  assert.match(retrieval, /validateReasoningResponse\(rawResponse\)/);
  assert.match(retrieval, /catch \{/);
  assert.doesNotMatch(retrieval, /\.filter\(/);
  assert.doesNotMatch(retrieval, /typeof response\.summary === "string"/);
});

test("P13D2.55 invalid confidence or evidence category is rejected without fallback", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.match(retrieval, /validateReasoningResponse\(rawResponse\)/);
  assert.doesNotMatch(retrieval, /\.includes\(response\.confidence/);
  assert.doesNotMatch(retrieval, /: "LOW"/);
});

test("P13D2.56 DTO allowlists nested hypothesis/check/evidence fields explicitly", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  for (const field of ["title", "explanation", "confidence", "evidenceReferences", "contradictions", "recommendedChecks", "description", "purpose", "expectedResult", "safetyNote", "evidenceSource", "category", "reference", "detail"]) {
    assert.match(retrieval, new RegExp(`${field}:`));
  }
});

test("P13D2.57 retrieval introduces no raw spread, reasoning, provider, or write calls", () => {
  const value = service();
  const retrieval = section(value, "export async function getIQ200SessionAssessment", "return {");
  assert.doesNotMatch(retrieval, /\.\.\./);
  assert.doesNotMatch(retrieval, /reasonAboutIQ200Session/);
  assert.doesNotMatch(retrieval, /runHostedReasoning/);
  assert.doesNotMatch(retrieval, /configuredReasoningProvider/);
  assert.doesNotMatch(retrieval, /provider\.reason/);
  assert.doesNotMatch(retrieval, /\.update\(/);
  assert.doesNotMatch(retrieval, /\.set\(/);
  assert.doesNotMatch(retrieval, /\.create\(/);
  assert.doesNotMatch(retrieval, /\.delete\(/);
  assert.doesNotMatch(retrieval, /FieldValue\.serverTimestamp\(\)/);
});
