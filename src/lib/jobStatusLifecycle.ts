import {
  isCanonicalJobStatusKey,
  normalizeJobStatusName,
  type JobStatusDocument,
} from "./jobStatusContract.ts";
import { resolveRuntimeStatus } from "./jobStatusRuntime.ts";

export interface LifecycleStatusDocument extends JobStatusDocument {
  active?: unknown;
  startStatus?: unknown;
}

export type LifecycleSelectionSource =
  | "configured_start"
  | "canonical_fallback"
  | "persisted_target"
  | "contextual_reopen";

export type LifecycleSelectionFailureReason =
  | "multiple_active_start_statuses"
  | "ambiguous_canonical_fallback"
  | "invalid_canonical_metadata"
  | "canonical_target_inactive"
  | "canonical_target_missing"
  | "invalid_target"
  | "multiple_active_reopen_statuses"
  | "reopen_target_missing";

export type LifecycleStatusSelection =
  | {
      kind: "selected";
      statusId: string;
      statusName: string;
      source: LifecycleSelectionSource;
    }
  | {
      kind: "failed";
      reason: LifecycleSelectionFailureReason;
    };

function selectableStatus(
  status: LifecycleStatusDocument,
  source: LifecycleSelectionSource,
): LifecycleStatusSelection {
  const statusId = typeof status.id === "string" ? status.id.trim() : "";
  const statusName = typeof status.name === "string" ? status.name.trim() : "";
  if (!statusId || !statusName) return { kind: "failed", reason: "invalid_target" };
  return { kind: "selected", statusId, statusName, source };
}

export function selectLifecycleStartStatus(
  statuses: readonly LifecycleStatusDocument[],
): LifecycleStatusSelection {
  const activeStartStatuses = statuses.filter(
    (status) => status.active !== false && status.startStatus === true,
  );

  if (activeStartStatuses.length > 1) {
    return { kind: "failed", reason: "multiple_active_start_statuses" };
  }
  if (activeStartStatuses.length === 1) {
    return selectableStatus(activeStartStatuses[0], "configured_start");
  }

  const canonicalCandidates: LifecycleStatusDocument[] = [];
  for (const status of statuses) {
    const identity = resolveRuntimeStatus({
      statuses,
      statusId: status.id,
      statusName: status.name,
    });
    if (identity.kind === "invalid") {
      return { kind: "failed", reason: "invalid_canonical_metadata" };
    }
    if (identity.kind === "ambiguous") {
      return { kind: "failed", reason: "ambiguous_canonical_fallback" };
    }
    if (identity.kind === "canonical" && identity.key === "job_booked") {
      canonicalCandidates.push(status);
    }
  }

  if (canonicalCandidates.length > 1) {
    return { kind: "failed", reason: "ambiguous_canonical_fallback" };
  }
  if (canonicalCandidates.length === 0) {
    return { kind: "failed", reason: "canonical_target_missing" };
  }
  if (canonicalCandidates[0].active === false) {
    return { kind: "failed", reason: "canonical_target_inactive" };
  }
  return selectableStatus(canonicalCandidates[0], "canonical_fallback");
}

export function selectAdvancedBookingTarget(
  statuses: readonly LifecycleStatusDocument[],
  persisted: { statusId?: unknown; statusName?: unknown },
): LifecycleStatusSelection {
  const statusId = typeof persisted.statusId === "string" ? persisted.statusId.trim() : "";
  const matches = statusId ? statuses.filter((status) => status.id === statusId) : [];
  if (matches.length === 1) {
    const target = matches[0];
    const validSystemKey = target.systemKey === undefined || isCanonicalJobStatusKey(target.systemKey);
    if (target.active !== false && validSystemKey) {
      return selectableStatus(target, "persisted_target");
    }
  }
  return selectLifecycleStartStatus(statuses);
}

function isContextualReopenName(value: unknown): boolean {
  return normalizeJobStatusName(value).replace(/\s/g, "") === "reopened";
}

export function selectContextualReopenStatus(
  statuses: readonly LifecycleStatusDocument[],
): LifecycleStatusSelection {
  const candidates = statuses.filter(
    (status) => status.active !== false && isContextualReopenName(status.name),
  );
  if (candidates.length > 1) {
    return { kind: "failed", reason: "multiple_active_reopen_statuses" };
  }
  if (candidates.length === 0) {
    return { kind: "failed", reason: "reopen_target_missing" };
  }
  return selectableStatus(candidates[0], "contextual_reopen");
}
