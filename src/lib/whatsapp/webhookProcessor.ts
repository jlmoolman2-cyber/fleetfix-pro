import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { processDeliveryStatus } from "./deliveryStatusService";
import { idempotencyKey } from "./idempotencyCore";
import { processIncomingMessage } from "./messageService";
import type { MetaWebhookPayload } from "./schemas";
import { getWhatsAppSettings } from "./settings";

export async function writeWebhookLifecycleAudit(companyId: string, eventId: string, action: string, result: string) {
  const ref = adminDb.doc(`companies/${companyId}/whatsappAuditLog/${idempotencyKey(`${eventId}:${action}`)}`);
  await ref.set({
    companyId,
    action,
    result,
    webhookEventId: eventId,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function processMetaWebhook(companyId: string, eventId: string, payload: MetaWebhookPayload): Promise<void> {
  const settings = await getWhatsAppSettings(companyId);
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const phoneNumberId = String(change.value.metadata?.phone_number_id || "");
      if (phoneNumberId !== settings.phoneNumberId) throw new Error("Webhook phone number does not match company settings.");
      for (const message of change.value.messages || []) {
        await processIncomingMessage({
          companyId,
          webhookEventId: eventId,
          phoneNumberId,
          defaultCountryCode: settings.defaultCountryCode,
          message,
        });
      }
      for (const status of change.value.statuses || []) {
        await processDeliveryStatus({ companyId, webhookEventId: eventId, status });
      }
    }
  }
}
