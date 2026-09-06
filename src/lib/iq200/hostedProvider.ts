import "server-only";
import { buildHostedProviderRequest, validateHostedAdvisoryResponse } from "./hostedEvidence";
import { hostedExecutionAllowed, IQ200_HOSTED_POLICY_VERSION, type HostedReasoningConfig } from "./hostedConfig";
import { HostedProviderError, safeHostedFailure } from "./hostedTransportCore";
import { validateProviderUsage, validateReasoningResponse, type ReasoningEvidence } from "./reasoningCore";
import type { IQ200ReasoningProvider, ProviderResult } from "./reasoningProvider";

export type HostedTransportResponse={response:unknown;usage:unknown};
export interface HostedReasoningTransport{send(request:ReturnType<typeof buildHostedProviderRequest>,options:{apiKey:string;model:string;signal:AbortSignal}):Promise<HostedTransportResponse>}
export class HostedReasoningProvider implements IQ200ReasoningProvider{
 readonly id="openai";readonly policyVersion=IQ200_HOSTED_POLICY_VERSION;
 constructor(private readonly config:HostedReasoningConfig,private readonly apiKey:string,private readonly transport:HostedReasoningTransport){}
 async reason(evidence:ReasoningEvidence,signal?:AbortSignal):Promise<ProviderResult>{
  if(!hostedExecutionAllowed(this.config)||!this.config.model||!this.config.limits||!this.apiKey)throw new HostedProviderError("DISABLED");
  const request=buildHostedProviderRequest(evidence,this.config.limits.maxOutputTokens),serialized=JSON.stringify(request.untrustedEvidence);if(serialized.length>this.config.limits.maxInputChars)throw new HostedProviderError("COMPANY_LIMIT");
  try{const result=await this.transport.send(request,{apiKey:this.apiKey,model:this.config.model,signal:signal||new AbortController().signal});if(JSON.stringify(result.response).length>this.config.limits.maxOutputChars)throw new HostedProviderError("INVALID_PROVIDER_RESPONSE");let response;try{response=validateReasoningResponse(validateHostedAdvisoryResponse(result.response))}catch(error){throw new HostedProviderError(error instanceof Error&&error.message==="SAFETY_VALIDATION_FAILED"?"SAFETY_VALIDATION_FAILED":"INVALID_PROVIDER_RESPONSE")}return{response,provider:this.id,model:this.config.model,usage:validateProviderUsage(result.usage)}}catch(error){throw new HostedProviderError(safeHostedFailure(error,Boolean(signal?.aborted)))}
 }
}
