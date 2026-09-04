import "server-only";

import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type { ServerUserContext } from "./auth";
import { WhatsAppError } from "./errors";
import { idempotencyKey } from "./idempotencyCore";
import { assertJobCustomer, linkedJobsFromConversation } from "./jobAssociationCore";
import { MetaWhatsAppClient } from "./metaClient";
import { assertManualOutboundEnabled, classifySendFailure, validateManualSendBody, type SendRequestState } from "./outboundCore";
import { requireWhatsAppPermission } from "./permissions";
import { normalizeE164 } from "./phoneNumbers";
import { enforceRateLimit } from "./rateLimit";
import { getWhatsAppSecret } from "./secrets";
import { assertServiceWindowOpen } from "./serviceWindow";
import { getWhatsAppSettings } from "./settings";
import { mayApplyDeliveryStatus, type DeliveryState } from "./statusCore";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function auditRef(companyId: string, requestId: string, action: string) {
  return adminDb.doc(`companies/${companyId}/whatsappAuditLog/${idempotencyKey(`${requestId}:${action}`)}`);
}

async function recordTerminalFailure(companyId: string, requestRef: FirebaseFirestore.DocumentReference, requestId: string, state: SendRequestState, reason: string, retryable: boolean) {
  await adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(requestRef);
    if (!current.exists || current.data()?.state !== "processing") return;
    const action = state === "outcome_unknown" ? "MESSAGE_SEND_OUTCOME_UNKNOWN" : "MESSAGE_SEND_FAILED";
    transaction.update(requestRef, { state, failureReason: reason, retryable, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(auditRef(companyId, requestId, action), { companyId, action, result: state, requestId, conversationId: current.data()?.conversationId, userId: current.data()?.userId, jobId: current.data()?.jobId || null, failureReason: reason, createdAt: FieldValue.serverTimestamp() });
  });
}

