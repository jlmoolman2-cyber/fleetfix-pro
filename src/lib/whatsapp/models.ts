import "server-only";

import type { Timestamp } from "firebase-admin/firestore";

export type ConversationStatus = "open" | "closed" | "unassigned";
export type LinkMethod = "existing_conversation" | "contact_phone" | "customer_phone" | "single_active_job" | "explicit_job_number" | "unknown_number" | "multiple_active_jobs" | "manual";

export type WhatsAppConversation = {
  companyId: string;
  customerId: string | null;
  contactId: string | null;
  jobId: string | null;
  jobNumber: string | null;
  phoneNumber: string;
  phoneNumberNormalized: string;
  phoneNumberWaId: string;
  assignedUserId: string | null;
  status: ConversationStatus;
  unreadCount: number;
  lastMessageText: string;
  lastMessageAt: Timestamp;
  lastInboundAt: Timestamp;
  lastOutboundAt: Timestamp | null;
  serviceWindowExpiresAt: Timestamp;
  linkConfidence: "high" | "medium" | "none";
  linkMethod: LinkMethod;
  needsJobAssignment: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  closedAt: Timestamp | null;
  closedBy: string | null;
};

export type WhatsAppMessageStatus = "received" | "sent" | "delivered" | "read" | "failed";

export type WhatsAppMessage = {
  conversationId: string;
  companyId: string;
  customerId: string | null;
  contactId: string | null;
  jobId: string | null;
  jobNumber: string | null;
  direction: "incoming" | "outgoing";
  sender: string;
  recipient: string;
  messageType: string;
  messageText: string;
  metaMessageId: string;
  webhookEventId: string;
  rawMessageType: string;
  metaTimestamp: Timestamp;
  status: WhatsAppMessageStatus;
  sentAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  readAt: Timestamp | null;
  failedAt: Timestamp | null;
  failureReason: string | null;
  errorCode: string | null;
  errorDetails: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type WhatsAppSettings = {
  enabled: boolean;
  metaBusinessAccountId: string;
  whatsappBusinessAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  accessTokenSecretName: string;
  webhookVerificationSecretName: string;
  appSecretSecretName: string;
  defaultCountryCode: string;
  defaultNotificationMethod: "email" | "whatsapp" | "both" | "none";
  graphApiVersion: string;
};
