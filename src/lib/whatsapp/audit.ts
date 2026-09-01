import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";

export type WhatsAppAuditAction =
  | "MESSAGE_SENT" | "MESSAGE_RECEIVED" | "TEMPLATE_SENT" | "MESSAGE_FAILED"
  | "CONVERSATION_ASSIGNED" | "CONVERSATION_CLOSED" | "AUTOMATION_TRIGGERED"
  | "AUTOMATION_SKIPPED" | "SETTINGS_CHANGED" | "WEBHOOK_ACCEPTED" | "WEBHOOK_REJECTED";

export async function writeWhatsAppAudit(input: {
  companyId: string;
  action: WhatsAppAuditAction;
  result: "success" | "failure" | "skipped";
  userId?: string;
  jobId?: string;
  customerId?: string;
  messageId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const ref = await adminDb.collection(`companies/${input.companyId}/whatsappAuditLog`).add({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