async function persistAcceptedRequest(context: ServerUserContext, requestRef: FirebaseFirestore.DocumentReference) {
  await adminDb.runTransaction(async (transaction) => {
    const request = await transaction.get(requestRef);
    if (!request.exists || request.data()?.state !== "accepted" || request.data()?.messagePersisted === true) return;
    const data = request.data() || {};
    const metaMessageId = String(data.metaMessageId || "");
    if (!metaMessageId) return;
    const conversationRef = adminDb.doc(`companies/${context.companyId}/whatsappConversations/${data.conversationId}`);
    const messageRef = adminDb.doc(`companies/${context.companyId}/whatsappMessages/${idempotencyKey(metaMessageId)}`);
    const conversation = await transaction.get(conversationRef);
    const existingMessage = await transaction.get(messageRef);
    const earlyReceipts = await transaction.get(adminDb.collection(`companies/${context.companyId}/whatsappDeliveryStatuses`).where("metaMessageId", "==", metaMessageId));
    if (!conversation.exists) throw new WhatsAppError("NOT_FOUND", "This WhatsApp conversation no longer exists.", 404);
    let status: DeliveryState = "sent";
    for (const receipt of earlyReceipts.docs.sort((a, b) => Number(a.data().metaTimestamp?.toMillis?.() || 0) - Number(b.data().metaTimestamp?.toMillis?.() || 0))) {
      const incoming = String(receipt.data().status || "") as DeliveryState;
      if (mayApplyDeliveryStatus(status, incoming)) status = incoming;
      transaction.update(receipt.ref, { matched: true, messageId: messageRef.id, reconciledAt: FieldValue.serverTimestamp() });
    }
    const acceptedAt = data.acceptedAt instanceof Timestamp ? data.acceptedAt : Timestamp.now();
    if (!existingMessage.exists) transaction.create(messageRef, {
      conversationId: data.conversationId, companyId: context.companyId,
      customerId: conversation.data()?.customerId || null, contactId: conversation.data()?.contactId || null,
      jobId: data.jobId || null, jobNumber: data.jobNumber || null,
      direction: "outgoing", sender: data.phoneNumberId, recipient: data.recipient,
      messageType: "text", messageText: data.text, metaMessageId, webhookEventId: null,
      rawMessageType: "text", metaTimestamp: acceptedAt, status,
      sentAt: acceptedAt, deliveredAt: status === "delivered" || status === "read" ? acceptedAt : null,
      readAt: status === "read" ? acceptedAt : null, failedAt: status === "failed" ? acceptedAt : null,
      failureReason: null, errorCode: null, errorDetails: null,
      createdBy: data.userId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(conversationRef, { lastMessageText: String(data.text).slice(0, 500), lastMessageAt: acceptedAt, lastOutboundAt: acceptedAt, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(requestRef, { messageId: messageRef.id, messagePersisted: true, updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function sendManualText(context: ServerUserContext, conversationId: string, body: unknown) {
  requireWhatsAppPermission(context.companyUser, "Send WhatsApp messages");
  assertManualOutboundEnabled(process.env);
  if (!ID_PATTERN.test(conversationId)) throw new WhatsAppError("INVALID_INPUT", "Conversation ID is invalid.", 400);
  const input = validateManualSendBody(body);
  const conversationRef = adminDb.doc(`companies/${context.companyId}/whatsappConversations/${conversationId}`);
  const conversation = await conversationRef.get();
  if (!conversation.exists) throw new WhatsAppError("NOT_FOUND", "This WhatsApp conversation no longer exists.", 404);
  const conversationData = conversation.data() || {};
  const settings = await getWhatsAppSettings(context.companyId);
  if (!settings.phoneNumberId || settings.phoneNumberId !== process.env.META_WHATSAPP_PHONE_NUMBER_ID) throw new WhatsAppError("CONFIGURATION_ERROR", "The tenant WhatsApp number does not match the configured staging test number.", 503);
  assertServiceWindowOpen(conversationData.serviceWindowExpiresAt?.toDate?.() || null);
  const recipient = normalizeE164(String(conversationData.phoneNumberNormalized || conversationData.phoneNumber || ""), settings.defaultCountryCode);
  const linkedJobs = linkedJobsFromConversation(conversationData);
  const selectedJob = input.jobId ? linkedJobs.find((job) => job.jobId === input.jobId) : null;
  if (input.jobId && !selectedJob) throw new WhatsAppError("FORBIDDEN", "The selected job is not linked to this conversation.", 403);
  if (selectedJob) {
    const job = await adminDb.doc(`companies/${context.companyId}/jobs/${selectedJob.jobId}`).get();
    if (!job.exists) throw new WhatsAppError("NOT_FOUND", "The selected FleetFix job no longer exists.", 404);
    assertJobCustomer(conversationData.customerId, job.data()?.customerId);
    selectedJob.jobNumber = String(job.data()?.jobNumber || job.id);
  }

  const requestId = idempotencyKey(`${context.companyId}:${conversationId}:${input.clientRequestId}`);
  const requestRef = adminDb.doc(`companies/${context.companyId}/whatsappSendRequests/${requestId}`);
  const claimed = await adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(requestRef);
    if (existing.exists) return false;
    transaction.create(requestRef, {
      companyId: context.companyId, conversationId, clientRequestId: input.clientRequestId,
      state: "processing", text: input.text, recipient, phoneNumberId: settings.phoneNumberId,
      jobId: selectedJob?.jobId || null, jobNumber: selectedJob?.jobNumber || null,
      userId: context.uid, attemptCount: 1, messagePersisted: false,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(auditRef(context.companyId, requestId, "MESSAGE_SEND_REQUESTED"), { companyId: context.companyId, action: "MESSAGE_SEND_REQUESTED", result: "processing", requestId, conversationId, userId: context.uid, jobId: selectedJob?.jobId || null, createdAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed) {
    const existing = await requestRef.get();
    if (existing.data()?.state === "accepted") await persistAcceptedRequest(context, requestRef).catch(() => undefined);
    const refreshed = await requestRef.get();
    return { requestId, state: refreshed.data()?.state || "processing", messageId: refreshed.data()?.messageId || null, duplicate: true, persistencePending: refreshed.data()?.state === "accepted" && refreshed.data()?.messagePersisted !== true };
  }

  try {
    await enforceRateLimit(context.companyId, "manual-send-company", context.companyId, { limit: 20, windowSeconds: 60 });
    await enforceRateLimit(context.companyId, "manual-send-user", context.uid, { limit: 10, windowSeconds: 60 });
    const client = new MetaWhatsAppClient({ accessToken: getWhatsAppSecret(settings.accessTokenSecretName), phoneNumberId: settings.phoneNumberId, graphApiVersion: settings.graphApiVersion });
    const response = await client.sendText(recipient, input.text);
    const metaMessageId = response.messages[0].id;
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(requestRef);
      if (current.data()?.state !== "processing") return;
      transaction.update(requestRef, { state: "accepted", metaMessageId, acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.create(auditRef(context.companyId, requestId, "MESSAGE_SEND_ACCEPTED"), { companyId: context.companyId, action: "MESSAGE_SEND_ACCEPTED", result: "accepted", requestId, conversationId, userId: context.uid, jobId: selectedJob?.jobId || null, metaMessageId, createdAt: FieldValue.serverTimestamp() });
    });
    await persistAcceptedRequest(context, requestRef).catch(() => undefined);
    const stored = await requestRef.get();
    return { requestId, state: "accepted", messageId: stored.data()?.messageId || null, duplicate: false, persistencePending: stored.data()?.messagePersisted !== true };
  } catch (error) {
    const failure = classifySendFailure(error);
    await recordTerminalFailure(context.companyId, requestRef, requestId, failure.state, failure.reason, failure.retryable);
    return { requestId, state: failure.state, messageId: null, duplicate: false, persistencePending: false, retryable: failure.retryable };
  }
}
