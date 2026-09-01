export type WebhookProcessingState = "received" | "processing" | "processed" | "failed" | "retryable" | undefined;

export function shouldProcessWebhook(state: WebhookProcessingState, leaseExpiresAt: number, now: number): boolean {
  if (state === "processed") return false;
  if (state === "processing" && leaseExpiresAt > now) return false;
  return true;
}
