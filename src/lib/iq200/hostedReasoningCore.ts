import { addTechnicalLimitations, selectTechnicalProviderSubset, technicalAdjunct, usedTechnicalReferences, validateCachedTechnicalCitations, type TechnicalCitationAdjunct } from "./technicalReasoningEvidenceCore.ts";
import { evidenceReferenceSet, mergeRequiredSafetyWarnings, ProviderValidationError, validateProviderUsage, validateReasoningResponse, type ReasoningEvidence, type ReasoningResponse } from "./reasoningCore.ts";
import { HostedProviderError, isHostedSafetyReason, type HostedSafetyReason, type HostedValidationReason } from "./hostedTransportCore.ts";

export type HostedExecutionScope={companyId:string;userId:string;jobId:string;sessionId:string;question:string};
export type HostedReservation={duplicate:boolean;inProgress:boolean;retryExhausted:boolean;retry:boolean;requestId:string|null};
export type HostedProviderResult={response:ReasoningResponse;provider:string;model:string;usage:{inputUnits:number|null;outputUnits:number|null}};
export type HostedPriorResult={exists:boolean;success:boolean;interactionId:string|null;response:ReasoningResponse|null}&TechnicalCitationAdjunct;

export type HostedRunErrorCode="REQUEST_IN_PROGRESS"|"RATE_LIMITED"|"COMPANY_LIMIT"|"RETRY_EXHAUSTED"|"TIMEOUT"|"PROVIDER_AUTH"|"PROVIDER_UNAVAILABLE"|"INVALID_PROVIDER_RESPONSE"|"SAFETY_VALIDATION_FAILED"|"STORAGE_FAILURE"|"CONFIGURATION_ERROR"|"DISABLED";
export class HostedRunError extends Error{readonly code:HostedRunErrorCode;constructor(code:HostedRunErrorCode){super(code);this.code=code}}

export type HostedExecutionControls={
 acquireLease(scope:HostedExecutionScope):Promise<{token:string;ref:unknown}>;
 finishLease(lease:{token:string;ref:unknown},outcome:"SUCCEEDED"|"FAILED"):Promise<void>;
 reserve(input:HostedExecutionScope):Promise<HostedReservation>;
 loadPriorResult(requestId:string):Promise<HostedPriorResult>;
 persistSuccess(args:{scope:HostedExecutionScope;requestId:string;response:ReasoningResponse;provider:string;model:string;usage:{inputUnits:number|null;outputUnits:number|null};latencyMs:number}&TechnicalCitationAdjunct):Promise<string>;
 persistFailure(args:{scope:HostedExecutionScope;requestId:string;errorClass:string;validationReason:HostedValidationReason|null;safetyReason:HostedSafetyReason|null;latencyMs:number}):Promise<void>;
 buildEvidence():Promise<ReasoningEvidence>;
 projectEvidence?(evidence:ReasoningEvidence):unknown;
 revalidateTechnicalEvidence?(evidence:ReasoningEvidence,response:ReasoningResponse):Promise<void>;
 provider(evidence:ReasoningEvidence,signal:AbortSignal):Promise<HostedProviderResult>;
 withTimeout<T>(work:(signal:AbortSignal)=>Promise<T>,timeoutMs:number):Promise<T>;
 maxEvidenceChars:number;
 timeoutMs:number;
 now():number;
};

export type HostedExecutionOutcome=
 |{kind:"SUCCEEDED";featureState:"HOSTED";message:string;interactionId:string;requestId:string;response:ReasoningResponse;retried:boolean}&TechnicalCitationAdjunct
 |{kind:"DUPLICATE_IN_PROGRESS";featureState:"HOSTED";message:string;requestId:string;response:null}
 |{kind:"DUPLICATE_REUSED";featureState:"HOSTED";message:string;requestId:string;interactionId:string;response:ReasoningResponse}&TechnicalCitationAdjunct
 |{kind:"RETRY_EXHAUSTED";featureState:"HOSTED";message:string;requestId:string;response:null};

