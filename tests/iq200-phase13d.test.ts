import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  IQ200ApiError,
  applySubmissionFailure,
  applySubmissionSuccess,
  beginSubmission,
  classifyFeatureState,
  classifyIQ200Error,
  createRequestCorrelation,
  createSubmissionGuard,
  isCurrentRequest,
  nextRequestToken,
  releaseSubmissionGuard,
  tryAcquireSubmissionGuard,
} from "../src/lib/iq200/client.ts";

const source = (path: string) => readFileSync(path, "utf8");
const page = () => source("src/app/jobs/[id]/iq200/page.tsx");
const client = () => source("src/lib/iq200/client.ts");
const section = (value: string, start: string, end: string) => {
  const startIndex = value.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = value.indexOf(end, startIndex + start.length);
  if (endIndex < 0) return "";
  return value.slice(startIndex, endIndex);
};

test("P13D.1 successful API path returns parsed payload and forwards AbortSignal", () => {
  const value = client();
  assert.match(value, /response = await fetch\(path,\s*{[\s\S]*signal: init\?\.signal/);
  assert.match(value, /if \(!response\.ok\)[\s\S]*return payload as T/);
});

test("P13D.2 HTTP error preserves safe status and server message", () => {
  const error = new IQ200ApiError("http", "Not found", 404, "Safe public message");
  assert.equal(error.status, 404);
  assert.equal(error.serverMessage, "Safe public message");
  assert.equal(error.isHttp, true);
  assert.equal(error.isNetwork, false);
  assert.equal(error.isAbort, false);
});

test("P13D.3 network and abort failures remain distinct error kinds", () => {
  const network = new IQ200ApiError("network", "Network failed");
  const abort = new IQ200ApiError("abort", "Cancelled");
  assert.equal(network.isNetwork, true);
  assert.equal(network.isAbort, false);
  assert.equal(abort.isAbort, true);
  assert.equal(abort.isNetwork, false);
});

test("P13D.4 API converts fetch aborts and network failures separately", () => {
  const value = client();
  assert.match(value, /error\.name === "AbortError"[\s\S]*new IQ200ApiError\("abort"/);
  assert.match(value, /new IQ200ApiError\("network", "Network request failed"\)/);
});

test("P13D.5 401 is authentication failure without automatic retry", () => {
  const result = classifyIQ200Error(new IQ200ApiError("http", "Unauthorized", 401));
  assert.deepEqual(result, { category: "auth", message: "Your session has expired. Please refresh the page.", retryable: false });
});

test("P13D.6 403 is permission-blocking and non-retryable", () => {
  const result = classifyIQ200Error(new IQ200ApiError("http", "Forbidden", 403, "No permission"));
  assert.deepEqual(result, { category: "permission", message: "No permission", retryable: false });
  const state = createRequestCorrelation(), token = nextRequestToken(state);
  assert.equal(applySubmissionFailure(state, token, new IQ200ApiError("http", "Forbidden", 403)).update.permissionBlocked, true);
});

test("P13D.7 404 is unavailable/not-found and non-retryable", () => {
  const result = classifyIQ200Error(new IQ200ApiError("http", "Missing", 404));
  assert.equal(result.category, "not_found");
  assert.equal(result.retryable, false);
  assert.match(result.message, /not found/i);
});

test("P13D.8 409 is conflict and non-retryable", () => {
  const result = classifyIQ200Error(new IQ200ApiError("http", "Conflict", 409));
  assert.equal(result.category, "conflict");
  assert.equal(result.retryable, false);
});

test("P13D.9 422 is validation failure and leaves assessment empty", () => {
  const state = createRequestCorrelation(), token = nextRequestToken(state);
  const result = applySubmissionFailure(state, token, new IQ200ApiError("http", "Invalid", 422));
  assert.equal(classifyIQ200Error(new IQ200ApiError("http", "Invalid", 422)).category, "validation");
  assert.equal(result.update.assessment, null);
});

test("P13D.10 429 is manual retry-later behavior", () => {
  const result = classifyIQ200Error(new IQ200ApiError("http", "Limited", 429));
  assert.equal(result.category, "rate_limited");
  assert.equal(result.retryable, false);
  assert.match(result.message, /wait before trying again/i);
});

test("P13D.11 500 is manually recoverable", () => {
  const result = classifyIQ200Error(new IQ200ApiError("http", "Server", 500));
  assert.equal(result.category, "server");
  assert.equal(result.retryable, true);
  assert.match(result.message, /try again/i);
});

test("P13D.12 network failure is manually recoverable", () => {
  const result = classifyIQ200Error(new IQ200ApiError("network", "Network failed"));
  assert.deepEqual(result, { category: "network", message: "A network error occurred. You can try again.", retryable: true });
});

test("P13D.13 abort is silent and not presented as an ordinary failure", () => {
  const classified = classifyIQ200Error(new IQ200ApiError("abort", "Cancelled"));
  assert.deepEqual(classified, { category: "abort", message: "", retryable: false });
  const state = createRequestCorrelation(), token = nextRequestToken(state);
  const failed = applySubmissionFailure(state, token, new IQ200ApiError("abort", "Cancelled"));
  assert.equal(failed.update.submissionError, "");
  assert.equal(failed.update.reasoningMessage, "");
});

test("P13D.14 first submission acquires guard and rapid duplicate is rejected", () => {
  const guard = createSubmissionGuard();
  assert.equal(tryAcquireSubmissionGuard(guard), true);
  assert.equal(tryAcquireSubmissionGuard(guard), false);
  assert.equal(guard.inFlight, true);
});

test("P13D.15 submission guard releases after completion and failure", () => {
  for (const outcome of ["success", "failure"]) {
    const guard = createSubmissionGuard();
    assert.equal(tryAcquireSubmissionGuard(guard), true, outcome);
    releaseSubmissionGuard(guard);
    assert.equal(guard.inFlight, false, outcome);
    assert.equal(tryAcquireSubmissionGuard(guard), true, outcome);
  }
});

test("P13D.16 request tokens advance monotonically and identify the current request", () => {
  const state = createRequestCorrelation();
  const first = nextRequestToken(state), second = nextRequestToken(state), third = nextRequestToken(state);
  assert.deepEqual([first, second, third], [1, 2, 3]);
  assert.equal(isCurrentRequest(state, first), false);
  assert.equal(isCurrentRequest(state, third), true);
});

test("P13D.17 stale response cannot update the authoritative assessment", () => {
  const state = createRequestCorrelation();
  const staleToken = nextRequestToken(state);
  nextRequestToken(state);
  const result = applySubmissionSuccess(state, staleToken, { summary: "stale" }, "TEST_ENABLED", "stale");
  assert.equal(result.stale, true);
  assert.equal(result.update.assessment, null);
  assert.equal(result.update.reasoningMessage, "");
});

test("P13D.18 current response is accepted", () => {
  const state = createRequestCorrelation(), token = nextRequestToken(state), response = { summary: "current" };
  const result = applySubmissionSuccess(state, token, response, "TEST_ENABLED", "Ready");
  assert.equal(result.stale, false);
  assert.equal(result.update.assessment, response);
});

test("P13D.19 beginning submission clears assessment message and prior error", () => {
  const result = beginSubmission(createRequestCorrelation());
  assert.deepEqual(result.cleared, { assessment: null, reasoningMessage: "", submissionError: "" });
});

test("P13D.20 session-create failure leaves assessment and reasoning message empty", () => {
  const state = createRequestCorrelation(), token = nextRequestToken(state);
  const result = applySubmissionFailure(state, token, new IQ200ApiError("http", "Server", 500));
  assert.equal(result.update.assessment, null);
  assert.equal(result.update.reasoningMessage, "");
  assert.match(result.update.submissionError, /try again/i);
});

test("P13D.21 reasoning failure cannot restore prior assessment or message", () => {
  const state = createRequestCorrelation(), token = nextRequestToken(state);
  const result = applySubmissionFailure(state, token, new IQ200ApiError("network", "Network"));
  assert.equal(result.update.assessment, null);
  assert.equal(result.update.reasoningMessage, "");
});

test("P13D.22 successful current response sets assessment and clears error", () => {
  const state = createRequestCorrelation(), token = nextRequestToken(state), response = { summary: "safe" };
  const result = applySubmissionSuccess(state, token, response, "HOSTED", "Complete");
  assert.equal(result.update.assessment, response);
  assert.equal(result.update.reasoningMessage, "Complete");
  assert.equal(result.update.submissionError, "");
});

test("P13D.23 DISABLED is explicitly unavailable rather than hosted success", () => {
  const classified = classifyFeatureState("DISABLED", "Disabled");
  assert.deepEqual(classified, { kind: "unavailable", message: "Disabled" });
  const state = createRequestCorrelation(), token = nextRequestToken(state);
  assert.equal(applySubmissionSuccess(state, token, { summary: "must not render" }, "DISABLED", "Disabled").update.assessment, null);
});

test("P13D.24 TEST_ENABLED and HOSTED are explicitly available", () => {
  assert.equal(classifyFeatureState("TEST_ENABLED", "Test").kind, "available");
  assert.equal(classifyFeatureState("HOSTED", "Hosted").kind, "available");
  assert.equal(classifyFeatureState("UNKNOWN", "Unknown").kind, "unavailable");
});

test("P13D.25 successful and failed reasoning both reach authoritative session refresh", () => {
  const flow = section(page(), "async function startSession", "async function searchHistory");
  const reasoningCatch = flow.indexOf("catch (reasonError)");
  const refresh = flow.indexOf("const refreshed = await refreshSessions");
  assert.ok(reasoningCatch >= 0);
  assert.ok(refresh > reasoningCatch);
  assert.match(flow, /setSessions\(refreshed\)/);
});

test("P13D.26 reasoning failure refresh does not resubmit reasoning", () => {
  const flow = section(page(), "async function startSession", "async function searchHistory");
  const firstReason = flow.indexOf("/reason");
  assert.ok(firstReason >= 0);
  assert.equal(flow.indexOf("/reason", firstReason + 1), -1);
  assert.ok(flow.indexOf("refreshSessions") > firstReason);
});

test("P13D.27 failed session refresh cannot fabricate successful state", () => {
  const flow = section(page(), "// Refresh session list", "} catch (reason) {");
  const refreshCatch = section(flow, "catch (refreshError)", "}");
  assert.doesNotMatch(refreshCatch, /setSessions|setAssessment|applySubmissionSuccess/);
});

test("P13D.28 first history action acquires guard and rapid duplicate is rejected", () => {
  const guard = createSubmissionGuard();
  assert.equal(tryAcquireSubmissionGuard(guard), true);
  assert.equal(tryAcquireSubmissionGuard(guard), false);
  releaseSubmissionGuard(guard);
  assert.equal(guard.inFlight, false);
});

test("P13D.29 history correlation rejects stale and accepts current results", () => {
  const state = createRequestCorrelation();
  const stale = nextRequestToken(state), current = nextRequestToken(state);
  assert.equal(isCurrentRequest(state, stale), false);
  assert.equal(isCurrentRequest(state, current), true);
});

test("P13D.30 page applies history results and errors only for current correlation", () => {
  const flow = section(page(), "async function searchHistory", "if (loading ||");
  assert.match(flow, /isCurrentJob\(\) && isCurrentRequest\(historyCorrelationRef\.current, token\)[\s\S]*setHistory\(results\)/);
  assert.match(flow, /isCurrentJob\(\) && isCurrentRequest\(historyCorrelationRef\.current, token\)[\s\S]*setHistoryError/);
  assert.match(flow, /historyAbortRef\.current\?\.\s*abort\(\)/);
  assert.match(flow, /releaseSubmissionGuard\(guard\)/);
});

test("P13D.31 required initial-load failure is recoverable only by explicit retry", () => {
  const value = page();
  const load = section(value, "useEffect(() =>", "async function startSession");
  assert.match(load, /Promise\.all\(\[[\s\S]*\/context[\s\S]*\/sessions/);
  assert.match(load, /setInitialLoadError\(classified\.message\)/);
  assert.match(value, /<button type="button" onClick=\{\(\) => window\.location\.reload\(\)\}/);
});

test("P13D.32 auxiliary history and Known Fix failures do not invalidate core data", () => {
  const load = section(page(), "useEffect(() =>", "async function startSession");
  assert.match(load, /setContext\(jobContext\);[\s\S]*setSessions\(sessionResult\.sessions\);[\s\S]*Promise\.allSettled/);
  assert.match(load, /historyOutcome\.status === "fulfilled"[\s\S]*setHistory/);
  assert.match(load, /knownFixOutcome\.status === "fulfilled"[\s\S]*setKnownFixes/);
  const optional = section(load, "Promise.allSettled", "} catch (reason)");
  assert.doesNotMatch(optional, /setContext\(null\)|setInitialLoadError/);
});

test("P13D.33 initial load cannot call reason and reasoning requires explicit submit", () => {
  const value = page();
  const load = section(value, "useEffect(() =>", "async function startSession");
  const submit = section(value, "async function startSession", "async function searchHistory");
  assert.doesNotMatch(load, /\/reason/);
  assert.match(submit, /\/sessions\/\$\{encodeURIComponent\(result\.session\.id\)\}\/reason/);
  assert.match(value, /<form onSubmit=\{startSession\}/);
});

test("P13D.34 form submission and non-submit actions use explicit button types", () => {
  const value = page();
  const questionForm = section(value, "<form onSubmit={startSession}", "</form>");
  const historyForm = section(value, "<form onSubmit={searchHistory}", "</form>");
  assert.match(questionForm, /<button type="submit"/);
  assert.match(historyForm, /<button type="submit"/);
  assert.match(value, /<button type="button" onClick=\{\(\) => window\.location\.reload\(\)\}/);
});

test("P13D.35 browser contracts exclude interaction and correlation identifiers", () => {
  const value = page(), api = client();
  const contracts = section(value, "type Context =", "export default function");
  assert.doesNotMatch(contracts, /interactionId|requestToken|currentToken/);
  const reasonRequest = section(value, "const reasoning = await iq200Api", "const { stale }");
  assert.doesNotMatch(reasonRequest, /interactionId|requestToken|currentToken/);
  assert.doesNotMatch(api.slice(0, api.indexOf("export interface SubmissionGuardState")), /interactionId|requestToken|currentToken/);
});

test("P13D.36 conflict handling refreshes state without automatic resubmission", () => {
  const conflict = classifyIQ200Error(new IQ200ApiError("http", "Conflict", 409));
  assert.equal(conflict.category, "conflict");
  assert.equal(conflict.retryable, false);
  const flow = section(page(), "async function startSession", "async function searchHistory");
  assert.equal((flow.match(/\/reason/g) || []).length, 1);
  assert.match(flow, /refreshSessions\(abortController\.signal\)/);
});

test("P13D.37 validation rate server and network failures remain safe and manual", () => {
  const statuses = [
    classifyIQ200Error(new IQ200ApiError("http", "Invalid", 422)),
    classifyIQ200Error(new IQ200ApiError("http", "Limited", 429)),
    classifyIQ200Error(new IQ200ApiError("http", "Server", 500)),
    classifyIQ200Error(new IQ200ApiError("network", "Network")),
  ];
  assert.deepEqual(statuses.map((item) => item.category), ["validation", "rate_limited", "server", "network"]);
  assert.deepEqual(statuses.map((item) => item.retryable), [false, false, true, true]);
});

test("P13D.38 page consumes normalized feature-state output without raw response bypass", () => {
  const flow = section(page(), "async function startSession", "async function searchHistory");
  assert.match(flow, /const \{ stale, update \} = applySubmissionSuccess\(/);
  assert.match(flow, /setAssessment\(update\.assessment as ReasoningResponse \| null\)/);
  assert.match(flow, /setReasoningMessage\(update\.reasoningMessage\)/);
  assert.match(flow, /setError\(update\.submissionError\)/);
  assert.doesNotMatch(flow, /setAssessment\(reasoning\.response\)/);
  const correlation = createRequestCorrelation(), token = nextRequestToken(correlation);
  const disabled = applySubmissionSuccess(correlation, token, { summary: "must not render" }, "DISABLED", "Disabled");
  assert.equal(disabled.update.assessment, null);
});

test("P13D.39 submission duplicates remain blocked and route cleanup aborts and invalidates", () => {
  const value = page();
  const submit = section(value, "async function startSession", "async function searchHistory");
  assert.ok(submit.indexOf("tryAcquireSubmissionGuard(guard)") < submit.indexOf("beginSubmission(submissionCorrelationRef.current)"));
  assert.match(submit, /requestJobId = id[\s\S]*generation = jobGenerationRef\.current[\s\S]*isCurrentJob/);
  assert.match(submit, /if \(!stale && isCurrentJob\(\)\)/);
  assert.match(submit, /releaseSubmissionGuard\(guard\)/);
  const cleanup = section(value, "return () => {", "};\n  }, [id]");
  assert.match(cleanup, /submissionAbortRef\.current\?\.abort\(\)/);
  assert.match(cleanup, /nextRequestToken\(submissionCorrelationRef\.current\)/);
});

test("P13D.40 newer history search reaches supersession and only current result wins", () => {
  const flow = section(page(), "async function searchHistory", "if (loading");
  const duplicateCheck = flow.indexOf("historyRequestKeyRef.current === requestKey");
  const advance = flow.indexOf("beginSubmission(historyCorrelationRef.current)");
  const abort = flow.indexOf("historyAbortRef.current?.abort()");
  const request = flow.indexOf("await loadHistory");
  assert.ok(duplicateCheck >= 0 && duplicateCheck < advance);
  assert.ok(advance < abort && abort < request);
  assert.match(flow, /isCurrentJob\(\) && isCurrentRequest\(historyCorrelationRef\.current, token\)[\s\S]*setHistory\(results\)/);
  assert.match(flow, /releaseSubmissionGuard\(guard\)/);
});

test("P13D.41 route change clears prior-job state and cannot render old context", () => {
  const value = page();
  const load = section(value, "useEffect(() =>", "async function startSession");
  for (const reset of [
    "setLoadedJobId(null)", "setContext(null)", "setSessions([])", "setHistory([])", "setKnownFixes([])",
    "setAssessment(null)", "setReasoningMessage(\"\")", "setError(\"\")", "setHistoryError(\"\")",
    "setPermissionBlocked(false)", "setSaving(false)", "setSearching(false)",
  ]) assert.match(load, new RegExp(reset.replace(/[()[\]]/g, "\\$&")));
  assert.match(value, /loading \|\| \(context && loadedJobId !== id\)/);
  assert.match(load, /setLoadedJobId\(id\)/);
});

test("P13D.42 old-job session refresh and async completions are generation guarded", () => {
  const value = page();
  const submit = section(value, "async function startSession", "async function searchHistory");
  assert.match(submit, /activeJobIdRef\.current === requestJobId && jobGenerationRef\.current === generation/);
  assert.match(submit, /isCurrentJob\(\) && isCurrentRequest\(submissionCorrelationRef\.current, token\)\) setSessions\(refreshed\)/);
  const cleanup = section(value, "return () => {", "};\n  }, [id]");
  assert.match(cleanup, /historyAbortRef\.current\?\.abort\(\)/);
  assert.match(cleanup, /nextRequestToken\(historyCorrelationRef\.current\)/);
  assert.match(cleanup, /jobGenerationRef\.current \+= 1/);
});
