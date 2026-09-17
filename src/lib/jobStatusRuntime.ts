import {
  resolveJobStatusIdentity,
  type CanonicalJobStatusKey,
  type JobStatusDocument,
  type StatusResolution,
} from "./jobStatusContract.ts";

export interface RuntimeJobStatusInput {
  statuses: readonly JobStatusDocument[];
  statusId?: unknown;
  status?: unknown;
  statusName?: unknown;
}

export type RuntimeStatusIdentity = StatusResolution;

export function resolveRuntimeStatus(input: RuntimeJobStatusInput): RuntimeStatusIdentity {
  return resolveJobStatusIdentity(input);
}

export function runtimeStatusIs(
  input: RuntimeJobStatusInput,
  key: CanonicalJobStatusKey,
): boolean {
  const resolution = resolveRuntimeStatus(input);
  return resolution.kind === "canonical" && resolution.key === key;
}

export function runtimeStatusIsOnRoute(input: RuntimeJobStatusInput): boolean {
  return runtimeStatusIs(input, "onroute");
}

export function runtimeStatusIsStartWork(input: RuntimeJobStatusInput): boolean {
  return runtimeStatusIs(input, "start_work");
}

export function runtimeStatusIsContextualArrival(value: unknown): boolean {
  return /arriv/i.test(String(value || ""));
}
