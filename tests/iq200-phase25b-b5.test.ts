import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { createHash } from "node:crypto";
import { retrieveKnowledgePages } from "../src/lib/iq200/knowledgeRetrievalCore.ts";
import { hashProcessingContent } from "../src/lib/iq200/knowledgePageProcessingCore.ts";
import { canUseIQ200 } from "../src/lib/iq200/permissions.ts";
import { ServerAccessError } from "../src/lib/serverAuthCore.ts";
import { buildTestReasoningResponse, evidenceReferenceSet, validateReasoningQuestion, validateReasoningResponse, type ReasoningEvidence, type ReasoningResponse } from "../src/lib/iq200/reasoningCore.ts";
import { prepareHostedReasoningEvidence, buildHostedProviderRequest } from "../src/lib/iq200/hostedEvidence.ts";
import { runHostedExecutionCore, type HostedExecutionControls, type HostedExecutionScope } from "../src/lib/iq200/hostedReasoningCore.ts";
import { addTechnicalLimitations, reconstructTechnicalCitations, revalidateTechnicalCitations, selectTechnicalProviderSubset, technicalAdjunct, technicalEvidenceFromRetrieval, TECHNICAL_LIMITATIONS, validateCachedTechnicalCitations, validatePersistedTechnicalAdjunct, validateTechnicalEvidence } from "../src/lib/iq200/technicalReasoningEvidenceCore.ts";
import type { RetrievalCandidate, RetrievalResult } from "../src/lib/iq200/knowledgeRetrievalContracts.ts";

function candidate(id = "doc-a", text = "P0087 fuel pressure test."): RetrievalCandidate {
  return {document:{companyId:"company-a",documentId:id,title:"Fuel pressure",originalFilename:"manual.pdf",contentHash:hashProcessingContent(id),processingStatus:"READY",approvalStatus:"APPROVED",publishedProcessingAttemptId:"attempt-a",publishedProcessingInvocationId:"invocation-a"},page:{documentId:id,pageId:"page-000001",pageIndex:0,displayPageNumber:"1",extractedText:text,textContentHash:hashProcessingContent(text),processingAttemptId:"attempt-a",processingInvocationId:"invocation-a"}};
}
function base(): ReasoningEvidence {
  return {question:"fuel pressure",currentJob:{jobNumber:"JOB-1",status:"OPEN",vehicle:{make:"Volvo",model:"FH",type:"Truck",engineFamily:"",descriptor:"REG-1"},complaint:"fuel pressure",faultCodes:["P0087"],notes:[],diagnostics:[]},relatedHistory:[],approvedKnownFixes:[],recentInteractions:[]};
}
function evidence(items = [candidate()]): ReasoningEvidence {
  const e=base(), result=retrieveKnowledgePages("company-a",items,{question:e.question,faultCodes:["P0087"]});
  return {...e,...technicalEvidenceFromRetrieval(result)};
}
function response(e:ReasoningEvidence,cite=true):ReasoningResponse {
  const r=buildTestReasoningResponse(e);
  if(cite && e.technicalDocuments?.length)r.evidenceUsed.push({category:"TECHNICAL_DOCUMENT",reference:e.technicalDocuments[0].reference,detail:"Supplied technical procedure"});
  return r;
}
const scope:HostedExecutionScope={companyId:"company-a",userId:"user-a",jobId:"job-a",sessionId:"session-a",question:"fuel pressure"};
function execution(e:ReasoningEvidence, options: {fresh?:()=>ReasoningEvidence;duplicate?:boolean;prior?:ReturnType<typeof technicalAdjunct>;providerResponse?:ReasoningResponse;maximum?:number}={}) {
  const calls={provider:0,reserve:0,success:0,failure:0,revalidated:0};let stored:unknown;
  const r=options.providerResponse||response(e);
  const controls:HostedExecutionControls={
    buildEvidence:async()=>e,projectEvidence:prepareHostedReasoningEvidence,
    acquireLease:async()=>({token:"lease",ref:{}}),finishLease:async()=>{},
    reserve:async()=>{calls.reserve++;return {duplicate:options.duplicate===true,inProgress:false,retryExhausted:false,retry:false,requestId:"request-a"};},
    loadPriorResult:async()=>({exists:true,success:true,interactionId:"interaction-a",response:r,...options.prior}),
    provider:async(selected)=>{calls.provider++;return {response:options.providerResponse||response(selected),provider:"controlled-test",model:"fixture",usage:{inputUnits:1,outputUnits:1}};},
    revalidateTechnicalEvidence:async(selected,reply)=>{calls.revalidated++;revalidateTechnicalCitations(selected,reply,options.fresh?.()||selected);},
    persistSuccess:async args=>{calls.success++;stored=args;return "interaction-a";},persistFailure:async()=>{calls.failure++;},
    withTimeout:async work=>work(new AbortController().signal),maxEvidenceChars:options.maximum||100000,timeoutMs:1000,now:()=>1,
  };
  return {controls,calls,get stored(){return stored;},run:()=>runHostedExecutionCore(controls,scope)};
}

