import { getAuth } from "firebase/auth";

export type IQ200ApiErrorKind = "http" | "network" | "abort";

export class IQ200ApiError extends Error {
  readonly kind: IQ200ApiErrorKind;
  readonly status: number | null;
  readonly serverMessage: string | null;

  constructor(kind: IQ200ApiErrorKind, message: string, status: number | null = null, serverMessage: string | null = null) {
    super(message);
    this.name = "IQ200ApiError";
    this.kind = kind;
    this.status = status;
    this.serverMessage = serverMessage;
  }

  get isAbort(): boolean {
    return this.kind === "abort";
  }

  get isNetwork(): boolean {
    return this.kind === "network";
  }

  get isHttp(): boolean {
    return this.kind === "http";
  }
}

export type IQ200ApiOptions = RequestInit & { signal?: AbortSignal };

export async function iq200Api<T>(path: string, init?: IQ200ApiOptions): Promise<T> {
  const auth = getAuth();
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      signal: init?.signal,
      headers: { "content-type": "application/json", ...(init?.headers || {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
  } catch (error) {
    // Distinguish abort from network failure
    if (error instanceof Error && error.name === "AbortError") {
      throw new IQ200ApiError("abort", "Request was cancelled");
    }
    throw new IQ200ApiError("network", "Network request failed");
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const serverMessage = payload?.error?.message || null;
    const fallbackMessage = getHttpErrorMessage(response.status);
    throw new IQ200ApiError("http", serverMessage || fallbackMessage, response.status, serverMessage);
  }

  return payload as T;
}

function getHttpErrorMessage(status: number): string {
  switch (status) {
    case 401: return "Authentication required";
    case 403: return "Permission denied";
    case 404: return "Resource not found";
    case 409: return "Conflict detected";
    case 422: return "Invalid request";
    case 429: return "Rate limit exceeded";
    case 500: return "Server error";
    default: return "Request failed";
  }
}

/* ═══════════════════════════════════════════════════════════════
 * Phase 13D-1 — Pure helpers for UI state hardening.
 * Framework-agnostic, testable without React or Firebase.
 * ═══════════════════════════════════════════════════════════════ */

// ── Synchronous Submission Guard ──────────────────────────────

export interface SubmissionGuardState { inFlight: boolean }

export function createSubmissionGuard(): SubmissionGuardState {
  return { inFlight: false };
}

export function tryAcquireSubmissionGuard(guard: SubmissionGuardState): boolean {
  if (guard.inFlight) return false;
  guard.inFlight = true;
  return true;
}

export function releaseSubmissionGuard(guard: SubmissionGuardState): void {
  guard.inFlight = false;
}

// ── Request Correlation ───────────────────────────────────────

export interface RequestCorrelationState { currentToken: number }

export function createRequestCorrelation(): RequestCorrelationState {
  return { currentToken: 0 };
}

export function nextRequestToken(correlation: RequestCorrelationState): number {
  correlation.currentToken += 1;
  return correlation.currentToken;
}

export function isCurrentRequest(correlation: RequestCorrelationState, token: number): boolean {
  return correlation.currentToken === token;
}

// ── Error Classification ──────────────────────────────────────

export type IQ200ErrorCategory =
  | "auth" | "permission" | "not_found" | "conflict"
  | "validation" | "rate_limited" | "server" | "network" | "abort" | "unknown";

export function classifyIQ200Error(error: unknown): { category: IQ200ErrorCategory; message: string; retryable: boolean } {
  if (error instanceof IQ200ApiError) {
    if (error.kind === "abort") return { category: "abort", message: "", retryable: false };
    if (error.kind === "network") return { category: "network", message: "A network error occurred. You can try again.", retryable: true };
    switch (error.status) {
      case 401: return { category: "auth", message: "Your session has expired. Please refresh the page.", retryable: false };
      case 403: return { category: "permission", message: error.serverMessage || "You do not have permission to use IQ200.", retryable: false };
      case 404: return { category: "not_found", message: error.serverMessage || "The requested resource was not found.", retryable: false };
      case 409: return { category: "conflict", message: error.serverMessage || "A conflicting request was detected.", retryable: false };
      case 422: return { category: "validation", message: error.serverMessage || "The request could not be processed.", retryable: false };
      case 429: return { category: "rate_limited", message: "IQ200 is temporarily rate-limited. Please wait before trying again.", retryable: false };
      default:
        if (error.status && error.status >= 500) return { category: "server", message: "A server error occurred. You can try again.", retryable: true };
        return { category: "unknown", message: error.serverMessage || "An unexpected error occurred.", retryable: false };
    }
  }
  return { category: "unknown", message: "An unexpected error occurred.", retryable: false };
}

// ── Feature State Classification ──────────────────────────────

export type IQ200FeatureState = "DISABLED" | "TEST_ENABLED" | "HOSTED";

export type FeatureStateClassification =
  | { kind: "unavailable"; message: string }
  | { kind: "available"; message: string };

export function classifyFeatureState(featureState: unknown, message: unknown): FeatureStateClassification {
  const safeMessage = typeof message === "string" && message.trim() ? message.trim() : "";
  if (featureState === "DISABLED") {
    return { kind: "unavailable", message: safeMessage || "IQ200 reasoning is not enabled. Job history and approved Known Fixes remain available." };
  }
  if (featureState === "TEST_ENABLED") {
    return { kind: "available", message: safeMessage || "Deterministic test reasoning generated." };
  }
  if (featureState === "HOSTED") {
    return { kind: "available", message: safeMessage || "Hosted IQ200 reasoning generated." };
  }
  return { kind: "unavailable", message: safeMessage || "IQ200 reasoning state is uncertain. Job history and approved Known Fixes remain available." };
}

// ── Submission State Machine ──────────────────────────────────

export interface SubmissionUIState {
  assessment: unknown | null;
  reasoningMessage: string;
  submissionError: string;
  permissionBlocked: boolean;
}

export function beginSubmission(
  correlation: RequestCorrelationState,
): { token: number; cleared: Pick<SubmissionUIState, "assessment" | "reasoningMessage" | "submissionError"> } {
  const token = nextRequestToken(correlation);
  return { token, cleared: { assessment: null, reasoningMessage: "", submissionError: "" } };
}

export function applySubmissionSuccess(
  correlation: RequestCorrelationState,
  token: number,
  response: unknown | null,
  featureState: unknown,
  message: unknown,
): { stale: boolean; update: Pick<SubmissionUIState, "assessment" | "reasoningMessage" | "submissionError"> } {
  if (!isCurrentRequest(correlation, token)) {
    return { stale: true, update: { assessment: null, reasoningMessage: "", submissionError: "" } };
  }
  const classification = classifyFeatureState(featureState, message);
  if (classification.kind === "unavailable" || !response) {
    return { stale: false, update: { assessment: null, reasoningMessage: classification.message, submissionError: "" } };
  }
  return { stale: false, update: { assessment: response, reasoningMessage: classification.message, submissionError: "" } };
}

export function applySubmissionFailure(
  correlation: RequestCorrelationState,
  token: number,
  error: unknown,
): { stale: boolean; update: Pick<SubmissionUIState, "assessment" | "reasoningMessage" | "submissionError" | "permissionBlocked"> } {
  if (!isCurrentRequest(correlation, token)) {
    return { stale: true, update: { assessment: null, reasoningMessage: "", submissionError: "", permissionBlocked: false } };
  }
  const classified = classifyIQ200Error(error);
  if (classified.category === "abort") {
    return { stale: false, update: { assessment: null, reasoningMessage: "", submissionError: "", permissionBlocked: false } };
  }
  const permissionBlocked = classified.category === "permission";
  return { stale: false, update: { assessment: null, reasoningMessage: "", submissionError: classified.message, permissionBlocked } };
}
