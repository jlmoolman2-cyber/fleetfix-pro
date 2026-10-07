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

export type JobKnowledgeCitation = {
  evidenceReference: string;
  documentId: string;
  documentTitle: string;
  documentContentHash: string;
  pageId: string;
  pageIndex: number;
  displayPageNumber: string;
  textContentHash: string;
  originalFilename: string;
  processingAttemptId: string;
  processingInvocationId: string;
  excerpt: string;
  relevanceReasons: string[];
  supportingPageReference: { documentId: string; pageId: string };
  evidenceCategory: "TECHNICAL_DOCUMENT";
};

export type JobKnowledgeResult = { relevance: number[]; citation: JobKnowledgeCitation };
export type JobKnowledgeCoverage = {
  candidateDocumentsConsidered: number;
  candidatePagesConsidered: number;
  resultsReturned: number;
  truncated: boolean;
  coverageLimited: boolean;
  invalidCandidates: number;
  emptyTextPages: number;
  reasoningEvidenceLength: number;
};
export type JobKnowledgeEvidence = { category: "TECHNICAL_DOCUMENT"; reference: string; excerpt: string; citation: JobKnowledgeCitation };
export type JobKnowledgeResponse = {
  results: JobKnowledgeResult[];
  evidence: JobKnowledgeEvidence[];
  coverage: JobKnowledgeCoverage;
  continuationCursor: string | null;
};
export type JobKnowledgeRequestResult = { httpStatus: number; data: JobKnowledgeResponse };
export type JobKnowledgePageResolution = { citation: JobKnowledgeCitation; imageWidth: number | null; imageHeight: number | null };

const KNOWLEDGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const KNOWLEDGE_EVIDENCE_REFERENCE_PATTERN = /^TECHNICAL_DOCUMENT_[a-f0-9]{64}$/;
const KNOWLEDGE_HASH_PATTERN = /^[a-f0-9]{64}$/;
const KNOWLEDGE_PAGE_ID_PATTERN = /^page-\d{6}$/;
const KNOWLEDGE_MAX_PAGE_INDEX = 1999;
const KNOWLEDGE_MAX_RESULTS = 5;
const KNOWLEDGE_MAX_CANDIDATE_DOCUMENTS = 50;
const KNOWLEDGE_MAX_CANDIDATE_PAGES = 200;
const KNOWLEDGE_MAX_EVIDENCE_LENGTH = 6000;

export function createIQ200SessionIdempotencyKey(): string {
  return crypto.randomUUID();
}

export async function iq200ApiResponse(path: string, init?: IQ200ApiOptions): Promise<Response> {
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

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const serverMessage = payload?.error?.message || null;
    const fallbackMessage = getHttpErrorMessage(response.status);
    throw new IQ200ApiError("http", serverMessage || fallbackMessage, response.status, serverMessage);
  }

  return response;
}

export async function iq200Api<T>(path: string, init?: IQ200ApiOptions): Promise<T> {
  const response = await iq200ApiResponse(path, init);
  const payload = await response.json().catch(() => ({}));
  return payload as T;
}

export async function iq200ApiBlob(path: string, init?: IQ200ApiOptions): Promise<Blob> {
  const response = await iq200ApiResponse(path, init);
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "image/png") throw new IQ200ApiError("http", "The supporting image response was not PNG data.", 502);
  return response.blob();
}

export interface ObjectUrlRegistry {
  create(key: string, blob: Blob): string;
  revoke(key: string): void;
  revokeAll(): void;
}

export function createObjectUrlRegistry(
  createUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
  revokeUrl: (url: string) => void = (url) => URL.revokeObjectURL(url),
): ObjectUrlRegistry {
  const urls = new Map<string, string>();
  return {
    create(key, blob) {
      const existing = urls.get(key);
      if (existing) revokeUrl(existing);
      const url = createUrl(blob);
      urls.set(key, url);
      return url;
    },
    revoke(key) {
      const url = urls.get(key);
      if (!url) return;
      urls.delete(key);
      revokeUrl(url);
    },
    revokeAll() {
      const activeUrls = [...urls.values()];
      urls.clear();
      activeUrls.forEach(revokeUrl);
    },
  };
}

export type CommissioningCitationGeneration = { generation: number; evidenceReference: string };

export interface CommissioningResultGeneration {
  invalidate(): number;
  activate(evidenceReferences: string[]): number;
  capture(evidenceReference: string): CommissioningCitationGeneration | null;
  isCurrent(citation: CommissioningCitationGeneration): boolean;
  current(): number;
}

export function createCommissioningResultGeneration(): CommissioningResultGeneration {
  let generation = 0;
  let activeEvidenceReferences = new Set<string>();
  return {
    invalidate() {
      generation += 1;
      activeEvidenceReferences = new Set();
      return generation;
    },
    activate(evidenceReferences) {
      generation += 1;
      activeEvidenceReferences = new Set(evidenceReferences);
      return generation;
    },
    capture(evidenceReference) {
      return activeEvidenceReferences.has(evidenceReference) ? { generation, evidenceReference } : null;
    },
    isCurrent(citation) {
      return citation.generation === generation && activeEvidenceReferences.has(citation.evidenceReference);
    },
    current() {
      return generation;
    },
  };
}