// Requirements 1-13,55-58: execute evidencePackage/authorization with module-boundary doubles.
const bridgeKey="__iq200B5Test";
interface Bridge { context:{companyId:string;uid:string;token:object;companyUser:{active:boolean;permissions:Record<string,boolean>}}; result:RetrievalResult; retrievalCalls:number; unauthorized:boolean; error:boolean; companySeen?:string; jobSeen?:string; inputSeen?:unknown; records:Array<{id:string;data:()=>Record<string,unknown>}> }
function bridgeState():Bridge{return Reflect.get(globalThis,bridgeKey) as Bridge;}
function fixtureBridge():Bridge {const c=candidate();return {context:{companyId:"company-a",uid:"user-a",token:{},companyUser:{active:true,permissions:{"View jobs":true,"Use IQ200 Technician Assist":true,"View IQ200 Knowledge":false}}},result:retrieveKnowledgePages("company-a",[c],{question:"fuel pressure",faultCodes:["P0087"]}),retrievalCalls:0,unauthorized:false,error:false,records:[]};}
function checkJob(){const b=bridgeState();if(!b.context.companyUser.active||!canUseIQ200(b.context.companyUser)||b.unauthorized)throw new ServerAccessError("FORBIDDEN","Denied",403);}
const ref={collection:()=>({orderBy:()=>({limit:()=>({get:async()=>({docs:[]})})})})};
const url=(source:string)=>`data:text/javascript,${encodeURIComponent(source)}`;
const accessUrl=new URL("../src/lib/serverAuthCore.ts",import.meta.url).href;
const getBridge=`Reflect.get(globalThis,${JSON.stringify(bridgeKey)})`;
Reflect.set(globalThis,bridgeKey,fixtureBridge());
Reflect.set(globalThis,bridgeKey+"Job",checkJob);
const jobCode=`function check(){Reflect.get(globalThis,${JSON.stringify(bridgeKey+"Job")})()};export async function authorisedJob(){check();return {data:{},snapshot:{id:"job-a"}}};export async function getIQ200JobContext(){check();return {job:{number:"JOB-1",status:"OPEN",vehicle:{make:"Volvo",model:"FH",type:"Truck",registrationNumber:"REG-1",fleetNumber:""},description:"server complaint",diagnostics:[{code:"P0087"}],notes:[{text:"server finding"}]}}}`;
const fakeQuery=()=>({where(){return this;},orderBy(){return this;},limit(){return this;},get:async()=>({docs:bridgeState().records})});
const db={doc:()=>({get:async()=>({exists:true,id:"job-a",data:()=>({companyId:"company-a",jobId:"job-a"}),ref:{collection:()=>({doc:()=>({get:async()=>({exists:true,id:"session-a",data:()=>({companyId:"company-a",jobId:"job-a"})}),collection:fakeQuery})})}})}),batch:()=>{throw Error("Unexpected write");}};
Reflect.set(globalThis,bridgeKey+"Db",db);
const hooks=registerHooks({resolve(specifier,context,next){
  if(specifier==="server-only")return {url:url("export {}"),shortCircuit:true};
  if(specifier==="@/lib/serverAuth")return {url:url(`export {ServerAccessError} from ${JSON.stringify(accessUrl)};export async function resolveServerUser(){return ${getBridge}.context}`),shortCircuit:true};
  if(specifier==="@/lib/firebaseAdmin")return {url:url(`export const adminDb=Reflect.get(globalThis,${JSON.stringify(bridgeKey+"Db")});export const adminStorage={bucket(){throw Error("No image/provider storage allowed")}}`),shortCircuit:true};
  if(specifier==="firebase-admin/firestore")return {url:url('export const FieldValue={serverTimestamp(){return "timestamp"}};export class Timestamp{}'),shortCircuit:true};
  if(specifier==="./service"&&context.parentURL?.endsWith("reasoningService.ts"))return {url:url(jobCode),shortCircuit:true};
  if(specifier==="./knowledgeRetrievalService"&&context.parentURL?.endsWith("reasoningService.ts"))return {url:url(`export async function retrieveTechnicalKnowledgeForJob(context,jobId,input){const b=${getBridge};Reflect.get(globalThis,${JSON.stringify(bridgeKey+"Job")})();b.retrievalCalls++;b.companySeen=context.companyId;b.jobSeen=jobId;b.inputSeen=input;if(b.error)throw Error("Controlled retrieval failure");return b.result}`),shortCircuit:true};
  if(specifier==="./historyService")return {url:url('export async function searchIQ200History(){return {results:[]}}'),shortCircuit:true};
  if(specifier==="./knownFixService")return {url:url('export async function searchKnownFixesForJob(){return {results:[]}}'),shortCircuit:true};
  if(specifier==="./hostedReasoningService"&&context.parentURL?.endsWith("reasoningService.ts"))return {url:url('export async function runHostedReasoning(){throw Error("No live hosted execution") }'),shortCircuit:true};
  if(specifier==="./hostedServerConfig")return {url:url('export function getHostedReasoningServerConfig(){return {}}'),shortCircuit:true};
  if(specifier.startsWith("@/"))return {url:new URL(`../src/${specifier.slice(2)}.ts`,import.meta.url).href,shortCircuit:true};
  if(specifier.startsWith(".")&&context.parentURL?.includes("/src/")&&!/\.(ts|js|mjs)$/.test(specifier))return {url:new URL(specifier+".ts",context.parentURL).href,shortCircuit:true};
  return next(specifier,context);
}});
const production=await import("../src/lib/iq200/reasoningService.ts");
const assessmentService=await import("../src/lib/iq200/service.ts");
hooks.deregister();
const asContext=(b:Bridge)=>b.context as unknown as Parameters<typeof production.evidencePackage>[0];
const asRef=()=>ref as unknown as Parameters<typeof production.evidencePackage>[3];

