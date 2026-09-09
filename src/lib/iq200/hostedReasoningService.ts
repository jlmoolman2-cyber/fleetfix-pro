import "server-only";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { ServerAccessError, type ServerUserContext } from "@/lib/serverAuth";
import { hostedExecutionAllowed, phase7ScopeAllowed, type HostedReasoningConfig } from "./hostedConfig";
import { getHostedReasoningServerConfig, getOpenAICredential } from "./hostedServerConfig";
import { HostedReasoningProvider, type HostedReasoningTransport } from "./hostedProvider";
import { OpenAIReasoningTransport } from "./openaiTransport";
import { DisabledReasoningProvider, type IQ200ReasoningProvider } from "./reasoningProvider";
import { acquireHostedSessionLease, finishHostedSessionLease, reserveHostedRequest } from "./hostedControls";
import { HOSTED_REASONING_TIMEOUT_MS, withHostedAbortTimeout } from "./hostedTransportCore";
import { runHostedExecutionCore, HostedRunError, type HostedExecutionControls, type HostedExecutionOutcome, type HostedExecutionScope } from "./hostedReasoningCore.ts";
import type { ReasoningResponse } from "./reasoningCore.ts";
import { evidencePackage } from "./reasoningService";

export function configuredHostedReasoningProvider(transport:HostedReasoningTransport=new OpenAIReasoningTransport(),config:HostedReasoningConfig=getHostedReasoningServerConfig(),keyReader:()=>string=getOpenAICredential,gate:(config:HostedReasoningConfig)=>boolean=hostedExecutionAllowed):IQ200ReasoningProvider{
 if(!gate(config)||!config.model||!config.limits||!config.credentialPresent)return new DisabledReasoningProvider();
 return new HostedReasoningProvider(config,keyReader(),transport,gate);
}

function runHostedServerError(error:unknown):never{
 if(error instanceof ServerAccessError)throw error;
 if(error instanceof HostedRunError){
  if(error.code==="REQUEST_IN_PROGRESS")throw new ServerAccessError("REQUEST_IN_PROGRESS","An IQ200 reasoning request is already in progress for this session.",429);
  if(error.code==="RATE_LIMITED")throw new ServerAccessError("RATE_LIMITED","IQ200 reasoning rate limit reached for this scope.",429);
  if(error.code==="COMPANY_LIMIT"||error.code==="RETRY_EXHAUSTED")throw new ServerAccessError("COMPANY_LIMIT","IQ200 reasoning request limits reached.",429);
  if(error.code==="INVALID_PROVIDER_RESPONSE"||error.code==="SAFETY_VALIDATION_FAILED")throw new ServerAccessError("REASONING_UNAVAILABLE","IQ200 reasoning produced an invalid advisory response.",502);
 }
 throw new ServerAccessError("REASONING_UNAVAILABLE","IQ200 hosted reasoning is temporarily unavailable. Job history and approved Known Fixes remain available.",503);
}

function hostedReservation(reservation:Awaited<ReturnType<typeof reserveHostedRequest>>){return{duplicate:reservation.duplicate,inProgress:reservation.inProgress,retryExhausted:reservation.retryExhausted,retry:reservation.retry,requestId:reservation.requestId}}

const PHASE7_RECOVERY_COMMISSIONING={phase:"PHASE_7" as const,maxRequests:1 as const,ledger:"phase7_retry5",idempotencyNamespace:"phase7_retry5"};
const PHASE7_RECOVERY_LEDGER_PATH="iq200_hosted_commissioning/phase7_retry5";

