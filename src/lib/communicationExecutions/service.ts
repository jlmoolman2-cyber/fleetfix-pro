import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { COMMUNICATION_VARIABLES } from "@/lib/communicationTemplates/core";
import { planCommunication, validateCommunicationRule, normalizeCommunicationPreference, type RuleChannel } from "@/lib/communicationRules/core";
import type { ServerUserContext } from "@/lib/whatsapp/auth";
import { WhatsAppError } from "@/lib/whatsapp/errors";
import { userHasPermission } from "@/lib/whatsapp/permissions";
import { communicationExecutionKey, normalizeExecutionDestination, stopConditionSatisfied, type ExecutionActor } from "./core";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const executionsFor = (companyId: string) => adminDb.collection(`companies/${companyId}/communicationExecutions`);
const privileged = (context: ServerUserContext) => ["Business Owner", "Administrator", "Super Admin"].includes(String(context.companyUser.primaryRole || context.companyUser.role || ""));
const canView = (context: ServerUserContext) => privileged(context) || userHasPermission(context.companyUser, "View WhatsApp") || context.companyUser.permissions?.["View messages"] === true;
const canPrepare = (context: ServerUserContext, channel: RuleChannel) => channel === "whatsapp" ? userHasPermission(context.companyUser, "Manage WhatsApp automation rules") : privileged(context) || context.companyUser.permissions?.["Manage automated communication"] === true;
const forbidden = () => { throw new WhatsAppError("FORBIDDEN", "You do not have permission to prepare communication executions.", 403); };
const iso = (value: unknown) => value && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate(): Date }).toDate().toISOString() : null;

function json(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, ...data, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), cancelledAt: iso(data.cancelledAt) };
}
async function audit(context: ServerUserContext, action: string, executionId: string, status: string, reason: string | null) {
  await adminDb.collection(`companies/${context.companyId}/audit_log`).add({ action, entityType: "communicationExecution", entityId: executionId, companyId: context.companyId, status, reason, actorType: "USER", userId: context.uid, createdAt: FieldValue.serverTimestamp(), occurredAt: FieldValue.serverTimestamp() });
}
function variables(source: Record<string, unknown>) {
  const allowed = new Set(COMMUNICATION_VARIABLES.map(({ key }) => key));
  return Object.fromEntries([...allowed].filter((key) => key in source).map((key) => [key, String(source[key] ?? "").slice(0, 2000)]));
}

async function authoritativeRecipient(context: ServerUserContext, recipientType: string, input: Record<string, unknown>, channel: RuleChannel) {
  const id = String(input.id || "").trim(); const customerId = String(input.customerId || "").trim();
  if (!ID.test(id)) return null;
  let path = "";
  if (recipientType === "customer" || recipientType === "accounts-contact") path = `companies/${context.companyId}/customers/${id}`;
  else if (recipientType === "customer-contact" && ID.test(customerId)) path = `companies/${context.companyId}/customers/${customerId}/contacts/${id}`;
  else if (["assigned-technician", "assigned-users", "assigned-user", "job-manager", "dispatcher"].includes(recipientType)) path = `companies/${context.companyId}/users/${id}`;
  else if (["supplier", "external-service-provider"].includes(recipientType)) path = `companies/${context.companyId}/suppliers/${id}`;
  if (!path) return null;
  const snapshot = await adminDb.doc(path).get(); if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  const display = String(data.name || data.displayName || data.contactName || data.companyName || input.display || "").trim().slice(0, 200);
  const destination = channel === "email"
    ? data.email || data.emailAddress || data.primaryContactEmail || data.contactEmail
    : data.mobile || data.mobileNumber || data.phone || data.phoneNumber || data.telephone || data.contactPhone;
  return { id, display, destination, preference: data.communicationPreference ?? data.contactPreference ?? input.preference };
}

