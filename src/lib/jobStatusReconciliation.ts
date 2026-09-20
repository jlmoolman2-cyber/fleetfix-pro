import {
  CANONICAL_JOB_STATUS_KEYS,
  CANONICAL_JOB_STATUS_LABELS,
  canonicalKeyFromSafeAlias,
  isCanonicalJobStatusKey,
  type CanonicalJobStatusKey,
  type JobStatusDocument,
} from "./jobStatusContract.ts";

export const STATUS_RECONCILIATION_REASON_CODES = [
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "INVALID_REQUEST",
  "INVALID_STATUS_ID",
  "INVALID_SYSTEM_KEY",
  "STATUS_NOT_FOUND",
  "CONFIRMED_NAME_MISMATCH",
  "TARGET_HAS_DIFFERENT_KEY",
  "DUPLICATE_EXPLICIT_KEY",
  "AMBIGUOUS_LEGACY_ALIAS",
  "INVALID_EXISTING_METADATA",
  "CONCURRENT_CONFLICT",
] as const;

export type StatusReconciliationReason = typeof STATUS_RECONCILIATION_REASON_CODES[number];

export class StatusReconciliationError extends Error {
  readonly code: StatusReconciliationReason;
  readonly status: number;

  constructor(code: StatusReconciliationReason, status: number, message: string) {
    super(message);
    this.name = "StatusReconciliationError";
    this.code = code;
    this.status = status;
  }
}

export interface StatusReconciliationRequest {
  statusId: string;
  systemKey: CanonicalJobStatusKey;
  confirmedStatusName: string;
  confirmation: true;
}

export interface ReconciledStatus {
  id: string;
  name: string;
  systemKey: CanonicalJobStatusKey;
}

export type StatusReconciliationPlan =
  | { result: "assigned"; status: ReconciledStatus }
  | { result: "already_assigned"; status: ReconciledStatus };

const REQUEST_KEYS = ["statusId", "systemKey", "confirmedStatusName", "confirmation"];
const STATUS_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_STATUS_NAME_LENGTH = 200;
const PRIVILEGED_ROLES = new Set(["Business Owner", "Administrator", "Super Admin"]);

function fail(code: StatusReconciliationReason, status: number, message: string): never {
  throw new StatusReconciliationError(code, status, message);
}

export function parseStatusReconciliationRequest(value: unknown): StatusReconciliationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("INVALID_REQUEST", 400, "A reconciliation request is required.");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== REQUEST_KEYS.length || keys.some((key) => !REQUEST_KEYS.includes(key))) {
    return fail("INVALID_REQUEST", 400, "The reconciliation request has invalid fields.");
  }
  if (typeof record.statusId !== "string" || !STATUS_ID_PATTERN.test(record.statusId)) {
    return fail("INVALID_STATUS_ID", 400, "The status ID is invalid.");
  }
  if (!isCanonicalJobStatusKey(record.systemKey)) {
    return fail("INVALID_SYSTEM_KEY", 400, "The canonical system key is invalid.");
  }
  if (
    typeof record.confirmedStatusName !== "string"
    || record.confirmedStatusName.length < 1
    || record.confirmedStatusName.length > MAX_STATUS_NAME_LENGTH
    || record.confirmedStatusName.trim() !== record.confirmedStatusName
    || /[\u0000-\u001f\u007f]/.test(record.confirmedStatusName)
  ) {
    return fail("INVALID_REQUEST", 400, "The confirmed status name is invalid.");
  }
  if (record.confirmation !== true) {
    return fail("INVALID_REQUEST", 400, "Explicit confirmation is required.");
  }
  return record as unknown as StatusReconciliationRequest;
}

export function canReconcileJobStatuses(companyUser: Record<string, unknown>): boolean {
  if (typeof companyUser.primaryRole === "string" && PRIVILEGED_ROLES.has(companyUser.primaryRole)) {
    return true;
  }
  const permissions = companyUser.permissions;
  return Boolean(
    permissions
    && typeof permissions === "object"
    && !Array.isArray(permissions)
    && (permissions as Record<string, unknown>)["Manage job settings"] === true,
  );
}

export function isConcurrentTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === 10 || code === "10" || code === "aborted" || code === "ABORTED";
}

