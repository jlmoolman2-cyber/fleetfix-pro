import { WhatsAppError } from "./errors.ts";

export type OutboundFlags = { manual: boolean; automation: boolean; templates: boolean };
export type SendRequestState = "processing" | "accepted" | "failed" | "outcome_unknown";

export function shouldAttemptSend(existingState: SendRequestState | null): boolean {
  return existingState === null;
}

export function defaultOutboundJobId(linkedJobIds: string[]): string | null {
  return linkedJobIds.length === 1 ? linkedJobIds[0] : null;
}

export function outboundFlags(environment: Record<string, string | undefined>): OutboundFlags {
  return {
    manual: environment.WHATSAPP_MANUAL_OUTBOUND_ENABLED === "true",
    automation: environment.WHATSAPP_AUTOMATION_ENABLED === "true",
    templates: environment.WHATSAPP_TEMPLATE_OUTBOUND_ENABLED === "true",
  };
}

export function assertManualOutboundEnabled(environment: Record<string, string | undefined>): void {
  const fleetfixEnvironment = environment.FLEETFIX_ENVIRONMENT || environment.NEXT_PUBLIC_FLEETFIX_ENVIRONMENT;
  if (fleetfixEnvironment !== "staging" || !outboundFlags(environment).manual) {
    throw new WhatsAppError("FORBIDDEN", "Manual WhatsApp sending is disabled.", 403);
  }
}

export function validateManualSendBody(value: unknown): { text: string; clientRequestId: string; jobId: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WhatsAppError("INVALID_INPUT", "Message request is invalid.", 400);
  const input = value as Record<string, unknown>;
  const allowed = new Set(["text", "clientRequestId", "jobId"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new WhatsAppError("INVALID_INPUT", "Message request contains unsupported fields.", 400);
  if (typeof input.text !== "string") throw new WhatsAppError("INVALID_INPUT", "Message text is invalid.", 400);
  const text = input.text.trim();
  if (!text || text.length > 4096) throw new WhatsAppError("INVALID_INPUT", "Message text must contain between 1 and 4096 characters.", 400);
  const clientRequestId = String(input.clientRequestId || "");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(clientRequestId)) throw new WhatsAppError("INVALID_INPUT", "Client request ID is invalid.", 400);
  const jobId = input.jobId == null || input.jobId === "" ? null : String(input.jobId);
  if (jobId && !/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) throw new WhatsAppError("INVALID_INPUT", "Job ID is invalid.", 400);
  return { text, clientRequestId, jobId };
}

export function classifySendFailure(error: unknown): { state: "failed" | "outcome_unknown"; reason: string; retryable: boolean } {
  if (error instanceof WhatsAppError && error.details?.metaStatus) {
    const status = Number(error.details.metaStatus);
    if ([400, 401, 403, 429].includes(status)) return { state: "failed", reason: `META_${status}`, retryable: status === 429 };
    if (status >= 500) return { state: "outcome_unknown", reason: "META_5XX", retryable: false };
  }
  if (error instanceof WhatsAppError && error.code !== "META_ERROR") return { state: "failed", reason: error.code, retryable: error.code === "RATE_LIMITED" };
  return { state: "outcome_unknown", reason: "NETWORK_OR_UNKNOWN", retryable: false };
}
