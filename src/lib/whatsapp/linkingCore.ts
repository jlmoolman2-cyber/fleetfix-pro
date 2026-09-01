export type ActiveJobCandidate = { id: string; jobNumber: string; customerId?: string; contactId?: string };

export function uniqueEntityMatch<T>(matches: T[]): T | null {
  return matches.length === 1 ? matches[0] : null;
}

export function preferExistingConversation(existingConversationId: string | null, generatedConversationId: string): string {
  return existingConversationId || generatedConversationId;
}

export function extractJobNumberCandidates(text: string): string[] {
  const matches = String(text || "").match(/\b[A-Za-z]{1,10}-?\d{4,12}\b/g) || [];
  return [...new Set(matches.map((value) => value.toUpperCase()))].slice(0, 10);
}

export function isActiveJob(job: Record<string, unknown>): boolean {
  if (job.isClosed === true || job.isCompleted === true || job.archived === true) return false;
  return !/cancelled|canceled|closed|complete(d)?/i.test(String(job.status || ""));
}

export function chooseJobLink(activeJobs: ActiveJobCandidate[], explicitJob?: ActiveJobCandidate | null) {
  if (explicitJob) return { job: explicitJob, needsJobAssignment: false, method: "explicit_job_number" as const };
  if (activeJobs.length === 1) return { job: activeJobs[0], needsJobAssignment: false, method: "single_active_job" as const };
  if (activeJobs.length > 1) return { job: null, needsJobAssignment: true, method: "multiple_active_jobs" as const };
  return { job: null, needsJobAssignment: false, method: null };
}
