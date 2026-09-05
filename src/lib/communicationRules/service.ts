import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type { ServerUserContext } from "@/lib/whatsapp/auth";
import { WhatsAppError } from "@/lib/whatsapp/errors";
import { userHasPermission } from "@/lib/whatsapp/permissions";
import { planCommunication, RULE_TRIGGERS, validateCommunicationRule, type RuleChannel } from "./core";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const rulesFor = (companyId: string) => adminDb.collection(`companies/${companyId}/communicationRulePlans`);
const templatesFor = (companyId: string) => adminDb.collection(`companies/${companyId}/communicationTemplates`);
const forbidden = () => { throw new WhatsAppError("FORBIDDEN", "You do not have permission to use these communication rules.", 403); };

function privileged(context: ServerUserContext) {
  return ["Business Owner", "Administrator", "Super Admin"].includes(String(context.companyUser.primaryRole || context.companyUser.role || ""));
}
function canView(context: ServerUserContext, channel: RuleChannel) {
  return channel === "whatsapp"
    ? userHasPermission(context.companyUser, "View WhatsApp") || userHasPermission(context.companyUser, "Manage WhatsApp automation rules")
    : privileged(context) || context.companyUser.permissions?.["View messages"] === true || context.companyUser.permissions?.["Manage automated communication"] === true;
}
function canManage(context: ServerUserContext, channel: RuleChannel) {
  return channel === "whatsapp"
    ? userHasPermission(context.companyUser, "Manage WhatsApp automation rules")
    : privileged(context) || context.companyUser.permissions?.["Manage automated communication"] === true;
}
function validated(value: unknown) {
  try { return validateCommunicationRule(value); }
  catch (error) { throw new WhatsAppError("INVALID_INPUT", error instanceof Error ? error.message : "Communication rule is invalid.", 400); }
}
function iso(value: unknown) {
  return value && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate(): Date }).toDate().toISOString() : null;
}
function json(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, name: data.name, description: data.description || "", category: data.category, trigger: data.trigger, recipientType: data.recipientType, recipientConfiguration: data.recipientConfiguration || {}, channel: data.channel, templateId: data.templateId, active: data.active !== false, timing: data.timing, createdAt: iso(data.createdAt), createdBy: data.createdBy || "", updatedAt: iso(data.updatedAt), updatedBy: data.updatedBy || "" };
}
async function ownedRule(context: ServerUserContext, id: string) {
  if (!ID_PATTERN.test(id)) throw new WhatsAppError("INVALID_INPUT", "Rule ID is invalid.", 400);
  const snapshot = await rulesFor(context.companyId).doc(id).get();
  if (!snapshot.exists || snapshot.data()?.companyId !== context.companyId) throw new WhatsAppError("NOT_FOUND", "Communication rule not found.", 404);
  return snapshot;
}
async function authoritativeTemplate(context: ServerUserContext, templateId: string, channel: RuleChannel) {
  if (!ID_PATTERN.test(templateId)) throw new WhatsAppError("INVALID_INPUT", "Template ID is invalid.", 400);
  const snapshot = await templatesFor(context.companyId).doc(templateId).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.companyId !== context.companyId) throw new WhatsAppError("INVALID_INPUT", "The selected template is unavailable.", 400);
  if (data?.channel !== channel) throw new WhatsAppError("INVALID_INPUT", "The selected template belongs to a different channel.", 400);
  return { id: snapshot.id, name: String(data.name || ""), description: String(data.description || ""), category: String(data.category || ""), recipientType: String(data.recipientType || ""), channel: data.channel, purpose: String(data.purpose || ""), active: data.active !== false, subject: String(data.subject || ""), body: String(data.body || "") };
}
async function planningTemplate(context: ServerUserContext, templateId: string) {
  if (!ID_PATTERN.test(templateId)) return null;
  const snapshot = await templatesFor(context.companyId).doc(templateId).get(); const data = snapshot.data();
  if (!snapshot.exists || data?.companyId !== context.companyId) return null;
  return { id: snapshot.id, name: String(data.name || ""), description: String(data.description || ""), category: String(data.category || ""), recipientType: String(data.recipientType || ""), channel: data.channel, purpose: String(data.purpose || ""), active: data.active !== false, subject: String(data.subject || ""), body: String(data.body || "") };
}
async function audit(context: ServerUserContext, action: string, ruleId: string, channel: string, extra: Record<string, unknown> = {}) {
  await adminDb.collection(`companies/${context.companyId}/audit_log`).add({ action, entityType: "communicationRule", entityId: ruleId, description: `${action} ${channel} communication rule`, userId: context.uid, createdAt: FieldValue.serverTimestamp(), occurredAt: FieldValue.serverTimestamp(), ...extra });
}

