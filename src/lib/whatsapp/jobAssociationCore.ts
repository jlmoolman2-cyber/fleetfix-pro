import { WhatsAppError } from "./errors.ts";

export const JOB_LINKED_AUDIT_ACTION = "CONVERSATION_JOB_LINKED";
export const JOB_UNLINKED_AUDIT_ACTION = "CONVERSATION_JOB_UNLINKED";
export const MESSAGE_JOB_ASSIGNED_AUDIT_ACTION = "MESSAGE_JOB_CONTEXT_ASSIGNED";

export type LinkedJob = {
  jobId: string;
  jobNumber: string;
  vehicleRegistration: string;
  fleetNumber: string;
  status: string;
  bookingAt: unknown;
  description: string;
  location: string;
};

export function jobMatchesSearch(job: LinkedJob, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [job.jobNumber, job.vehicleRegistration, job.fleetNumber]
    .some((value) => value.toLowerCase().includes(needle));
}

export function assertJobCustomer(conversationCustomerId: unknown, jobCustomerId: unknown): void {
  if (conversationCustomerId && String(jobCustomerId || "") !== String(conversationCustomerId)) {
    throw new WhatsAppError("FORBIDDEN", "The selected job does not belong to this conversation's customer.", 403);
  }
}

export function needsJobAssignmentForLatest(linkedJobs: LinkedJob[], latestInboundJobId: unknown): boolean {
  if (linkedJobs.length <= 1) return false;
  return !latestInboundJobId || !linkedJobs.some((job) => job.jobId === String(latestInboundJobId));
}

export function messageJobContextJson(data: Record<string, unknown>) {
  return { jobId: data.jobId || null, jobNumber: data.jobNumber || null };
}

export function existingConversationJobContext(existing: LinkedJob[], explicitJob?: LinkedJob | null, hasExplicitReference = Boolean(explicitJob)) {
  const linkedExplicit = explicitJob && existing.find((job) => job.jobId === explicitJob.jobId);
  if (existing.length > 1) return {
    messageJobId: linkedExplicit?.jobId || null,
    messageJobNumber: linkedExplicit?.jobNumber || null,
    conversationJobId: null,
    conversationJobNumber: null,
    needsJobAssignment: !linkedExplicit,
  };
  const only = existing[0] || null;
  return {
    messageJobId: hasExplicitReference ? linkedExplicit?.jobId || null : only?.jobId || null,
    messageJobNumber: hasExplicitReference ? linkedExplicit?.jobNumber || null : only?.jobNumber || null,
    conversationJobId: only?.jobId || null,
    conversationJobNumber: only?.jobNumber || null,
    needsJobAssignment: hasExplicitReference && !linkedExplicit,
  };
}

export function linkedJobsFromConversation(data: Record<string, unknown>): LinkedJob[] {
  const stored = Array.isArray(data.linkedJobs) ? data.linkedJobs : [];
  const normalized = stored.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const job = value as Record<string, unknown>;
    const jobId = String(job.jobId || job.id || "");
    if (!jobId) return [];
    return [{
      jobId,
      jobNumber: String(job.jobNumber || jobId),
      vehicleRegistration: String(job.vehicleRegistration || ""),
      fleetNumber: String(job.fleetNumber || ""),
      status: String(job.status || ""),
      bookingAt: job.bookingAt || null,
      description: String(job.description || ""),
      location: String(job.location || ""),
    }];
  });
  if (!normalized.length && data.jobId) normalized.push({
    jobId: String(data.jobId),
    jobNumber: String(data.jobNumber || data.jobId),
    vehicleRegistration: "",
    fleetNumber: "",
    status: "",
    bookingAt: null,
    description: "",
    location: "",
  });
  return [...new Map(normalized.map((job) => [job.jobId, job])).values()];
}

export function linkJob(existing: LinkedJob[], job: LinkedJob) {
  if (existing.some((linked) => linked.jobId === job.jobId)) {
    throw new WhatsAppError("DUPLICATE", "This job is already linked to the conversation.", 409);
  }
  if (existing.length >= 50) throw new WhatsAppError("INVALID_INPUT", "A conversation cannot link more than 50 jobs.", 400);
  const linkedJobs = [...existing, job];
  return {
    linkedJobs,
    jobId: linkedJobs.length === 1 ? job.jobId : null,
    jobNumber: linkedJobs.length === 1 ? job.jobNumber : null,
    needsJobAssignment: linkedJobs.length > 1,
  };
}

export function unlinkJob(existing: LinkedJob[], jobId: string) {
  if (!existing.some((linked) => linked.jobId === jobId)) {
    throw new WhatsAppError("NOT_FOUND", "This job is not linked to the conversation.", 404);
  }
  const linkedJobs = existing.filter((linked) => linked.jobId !== jobId);
  return {
    linkedJobs,
    jobId: linkedJobs.length === 1 ? linkedJobs[0].jobId : null,
    jobNumber: linkedJobs.length === 1 ? linkedJobs[0].jobNumber : null,
    needsJobAssignment: linkedJobs.length !== 1,
  };
}