function validJobId(value: string): boolean {
  return KNOWLEDGE_ID_PATTERN.test(value);
}

function validQuestion(value: string): boolean {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= 2000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isKnowledgeCitation(value: unknown): value is JobKnowledgeCitation {
  if (!isRecord(value) || !hasExactKeys(value, [
    "evidenceReference", "documentId", "documentTitle", "documentContentHash", "pageId", "pageIndex",
    "displayPageNumber", "textContentHash", "originalFilename", "processingAttemptId",
    "processingInvocationId", "excerpt", "relevanceReasons", "supportingPageReference", "evidenceCategory",
  ])) return false;
  if (!KNOWLEDGE_EVIDENCE_REFERENCE_PATTERN.test(String(value.evidenceReference)) ||
    !KNOWLEDGE_ID_PATTERN.test(String(value.documentId)) ||
    !nonEmptyString(value.documentTitle) ||
    !KNOWLEDGE_HASH_PATTERN.test(String(value.documentContentHash)) ||
    typeof value.pageId !== "string" || !KNOWLEDGE_PAGE_ID_PATTERN.test(value.pageId) ||
    !Number.isSafeInteger(value.pageIndex) || (value.pageIndex as number) < 0 || (value.pageIndex as number) > KNOWLEDGE_MAX_PAGE_INDEX ||
    value.pageId !== `page-${String((value.pageIndex as number) + 1).padStart(6, "0")}` ||
    value.displayPageNumber !== String((value.pageIndex as number) + 1) ||
    !KNOWLEDGE_HASH_PATTERN.test(String(value.textContentHash)) ||
    !nonEmptyString(value.originalFilename) ||
    !KNOWLEDGE_ID_PATTERN.test(String(value.processingAttemptId)) ||
    !KNOWLEDGE_ID_PATTERN.test(String(value.processingInvocationId)) ||
    typeof value.excerpt !== "string" || value.excerpt.length > 1200 ||
    !Array.isArray(value.relevanceReasons) || !value.relevanceReasons.every((reason) => typeof reason === "string") ||
    value.evidenceCategory !== "TECHNICAL_DOCUMENT" ||
    !isRecord(value.supportingPageReference) ||
    !hasExactKeys(value.supportingPageReference, ["documentId", "pageId"]) ||
    value.supportingPageReference.documentId !== value.documentId ||
    value.supportingPageReference.pageId !== value.pageId) return false;
  return true;
}

function isKnowledgeCoverage(value: unknown, resultCount: number): value is JobKnowledgeCoverage {
  if (!isRecord(value) || !hasExactKeys(value, [
    "candidateDocumentsConsidered", "candidatePagesConsidered", "resultsReturned", "truncated",
    "coverageLimited", "invalidCandidates", "emptyTextPages", "reasoningEvidenceLength",
  ])) return false;
  const nonNegativeInteger = (item: unknown): item is number => Number.isSafeInteger(item) && (item as number) >= 0;
  return nonNegativeInteger(value.candidateDocumentsConsidered) && value.candidateDocumentsConsidered <= KNOWLEDGE_MAX_CANDIDATE_DOCUMENTS &&
    nonNegativeInteger(value.candidatePagesConsidered) && value.candidatePagesConsidered <= KNOWLEDGE_MAX_CANDIDATE_PAGES &&
    value.resultsReturned === resultCount && resultCount <= KNOWLEDGE_MAX_RESULTS &&
    typeof value.truncated === "boolean" && typeof value.coverageLimited === "boolean" &&
    nonNegativeInteger(value.invalidCandidates) && nonNegativeInteger(value.emptyTextPages) &&
    nonNegativeInteger(value.reasoningEvidenceLength) && value.reasoningEvidenceLength <= KNOWLEDGE_MAX_EVIDENCE_LENGTH;
}

function sameKnowledgeCitation(left: JobKnowledgeCitation, right: JobKnowledgeCitation): boolean {
  return left.evidenceReference === right.evidenceReference &&
    left.documentId === right.documentId &&
    left.documentTitle === right.documentTitle &&
    left.documentContentHash === right.documentContentHash &&
    left.pageId === right.pageId &&
    left.pageIndex === right.pageIndex &&
    left.displayPageNumber === right.displayPageNumber &&
    left.textContentHash === right.textContentHash &&
    left.originalFilename === right.originalFilename &&
    left.processingAttemptId === right.processingAttemptId &&
    left.processingInvocationId === right.processingInvocationId &&
    left.excerpt === right.excerpt &&
    left.evidenceCategory === right.evidenceCategory &&
    left.relevanceReasons.length === right.relevanceReasons.length &&
    left.relevanceReasons.every((reason, index) => reason === right.relevanceReasons[index]) &&
    left.supportingPageReference.documentId === right.supportingPageReference.documentId &&
    left.supportingPageReference.pageId === right.supportingPageReference.pageId;
}

function isJobKnowledgeResponse(value: unknown): value is JobKnowledgeResponse {
  if (!isRecord(value) || !hasExactKeys(value, ["results", "evidence", "coverage", "continuationCursor"])) return false;
  if (!Array.isArray(value.results) || !Array.isArray(value.evidence) || value.results.length > KNOWLEDGE_MAX_RESULTS || value.evidence.length !== value.results.length) return false;
  if (value.continuationCursor !== null && (typeof value.continuationCursor !== "string" || !KNOWLEDGE_ID_PATTERN.test(value.continuationCursor))) return false;

  const citations: JobKnowledgeCitation[] = [];
  for (const result of value.results) {
    if (!isRecord(result) || !hasExactKeys(result, ["relevance", "citation"]) || !Array.isArray(result.relevance) || result.relevance.length !== 6 ||
      !result.relevance.every((score) => Number.isSafeInteger(score) && (score as number) >= 0) || !isKnowledgeCitation(result.citation)) return false;
    citations.push(result.citation);
  }
  for (let index = 0; index < value.evidence.length; index++) {
    const entry = value.evidence[index];
    const citation = citations[index];
    if (!isRecord(entry) || !hasExactKeys(entry, ["category", "reference", "excerpt", "citation"]) ||
      entry.category !== "TECHNICAL_DOCUMENT" || entry.reference !== citation.evidenceReference ||
      entry.excerpt !== citation.excerpt || !isKnowledgeCitation(entry.citation) ||
      !sameKnowledgeCitation(entry.citation, citation)) return false;
  }
  return isKnowledgeCoverage(value.coverage, value.results.length);
}

function assertResolvableCitation(citation: JobKnowledgeCitation): void {
  const reference = citation.supportingPageReference;
  if (
    !KNOWLEDGE_EVIDENCE_REFERENCE_PATTERN.test(citation.evidenceReference) ||
    !validJobId(citation.documentId) ||
    !validJobId(citation.pageId) ||
    !reference ||
    reference.documentId !== citation.documentId ||
    reference.pageId !== citation.pageId
  ) throw new IQ200ApiError("http", "The returned Knowledge citation is invalid.", 400);
}

export async function fetchJobKnowledge(jobId: string, question: string, cursor?: string): Promise<JobKnowledgeRequestResult> {
  if (!validJobId(jobId) || !validQuestion(question) || (cursor !== undefined && !validJobId(cursor))) {
    throw new IQ200ApiError("http", "A valid job ID, question, and cursor are required.", 422);
  }
  const body = { question: question.trim(), ...(cursor ? { cursor } : {}) };
  const response = await iq200ApiResponse(`/api/iq200/jobs/${encodeURIComponent(jobId)}/knowledge`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!isJobKnowledgeResponse(payload)) throw new IQ200ApiError("http", "The Knowledge retrieval response was invalid.", 502);
  return { httpStatus: response.status, data: payload };
}

export async function resolveJobKnowledgePage(
  jobId: string,
  question: string,
  citation: JobKnowledgeCitation,
): Promise<JobKnowledgePageResolution> {
  if (!validJobId(jobId) || !validQuestion(question)) throw new IQ200ApiError("http", "A valid job ID and question are required.", 422);
  assertResolvableCitation(citation);
  return iq200Api<JobKnowledgePageResolution>(
    `/api/iq200/jobs/${encodeURIComponent(jobId)}/knowledge/${encodeURIComponent(citation.supportingPageReference.documentId)}/pages/${encodeURIComponent(citation.supportingPageReference.pageId)}`,
    { method: "POST", body: JSON.stringify({ question: question.trim(), evidenceReference: citation.evidenceReference }) },
  );
}

export async function resolveJobKnowledgeImage(
  jobId: string,
  question: string,
  citation: JobKnowledgeCitation,
): Promise<Blob> {
  if (!validJobId(jobId) || !validQuestion(question)) throw new IQ200ApiError("http", "A valid job ID and question are required.", 422);
  assertResolvableCitation(citation);
  return iq200ApiBlob(
    `/api/iq200/jobs/${encodeURIComponent(jobId)}/knowledge/${encodeURIComponent(citation.supportingPageReference.documentId)}/pages/${encodeURIComponent(citation.supportingPageReference.pageId)}/image`,
    { method: "POST", body: JSON.stringify({ question: question.trim(), evidenceReference: citation.evidenceReference }) },
  );
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

// ── Phase 13D-2: Assessment Retrieval ─────────────────────────

export type IQ200AssessmentSessionDTO = {
  id: string;
  initialQuestion?: string;
  state?: string;
  responseStatus?: string;
  createdAt?: string;
};

export type IQ200AssessmentResult = {
  session: IQ200AssessmentSessionDTO;
  assessment: unknown;
};

export async function fetchSessionAssessment(
  jobId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<IQ200AssessmentResult> {
  return iq200Api<IQ200AssessmentResult>(
    `/api/iq200/jobs/${encodeURIComponent(jobId)}/sessions/${encodeURIComponent(sessionId)}/assessment`,
    signal ? { signal } : {},
  );
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
