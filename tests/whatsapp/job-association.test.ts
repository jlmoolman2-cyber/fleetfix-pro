import test from "node:test";
import assert from "node:assert/strict";
import {
  assertJobCustomer,
  existingConversationJobContext,
  JOB_LINKED_AUDIT_ACTION,
  JOB_UNLINKED_AUDIT_ACTION,
  jobMatchesSearch,
  linkJob,
  linkedJobsFromConversation,
  messageJobContextJson,
  needsJobAssignmentForLatest,
  unlinkJob,
  type LinkedJob,
} from "../../src/lib/whatsapp/jobAssociationCore.ts";

const job = (jobId: string, jobNumber: string): LinkedJob => ({
  jobId, jobNumber, vehicleRegistration: `${jobId}-REG`, fleetNumber: `${jobId}-FLEET`,
  status: "Job Booked", bookingAt: "2026-09-03T08:00:00.000Z", description: "Service", location: "Cape Town",
});

test("one, two, and multiple jobs can be linked without replacing earlier links", () => {
  const first = linkJob([], job("job-1", "NJ00001"));
  assert.deepEqual(first.linkedJobs.map((item) => item.jobId), ["job-1"]);
  assert.equal(first.jobId, "job-1");
  const second = linkJob(first.linkedJobs, job("job-2", "NJ00002"));
  assert.deepEqual(second.linkedJobs.map((item) => item.jobId), ["job-1", "job-2"]);
  assert.equal(second.jobId, null);
  assert.equal(second.needsJobAssignment, true);
  const third = linkJob(second.linkedJobs, job("job-3", "NJ00003"));
  assert.deepEqual(third.linkedJobs.map((item) => item.jobId), ["job-1", "job-2", "job-3"]);
});

test("duplicate links are rejected", () => {
  assert.throws(() => linkJob([job("job-1", "NJ00001")], job("job-1", "NJ00001")), /already linked/);
});

test("unlink removes only the requested association and restores the legacy pointer when unambiguous", () => {
  const result = unlinkJob([job("job-1", "NJ00001"), job("job-2", "NJ00002")], "job-1");
  assert.deepEqual(result.linkedJobs.map((item) => item.jobId), ["job-2"]);
  assert.equal(result.jobId, "job-2");
  assert.equal(result.needsJobAssignment, false);
  assert.throws(() => unlinkJob(result.linkedJobs, "missing"), /not linked/);
});

test("legacy singular job fields are read as one linked job", () => {
  assert.deepEqual(linkedJobsFromConversation({ jobId: "job-1", jobNumber: "NJ00001" }).map((item) => item.jobNumber), ["NJ00001"]);
});

test("job lookup matches job number, registration, and fleet number", () => {
  const candidate = job("job-1", "NJ00001");
  assert.equal(jobMatchesSearch(candidate, "nj00001"), true);
  assert.equal(jobMatchesSearch(candidate, "JOB-1-reg"), true);
  assert.equal(jobMatchesSearch(candidate, "job-1-fleet"), true);
  assert.equal(jobMatchesSearch(candidate, "unrelated"), false);
});

test("customer-scoped linking rejects a job belonging to another customer", () => {
  assert.doesNotThrow(() => assertJobCustomer("customer-a", "customer-a"));
  assert.throws(() => assertJobCustomer("customer-a", "customer-b"), /does not belong/);
});

test("multiple jobs do not guess message context, while an explicit job tags only that message", () => {
  const jobs = [job("job-1", "NJ00001"), job("job-2", "NJ00002")];
  assert.deepEqual(existingConversationJobContext(jobs), {
    messageJobId: null, messageJobNumber: null, conversationJobId: null, conversationJobNumber: null, needsJobAssignment: true,
  });
  assert.deepEqual(existingConversationJobContext(jobs, jobs[1]), {
    messageJobId: "job-2", messageJobNumber: "NJ00002", conversationJobId: null, conversationJobNumber: null, needsJobAssignment: false,
  });
  assert.deepEqual(jobs.map((item) => item.jobNumber), ["NJ00001", "NJ00002"]);
});

test("invalid, unlinked, ambiguous, and absent references do not guess among multiple linked jobs", () => {
  const jobs = [job("job-1", "NJ00001"), job("job-2", "NJ00002")];
  const unlinked = job("job-3", "NJ00003");
  assert.equal(existingConversationJobContext(jobs, unlinked, true).messageJobId, null);
  assert.equal(existingConversationJobContext(jobs, null, true).messageJobId, null);
  assert.equal(existingConversationJobContext(jobs, null, false).messageJobId, null);
  assert.equal(existingConversationJobContext(jobs, unlinked, true).needsJobAssignment, true);
});

test("one linked job retains the existing default context rule unless an unresolved explicit reference is present", () => {
  const linked = job("job-1", "NJ00001");
  assert.equal(existingConversationJobContext([linked], null, false).messageJobId, "job-1");
  assert.equal(existingConversationJobContext([linked], null, true).messageJobId, null);
});

test("JOB REQUIRED follows latest inbound message resolution rather than linked-job count alone", () => {
  const jobs = [job("job-1", "NJ00001"), job("job-2", "NJ00002")];
  assert.equal(needsJobAssignmentForLatest(jobs, "job-2"), false);
  assert.equal(needsJobAssignmentForLatest(jobs, null), true);
  assert.equal(needsJobAssignmentForLatest(jobs, "cross-tenant-job"), true);
});

test("association updates are additive and therefore preserve conversation identity and message history", () => {
  const conversation = { phoneNumberWaId: "27823206967", phoneNumberNormalized: "+27823206967", customerId: "customer-a", messages: ["message-1"] };
  const association = linkJob([], job("job-1", "NJ00001"));
  const updated = { ...conversation, ...association };
  assert.equal(updated.phoneNumberWaId, conversation.phoneNumberWaId);
  assert.deepEqual(updated.messages, conversation.messages);
  assert.equal(updated.customerId, conversation.customerId);
});

test("link and unlink use explicit auditable conversation events", () => {
  assert.equal(JOB_LINKED_AUDIT_ACTION, "CONVERSATION_JOB_LINKED");
  assert.equal(JOB_UNLINKED_AUDIT_ACTION, "CONVERSATION_JOB_UNLINKED");
});

test("message job badge data is returned without inventing a context", () => {
  assert.deepEqual(messageJobContextJson({ jobId: "job-2", jobNumber: "NJ00002" }), { jobId: "job-2", jobNumber: "NJ00002" });
  assert.deepEqual(messageJobContextJson({}), { jobId: null, jobNumber: null });
});
