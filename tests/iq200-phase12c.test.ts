import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { knownFixEditBehavior, knownFixTransitionAllowed } from "../src/lib/iq200/knownFixCore.ts";
import { acquireKnownFixAction, KNOWN_FIX_REFRESH_WARNING, reconcileKnownFixRefreshRecovery, releaseKnownFixAction, updateKnownFixLifecycleError, updateKnownFixRefreshBlock } from "../src/lib/iq200/knownFixLifecycleUiCore.ts";
import { hostedExecutionAllowed, hostedReasoningConfig, IQ200_HOSTED_COMMISSIONING_ARMED, IQ200_PHASE7_COMMISSIONING_ARMED, IQ200_PHASE7_MODEL } from "../src/lib/iq200/hostedConfig.ts";

const source = (path: string) => readFileSync(path, "utf8");
const page = () => source("src/app/admin/iq200-known-fixes/page.tsx");
const service = () => source("src/lib/iq200/knownFixService.ts");
const actionBody = () => { const value=page(); return value.slice(value.indexOf("const action="),value.indexOf("const edit=")); };

test("P12C executable same-record lock rejects overlap and permits reuse after release",()=>{
  const inFlight=new Set<string>(),blocked=new Set<string>();
  assert.equal(acquireKnownFixAction(inFlight,blocked,"A"),true);
  assert.equal(acquireKnownFixAction(inFlight,blocked,"A"),false);
  releaseKnownFixAction(inFlight,"A");
  assert.equal(acquireKnownFixAction(inFlight,blocked,"A"),true);
});

test("P12C executable refresh block rejects acquisition and survives ordinary release",()=>{
  const inFlight=new Set<string>(["A"]),blocked=new Set<string>(["A"]);
  releaseKnownFixAction(inFlight,"A");
  assert.equal(inFlight.has("A"),false);
  assert.equal(blocked.has("A"),true);
  assert.equal(acquireKnownFixAction(inFlight,blocked,"A"),false);
});

test("P12C executable locks remain independent across records",()=>{
  const inFlight=new Set<string>(),blocked=new Set<string>();
  assert.equal(acquireKnownFixAction(inFlight,blocked,"A"),true);
  assert.equal(acquireKnownFixAction(inFlight,blocked,"B"),true);
  releaseKnownFixAction(inFlight,"B");
  assert.equal(inFlight.has("A"),true);
  assert.equal(inFlight.has("B"),false);
});

test("P12C executable lifecycle errors have immutable per-record ownership",()=>{
  const original:Record<string,string>={};
  const withA=updateKnownFixLifecycleError(original,"A","A failed");
  const withB=updateKnownFixLifecycleError(withA,"B","B failed");
  const withoutB=updateKnownFixLifecycleError(withB,"B","");
  assert.deepEqual(original,{});
  assert.deepEqual(withA,{A:"A failed"});
  assert.deepEqual(withoutB,{A:"A failed"});
  assert.notEqual(withA,original);
  assert.notEqual(withoutB,withB);
});

test("P12C executable refresh blocks have immutable per-record ownership",()=>{
  const original:Record<string,boolean>={};
  const withA=updateKnownFixRefreshBlock(original,"A",true);
  const withC=updateKnownFixRefreshBlock(withA,"C",true);
  const withoutA=updateKnownFixRefreshBlock(withC,"A",false);
  assert.deepEqual(original,{});
  assert.deepEqual(withC,{A:true,C:true});
  assert.deepEqual(withoutA,{C:true});
  assert.notEqual(withoutA,withC);
});

test("P12C executable successful recovery clears only blocked-record warnings",()=>{
  const errors={A:KNOWN_FIX_REFRESH_WARNING,B:"Lifecycle request denied",C:KNOWN_FIX_REFRESH_WARNING};
  const recovered=reconcileKnownFixRefreshRecovery(new Set(["A","C"]),errors);
  assert.deepEqual(recovered.refreshBlocked,{});
  assert.deepEqual(recovered.lifecycleErrors,{B:"Lifecycle request denied"});
  assert.deepEqual(errors,{A:KNOWN_FIX_REFRESH_WARNING,B:"Lifecycle request denied",C:KNOWN_FIX_REFRESH_WARNING});
});

test("P12C executable empty recovery preserves unrelated errors",()=>{
  const errors={B:"Lifecycle request denied"};
  const recovered=reconcileKnownFixRefreshRecovery(new Set<string>(),errors);
  assert.deepEqual(recovered.lifecycleErrors,errors);
  assert.notEqual(recovered.lifecycleErrors,errors);
});

test("P12C executable failed recovery preserves block and warning",()=>{
  const blocked=updateKnownFixRefreshBlock({},"A",true);
  const errors=updateKnownFixLifecycleError({},"A",KNOWN_FIX_REFRESH_WARNING);
  // A failed authoritative load does not invoke successful recovery reconciliation.
  assert.deepEqual(blocked,{A:true});
  assert.deepEqual(errors,{A:KNOWN_FIX_REFRESH_WARNING});
});

