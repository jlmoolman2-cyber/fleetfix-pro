import {
  canonicalJobStatusLabel,
  canonicalKeyFromSafeAlias,
  resolveJobStatusIdentity,
  type CanonicalJobStatusKey,
  type JobStatusDocument,
  type StatusResolution,
} from "./jobStatusContract.ts";

export type AdminStatusDisplayState =
  | "SYSTEM"
  | "LEGACY_SYSTEM"
  | "AMBIGUOUS"
  | "INVALID"
  | "CUSTOM";

export type AdminStatusPolicyReason =
  | "system_status_protected"
  | "ambiguous_status_identity"
  | "invalid_status_identity";

export interface AdminStatusPolicy {
  state: AdminStatusDisplayState;
  resolution: StatusResolution;
  key?: CanonicalJobStatusKey;
  canonicalLabel?: string;
  reason?: AdminStatusPolicyReason;
  canRename: boolean;
  canDelete: boolean;
  canDisable: boolean;
  canEnable: boolean;
  jobBookedWorkflowLocked: boolean;
}

export type CustomStatusNameValidation =
  | { valid: true }
  | {
      valid: false;
      reason: "reserved_system_name";
      key: CanonicalJobStatusKey;
    };

export function validateCustomStatusName(name: unknown): CustomStatusNameValidation {
  const key = canonicalKeyFromSafeAlias(name);
  return key
    ? { valid: false, reason: "reserved_system_name", key }
    : { valid: true };
}

export function adminStatusPolicy(
  statuses: readonly JobStatusDocument[],
  status: JobStatusDocument,
): AdminStatusPolicy {
  const resolution = resolveJobStatusIdentity({
    statuses,
    statusId: status.id,
    statusName: status.name,
  });
  const nameKey = canonicalKeyFromSafeAlias(status.name);

  if (resolution.kind === "canonical") {
    const state = resolution.source === "explicit" ? "SYSTEM" : "LEGACY_SYSTEM";
    return {
      state,
      resolution,
      key: resolution.key,
      canonicalLabel: canonicalJobStatusLabel(resolution.key),
      reason: "system_status_protected",
      canRename: false,
      canDelete: false,
      canDisable: false,
      canEnable: true,
      jobBookedWorkflowLocked: resolution.key === "job_booked",
    };
  }

  if (resolution.kind === "ambiguous") {
    return {
      state: "AMBIGUOUS",
      resolution,
      reason: "ambiguous_status_identity",
      canRename: false,
      canDelete: false,
      canDisable: false,
      canEnable: true,
      jobBookedWorkflowLocked: nameKey === "job_booked",
    };
  }

  if (resolution.kind === "invalid") {
    return {
      state: "INVALID",
      resolution,
      reason: "invalid_status_identity",
      canRename: false,
      canDelete: false,
      canDisable: false,
      canEnable: true,
      jobBookedWorkflowLocked: nameKey === "job_booked",
    };
  }

  return {
    state: "CUSTOM",
    resolution,
    canRename: true,
    canDelete: true,
    canDisable: true,
    canEnable: true,
    jobBookedWorkflowLocked: false,
  };
}