export async function listCommunicationRules(context: ServerUserContext, url: URL) {
  if (!canView(context, "email") && !canView(context, "whatsapp")) forbidden();
  const [ruleSnapshots, templateSnapshots] = await Promise.all([rulesFor(context.companyId).orderBy("updatedAt", "desc").limit(250).get(), templatesFor(context.companyId).orderBy("updatedAt", "desc").limit(250).get()]);
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase().slice(0, 80);
  const channel = String(url.searchParams.get("channel") || ""); const category = String(url.searchParams.get("category") || ""); const trigger = String(url.searchParams.get("trigger") || ""); const active = url.searchParams.get("active");
  const items = ruleSnapshots.docs.map((doc) => json(doc.id, doc.data())).filter((item) => canView(context, item.channel)).filter((item) => !channel || item.channel === channel).filter((item) => !category || item.category === category).filter((item) => !trigger || item.trigger === trigger).filter((item) => active == null || active === "" || item.active === (active === "true")).filter((item) => !search || `${item.name} ${item.description} ${item.trigger}`.toLowerCase().includes(search));
  const templates = templateSnapshots.docs.map((doc) => ({ id: doc.id, data: doc.data() })).filter((item) => item.data.companyId === context.companyId && canView(context, item.data.channel as RuleChannel)).map(({ id, data }) => ({ id, name: data.name, channel: data.channel, category: data.category, purpose: data.purpose, active: data.active !== false }));
  return { items, templates, capabilities: { manageEmail: canManage(context, "email"), manageWhatsApp: canManage(context, "whatsapp"), viewEmail: canView(context, "email"), viewWhatsApp: canView(context, "whatsapp") } };
}

export async function createCommunicationRule(context: ServerUserContext, body: unknown) {
  const input = validated(body); if (!canManage(context, input.channel)) forbidden(); await authoritativeTemplate(context, input.templateId, input.channel);
  const ref = rulesFor(context.companyId).doc();
  await ref.create({ ...input, companyId: context.companyId, createdAt: FieldValue.serverTimestamp(), createdBy: context.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid });
  await audit(context, "COMMUNICATION_RULE_CREATED", ref.id, input.channel);
  return { rule: json(ref.id, (await ref.get()).data() || {}) };
}

export async function getCommunicationRule(context: ServerUserContext, id: string) {
  const snapshot = await ownedRule(context, id); const rule = json(snapshot.id, snapshot.data() || {}); if (!canView(context, rule.channel)) forbidden(); return { rule };
}