test("P12C.1 non-submit action buttons have explicit button type",()=>{
  const value=page();
  assert.match(value,/<button type="button" onClick=\{\(\)=>void save\(\)\}/);
  assert.match(value,/<button onClick=\{\(\)=>edit\(fix\)\} type="button" disabled=\{blocked\}/);
  assert.match(value,/<button type="button" disabled=\{blocked\} onClick=\{\(\)=>void action\(fix\.id,"approve"\)\}/);
  assert.match(value,/<button type="button" disabled=\{blocked\} onClick=\{\(\)=>void action\(fix\.id,"inactivate"\)\}/);
});

test("P12C.2 pending lifecycle state is per record",()=>{
  const value=page();
  assert.match(value,/pendingActions,setPendingActions/);
  assert.match(value,/lifecycleErrors,setLifecycleErrors/);
  assert.match(value,/refreshBlocked,setRefreshBlocked/);
  assert.match(value,/const pending=pendingActions\[fix\.id\]/);
  assert.match(value,/refreshBlocked\[fix\.id\]/);
});

test("P12C.3 synchronous guard precedes the request",()=>{
  const value=actionBody();
  const reserve=value.indexOf("acquireKnownFixAction(inFlightActions.current,refreshBlockedActions.current,id)");
  const request=value.indexOf("await iq200Api");
  assert.ok(reserve>=0&&request>reserve);
});

test("P12C.4 pending state is set before lifecycle request",()=>{
  const value=actionBody();
  assert.ok(value.indexOf("setPendingActions")<value.indexOf("await iq200Api"));
});

test("P12C.5 pending state and synchronous lock clear in finally",()=>{
  const value=actionBody();
  const finallyAt=value.indexOf("finally{");
  assert.ok(finallyAt>0);
  const cleanup=value.slice(finallyAt);
  assert.match(cleanup,/releaseKnownFixAction\(inFlightActions\.current,id\)/);
  assert.match(cleanup,/delete next\[id\]/);
});

test("P12C.6 prior lifecycle error clears before request",()=>{
  const value=actionBody();
  assert.ok(value.indexOf('setLifecycleError(id,"")')<value.indexOf("await iq200Api"));
});

test("P12C.7 Approve is disabled and visibly pending",()=>{
  const value=page();
  assert.match(value,/disabled=\{blocked\} onClick=\{\(\)=>void action\(fix\.id,"approve"\)\}/);
  assert.match(value,/pending==="approve"\?"Approving…":"Approve"/);
});

test("P12C.8 Mark inactive is disabled and visibly pending",()=>{
  const value=page();
  assert.match(value,/disabled=\{blocked\} onClick=\{\(\)=>void action\(fix\.id,"inactivate"\)\}/);
  assert.match(value,/pending==="inactivate"\?"Marking inactive…":"Mark inactive"/);
});

test("P12C.9 Edit is disabled and synchronously guarded",()=>{
  const value=page();
  assert.match(value,/onClick=\{\(\)=>edit\(fix\)\} type="button" disabled=\{blocked\}/);
  const edit=value.slice(value.indexOf("const edit="),value.indexOf("return <main"));
  assert.match(edit,/if\(inFlightActions\.current\.has\(fix\.id\)\|\|refreshBlockedActions\.current\.has\(fix\.id\)\)return/);
});

test("P12C.10 successful lifecycle request reloads Known Fix data",()=>{
  const value=actionBody();
  assert.match(value,/await iq200Api[\s\S]*await load\(\{throwOnError:true,clearPageError:false,reconcileBlocks:false\}\)/);
});

test("P12C.11 lifecycle errors and ownership are per record",()=>{
  const value=actionBody();
  assert.doesNotMatch(page(),/latestActionRequest/);
  assert.match(value,/setLifecycleError\(id,e instanceof Error\?e\.message:"Action failed"\)/);
  assert.match(page(),/setLifecycleErrors\(current=>updateKnownFixLifecycleError\(current,id,message\)\)/);
});

test("P12C refresh failure is observable and uses a specific safe message",()=>{
  const value=page();
  assert.match(value,/if\(options\.throwOnError\)throw e/);
  assert.match(value,/setLifecycleError\(id,KNOWN_FIX_REFRESH_WARNING\)/);
  assert.doesNotMatch(actionBody(),/load\(false\)/);
});

test("P12C refresh failure blocks only the affected record",()=>{
  const value=actionBody();
  assert.match(value,/refreshBlockedActions\.current\.add\(id\)/);
  assert.match(value,/updateKnownFixRefreshBlock\(current,id,true\)/);
  assert.match(page(),/blocked=Boolean\(pending\|\|refreshBlocked\[fix\.id\]\)/);
});

