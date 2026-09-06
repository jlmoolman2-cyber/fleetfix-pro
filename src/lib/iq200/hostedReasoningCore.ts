import { evidenceReferenceSet, mergeRequiredSafetyWarnings, validateProviderUsage, validateReasoningResponse, type ReasoningEvidence, type ReasoningResponse } from "./reasoningCore.ts";
import { HostedProviderError } from "./hostedTransportCore.ts";

export type HostedExecutionScope={companyId:string;userId:string;jobId:string;sessionId:string;question:string};
export type HostedReservation={duplicate:boolean;inProgress:boolean;retryExhausted:boolean;retry:boolean;requestId:string|null};
export type HostedProviderResult={response:ReasoningResponse;provider:string;model:string;usage:{inputUnits:number|null;outputUnits:number|null}};
export type HostedPriorResult={exists:boolean;success:boolean;interactionId:string|null;response:ReasoningResponse|null};

export type HostedRunErrorCode="REQUEST_IN_PROGRESS"|"RATE_LIMITED"|"COMPANY_LIMIT"|"RETRY_EXHAUSTED"|"TIMEOUT"|"PROVIDER_AUTH"|"PROVIDER_UNAVAILABLE"|"INVALID_PROVIDER_RESPONSE"|"SAFETY_VALIDATION_FAILED"|"STORAGE_FAILURE"|"CONFIGURATION_ERROR"|"DISABLED";
export class HostedRunError extends Error{readonly code:HostedRunErrorCode;constructor(code:HostedRunErrorCode){super(code);this.code=code}}

export type HostedExecutionControls={
 acquireLease(scope:HostedExecutionScope):Promise<{token:string;ref:unknown}>;
 finishLease(lease:{token:string;ref:unknown},outcome:"SUCCEEDED"|"FAILED"):Promise<void>;
 reserve(input:HostedExecutionScope):Promise<HostedReservation>;
 loadPriorResult(requestId:string):Promise<HostedPriorResult>;
 persistSuccess(args:{scope:HostedExecutionScope;requestId:string;response:ReasoningResponse;provider:string;model:string;usage:{inputUnits:number|null;outputUnits:number|null};latencyMs:number}):Promise<string>;
 persistFailure(args:{scope:HostedExecutionScope;requestId:string;errorClass:string;latencyMs:number}):Promise<void>;
 buildEvidence():Promise<ReasoningEvidence>;
 provider(evidence:ReasoningEvidence,signal:AbortSignal):Promise<HostedProviderResult>;
 withTimeout<T>(work:(signal:AbortSignal)=>Promise<T>,timeoutMs:number):Promise<T>;
 maxEvidenceChars:number;
 timeoutMs:number;
 now():number;
};

export type HostedExecutionOutcome=
 |{kind:"SUCCEEDED";featureState:"HOSTED";message:string;interactionId:string;requestId:string;response:ReasoningResponse;retried:boolean}
 |{kind:"DUPLICATE_IN_PROGRESS";featureState:"HOSTED";message:string;requestId:string;response:null}
 |{kind:"DUPLICATE_REUSED";featureState:"HOSTED";message:string;requestId:string;interactionId:string;response:ReasoningResponse}
 |{kind:"RETRY_EXHAUSTED";featureState:"HOSTED";message:string;requestId:string;response:null};

export function mapHostedRunError(error:unknown):HostedRunErrorCode{
 if(error instanceof HostedRunError)return error.code;
 if(error instanceof HostedProviderError)return error.category as HostedRunErrorCode;
 if(error instanceof Error){
  const code=error.message;
  if(code==="REQUEST_IN_PROGRESS"||code==="RATE_LIMITED"||code==="COMPANY_LIMIT")return code;
  if(code==="INVALID_LEASE_STATE"||code==="INVALID_IDEMPOTENCY_STATE"||code==="INVALID_RATE_STATE"||code==="INVALID_COMMISSIONING_STATE"||code==="STORAGE_FAILURE")return"STORAGE_FAILURE";
  if(code==="CONFIGURATION_ERROR")return"CONFIGURATION_ERROR";
  if(code==="PROVIDER_TIMEOUT")return"TIMEOUT";
 }
 return"PROVIDER_UNAVAILABLE";
}

export async function runHostedExecutionCore(controls:HostedExecutionControls,scope:HostedExecutionScope):Promise<HostedExecutionOutcome>{
 const started=controls.now(),evidence=await controls.buildEvidence();if(JSON.stringify(evidence).length>controls.maxEvidenceChars)throw new HostedRunError("COMPANY_LIMIT");
 let lease:{token:string;ref:unknown}|null=null,reservation:HostedReservation|null=null,requestId:string|null=null;
 try{
  lease=await controls.acquireLease(scope);
  reservation=await controls.reserve(scope);requestId=reservation.requestId;
  if(reservation.duplicate&&!reservation.retryExhausted){
   if(reservation.inProgress){await controls.finishLease(lease,"FAILED");lease=null;return{kind:"DUPLICATE_IN_PROGRESS",featureState:"HOSTED",message:"An identical IQ200 reasoning request is already being processed.",requestId:requestId??"",response:null}}
   const prior=await controls.loadPriorResult(requestId??"");
   if(prior.exists&&prior.success&&prior.response){await controls.finishLease(lease,"FAILED");lease=null;return{kind:"DUPLICATE_REUSED",featureState:"HOSTED",message:"This IQ200 reasoning request was already processed.",requestId:requestId??"",interactionId:prior.interactionId??"",response:prior.response}}
   throw new HostedRunError("INVALID_PROVIDER_RESPONSE");
  }
  if(reservation.retryExhausted)throw new HostedRunError("RETRY_EXHAUSTED");
  const result=await controls.withTimeout(signal=>controls.provider(evidence,signal),controls.timeoutMs);
  const allowed=evidenceReferenceSet(evidence),structured=validateReasoningResponse(result.response,allowed),response=validateReasoningResponse(mergeRequiredSafetyWarnings(structured,evidence),allowed),usage=validateProviderUsage(result.usage);
  const interactionId=await controls.persistSuccess({scope,requestId:requestId??"",response,provider:result.provider,model:result.model,usage,latencyMs:controls.now()-started});
  await controls.finishLease(lease,"SUCCEEDED");lease=null;
  return{kind:"SUCCEEDED",featureState:"HOSTED",message:"Hosted IQ200 reasoning generated.",interactionId,requestId:requestId??"",response,retried:reservation.retry===true};
 }catch(error){
  const errorClass=mapHostedRunError(error);
  if(requestId){try{await controls.persistFailure({scope,requestId,errorClass,latencyMs:controls.now()-started})}catch{}}
  if(lease){try{await controls.finishLease(lease,"FAILED")}catch{}}
  throw error instanceof HostedRunError?error:new HostedRunError(errorClass);
 }
}
