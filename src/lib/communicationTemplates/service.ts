import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type { ServerUserContext } from "@/lib/whatsapp/auth";
import { WhatsAppError } from "@/lib/whatsapp/errors";
import { userHasPermission } from "@/lib/whatsapp/permissions";
import { COMMUNICATION_VARIABLES, exampleVariableValues, renderCommunicationTemplate, validateCommunicationTemplate, variablesUsed, type CommunicationChannel } from "./core";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const collectionFor = (companyId: string) => adminDb.collection(`companies/${companyId}/communicationTemplates`);
const forbidden = () => { throw new WhatsAppError("FORBIDDEN", "You do not have permission to use these communication templates.", 403); };

function validatedTemplate(value: unknown) {
  try {
    return validateCommunicationTemplate(value);
  } catch (error) {
    throw new WhatsAppError(
      "INVALID_INPUT",
      error instanceof Error ? error.message : "Template details are invalid.",
      400,
    );
  }
}

function canView(context: ServerUserContext, channel: CommunicationChannel) {
  return channel === "whatsapp"
    ? userHasPermission(context.companyUser, "View WhatsApp") || userHasPermission(context.companyUser, "Manage WhatsApp templates")
    : context.companyUser.permissions?.["View messages"] === true || context.companyUser.permissions?.["Manage message templates"] === true || ["Business Owner", "Administrator", "Super Admin"].includes(String(context.companyUser.primaryRole || context.companyUser.role || ""));
}

function canManage(context: ServerUserContext, channel: CommunicationChannel) {
  return channel === "whatsapp"
    ? userHasPermission(context.companyUser, "Manage WhatsApp templates")
    : context.companyUser.permissions?.["Manage message templates"] === true || ["Business Owner", "Administrator", "Super Admin"].includes(String(context.companyUser.primaryRole || context.companyUser.role || ""));
}

function json(id: string, data: FirebaseFirestore.DocumentData) {
  const iso = (value: unknown) => value && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate(): Date }).toDate().toISOString() : null;
  return { id, name: data.name, description: data.description, category: data.category, recipientType: data.recipientType, channel: data.channel, purpose: data.purpose, active: data.active !== false, subject: data.subject || "", body: data.body || "", availableVariables: data.availableVariables || [], createdAt: iso(data.createdAt), createdBy: data.createdBy || "", updatedAt: iso(data.updatedAt), updatedBy: data.updatedBy || "", metaTemplate: data.metaTemplate || null };
}

async function ownedTemplate(context: ServerUserContext, id: string) {
  if (!ID_PATTERN.test(id)) throw new WhatsAppError("INVALID_INPUT", "Template ID is invalid.", 400);
  const snapshot = await collectionFor(context.companyId).doc(id).get();
  if (!snapshot.exists || snapshot.data()?.companyId !== context.companyId) throw new WhatsAppError("NOT_FOUND", "Communication template not found.", 404);
  return snapshot;
}

async function audit(context: ServerUserContext, action: string, templateId: string, channel: string) {
  await adminDb.collection(`companies/${context.companyId}/audit_log`).add({ action, entityType: "communicationTemplate", entityId: templateId, description: `${action} ${channel} communication template`, userId: context.uid, createdAt: FieldValue.serverTimestamp(), occurredAt: FieldValue.serverTimestamp() });
}

export async function listCommunicationTemplates(context: ServerUserContext, url: URL) {
  const snapshots = await collectionFor(context.companyId).orderBy("updatedAt", "desc").limit(250).get();
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase().slice(0, 80);
  const channel = String(url.searchParams.get("channel") || ""); const category = String(url.searchParams.get("category") || ""); const active = url.searchParams.get("active");
  const items = snapshots.docs.map((doc) => json(doc.id, doc.data())).filter((item) => canView(context, item.channel)).filter((item) => !channel || item.channel === channel).filter((item) => !category || item.category === category).filter((item) => active == null || active === "" || item.active === (active === "true")).filter((item) => !search || `${item.name} ${item.description} ${item.purpose}`.toLowerCase().includes(search));
  if (!canView(context, "email") && !canView(context, "whatsapp")) forbidden();
  return { items, variables: COMMUNICATION_VARIABLES, capabilities: { manageEmail: canManage(context, "email"), manageWhatsApp: canManage(context, "whatsapp"), viewEmail: canView(context, "email"), viewWhatsApp: canView(context, "whatsapp") } };
}

export async function createCommunicationTemplate(context: ServerUserContext, body: unknown) {
  const input = validatedTemplate(body); if (!canManage(context, input.channel)) forbidden();
  const ref = collectionFor(context.companyId).doc();
  await ref.create({ ...input, companyId: context.companyId, availableVariables: variablesUsed(input), metaTemplate: null, createdAt: FieldValue.serverTimestamp(), createdBy: context.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid });
  await audit(context, "TEMPLATE_CREATED", ref.id, input.channel);
  return { template: json(ref.id, (await ref.get()).data() || {}) };
}

export async function getCommunicationTemplate(context: ServerUserContext, id: string) {
  const snapshot = await ownedTemplate(context, id); const item = json(snapshot.id, snapshot.data() || {}); if (!canView(context, item.channel)) forbidden();
  return { template: item, variables: COMMUNICATION_VARIABLES };
}

export async function mutateCommunicationTemplate(context: ServerUserContext, id: string, body: unknown) {
  if (!body || typeof body !== "object") throw new WhatsAppError("INVALID_INPUT", "Template action is invalid.", 400);
  const request = body as Record<string, unknown>; const snapshot = await ownedTemplate(context, id); const existing = snapshot.data() || {}; const existingChannel = existing.channel as CommunicationChannel;
  const action = String(request.action || "update");
  if (action === "preview") {
    if (!canView(context, existingChannel)) forbidden(); const input = validatedTemplate(request.template || existing); if (!canView(context, input.channel)) forbidden(); const values = exampleVariableValues();
    return { subject: renderCommunicationTemplate(input.subject, values), body: renderCommunicationTemplate(input.body, values), sent: false };
  }
  if (!canManage(context, existingChannel)) forbidden();
  if (action === "duplicate") {
    const input = validatedTemplate({ ...existing, name: `${existing.name} (Copy)` }); const ref = collectionFor(context.companyId).doc();
    await ref.create({ ...input, companyId: context.companyId, active: false, availableVariables: variablesUsed(input), metaTemplate: existing.metaTemplate || null, createdAt: FieldValue.serverTimestamp(), createdBy: context.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid });
    await audit(context, "TEMPLATE_DUPLICATED", ref.id, input.channel); return { template: json(ref.id, (await ref.get()).data() || {}) };
  }
  if (action === "set-active") {
    const active = request.active === true; await snapshot.ref.update({ active, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid });
    await audit(context, active ? "TEMPLATE_ACTIVATED" : "TEMPLATE_DEACTIVATED", id, existingChannel); return { template: json(id, (await snapshot.ref.get()).data() || {}) };
  }
  if (action !== "update") throw new WhatsAppError("INVALID_INPUT", "Template action is unsupported.", 400);
  const input = validatedTemplate(request.template); if (!canManage(context, input.channel)) forbidden();
  await snapshot.ref.update({ ...input, companyId: context.companyId, availableVariables: variablesUsed(input), updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid });
  await audit(context, "TEMPLATE_UPDATED", id, input.channel); return { template: json(id, (await snapshot.ref.get()).data() || {}) };
}
