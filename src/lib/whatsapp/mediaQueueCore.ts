export const MEDIA_MAX_ATTEMPTS = 5;
export const MEDIA_LEASE_MILLISECONDS = 2 * 60 * 1000;

export function mediaRetryDelayMilliseconds(attempt: number): number {
  return Math.min(30 * 60 * 1000, 30_000 * (2 ** Math.max(0, attempt - 1)));
}

export function mediaFailureState(attempt: number): "retryable" | "failed" {
  return attempt < MEDIA_MAX_ATTEMPTS ? "retryable" : "failed";
}