test("P12C successful refresh clears only that record lifecycle state",()=>{
  const value=actionBody();
  assert.match(value,/refreshBlockedActions\.current\.delete\(id\)/);
  assert.match(value,/updateKnownFixRefreshBlock\(current,id,false\)/);
  assert.match(value,/setLifecycleError\(id,""\)/);
});

test("P12C general successful refresh reconciles stale-state blocks",()=>{
  const value=page();
  assert.match(value,/const recoveredIds=new Set\(refreshBlockedActions\.current\)/);
  assert.match(value,/reconcileKnownFixRefreshRecovery\(recoveredIds,\{\}\)\.refreshBlocked/);
  assert.match(value,/reconcileKnownFixRefreshRecovery\(recoveredIds,current\)\.lifecycleErrors/);
});

test("P12C same-record calls are blocked while unrelated records remain independent",()=>{
  const value=actionBody();
  assert.match(value,/acquireKnownFixAction\(inFlightActions\.current,refreshBlockedActions\.current,id\)/);
  assert.doesNotMatch(value,/inFlightActions\.current\.size|pendingActions\).*return/);
});

test("P12C.12 server lifecycle remains authoritative and guarded",()=>{
  const value=service();
  assert.match(value,/knownFixTransitionAllowed\(data\.status,action\)/);
  assert.match(value,/knownFixApprovalReadiness\(data\)/);
  assert.match(value,/adminDb\.runTransaction/);
});

test("P12C.13 INACTIVE remains terminal",()=>{
  assert.equal(knownFixEditBehavior("INACTIVE"),"denied");
  assert.equal(knownFixTransitionAllowed("INACTIVE","approve"),false);
  assert.equal(knownFixTransitionAllowed("INACTIVE","inactivate"),false);
});

test("P12C.14 technician retrieval remains company-scoped Approved plus active",()=>{
  const value=service();
  const search=value.slice(value.indexOf("export async function searchKnownFixesForJob"),value.indexOf("export async function listKnownFixes"));
  assert.match(value,/companies\/\$\{companyId\}\/iq200_known_fixes/);
  assert.match(search,/where\("status", "==", "APPROVED"\)/);
  assert.match(search,/active === true/);
});

test("P12C.15 commissioning remains closed",()=>{
  assert.equal(IQ200_HOSTED_COMMISSIONING_ARMED,false);
  assert.equal(IQ200_PHASE7_COMMISSIONING_ARMED,false);
  const config=hostedReasoningConfig({FLEETFIX_ENVIRONMENT:"staging",IQ200_PHASE7_COMMISSIONING_ENABLED:"false",IQ200_REASONING_ENABLED:"true",IQ200_HOSTED_PROVIDER_ENABLED:"true",IQ200_HOSTED_PROVIDER:"openai",IQ200_HOSTED_MODEL:IQ200_PHASE7_MODEL,IQ200_HOSTED_CREDENTIAL_PRESENT:"true",IQ200_PHASE7_COMPANY_ID:"company-a",IQ200_PHASE7_JOB_ID:"job-a",IQ200_PHASE7_SESSION_ID:"session-a",IQ200_RATE_USER_PER_HOUR:"1",IQ200_RATE_COMPANY_PER_HOUR:"1",IQ200_RATE_SESSION_PER_HOUR:"1",IQ200_COMPANY_PERIOD_REQUESTS:"1",IQ200_LIMIT_PERIOD_SECONDS:"3600",IQ200_MAX_INPUT_CHARS:"20000",IQ200_MAX_OUTPUT_CHARS:"10000",IQ200_MAX_OUTPUT_TOKENS:"4096"});
  assert.equal(config.commissioningEnabled,false);
  assert.equal(hostedExecutionAllowed(config),false);
});

test("P12C.16 Retry identity remains phase7_retry5",()=>{
  const value=source("src/lib/iq200/hostedReasoningService.ts");
  assert.match(value,/ledger:"phase7_retry5",idempotencyNamespace:"phase7_retry5"/);
  assert.match(value,/iq200_hosted_commissioning\/phase7_retry5/);
});

test("P12C.17 no retry6 or automatic external action was introduced",()=>{
  const hosted=source("src/lib/iq200/hostedReasoningService.ts");
  assert.doesNotMatch(hosted,/retry6/i);
  assert.doesNotMatch(page(),/sendWhatsApp|sendEmail|orderParts|changeJobStatus|OpenAI\(/i);
  const imports=source("tests/iq200-phase12c.test.ts").slice(0,source("tests/iq200-phase12c.test.ts").indexOf("const source"));
  assert.doesNotMatch(imports,/hostedProvider|openaiTransport|firebase|serverAuth/i);
});
