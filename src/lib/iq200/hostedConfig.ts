export const IQ200_HOSTED_POLICY_VERSION = "iq200-hosted-policy-v1";
export const IQ200_HOSTED_COMMISSIONING_ARMED = false;

export type HostedReasoningConfig = {
  reasoningEnabled:boolean; hostedEnabled:boolean; environment:"staging"|"production"|"invalid";
  provider:"openai"|"disabled"; model:string|null; credentialPresent:boolean;
  limits:{perUser:number;perCompany:number;perSession:number;companyPeriodRequests:number;periodSeconds:number;maxInputChars:number;maxOutputChars:number;maxOutputTokens:number}|null;
};

const positive=(value:string|undefined,min:number,max:number)=>{const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>=min&&parsed<=max?parsed:null};
export function hostedReasoningConfig(env:Record<string,string|undefined>={}):HostedReasoningConfig{
 const environment=env.FLEETFIX_ENVIRONMENT==="staging"?"staging":env.FLEETFIX_ENVIRONMENT==="production"?"production":"invalid";
 const provider=env.IQ200_HOSTED_PROVIDER==="openai"?"openai":"disabled";
 const values=[positive(env.IQ200_RATE_USER_PER_HOUR,1,100),positive(env.IQ200_RATE_COMPANY_PER_HOUR,1,1000),positive(env.IQ200_RATE_SESSION_PER_HOUR,1,50),positive(env.IQ200_COMPANY_PERIOD_REQUESTS,1,10000),positive(env.IQ200_LIMIT_PERIOD_SECONDS,60,86400),positive(env.IQ200_MAX_INPUT_CHARS,1000,100000),positive(env.IQ200_MAX_OUTPUT_CHARS,1000,50000),positive(env.IQ200_MAX_OUTPUT_TOKENS,128,8192)];
 const limits=values.every(value=>value!==null)?{perUser:values[0]!,perCompany:values[1]!,perSession:values[2]!,companyPeriodRequests:values[3]!,periodSeconds:values[4]!,maxInputChars:values[5]!,maxOutputChars:values[6]!,maxOutputTokens:values[7]!}:null;
 const model=typeof env.IQ200_HOSTED_MODEL==="string"&&/^[A-Za-z0-9._-]{1,100}$/.test(env.IQ200_HOSTED_MODEL)?env.IQ200_HOSTED_MODEL:null;
 return{reasoningEnabled:env.IQ200_REASONING_ENABLED==="true",hostedEnabled:env.IQ200_HOSTED_PROVIDER_ENABLED==="true",environment,provider,model,credentialPresent:env.IQ200_HOSTED_CREDENTIAL_PRESENT==="true",limits};
}
export function hostedExecutionAllowed(config:HostedReasoningConfig){return IQ200_HOSTED_COMMISSIONING_ARMED&&config.reasoningEnabled&&config.hostedEnabled&&config.environment==="staging"&&config.provider==="openai"&&Boolean(config.model&&config.credentialPresent&&config.limits)}
export function hostedCommissioningReadiness(env:Record<string,string|undefined>={}){const config=hostedReasoningConfig(env);const checks={staging:config.environment==="staging",reasoningEnabled:config.reasoningEnabled,hostedEnabled:config.hostedEnabled,providerSelected:config.provider==="openai",modelConfigured:Boolean(config.model),credentialPresent:config.credentialPresent,rateAndCostControlsConfigured:Boolean(config.limits),transportAvailable:config.provider==="openai",policyVersion:IQ200_HOSTED_POLICY_VERSION};return{...checks,liveCommissioningAllowed:hostedExecutionAllowed(config)};}