export function planStatusReconciliation(
  statuses: readonly JobStatusDocument[],
  requestValue: unknown,
): StatusReconciliationPlan {
  const request = parseStatusReconciliationRequest(requestValue);
  const explicitCounts = new Map<CanonicalJobStatusKey, number>();
  const legacyCounts = new Map<CanonicalJobStatusKey, number>();
  const idCounts = new Map<string, number>();

  for (const status of statuses) {
    idCounts.set(status.id, (idCounts.get(status.id) ?? 0) + 1);
    if (status.systemKey !== undefined) {
      if (!isCanonicalJobStatusKey(status.systemKey)) {
        return fail("INVALID_EXISTING_METADATA", 409, "Existing status metadata is invalid.");
      }
      explicitCounts.set(status.systemKey, (explicitCounts.get(status.systemKey) ?? 0) + 1);
    } else {
      const aliasKey = canonicalKeyFromSafeAlias(status.name);
      if (aliasKey) legacyCounts.set(aliasKey, (legacyCounts.get(aliasKey) ?? 0) + 1);
    }
  }

  if ([...explicitCounts.values()].some((count) => count > 1)) {
    return fail("DUPLICATE_EXPLICIT_KEY", 409, "Duplicate canonical status identity exists.");
  }
  if ((idCounts.get(request.statusId) ?? 0) > 1) {
    return fail("INVALID_EXISTING_METADATA", 409, "Duplicate status identity exists.");
  }

  const target = statuses.find((status) => status.id === request.statusId);
  if (!target) return fail("STATUS_NOT_FOUND", 404, "The selected status was not found.");
  if (typeof target.name !== "string" || target.name !== request.confirmedStatusName) {
    return fail("CONFIRMED_NAME_MISMATCH", 409, "The confirmed status name no longer matches.");
  }
  if (target.systemKey !== undefined && target.systemKey !== request.systemKey) {
    return fail("TARGET_HAS_DIFFERENT_KEY", 409, "The selected status has another canonical identity.");
  }
  if (target.systemKey === undefined && (explicitCounts.get(request.systemKey) ?? 0) > 0) {
    return fail("DUPLICATE_EXPLICIT_KEY", 409, "The canonical status identity is already assigned.");
  }

  const targetAlias = target.systemKey === undefined ? canonicalKeyFromSafeAlias(target.name) : undefined;
  const aliasesForRequestedKey = legacyCounts.get(request.systemKey) ?? 0;
  const otherRequestedAliases = aliasesForRequestedKey - (targetAlias === request.systemKey ? 1 : 0);
  if (aliasesForRequestedKey > 1 || otherRequestedAliases > 0) {
    return fail("AMBIGUOUS_LEGACY_ALIAS", 409, "Legacy status aliases are ambiguous.");
  }

  const status: ReconciledStatus = {
    id: target.id,
    name: target.name,
    systemKey: request.systemKey,
  };
  return target.systemKey === request.systemKey
    ? { result: "already_assigned", status }
    : { result: "assigned", status };
}

// ─── Complete-Collection Canonical Reconciliation Planner ────────────────

export type CanonicalClassification =
  | "EXPLICIT"
  | "LEGACY_ALIAS"
  | "MISSING"
  | "AMBIGUOUS"
  | "INVALID";

export interface CanonicalClassificationDetail {
  key: CanonicalJobStatusKey;
  classification: CanonicalClassification;
  existingDocumentId?: string;
  existingDocumentName?: string;
  reason?: string;
}

export interface CanonicalCreateDefinition {
  name: string;
  systemKey: CanonicalJobStatusKey;
  active: boolean;
  startStatus: boolean;
  color: string;
  sortOrder: number;
}

export interface CanonicalUpdateDefinition {
  documentId: string;
  systemKey: CanonicalJobStatusKey;
}

export interface CanonicalCollectionPlan {
  classifications: CanonicalClassificationDetail[];
  updates: CanonicalUpdateDefinition[];
  creates: CanonicalCreateDefinition[];
  hasErrors: boolean;
  errorReasons: string[];
}

const CANONICAL_CREATE_DEFINITIONS: Readonly<
  Record<CanonicalJobStatusKey, { name: string; color: string; startStatus: boolean }>
> = {
  job_booked: { name: "Job Booked", color: "bg-blue-500", startStatus: true },
  onroute: { name: "Onroute", color: "bg-blue-500", startStatus: false },
  start_work: { name: "Start Work", color: "bg-green-500", startStatus: false },
  job_complete: { name: "Job Complete", color: "bg-emerald-600", startStatus: false },
};

