export const CANONICAL_JOB_STATUS_KEYS = [
  "job_booked",
  "onroute",
  "start_work",
  "job_complete",
] as const;

export type CanonicalJobStatusKey = typeof CANONICAL_JOB_STATUS_KEYS[number];

export const CANONICAL_JOB_STATUS_LABELS: Readonly<Record<CanonicalJobStatusKey, string>> = {
  job_booked: "Job Booked",
  onroute: "Onroute",
  start_work: "Start Work",
  job_complete: "Job Complete",
};

const SAFE_ALIASES: Readonly<Record<CanonicalJobStatusKey, readonly string[]>> = {
  job_booked: ["job booked"],
  onroute: [
    "onroute",
    "on route",
    "enroute",
    "en route",
    "traveling",
    "travelling",
    "dispatched",
  ],
  start_work: [
    "start work",
    "work in progress",
    "working",
    "repair progress",
    "repair in progress",
    "on site",
    "onsite",
    "on_site",
  ],
  job_complete: ["job complete", "completed"],
};

const SAFE_ALIAS_KEYS = new Map<string, CanonicalJobStatusKey>();

export function normalizeJobStatusName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ");
}

for (const key of CANONICAL_JOB_STATUS_KEYS) {
  for (const alias of SAFE_ALIASES[key]) {
    SAFE_ALIAS_KEYS.set(normalizeJobStatusName(alias), key);
  }
}

export function isCanonicalJobStatusKey(value: unknown): value is CanonicalJobStatusKey {
  return typeof value === "string" &&
    (CANONICAL_JOB_STATUS_KEYS as readonly string[]).includes(value);
}

export function canonicalJobStatusLabel(key: CanonicalJobStatusKey): string {
  return CANONICAL_JOB_STATUS_LABELS[key];
}

export function canonicalKeyFromSafeAlias(value: unknown): CanonicalJobStatusKey | undefined {
  return SAFE_ALIAS_KEYS.get(normalizeJobStatusName(value));
}

export interface JobStatusDocument {
  id: string;
  name?: unknown;
  systemKey?: unknown;
  [field: string]: unknown;
}

export interface ResolveJobStatusIdentityInput {
  statuses: readonly JobStatusDocument[];
  statusId?: unknown;
  status?: unknown;
  statusName?: unknown;
}

export type StatusResolutionReason =
  | "invalid_system_key"
  | "duplicate_explicit_system_key"
  | "duplicate_status_id"
  | "duplicate_legacy_alias"
  | "conflicting_status_identity";

export type StatusResolution =
  | {
      kind: "canonical";
      key: CanonicalJobStatusKey;
      source: "explicit" | "legacy_alias" | "stored_name_alias";
    }
  | { kind: "custom" }
  | { kind: "ambiguous"; reason: StatusResolutionReason }
  | { kind: "invalid"; reason: StatusResolutionReason }
  | { kind: "unresolved" };

function storedName(input: ResolveJobStatusIdentityInput): unknown {
  if (typeof input.statusName === "string" && input.statusName.trim()) {
    return input.statusName;
  }
  return input.status;
}

function conflictsWithStoredName(
  resolvedKey: CanonicalJobStatusKey,
  input: ResolveJobStatusIdentityInput,
): boolean {
  const storedKey = canonicalKeyFromSafeAlias(storedName(input));
  return storedKey !== undefined && storedKey !== resolvedKey;
}

export function resolveJobStatusIdentity(
  input: ResolveJobStatusIdentityInput,
): StatusResolution {
  const explicitCounts = new Map<CanonicalJobStatusKey, number>();
  const statusIdCounts = new Map<string, number>();
  const legacyAliasCounts = new Map<CanonicalJobStatusKey, number>();

  for (const statusDocument of input.statuses) {
    statusIdCounts.set(statusDocument.id, (statusIdCounts.get(statusDocument.id) ?? 0) + 1);

    if (statusDocument.systemKey !== undefined) {
      if (!isCanonicalJobStatusKey(statusDocument.systemKey)) {
        return { kind: "invalid", reason: "invalid_system_key" };
      }
      explicitCounts.set(
        statusDocument.systemKey,
        (explicitCounts.get(statusDocument.systemKey) ?? 0) + 1,
      );
      continue;
    }

    const legacyKey = canonicalKeyFromSafeAlias(statusDocument.name);
    if (legacyKey) {
      legacyAliasCounts.set(legacyKey, (legacyAliasCounts.get(legacyKey) ?? 0) + 1);
    }
  }

  if ([...explicitCounts.values()].some((count) => count > 1)) {
    return { kind: "ambiguous", reason: "duplicate_explicit_system_key" };
  }

  const referencedId = typeof input.statusId === "string" ? input.statusId.trim() : "";
  if (referencedId && (statusIdCounts.get(referencedId) ?? 0) > 1) {
    return { kind: "ambiguous", reason: "duplicate_status_id" };
  }

  const referencedStatus = referencedId
    ? input.statuses.find((statusDocument) => statusDocument.id === referencedId)
    : undefined;

  if (referencedStatus) {
    if (isCanonicalJobStatusKey(referencedStatus.systemKey)) {
      if (conflictsWithStoredName(referencedStatus.systemKey, input)) {
        return { kind: "ambiguous", reason: "conflicting_status_identity" };
      }
      return { kind: "canonical", key: referencedStatus.systemKey, source: "explicit" };
    }

    const legacyKey = canonicalKeyFromSafeAlias(referencedStatus.name);
    if (!legacyKey) return { kind: "custom" };
    if ((legacyAliasCounts.get(legacyKey) ?? 0) > 1) {
      return { kind: "ambiguous", reason: "duplicate_legacy_alias" };
    }
    if (conflictsWithStoredName(legacyKey, input)) {
      return { kind: "ambiguous", reason: "conflicting_status_identity" };
    }
    return { kind: "canonical", key: legacyKey, source: "legacy_alias" };
  }

  const fallbackKey = canonicalKeyFromSafeAlias(storedName(input));
  if (!fallbackKey) return { kind: "unresolved" };
  if ((legacyAliasCounts.get(fallbackKey) ?? 0) > 1) {
    return { kind: "ambiguous", reason: "duplicate_legacy_alias" };
  }
  return { kind: "canonical", key: fallbackKey, source: "stored_name_alias" };
}
