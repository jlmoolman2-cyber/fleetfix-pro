import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { idempotencyKey } from "./idempotencyCore";
import { mayApplyDeliveryStatus, type DeliveryState } from "./statusCore";
import type { MetaWebhookPayload } from "./schemas";

type MetaStatus = NonNullable<MetaWebhookPayload["entry"][number]["changes"][number]["value"]["statuses"]>[number];
const supported = new Set<DeliveryState>(["sent", "delivered", "read", "failed"]);

function statusDate(value?: string): Timestamp {
  const milliseconds = Number(value) * 1000;
  return Timestamp.fromDate(Number.isFinite(milliseconds) && milliseconds > 0 ? new Date(milliseconds) : new Date());
}

function safeFailure(status: MetaStatus) {
  const error = status.errors?.[0];
  return {
    errorCode: error?.code == null ? null : String(error.code).slice(0, 50),
    failureReason: String(error?.title || error?.message || "Meta reported a delivery failure.").slice(0, 300),
    errorDetails: String(error?.error_data?.details || "").slice(0, 500) || null,
  };
}

export async function processDeliveryStatus(input: {
  companyId: string;
  webhookEventId: string;
  status: MetaStatus;
}): Promise<"updated" | "duplicate" | "ignored" | "unmatched"> {
  const metaMessageId = String(input.status.id || "");
  const incoming = String(input.status.status || "") as DeliveryState;
  if (!metaMessageId || !supported.has(incoming)) return "ignored";
  const occurredAt = statusDate(input.status.timestamp);
  const deliveryId = idempotencyKey(`${metaMessageId}:${incoming}:${input.status.timestamp || ""}`);
  const messageId = idempotencyKey(metaMessageId);
  const deliveryRef = adminDb.doc(`companies/${input.companyId}/whatsappDeliveryStatuses/${deliveryId}`);
  const messageRef = adminDb.doc(`companies/${input.companyId}/whatsappMessages/${messageId}`);
  const auditRef = adminDb.doc(`companies/${input.companyId}/whatsappAuditLog/${idempotencyKey(`${deliveryId}:DELIVERY_STATUS_CHANGED`)}`);

  return adminDb.runTransaction(async (transaction) => {
    const [existingDelivery, messageSnapshot] = await Promise.all([
      transaction.get(deliveryRef), transaction.get(messageRef),
    ]);
    if (existingDelivery.exists) return "duplicate";
    const failure = incoming === "failed" ? safeFailure(input.status) : { errorCode: null, failureReason: null, errorDetails: null };
    transaction.create(deliveryRef, {
      companyId: input.companyId,
      messageId: messageSnapshot.exists ? messageId : null,
      metaMessageId,
      webhookEventId: input.webhookEventId,
      status: incoming,
      metaTimestamp: occurredAt,
      matched: messageSnapshot.exists,
      ...failure,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (!messageSnapshot.exists) return "unmatched";
    const current = String(messageSnapshot.data()?.status || "pending") as DeliveryState;
    if (!mayApplyDeliveryStatus(current, incoming)) return "ignored";
    const timestampField = incoming === "sent" ? "sentAt" : incoming === "delivered" ? "deliveredAt" : incoming === "read" ? "readAt" : "failedAt";
    transaction.update(messageRef, {
      status: incoming,
      [timestampField]: occurredAt,
      ...(incoming === "failed" ? failure : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(auditRef, {
      companyId: input.companyId,
      action: "DELIVERY_STATUS_CHANGED",
      result: "success",
      messageId,
      previousStatus: current,
      status: incoming,
      createdAt: FieldValue.serverTimestamp(),
    });
    return "updated";
  });
}