export function mapHostedRunError(error:unknown):HostedRunErrorCode{
 if(error instanceof HostedRunError)return error.code;
 if(error instanceof HostedProviderError)return error.category as HostedRunErrorCode;
 if(error instanceof ProviderValidationError)return"INVALID_PROVIDER_RESPONSE";
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
 const started=controls.now(),rawEvidence=await controls.buildEvidence();
 let evidence:ReasoningEvidence;
 try { evidence=selectTechnicalProviderSubset(rawEvidence,controls.maxEvidenceChars,controls.projectEvidence??(value=>value)); } catch(error) { throw new HostedRunError(mapHostedRunError(error)); }
 let lease:{token:string;ref:unknown}|null=null,reservation:HostedReservation|null=null,requestId:string|null=null,reservedByThisRun=false;
 try{
  lease=await controls.acquireLease(scope);
  reservation=await controls.reserve(scope);requestId=reservation.requestId;
  if(reservation.duplicate&&!reservation.retryExhausted){
   if(reservation.inProgress){await controls.finishLease(lease,"FAILED");lease=null;return{kind:"DUPLICATE_IN_PROGRESS",featureState:"HOSTED",message:"An identical IQ200 reasoning request is already being processed.",requestId:requestId??"",response:null}}
   const prior=await controls.loadPriorResult(requestId??"");
   if(prior.exists&&prior.success&&prior.response){
    const cached=validateReasoningResponse(prior.response,evidenceReferenceSet(evidence));
    validateCachedTechnicalCitations(evidence,cached,prior);
    await revalidateTechnicalRun(controls,evidence,cached);
    const response=validateReasoningResponse(addTechnicalLimitations(cached,evidence),evidenceReferenceSet(evidence));
    const adjunct=technicalAdjunct(evidence,response);
    await controls.finishLease(lease,"FAILED");lease=null;return{kind:"DUPLICATE_REUSED",featureState:"HOSTED",message:"This IQ200 reasoning request was already processed.",requestId:requestId??"",interactionId:prior.interactionId??"",response,...adjunct}}
   throw new HostedRunError("INVALID_PROVIDER_RESPONSE");
  }
  if(reservation.retryExhausted)throw new HostedRunError("RETRY_EXHAUSTED");
  reservedByThisRun=true;
  const result=await controls.withTimeout(signal=>controls.provider(evidence,signal),controls.timeoutMs);
  const allowed=evidenceReferenceSet(evidence),structured=validateReasoningResponse(result.response,allowed),response=validateReasoningResponse(addTechnicalLimitations(mergeRequiredSafetyWarnings(structured,evidence),evidence),allowed),usage=validateProviderUsage(result.usage);
  await revalidateTechnicalRun(controls,evidence,response);
  const adjunct=technicalAdjunct(evidence,response);
  const interactionId=await controls.persistSuccess({scope,requestId:requestId??"",response,provider:result.provider,model:result.model,usage,latencyMs:controls.now()-started,...adjunct});
  await controls.finishLease(lease,"SUCCEEDED");lease=null;
  return{kind:"SUCCEEDED",featureState:"HOSTED",message:"Hosted IQ200 reasoning generated.",interactionId,requestId:requestId??"",response,retried:reservation.retry===true,...adjunct};
 }catch(error){
  const errorClass=mapHostedRunError(error);
  const validationReason=errorClass==="INVALID_PROVIDER_RESPONSE"?(error instanceof HostedProviderError?error.validationReason:error instanceof ProviderValidationError?error.validationReason:null):null;
  const safetyReason=errorClass==="SAFETY_VALIDATION_FAILED"&&error instanceof HostedProviderError&&isHostedSafetyReason(error.safetyReason)?error.safetyReason:null;
  if(requestId&&reservedByThisRun){try{await controls.persistFailure({scope,requestId,errorClass,validationReason,safetyReason,latencyMs:controls.now()-started})}catch{}}
  if(lease){try{await controls.finishLease(lease,"FAILED")}catch{}}
  throw error instanceof HostedRunError?error:new HostedRunError(errorClass);
 }
}

async function revalidateTechnicalRun(controls:HostedExecutionControls,evidence:ReasoningEvidence,response:ReasoningResponse):Promise<void>{
 if(!usedTechnicalReferences(response).size)return;
 if(!controls.revalidateTechnicalEvidence)throw new ProviderValidationError("EVIDENCE_UNKNOWN");
 await controls.revalidateTechnicalEvidence(evidence,response);
}
