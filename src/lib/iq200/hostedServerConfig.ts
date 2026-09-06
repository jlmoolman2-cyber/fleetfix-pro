import "server-only";
import { hostedCommissioningReadiness, hostedReasoningConfig } from "./hostedConfig";

function serverEnvironment(){return{...process.env,IQ200_HOSTED_CREDENTIAL_PRESENT:Boolean(process.env.OPENAI_API_KEY?.trim())?"true":"false"}}
export function getHostedReasoningServerConfig(){return hostedReasoningConfig(serverEnvironment())}
export function getHostedCommissioningReadiness(){return hostedCommissioningReadiness(serverEnvironment())}
export function getOpenAICredential(){const value=process.env.OPENAI_API_KEY?.trim();if(!value)throw new Error("CONFIGURATION_ERROR");return value}
