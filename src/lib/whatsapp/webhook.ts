import "server-only";

import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { WhatsAppError } from "./errors";
import { idempotencyKey } from "./idempotencyCore";
import { parseMetaWebhookPayload, webhookPhoneNumberIds, type MetaWebhookPayload } from "./schemas";

export async function resolveWebhookCompany(payload: MetaWebhookPayload): Promise<{ companyId: string; phoneNumberId: string }> {
  const phoneNumberIds = webhookPhoneNumberIds(payload);
  if (phoneNumberIds.length !== 1) {
    throw new WhatsAppError("INVALID_INPUT", "Webhook must contain one WhatsApp phone number ID.", 400);
  }
  const phoneNumberId = phoneNumberIds[0];
  const snapshot = await adminDb.collectionGroup("whatsappSettings")
    .where("phoneNumberId", "==", phoneNumberId)
    .limit(3)
    .get();
  const matches = snapshot.docs.filter((document) => document.data().enabled === true);
  if (matches.length !== 1) {
    throw new WhatsAppError("NOT_FOUND", "No unique enabled WhatsApp configuration matches this webhook.", 404);
  }
  const companyId = matches[0].ref.parent.parent?.id;
  if (!companyId) throw new WhatsAppError("CONFIGURATION_ERROR", "WhatsApp company configuration is invalid.", 500);
  return { companyId, phoneNumberId };
}

export function webhookEventKey(payload: MetaWebhookPayload, rawBody: string): string {
  const ids = payload.entry.flatMap((entry) => entry.changes.flatMap((change) => [
    ...(change.value.messages || []).map((message) => message.id),
    ...(change.value.statuses || []).map((status) => `${status.id}:${status.status}`),
  ])).filter(Boolean);
  return ids.length ? ids.sort().join("|") : idempotencyKey(rawBody);
}

export async function validateWebhookEnvelope(rawBody: string): Promise<{
  payload: MetaWebhookPayload;
  companyId: string;
  eventKey: string;
  payloadHash: string;
}> {
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); }
  catch { throw new WhatsAppError("INVALID_INPUT", "Webhook body must be valid JSON.", 400); }
  const payload = parseMetaWebhookPayload(parsed);
  const { companyId } = await resolveWebhookCompany(payload);
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  return { payload, companyId, eventKey: webhookEventKey(payload, rawBody), payloadHash: bodyHash };
}
