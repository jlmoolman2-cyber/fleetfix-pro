export type LiveUpdateEvent = "conversations" | "messages";

export function mergeLiveMessagePage<T extends { id: string }>(live: T[], current: T[]): T[] {
  const liveIds = new Set(live.map((message) => message.id));
  return [...live, ...current.filter((message) => !liveIds.has(message.id))];
}

export function createCleanupBag() {
  const cleanups = new Set<() => void>();
  let closed = false;
  return {
    add(cleanup: () => void) {
      if (closed) cleanup();
      else cleanups.add(cleanup);
      return cleanup;
    },
    close() {
      if (closed) return;
      closed = true;
      for (const cleanup of cleanups) {
        try { cleanup(); } catch { /* continue releasing the remaining resources */ }
      }
      cleanups.clear();
    },
  };
}
