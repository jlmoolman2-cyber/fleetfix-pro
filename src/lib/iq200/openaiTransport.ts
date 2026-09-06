import "server-only";
import OpenAI from "openai";
import type { HostedReasoningTransport } from "./hostedProvider";
import { CoreOpenAIReasoningTransport, type OpenAIClientFactory, type OpenAIResponsesClient } from "./openaiTransportCore";

export { IQ200_OPENAI_RESPONSE_SCHEMA, classifyOpenAITransportError, openAIResponsesBody, parseOpenAIResponseEnvelope, CoreOpenAIReasoningTransport, type OpenAIResponseEnvelope, type OpenAIClientFactory, type OpenAIResponsesClient } from "./openaiTransportCore";

export function createOpenAIResponsesClient(apiKey: string): OpenAIResponsesClient { return new OpenAI({ apiKey, maxRetries: 0 }) as unknown as OpenAIResponsesClient }
export class OpenAIReasoningTransport extends CoreOpenAIReasoningTransport implements HostedReasoningTransport {
    constructor(clientFactory: OpenAIClientFactory = createOpenAIResponsesClient) { super(clientFactory) }
}
