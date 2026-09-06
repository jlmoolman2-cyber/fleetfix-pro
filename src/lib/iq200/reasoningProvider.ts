import "server-only";
import { buildTestReasoningResponse, reasoningEnabled, validateReasoningResponse, type ReasoningEvidence, type ReasoningResponse } from "./reasoningCore";
export type ProviderResult={response:ReasoningResponse;provider:string;model:string;usage:{inputUnits:number|null;outputUnits:number|null}};
export interface IQ200ReasoningProvider{readonly id:string;reason(evidence:ReasoningEvidence,signal?:AbortSignal):Promise<ProviderResult>}
export class DisabledReasoningProvider implements IQ200ReasoningProvider{readonly id="disabled";async reason():Promise<ProviderResult>{throw new Error("REASONING_DISABLED")}}
export class DeterministicTestReasoningProvider implements IQ200ReasoningProvider{
 readonly id="deterministic-test";
 async reason(evidence:ReasoningEvidence):Promise<ProviderResult>{
  const response=validateReasoningResponse(buildTestReasoningResponse(evidence));
  return{response,provider:this.id,model:"fixture-v1",usage:{inputUnits:null,outputUnits:null}};
 }
}
export function configuredReasoningProvider():IQ200ReasoningProvider{return reasoningEnabled()?new DeterministicTestReasoningProvider():new DisabledReasoningProvider()}