export async function mutateCommunicationRule(context: ServerUserContext, id: string, body: unknown) {
  if (!body || typeof body !== "object") throw new WhatsAppError("INVALID_INPUT", "Rule action is invalid.", 400);
  const request = body as Record<string, unknown>; const snapshot = await ownedRule(context, id); const existing = snapshot.data() || {}; const existingChannel = existing.channel as RuleChannel; const action = String(request.action || "update");
  if (action === "simulate") {
    if (!canView(context, existingChannel)) forbidden();
    const rule = validated(request.rule || existing); if (!canView(context, rule.channel)) forbidden();
    const template = await planningTemplate(context, rule.templateId);
    const simulation = request.simulation && typeof request.simulation === "object" ? request.simulation as Record<string, unknown> : {};
    const variables = simulation.variables && typeof simulation.variables === "object" ? Object.fromEntries(Object.entries(simulation.variables as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")])) : {};
    const recipient = simulation.recipient && typeof simulation.recipient === "object" ? simulation.recipient as Record<string, unknown> : {};
    const plan = planCommunication({ rule, template, recipient: { display: String(recipient.display || ""), destination: String(recipient.destination || ""), preference: recipient.preference }, variables });
    await audit(context, "COMMUNICATION_RULE_SIMULATED", id, rule.channel, { sent: false, result: plan.status }); return { plan };
  }
  if (!canManage(context, existingChannel)) forbidden();
  if (action === "duplicate") {
    const input = validated({ ...existing, name: `${existing.name} (Copy)` }); await authoritativeTemplate(context, input.templateId, input.channel); const ref = rulesFor(context.companyId).doc();
    await ref.create({ ...input, companyId: context.companyId, active: false, createdAt: FieldValue.serverTimestamp(), createdBy: context.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid }); await audit(context, "COMMUNICATION_RULE_DUPLICATED", ref.id, input.channel); return { rule: json(ref.id, (await ref.get()).data() || {}) };
  }
  if (action === "set-active") { const active = request.active === true; await snapshot.ref.update({ active, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid }); await audit(context, active ? "COMMUNICATION_RULE_ACTIVATED" : "COMMUNICATION_RULE_DEACTIVATED", id, existingChannel); return { rule: json(id, (await snapshot.ref.get()).data() || {}) }; }
  if (action !== "update") throw new WhatsAppError("INVALID_INPUT", "Rule action is unsupported.", 400);
  const input = validated(request.rule); if (!canManage(context, input.channel)) forbidden(); await authoritativeTemplate(context, input.templateId, input.channel);
  await snapshot.ref.update({ ...input, companyId: context.companyId, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid }); await audit(context, "COMMUNICATION_RULE_UPDATED", id, input.channel); return { rule: json(id, (await snapshot.ref.get()).data() || {}) };
}

export async function simulateCommunicationEvent(context: ServerUserContext, body: unknown) {
  if (!canView(context, "email") && !canView(context, "whatsapp")) forbidden();
  if (!body || typeof body !== "object") throw new WhatsAppError("INVALID_INPUT", "Simulation details are required.", 400);
  const request = body as Record<string, unknown>; const trigger = String(request.trigger || "").trim();
  if (!(RULE_TRIGGERS as readonly string[]).includes(trigger)) throw new WhatsAppError("INVALID_INPUT", "Simulation trigger is invalid.", 400);
  const simulation = request.simulation && typeof request.simulation === "object" ? request.simulation as Record<string, unknown> : {};
  const variables = simulation.variables && typeof simulation.variables === "object" ? Object.fromEntries(Object.entries(simulation.variables as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")])) : {};
  const recipientData = simulation.recipient && typeof simulation.recipient === "object" ? simulation.recipient as Record<string, unknown> : {};
  const recipient = { display: String(recipientData.display || ""), destination: String(recipientData.destination || ""), preference: recipientData.preference };
  const snapshots = await rulesFor(context.companyId).orderBy("updatedAt", "desc").limit(250).get();
  const matched = snapshots.docs.map((doc) => ({ id: doc.id, rule: validated(doc.data()) })).filter(({ rule }) => rule.trigger === trigger && canView(context, rule.channel));
  if (!matched.length) return { trigger, plans: [planCommunication({ rule: null, template: null, recipient, variables })], sent: false };
  const plans = await Promise.all(matched.map(async ({ id, rule }) => ({ ruleId: id, ruleName: rule.name, ...planCommunication({ rule, template: await planningTemplate(context, rule.templateId), recipient, variables }) })));
  await audit(context, "COMMUNICATION_EVENT_SIMULATED", "event-dry-run", "multi", { sent: false, trigger, matchedRules: plans.length });
  return { trigger, plans, sent: false };
}