function computeMaxSortOrder(statuses: readonly JobStatusDocument[]): number {
  let max = 0;
  for (const status of statuses) {
    const value = status.sortOrder;
    if (typeof value === "number" && Number.isFinite(value) && value > max) {
      max = value;
    }
  }
  return max;
}

export function planCompleteReconciliation(
  statuses: readonly JobStatusDocument[],
): CanonicalCollectionPlan {
  const classifications: CanonicalClassificationDetail[] = [];
  const updates: CanonicalUpdateDefinition[] = [];
  const creates: CanonicalCreateDefinition[] = [];
  const errorReasons: string[] = [];

  // Phase 1: Check for invalid metadata on ANY existing document
  for (const status of statuses) {
    if (status.systemKey !== undefined && !isCanonicalJobStatusKey(status.systemKey)) {
      return {
        classifications: [{
          key: status.systemKey as CanonicalJobStatusKey,
          classification: "INVALID",
          existingDocumentId: status.id,
          reason: `Document ${status.id} has invalid systemKey: ${String(status.systemKey)}`,
        }],
        updates: [],
        creates: [],
        hasErrors: true,
        errorReasons: [`Invalid systemKey on document ${status.id}`],
      };
    }
  }

  // Phase 2: Classify each canonical key
  const maxSortOrder = computeMaxSortOrder(statuses);
  let nextSortOrder = maxSortOrder + 1;

  for (const key of CANONICAL_JOB_STATUS_KEYS) {
    const explicitDocs = statuses.filter((s) => s.systemKey === key);
    const legacyDocs = statuses.filter(
      (s) => s.systemKey === undefined && canonicalKeyFromSafeAlias(s.name) === key,
    );
    const explicitCount = explicitDocs.length;
    const legacyCount = legacyDocs.length;

    if (explicitCount > 1) {
      classifications.push({
        key, classification: "AMBIGUOUS",
        reason: `Duplicate explicit systemKey "${key}" on ${explicitCount} documents`,
      });
      errorReasons.push(`Duplicate explicit key: ${key}`);
      continue;
    }
    if (legacyCount > 1) {
      classifications.push({
        key, classification: "AMBIGUOUS",
        reason: `Multiple legacy aliases match "${key}": ${legacyCount} found`,
      });
      errorReasons.push(`Ambiguous legacy alias: ${key}`);
      continue;
    }
    if (explicitCount === 1 && legacyCount >= 1) {
      classifications.push({
        key, classification: "AMBIGUOUS",
        reason: `Both explicit and legacy documents exist for "${key}"`,
      });
      errorReasons.push(`Explicit + legacy collision: ${key}`);
      continue;
    }
    if (explicitCount === 1) {
      classifications.push({
        key, classification: "EXPLICIT",
        existingDocumentId: explicitDocs[0].id,
        existingDocumentName: typeof explicitDocs[0].name === "string" ? explicitDocs[0].name : undefined,
      });
      continue;
    }
    if (legacyCount === 1) {
      classifications.push({
        key, classification: "LEGACY_ALIAS",
        existingDocumentId: legacyDocs[0].id,
        existingDocumentName: typeof legacyDocs[0].name === "string" ? legacyDocs[0].name : undefined,
      });
      updates.push({ documentId: legacyDocs[0].id, systemKey: key });
      continue;
    }
    // MISSING
    const def = CANONICAL_CREATE_DEFINITIONS[key];
    classifications.push({
      key, classification: "MISSING",
      reason: `No document exists for canonical key "${key}"`,
    });
    creates.push({
      name: def.name, systemKey: key, active: true,
      startStatus: def.startStatus, color: def.color, sortOrder: nextSortOrder,
    });
    nextSortOrder += 1;
  }

  // Phase 3: Abort if any errors
  if (errorReasons.length > 0) {
    return { classifications, updates: [], creates: [], hasErrors: true, errorReasons };
  }

  // Phase 4: Start status safety
  const existingStartCount = statuses.filter((s) => s.startStatus === true).length;
  const newStartCount = creates.filter((c) => c.startStatus).length;
  if (existingStartCount + newStartCount > 1 && existingStartCount <= 1) {
    return {
      classifications, updates: [], creates: [], hasErrors: true,
      errorReasons: ["Reconciliation would create multiple active start statuses"],
    };
  }

  return { classifications, updates, creates, hasErrors: false, errorReasons: [] };
}