for(const requirement of [1,2,7,8,12,55,56,57,58])test(`B5 requirement ${requirement}: production evidence retrieval uses authorized server context without library/image/provider calls`,async()=>{
  const b=fixtureBridge();Reflect.set(globalThis,bridgeKey,b);const e=await production.evidencePackage(asContext(b),"job-a",{},asRef(),"fuel pressure");
  assert.equal(b.retrievalCalls,1);assert.equal(b.companySeen,"company-a");assert.equal(b.jobSeen,"job-a");assert.deepEqual(b.inputSeen,{question:"fuel pressure"});assert.equal(e.currentJob.complaint,"server complaint");assert.equal(e.currentJob.vehicle.make,"Volvo");assert.equal(e.technicalDocuments?.length,1);
});
for(const [n,permission]of [[3,"View jobs"],[4,"Use IQ200 Technician Assist"]]as const)test(`B5 requirement ${n}: missing ${permission} denied`,async()=>{const b=fixtureBridge();b.context.companyUser.permissions[permission]=false;Reflect.set(globalThis,bridgeKey,b);await assert.rejects(()=>production.evidencePackage(asContext(b),"job-a",{},asRef(),"fuel pressure"));});
test("B5 requirement 5: inactive/no membership denied",async()=>{const b=fixtureBridge();b.context.companyUser.active=false;Reflect.set(globalThis,bridgeKey,b);await assert.rejects(()=>production.evidencePackage(asContext(b),"job-a",{},asRef(),"fuel pressure"));assert.equal(b.retrievalCalls,0);});
test("B5 requirement 6: unauthorized job denied",async()=>{const b=fixtureBridge();b.unauthorized=true;Reflect.set(globalThis,bridgeKey,b);await assert.rejects(()=>production.evidencePackage(asContext(b),"job-a",{},asRef(),"fuel pressure"));});
for(const [n,fields]of [[9,["companyId","company"]],[10,["documentId","pageId","pageIndex"]],[11,["storagePath","url","assetPath"]]]as const)test(`B5 requirement ${n}: caller authority rejected by canonical reasoning validator`,()=>{for(const field of fields)assert.throws(()=>validateReasoningQuestion({question:"fuel pressure",[field]:"forged"}));});
test("B5 requirement 13: ineligible B4 result cannot contribute evidence",async()=>{const b=fixtureBridge(),c=candidate();c.document.approvalStatus="DRAFT";b.result=retrieveKnowledgePages("company-a",[c],{faultCodes:["P0087"]});Reflect.set(globalThis,bridgeKey,b);const e=await production.evidencePackage(asContext(b),"job-a",{},asRef(),"fuel pressure");assert.deepEqual(e.technicalDocuments,[]);});
test("B5 requirement 14: zero technical results continue",async()=>{const e=evidence([]),f=execution(e);assert.equal((await f.run()).kind,"SUCCEEDED");assert.equal(f.calls.provider,1);});
test("B5 requirement 15: zero result limitation",()=>{const e=evidence([]);assert.ok(addTechnicalLimitations(response(e),e).limitations.includes(TECHNICAL_LIMITATIONS.zero));});
test("B5 requirement 16: retrieval failure prevents provider/reservation",async()=>{const b=fixtureBridge();b.error=true;Reflect.set(globalThis,bridgeKey,b);const f=execution(base());f.controls.buildEvidence=()=>production.evidencePackage(asContext(b),"job-a",{},asRef(),"fuel pressure");await assert.rejects(f.run);assert.equal(f.calls.provider,0);assert.equal(f.calls.reserve,0);});
test("B5 requirement 17: coverage reaches provider projection",()=>{const e=evidence();e.technicalRetrievalCoverage!.coverageLimited=true;assert.equal(prepareHostedReasoningEvidence(e).technicalRetrievalCoverage?.coverageLimited,true);});
test("B5 requirement 18: coverage reaches mandatory response limitation",()=>{const e=evidence();e.technicalRetrievalCoverage!.coverageLimited=true;assert.ok(addTechnicalLimitations(response(e),e).limitations.includes(TECHNICAL_LIMITATIONS.coverage));});
for(const n of [19,20,21])test(`B5 requirement ${n}: source bounds fail closed`,()=>{const e=evidence();assert.doesNotThrow(()=>validateTechnicalEvidence(e));if(n===21)e.technicalDocuments=Array.from({length:6},()=>e.technicalDocuments![0]);else{e.technicalDocuments![0].excerpt="x".repeat(n===19?6001:1201);e.technicalDocuments![0].citation.excerpt=e.technicalDocuments![0].excerpt;}assert.throws(()=>validateTechnicalEvidence(e));});
test("B5 requirement 22: deterministic whole-entry budget omission",()=>{const e=evidence([candidate("a"),candidate("b")]),one={...e,technicalDocuments:e.technicalDocuments!.slice(0,1),technicalEvidenceOmitted:true};const limit=Math.max(JSON.stringify(one).length,JSON.stringify(prepareHostedReasoningEvidence(one)).length);const selected=selectTechnicalProviderSubset(e,limit,prepareHostedReasoningEvidence);assert.equal(selected.technicalDocuments?.length,1);assert.equal(selected.technicalDocuments![0].excerpt,e.technicalDocuments![0].excerpt);assert.deepEqual(selected,selectTechnicalProviderSubset(e,limit,prepareHostedReasoningEvidence));});
test("B5 requirement 23: omitted reference removed from provider allowlist and reconstruction",()=>{const e=evidence([candidate("a"),candidate("b")]);const selected={...e,technicalDocuments:e.technicalDocuments!.slice(0,1)};assert.ok(!evidenceReferenceSet(selected).has(e.technicalDocuments![1].reference));const r=response(e);r.checks[0].evidenceSource=e.technicalDocuments![1].reference;assert.throws(()=>validateReasoningResponse(r,evidenceReferenceSet(selected)));});
for(const n of [24,25,26])test(`B5 requirement ${n}: provider redaction preserves server source identity`,()=>{const e=evidence([candidate("a","P0087 contact boss@example.com Bearer abcdefghijklmnop")]);e.technicalDocuments![0].citation.documentTitle="boss@example.com technical source";const before=structuredClone(e);const payload=prepareHostedReasoningEvidence(e);assert.ok(!JSON.stringify(payload).includes("boss@example.com"));assert.ok(!JSON.stringify(payload).includes("abcdefghijklmnop"));assert.deepEqual(e,before);assert.ok(payload.technicalDocuments![0].redactedExcerpt.includes("REDACTED"));});
for(const n of [27,28,29,30,53,54])test(`B5 requirement ${n}: minimal text-only provider projection`,()=>{const request=buildHostedProviderRequest(evidence(),100);const item=request.untrustedEvidence.technicalDocuments![0];assert.deepEqual(Object.keys(item).sort(),["category","reference","redactedExcerpt","redactedSourceLabel","relevanceReasons"].sort());assert.equal(item.category,"TECHNICAL_DOCUMENT");assert.equal(request.output.multimodal,false);assert.ok(!JSON.stringify(item).includes("company-a"));assert.ok(!JSON.stringify(item).includes("attempt-a"));assert.ok(!JSON.stringify(item).includes("companies/"));});
test("B5 requirement 31: valid technical reference accepted",()=>{const e=evidence();assert.doesNotThrow(()=>validateReasoningResponse(response(e),evidenceReferenceSet(e)));});
test("B5 requirement 32: unknown technical reference rejected in every canonical location",()=>{const e=evidence(),unknown="TECHNICAL_DOCUMENT_"+"f".repeat(64);for(const location of ["evidenceUsed","hypotheses","checks"]){const r=response(e);if(location==="evidenceUsed")r.evidenceUsed.push({category:"TECHNICAL_DOCUMENT",reference:unknown,detail:"forged"});else if(location==="hypotheses")r.hypotheses[0].evidenceReferences.push(unknown);else r.checks[0].evidenceSource=unknown;assert.throws(()=>validateReasoningResponse(r,evidenceReferenceSet(e)));}});
test("B5 requirement 33: provider identity fields rejected",()=>{const e=evidence();assert.throws(()=>validateReasoningResponse({...response(e),technicalCitations:[e.technicalDocuments![0].citation]},evidenceReferenceSet(e)));});
test("B5 requirement 34: server map reconstructs only referenced citations in retrieval order",()=>{const e=evidence([candidate("a"),candidate("b")]);assert.deepEqual(reconstructTechnicalCitations(e,response(e)),[e.technicalDocuments![0].citation]);});
test("B5 requirement 35: fresh post-provider evidence succeeds before persistence",async()=>{const f=execution(evidence());const result=await f.run();assert.equal(result.kind,"SUCCEEDED");assert.equal(f.calls.revalidated,1);assert.equal(f.calls.success,1);});
for(const [n,kind]of [[36,"approval"],[37,"processing"],[38,"ownership"],[39,"hash"],[40,"membership"]]as const)test(`B5 requirement ${n}: changed ${kind} source fails before success`,async()=>{const e=evidence();const f=execution(e,{fresh:()=>{const c=candidate();if(kind==="approval")c.document.approvalStatus="INACTIVE";if(kind==="processing")c.document.processingStatus="PROCESSING";if(kind==="ownership"){c.document.publishedProcessingAttemptId="new";c.page.processingAttemptId="new";}if(kind==="hash")c.document.contentHash=createHash("sha256").update("new").digest("hex");return kind==="membership"?evidence([]):evidence([c]);}});await assert.rejects(f.run);assert.equal(f.calls.success,0);assert.equal(f.calls.provider,1);});
test("B5 requirement 41: stale evidence causes no provider retry",async()=>{const f=execution(evidence(),{fresh:()=>evidence([])});await assert.rejects(f.run);assert.equal(f.calls.provider,1);assert.equal(f.calls.reserve,1);});
test("B5 requirement 42: current cached technical response safely reused",async()=>{const e=evidence(),r=response(e),f=execution(e,{duplicate:true,prior:technicalAdjunct(e,r)});assert.equal((await f.run()).kind,"DUPLICATE_REUSED");assert.equal(f.calls.provider,0);assert.equal(f.calls.revalidated,1);});
for(const n of [43,44])test(`B5 requirement ${n}: stale cached source denied without provider/reservation retry`,async()=>{const old=evidence(),cached=response(old),fresh=evidence([]),f=execution(fresh,{duplicate:true,prior:technicalAdjunct(old,cached),providerResponse:cached});await assert.rejects(f.run);assert.equal(f.calls.provider,0);assert.equal(f.calls.reserve,1);assert.equal(f.calls.success,0);});
for(const n of [45,46])test(`B5 requirement ${n}: persisted adjunct round-trips without null cursor`,()=>{const e=evidence(),r=response(e),adjunct=technicalAdjunct(e,r),stored=JSON.parse(JSON.stringify(adjunct));assert.deepEqual(validatePersistedTechnicalAdjunct(r,e.question,stored),adjunct);assert.deepEqual(adjunct.technicalRetrievalContext,{question:e.question});assert.ok(!JSON.stringify(adjunct).includes('"cursor"'));});
test("B5 requirement 47: legacy evidence and interaction remain valid",()=>{const e=base(),r=response(e);assert.doesNotThrow(()=>validateReasoningResponse(r,evidenceReferenceSet(e)));assert.deepEqual(validatePersistedTechnicalAdjunct(r,undefined,{}),{});assert.deepEqual(technicalAdjunct(e,r),{});});
test("B5 requirement 48: malformed persisted adjunct and stale cached identity rejected",()=>{const e=evidence(),r=response(e),adjunct=technicalAdjunct(e,r);assert.throws(()=>validatePersistedTechnicalAdjunct(r,e.question,{}));const forged=structuredClone(adjunct);forged.technicalCitations![0].documentId="other";assert.throws(()=>validateCachedTechnicalCitations(e,r,forged));assert.throws(()=>validatePersistedTechnicalAdjunct(r,e.question,{...adjunct,technicalRetrievalContext:{question:"different"}}));});
for(const [n,category,reference]of [[49,"CURRENT_JOB","CURRENT_JOB"],[50,"RELATED_HISTORY","HISTORY_1"],[51,"KNOWN_FIX","KNOWN_FIX_1"],[52,"INTERACTION","INTERACTION_1"]]as const)test(`B5 requirement ${n}: ${category} validation semantics preserved`,()=>{const r=response(base());r.evidenceUsed=[{category,reference,detail:"existing evidence"}];if(n>=50){r.hypotheses.forEach(h=>{h.evidenceReferences=[reference];});r.checks.forEach(c=>{c.evidenceSource=reference;});}const validated=validateReasoningResponse(r,new Set([reference]));assert.deepEqual(validated.evidenceUsed,[{category,reference,detail:"existing evidence"}]);assert.ok(validated.hypotheses.every(h=>h.evidenceReferences.every(ref=>ref===reference)));assert.ok(validated.checks.every(c=>c.evidenceSource===reference));});
test("B5 additional: mandatory limitations reserve room and deduplicate",()=>{const e=evidence([]);e.technicalRetrievalCoverage!.coverageLimited=true;e.technicalEvidenceOmitted=true;const r=response(e,false);r.limitations=Array.from({length:12},(_,i)=>"Provider limitation "+i);const final=addTechnicalLimitations(r,e);assert.ok(final.limitations.length<=12);for(const value of Object.values(TECHNICAL_LIMITATIONS))assert.ok(final.limitations.includes(value));assert.deepEqual(final,addTechnicalLimitations(final,e));});
test("B5 additional: provider budget checks post-redaction expansion",()=>{const e=evidence([candidate("a","P0087 "+"a@b.co ".repeat(100))]);const p=prepareHostedReasoningEvidence(e);assert.ok(p.technicalDocuments![0].redactedExcerpt.length>e.technicalDocuments![0].excerpt.length);const bare={...e,technicalDocuments:[],technicalEvidenceOmitted:true};const limit=Math.max(JSON.stringify(bare).length,JSON.stringify(prepareHostedReasoningEvidence(bare)).length);const result=selectTechnicalProviderSubset(e,limit,prepareHostedReasoningEvidence);assert.equal(result.technicalDocuments!.length,0);assert.equal(result.technicalEvidenceOmitted,true);});
test("B5 additional: missing fresh-revalidation seam fails closed for technical result",async()=>{const f=execution(evidence());delete f.controls.revalidateTechnicalEvidence;await assert.rejects(f.run);assert.equal(f.calls.success,0);});

