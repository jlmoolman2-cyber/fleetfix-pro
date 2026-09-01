import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { linkIncomingConversation } from "./conversationLinker";
import { idempotencyKey } from "./idempotencyCore";
import { incrementUnreadOnce, safeIncomingMessageText } from "./messageCore";
import { preferExistingConversation } from "./linkingCore";
import { buildSearchTokens } from "./search";
import { normalizeE164 } from "./phoneNumbers";
import { serviceWindowExpiry } from "./statusCore";
import type { MetaWebhookPayload } from "./schemas";
import { mediaDescriptor } from "./mediaService";

function metaDate(timestamp?: string): Date {
  const milliseconds = Number(timestamp) * 1000;
  return Number.isFinite(milliseconds) && milliseconds > 0 ? new Date(milliseconds) : new Date();
}

function auditRef(companyId: string, metaMessageId: string, action: string) {
  return adminDb.doc(`companies/${companyId}/whatsappAuditLog/${idempotencyKey(`${metaMessageId}:${action}`)}`);
}

export async function processIncomingMessage(input: {
  companyId: string;
  webhookEventId: string;
  phoneNumberId: string;
  defaultCountryCode: string;
  message: NonNullable<MetaWebhookPayload["entry"][number]["changes"][number]["value"]["messages"]>[number];
}): Promise<"created" | "duplicate"> {
  const metaMessageId = String(input.message.id || "");
  const waId = String(input.message.from || "").replace(/\D/g, "");
  if (!metaMessageId || !waId) throw new Error("Incoming WhatsApp message is missing its Meta ID or sender.");
  const normalizedPhone = normalizeE164(`+${waId}`, input.defaultCountryCode);
  const messageText = safeIncomingMessageText(input.message);
  const link = await linkIncomingConversation({
    companyId: input.companyId,
    waId,
    normalizedPhone,
    messageText,
    defaultCountryCode: input.defaultCountryCode,
  });
  const inboundDate = metaDate(input.message.timestamp);
  const inboundAt = Timestamp.fromDate(inboundDate);
  const windowExpiresAt = Timestamp.fromDate(serviceWindowExpiry(inboundDate));
  const messageId = idempotencyKey(metaMessageId);
  // A stable per-company wa_id document prevents two simultaneous first
  // messages from creating parallel open conversations. A later close action
  // can safely be reopened by a new inbound message without losing history.
  const conversationId = preferExistingConversation(
    link.existingConversationId,
    idempotencyKey(`${input.companyId}:${waId}`).slice(0, 40),
  );
  const messageRef = adminDb.doc(`companies/${input.companyId}/whatsappMessages/${messageId}`);
  const conversationRef = adminDb.doc(`companies/${input.companyId}/whatsappConversations/${conversationId}`);

  const descriptor = mediaDescriptor(input.message);
  const result = await adminDb.runTransaction(async (transaction) => {
    const existingMessage = await transaction.get(messageRef);
    if (existingMessage.exists) return "duplicate";
    const conversationSnapshot = await transaction.get(conversationRef);
    const existingConversation = conversationSnapshot.data() || {};
    transaction.set(conversationRef, {
      companyId: input.companyId,
      customerId: link.customerId,
      contactId: link.contactId,
      customerName: link.customerName,
      contactName: link.contactName,
      jobId: link.jobId,
      jobNumber: link.jobNumber,
      phoneNumber: normalizedPhone,
      phoneNumberNormalized: normalizedPhone,
      phoneNumberWaId: waId,
      assignedUserId: existingConversation.assignedUserId || null,
      status: existingConversation.status === "closed" ? "open" : (existingConversation.status || (link.customerId ? "open" : "unassigned")),
      unreadCount: incrementUnreadOnce(false, Number(existingConversation.unreadCount || 0)),
      lastMessageText: messageText.slice(0, 500),
      lastMessageAt: inboundAt,
      lastInboundAt: inboundAt,
      lastOutboundAt: existingConversation.lastOutboundAt || null,
      serviceWindowExpiresAt: windowExpiresAt,
      linkConfidence: link.linkConfidence,
      linkMethod: link.linkMethod,
      needsJobAssignment: link.needsJobAssignment,
      searchTokens: buildSearchTokens([link.customerName, link.contactName, normalizedPhone, waId, link.jobNumber]),
      createdAt: existingConversation.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      closedAt: null,
      closedBy: null,
    }, { merge: true });
    transaction.create(messageRef, {
      conversationId,
      companyId: input.companyId,
      customerId: link.customerId,
      contactId: link.contactId,
      jobId: link.jobId,
      jobNumber: link.jobNumber,
      direction: "incoming",
      sender: waId,
      recipient: input.phoneNumberId,
      messageType: input.message.type === "text" ? "text" : (descriptor?.type || "unsupported"),
      messageText,
      metaMessageId,
      webhookEventId: input.webhookEventId,
      rawMessageType: String(input.message.type || "unknown").slice(0, 50),
      metaTimestamp: inboundAt,
      status: "received",
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failedAt: null,
      failureReason: null,
      errorCode: null,
      errorDetails: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      mediaId: descriptor?.id || null,
      mediaType: descriptor?.type || null,
      mediaIngestionStatus: descriptor ? "pending" : null,
    });
    if (descriptor) transaction.create(adminDb.doc(`companies/${input.companyId}/whatsappMediaJobs/${messageId}`), {
      companyId: input.companyId,
      messageId,
      conversationId,
      phoneNumberId: input.phoneNumberId,
      descriptor,
      status: "pending",
      attempts: 0,
      nextAttemptAt: FieldValue.serverTimestamp(),
      leaseExpiresAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const actions = [
      "MESSAGE_RECEIVED",
      conversationSnapshot.exists ? "CONVERSATION_LINKED" : "CONVERSATION_CREATED",
      link.linkMethod === "unknown_number" ? "CONVERSATION_UNASSIGNED" :
        link.needsJobAssignment ? "AMBIGUOUS_JOB_ASSOCIATION" : "CONVERSATION_AUTO_LINKED",
    ];
    for (const action of actions) transaction.set(auditRef(input.companyId, metaMessageId, action), {
      companyId: input.companyId,
      action,
      result: "success",
      messageId,
      conversationId,
      jobId: link.jobId,
      customerId: link.customerId,
      linkMethod: link.linkMethod,
      createdAt: FieldValue.serverTimestamp(),
    });
    return "created";
  });
  return result;
}
