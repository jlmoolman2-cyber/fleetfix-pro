export const IQ200_HOSTED_POLICY_VERSION = "iq200-hosted-policy-v1";
export const IQ200_HOSTED_COMMISSIONING_ARMED = false;
export const IQ200_PHASE7_COMMISSIONING_ARMED = true;
export const IQ200_PHASE7_MODEL = "gpt-5-mini";

export type HostedReasoningConfig = {
  reasoningEnabled:boolean; hostedEnabled:boolean; environment:"staging"|"production"|"invalid";
  provider:"openai"|"disabled"; model:string|null; credentialPresent:boolean; commissioningEnabled:boolean;
  commissioningTarget:{companyId:string;jobId:string;sessionId:string}|null;
  limits:{perUser:number;perCompany:number;perSession:number;companyPeriodRequests:number;periodSeconds:number;maxInputChars:number;maxOutputChars:number;maxOutputTokens:number}|null;
};

const positive=(value:string|undefined,min:number,max:number)=>{const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>=min&&parsed<=max?parsed:null};
export function hostedReasoningConfig(env:Record<string,string|undefined>={}):HostedReasoningConfig{
 const environment=env.FLEETFIX_ENVIRONMENT==="staging"?"staging":env.FLEETFIX_ENVIRONMENT==="production"?"production":"invalid";
 const provider=env.IQ200_HOSTED_PROVIDER==="openai"?"openai":"disabled";
 const values=[positive(env.IQ200_RATE_USER_PER_HOUR,1,100),positive(env.IQ200_RATE_COMPANY_PER_HOUR,1,1000),positive(env.IQ200_RATE_SESSION_PER_HOUR,1,50),positive(env.IQ200_COMPANY_PERIOD_REQUESTS,1,10000),positive(env.IQ200_LIMIT_PERIOD_SECONDS,60,86400),positive(env.IQ200_MAX_INPUT_CHARS,1000,100000),positive(env.IQ200_MAX_OUTPUT_CHARS,1000,50000),positive(env.IQ200_MAX_OUTPUT_TOKENS,128,8192)];
 const limits=values.every(value=>value!==null)?{perUser:values[0]!,perCompany:values[1]!,perSession:values[2]!,companyPeriodRequests:values[3]!,periodSeconds:values[4]!,maxInputChars:values[5]!,maxOutputChars:values[6]!,maxOutputTokens:values[7]!}:null;
 const model=typeof env.IQ200_HOSTED_MODEL==="string"&&/^[A-Za-z0-9._-]{1,100}$/.test(env.IQ200_HOSTED_MODEL)?env.IQ200_HOSTED_MODEL:null;
 const targetValues=[env.IQ200_PHASE7_COMPANY_ID,env.IQ200_PHASE7_JOB_ID,env.IQ200_PHASE7_SESSION_ID],commissioningTarget=targetValues.every(value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(value!))?{companyId:targetValues[0]!,jobId:targetValues[1]!,sessionId:targetValues[2]!}:null;
 return{reasoningEnabled:env.IQ200_REASONING_ENABLED==="true",hostedEnabled:env.IQ200_HOSTED_PROVIDER_ENABLED==="true",environment,provider,model,credentialPresent:env.IQ200_HOSTED_CREDENTIAL_PRESENT==="true",commissioningEnabled:env.IQ200_PHASE7_COMMISSIONING_ENABLED==="true",commissioningTarget,limits};
}
export function hostedExecutionAllowed(config:HostedReasoningConfig){return IQ200_HOSTED_COMMISSIONING_ARMED===false&&IQ200_PHASE7_COMMISSIONING_ARMED&&config.commissioningEnabled&&config.reasoningEnabled&&config.hostedEnabled&&config.environment==="staging"&&config.provider==="openai"&&config.model===IQ200_PHASE7_MODEL&&Boolean(config.credentialPresent&&config.commissioningTarget&&config.limits)}
export function phase7ScopeAllowed(config:HostedReasoningConfig,scope:{companyId:string;jobId:string;sessionId:string}){const target=config.commissioningTarget;return hostedExecutionAllowed(config)&&Boolean(target&&target.companyId===scope.companyId&&target.jobId===scope.jobId&&target.sessionId===scope.sessionId)}
export function hostedCommissioningReadiness(env:Record<string,string|undefined>={}){const config=hostedReasoningConfig(env);const checks={sourceArmed:IQ200_PHASE7_COMMISSIONING_ARMED,staging:config.environment==="staging",commissioningEnabled:config.commissioningEnabled,reasoningEnabled:config.reasoningEnabled,hostedEnabled:config.hostedEnabled,providerSelected:config.provider==="openai",modelConfigured:Boolean(config.model),approvedModelSelected:config.model===IQ200_PHASE7_MODEL,targetConfigured:Boolean(config.commissioningTarget),credentialPresent:config.credentialPresent,rateAndCostControlsConfigured:Boolean(config.limits),transportAvailable:config.provider==="openai",policyVersion:IQ200_HOSTED_POLICY_VERSION};return{...checks,liveCommissioningAllowed:hostedExecutionAllowed(config)};}