test("B5 additional 45-48: actual assessment service returns adjunct, skips malformed newest, preserves legacy",async()=>{
  const b=fixtureBridge();Reflect.set(globalThis,bridgeKey,b);
  const e=evidence(),r=response(e),adjunct=technicalAdjunct(e,r);
  b.records=[{id:"valid",data:()=>({success:true,response:r,question:e.question,...adjunct})}];
  const result=await assessmentService.getIQ200SessionAssessment(asContext(b),"job-a","session-a");
  assert.deepEqual(result.assessment?.technicalCitations,adjunct.technicalCitations);
  assert.deepEqual(result.assessment?.technicalRetrievalContext,{question:e.question});
  const legacy=response(base());
  b.records=[{id:"malformed",data:()=>({success:true,response:r,question:e.question,technicalCitations:[{documentId:"forged"}],technicalRetrievalContext:{question:e.question}})},{id:"legacy",data:()=>({success:true,response:legacy})}];
  const fallback=await assessmentService.getIQ200SessionAssessment(asContext(b),"job-a","session-a");
  assert.deepEqual(fallback.assessment?.evidenceUsed,legacy.evidenceUsed);
  assert.ok(!Object.hasOwn(fallback.assessment!,"technicalCitations"));
});
test("B5 additional: successful hosted orchestration persists only server citation adjunct",async()=>{
  const e=evidence(),f=execution(e);await f.run();
  const stored=f.stored as ReturnType<typeof technicalAdjunct>;
  assert.deepEqual(stored.technicalCitations,[e.technicalDocuments![0].citation]);
  assert.deepEqual(stored.technicalRetrievalContext,{question:e.question});
});
test("B5 additional: unused changed source does not invalidate referenced source",async()=>{
  const e=evidence([candidate("a"),candidate("b")]),f=execution(e,{fresh:()=>evidence([candidate("a")])});
  assert.equal((await f.run()).kind,"SUCCEEDED");
});