export async function runHostedReasoning(context:ServerUserContext,jobId:string,sessionId:string,question:string,currentData:DocumentData,sessionRef:FirebaseFirestore.DocumentReference,overrides:{config?:HostedReasoningConfig;provider?:IQ200ReasoningProvider;transport?:HostedReasoningTransport;timeoutMs?:number;gate?:(config:HostedReasoningConfig)=>boolean}={}):Promise<HostedExecutionOutcome>{
 const config=overrides.config??getHostedReasoningServerConfig();
 const gate=overrides.gate??hostedExecutionAllowed;
 if(!gate(config)||!config.model||!config.limits)throw new ServerAccessError("FEATURE_DISABLED","IQ200 hosted reasoning is not enabled.",503);
 if(!overrides.gate&&!phase7ScopeAllowed(config,{companyId:context.companyId,jobId,sessionId}))throw new ServerAccessError("FEATURE_DISABLED","IQ200 hosted reasoning is not enabled for this commissioning target.",503);
 const provider=overrides.provider??configuredHostedReasoningProvider(overrides.transport??new OpenAIReasoningTransport(),config,getOpenAICredential,gate);
 if(provider.id==="disabled")throw new ServerAccessError("FEATURE_DISABLED","IQ200 hosted reasoning is not enabled.",503);
 const scope:HostedExecutionScope={companyId:context.companyId,userId:context.uid,jobId,sessionId,question};
 const controls:HostedExecutionControls={
  acquireLease:async inner=>acquireHostedSessionLease({companyId:inner.companyId,jobId:inner.jobId,sessionId:inner.sessionId}),
  finishLease:async(lease,outcome)=>finishHostedSessionLease(lease as Awaited<ReturnType<typeof acquireHostedSessionLease>>,outcome),
  reserve:async inner=>hostedReservation(await reserveHostedRequest({companyId:inner.companyId,userId:inner.userId,jobId:inner.jobId,sessionId:inner.sessionId,question:inner.question,limits:config.limits!},Date.now(),1,PHASE7_RECOVERY_COMMISSIONING)),
  loadPriorResult:async requestId=>{const docs=await sessionRef.collection("interactions").where("requestId","==",requestId).limit(1).get();if(!docs.size)return{exists:false,success:false,interactionId:null,response:null};const doc=docs.docs[0],data=doc.data();if(data.success!==true||!data.response)return{exists:true,success:false,interactionId:doc.id,response:null};return{exists:true,success:true,interactionId:doc.id,response:data.response as ReasoningResponse}},
  persistSuccess:async({scope,requestId,response,provider,model,usage,latencyMs})=>{const interaction=sessionRef.collection("interactions").doc(),requestRef=adminDb.doc(`companies/${scope.companyId}/iq200_hosted_controls/request_${requestId}`),commissioningRef=adminDb.doc(PHASE7_RECOVERY_LEDGER_PATH),batch=adminDb.batch();batch.create(interaction,{companyId:scope.companyId,jobId:scope.jobId,sessionId:scope.sessionId,question:scope.question,response,evidenceReferences:response.evidenceUsed,requestedBy:scope.userId,featureState:"HOSTED",provider,model,usage,requestId,success:true,latencyMs,createdAt:FieldValue.serverTimestamp()});batch.update(sessionRef,{state:"REASONING_AVAILABLE",responseStatus:"STRUCTURED_RESPONSE",updatedAt:FieldValue.serverTimestamp()});batch.update(requestRef,{status:"SUCCEEDED",interactionId:interaction.id,updatedAt:FieldValue.serverTimestamp()});batch.update(commissioningRef,{status:"SUCCEEDED",interactionId:interaction.id,model,usage,latencyMs,updatedAt:FieldValue.serverTimestamp()});await batch.commit();return interaction.id},
  persistFailure:async({scope,requestId,errorClass,validationReason,safetyReason,latencyMs})=>{const interaction=sessionRef.collection("interactions").doc(),requestRef=adminDb.doc(`companies/${scope.companyId}/iq200_hosted_controls/request_${requestId}`),commissioningRef=adminDb.doc(PHASE7_RECOVERY_LEDGER_PATH),batch=adminDb.batch(),safeFailureMetadata=errorClass==="INVALID_PROVIDER_RESPONSE"&&validationReason?{validationReason}:errorClass==="SAFETY_VALIDATION_FAILED"&&safetyReason?{safetyReason}:{};batch.create(interaction,{companyId:scope.companyId,jobId:scope.jobId,sessionId:scope.sessionId,requestedBy:scope.userId,featureState:"HOSTED",provider:"openai",requestId,success:false,errorClass,...safeFailureMetadata,latencyMs,createdAt:FieldValue.serverTimestamp()});batch.update(requestRef,{status:"FAILED",errorClass,...safeFailureMetadata,updatedAt:FieldValue.serverTimestamp()});batch.update(commissioningRef,{status:"FAILED",errorClass,...safeFailureMetadata,latencyMs,updatedAt:FieldValue.serverTimestamp()});await batch.commit()},
  buildEvidence:()=>evidencePackage(context,jobId,currentData,sessionRef,question),
  provider:(evidence,signal)=>provider.reason(evidence,signal),
  withTimeout:withHostedAbortTimeout,
  maxEvidenceChars:config.limits.maxInputChars,
  timeoutMs:overrides.timeoutMs??HOSTED_REASONING_TIMEOUT_MS,
  now:Date.now,
 };
 try{return await runHostedExecutionCore(controls,scope)}catch(error){runHostedServerError(error)}
}