export async function prepareCommunicationExecution(context: ServerUserContext, body: unknown, dryRun = false) {
  if (!body || typeof body !== "object") throw new WhatsAppError("INVALID_INPUT", "Execution details are required.", 400);
  const input = body as Record<string, unknown>; const ruleId = String(input.ruleId || "");
  const sourceEntityType = String(input.sourceEntityType || "job"); const sourceEntityId = String(input.sourceEntityId || "");
  const occurrence = String(input.occurrence || "").trim();
  if (!ID.test(ruleId) || !ID.test(sourceEntityId) || !/^[A-Za-z0-9_.:-]{1,160}$/.test(occurrence)) throw new WhatsAppError("INVALID_INPUT", "Rule, source, and occurrence identifiers are required.", 400);
  if (sourceEntityType !== "job") throw new WhatsAppError("INVALID_INPUT", "Only authoritative job sources are supported in Phase 9.", 400);
  const [ruleSnapshot, sourceSnapshot] = await Promise.all([adminDb.doc(`companies/${context.companyId}/communicationRulePlans/${ruleId}`).get(), adminDb.doc(`companies/${context.companyId}/jobs/${sourceEntityId}`).get()]);
  if (!ruleSnapshot.exists || ruleSnapshot.data()?.companyId !== context.companyId) throw new WhatsAppError("NOT_FOUND", "Communication rule not found.", 404);
  if (!sourceSnapshot.exists) throw new WhatsAppError("NOT_FOUND", "Source job not found.", 404);
  const rule = validateCommunicationRule(ruleSnapshot.data()); if (!canPrepare(context, rule.channel)) forbidden();
  const templateSnapshot = await adminDb.doc(`companies/${context.companyId}/communicationTemplates/${rule.templateId}`).get();
  const templateData = templateSnapshot.data();
  const recipientInput = input.recipient && typeof input.recipient === "object" ? input.recipient as Record<string, unknown> : {};
  const recipient = await authoritativeRecipient(context, rule.recipientType, recipientInput, rule.channel);
  const recipientId = recipient?.id || ""; const recipientDisplay = recipient?.display || "";
  const normalized = normalizeExecutionDestination(rule.channel, recipient?.destination, rule.recipientType);
  const preference = normalizeCommunicationPreference(recipient?.preference ?? rule.recipientConfiguration.preference);
  const source = { ...sourceSnapshot.data(), jobNumber: sourceSnapshot.data()?.jobNumber || sourceSnapshot.id } as Record<string, unknown>;
  let plan = planCommunication({ rule, template: templateSnapshot.exists && templateData?.companyId === context.companyId ? { id: templateSnapshot.id, ...templateData } as never : null, recipient: { display: recipientDisplay, destination: normalized.destination, preference }, variables: variables(source) });
  if (!rule.active) plan = { status: "SKIPPED", reason: "RULE_INACTIVE", sent: false };
  else if (!templateSnapshot.exists || templateData?.companyId !== context.companyId) plan = { status: "BLOCKED", reason: "MISSING_TEMPLATE", sent: false };
  else if (templateData.active === false) plan = { status: "BLOCKED", reason: "TEMPLATE_INACTIVE", sent: false };
  else if (templateData.channel !== rule.channel) plan = { status: "BLOCKED", reason: "WRONG_TEMPLATE_CHANNEL", sent: false };
  else if (!recipientId || !recipientDisplay) plan = { status: "BLOCKED", reason: "NO_RECIPIENT", sent: false };
  else if (normalized.reason) plan = { status: "BLOCKED", reason: normalized.reason, sent: false };
  else if (stopConditionSatisfied(rule.timing.stopCondition, source)) plan = { status: "SKIPPED", reason: "STOP_CONDITION_SATISFIED", sent: false };
  const key = communicationExecutionKey({ companyId: context.companyId, sourceEntityType, sourceEntityId, ruleId, trigger: rule.trigger, recipientId, channel: rule.channel, occurrence });
  const actor: ExecutionActor = { type: "USER", id: context.uid };
  const rendered = "rendered" in plan && plan.rendered ? plan.rendered : { subject: "", body: "" };
  const record = { companyId: context.companyId, ruleId, templateId: rule.templateId, sourceEntityType, sourceEntityId, trigger: rule.trigger, occurrence, recipientType: rule.recipientType, recipientId, recipientDisplay, normalizedDestination: normalized.destination || null, channel: rule.channel, renderedSubject: rendered.subject, renderedBody: rendered.body, timingType: rule.timing.type, plannedAt: "scheduledAt" in plan ? plan.scheduledAt : new Date().toISOString(), status: plan.status, reason: plan.reason || null, idempotencyKey: key, attemptCount: 0, actor, transportReference: null, deliveryState: null, conversationId: null, messageId: null, metaMessageId: null, sent: false };
  if (dryRun) return { execution: { id: key, ...record }, duplicate: false, prepared: false, sent: false };
  const ref = executionsFor(context.companyId).doc(key); let duplicate = false;
  await adminDb.runTransaction(async (transaction) => { const existing = await transaction.get(ref); if (existing.exists) { duplicate = true; return; } transaction.create(ref, { ...record, createdAt: FieldValue.serverTimestamp(), createdBy: context.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid }); });
  if (!duplicate) {
    await audit(context, "COMMUNICATION_EXECUTION_CREATED", key, record.status, record.reason);
    await audit(context, `COMMUNICATION_EXECUTION_${record.status}`, key, record.status, record.reason);
  }
  const stored = await ref.get(); return { execution: json(key, stored.data() || record), duplicate, prepared: true, sent: false };
}

export async function listCommunicationExecutions(context: ServerUserContext) {
  if (!canView(context)) forbidden(); const snapshot = await executionsFor(context.companyId).orderBy("createdAt", "desc").limit(250).get();
  return { items: snapshot.docs.filter((doc) => doc.data().companyId === context.companyId).map((doc) => json(doc.id, doc.data())), transportEnabled: false };
}
export async function getCommunicationExecution(context: ServerUserContext, id: string) {
  if (!canView(context) || !ID.test(id)) forbidden(); const snapshot = await executionsFor(context.companyId).doc(id).get();
  if (!snapshot.exists || snapshot.data()?.companyId !== context.companyId) throw new WhatsAppError("NOT_FOUND", "Communication execution not found.", 404); return { execution: json(snapshot.id, snapshot.data() || {}) };
}
export async function cancelCommunicationExecution(context: ServerUserContext, id: string) {
  if (!ID.test(id)) throw new WhatsAppError("INVALID_INPUT", "Execution ID is invalid.", 400); const ref = executionsFor(context.companyId).doc(id);
  await adminDb.runTransaction(async (transaction) => { const snapshot = await transaction.get(ref); if (!snapshot.exists || snapshot.data()?.companyId !== context.companyId) throw new WhatsAppError("NOT_FOUND", "Communication execution not found.", 404); const data = snapshot.data() || {}; if (!canPrepare(context, data.channel)) forbidden(); if (data.status !== "READY") throw new WhatsAppError("INVALID_INPUT", "Only READY executions can be cancelled.", 409); transaction.update(ref, { status: "CANCELLED", reason: "CANCELLED_BY_USER", sent: false, cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid }); });
  await audit(context, "COMMUNICATION_EXECUTION_CANCELLED", id, "CANCELLED", "CANCELLED_BY_USER"); return getCommunicationExecution(context, id);
}
