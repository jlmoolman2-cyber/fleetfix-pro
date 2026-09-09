import "server-only";
import { buildHostedProviderRequest, validateHostedAdvisoryResponse } from "./hostedEvidence";
import { hostedExecutionAllowed, IQ200_HOSTED_POLICY_VERSION, type HostedReasoningConfig } from "./hostedConfig";
import { HostedProviderError, HostedSafetyValidationError, safeHostedFailure } from "./hostedTransportCore";
import { evidenceReferenceSet, mergeRequiredSafetyWarnings, ProviderValidationError, validateProviderUsage, validateReasoningResponse, type ReasoningEvidence } from "./reasoningCore";
import type { IQ200ReasoningProvider, ProviderResult } from "./reasoningProvider";

export type HostedTransportResponse={response:unknown;usage:unknown};
export interface HostedReasoningTransport{send(request:ReturnType<typeof buildHostedProviderRequest>,options:{apiKey:string;model:string;signal:AbortSignal}):Promise<HostedTransportResponse>}
export class HostedReasoningProvider implements IQ200ReasoningProvider{
 readonly id="openai";readonly policyVersion=IQ200_HOSTED_POLICY_VERSION;
 constructor(private readonly config:HostedReasoningConfig,private readonly apiKey:string,private readonly transport:HostedReasoningTransport,private readonly gate:(config:HostedReasoningConfig)=>boolean=hostedExecutionAllowed){}
 async reason(evidence:ReasoningEvidence,signal?:AbortSignal):Promise<ProviderResult>{
  if(!this.gate(this.config)||!this.config.model||!this.config.limits||!this.apiKey)throw new HostedProviderError("DISABLED");
  const request=buildHostedProviderRequest(evidence,this.config.limits.maxOutputTokens),serialized=JSON.stringify(request.untrustedEvidence);if(serialized.length>this.config.limits.maxInputChars)throw new HostedProviderError("COMPANY_LIMIT");
  try{const result=await this.transport.send(request,{apiKey:this.apiKey,model:this.config.model,signal:signal||new AbortController().signal});if(JSON.stringify(result.response).length>this.config.limits.maxOutputChars)throw new HostedProviderError("INVALID_PROVIDER_RESPONSE","RESPONSE_SIZE_LIMIT");let response;try{const advisory=validateHostedAdvisoryResponse(result.response),structured=validateReasoningResponse(advisory);response=validateReasoningResponse(mergeRequiredSafetyWarnings(structured,evidence),evidenceReferenceSet(evidence))}catch(error){if(error instanceof ProviderValidationError)throw new HostedProviderError("INVALID_PROVIDER_RESPONSE",error.validationReason);if(error instanceof HostedSafetyValidationError)throw new HostedProviderError("SAFETY_VALIDATION_FAILED",null,error.safetyReason);throw new HostedProviderError("INVALID_PROVIDER_RESPONSE","RESPONSE_SHAPE")}let usage;try{usage=validateProviderUsage(result.usage)}catch(error){throw new HostedProviderError("INVALID_PROVIDER_RESPONSE",error instanceof ProviderValidationError?error.validationReason:"USAGE_INVALID")}return{response,provider:this.id,model:this.config.model,usage}}catch(error){const category=safeHostedFailure(error,Boolean(signal?.aborted));throw new HostedProviderError(category,category==="INVALID_PROVIDER_RESPONSE"&&error instanceof HostedProviderError?error.validationReason:null,category==="SAFETY_VALIDATION_FAILED"&&error instanceof HostedProviderError?error.safetyReason:null)}
 }
}
