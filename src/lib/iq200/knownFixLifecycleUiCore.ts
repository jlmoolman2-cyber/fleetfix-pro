export const KNOWN_FIX_REFRESH_WARNING = "The Known Fix was updated, but the list could not be refreshed. Reload the page before taking another action.";

export type KnownFixLifecycleErrors = Record<string, string>;
export type KnownFixRefreshBlocks = Record<string, boolean>;

export function acquireKnownFixAction(inFlight: Set<string>, refreshBlocked: ReadonlySet<string>, id: string): boolean {
  if (inFlight.has(id) || refreshBlocked.has(id)) return false;
  inFlight.add(id);
  return true;
}

export function releaseKnownFixAction(inFlight: Set<string>, id: string): void {
  inFlight.delete(id);
}

export function updateKnownFixLifecycleError(errors: Readonly<KnownFixLifecycleErrors>, id: string, message: string): KnownFixLifecycleErrors {
  const next = { ...errors };
  if (message) next[id] = message;
  else delete next[id];
  return next;
}

export function updateKnownFixRefreshBlock(blocked: Readonly<KnownFixRefreshBlocks>, id: string, value: boolean): KnownFixRefreshBlocks {
  const next = { ...blocked };
  if (value) next[id] = true;
  else delete next[id];
  return next;
}

export function reconcileKnownFixRefreshRecovery(blockedIds: ReadonlySet<string>, errors: Readonly<KnownFixLifecycleErrors>): {
  refreshBlocked: KnownFixRefreshBlocks;
  lifecycleErrors: KnownFixLifecycleErrors;
} {
  const lifecycleErrors = { ...errors };
  for (const id of blockedIds) delete lifecycleErrors[id];
  return { refreshBlocked: {}, lifecycleErrors };
}
