import { WhatsAppError } from "./errors.ts";
import { buildSearchTokens } from "./search.ts";

type EntityRecord = { id: string; exists: boolean; data: Record<string, unknown> };

export function buildManualAssociation(input: {
  conversationId: string;
  conversation: Record<string, unknown>;
  customerId: string;
  customer: EntityRecord;
  contactId: string | null;
  contact: (EntityRecord & { customerId: string }) | null;
  actorUserId: string;
}) {
  if (!input.customer.exists || input.customer.id !== input.customerId) {
    throw new WhatsAppError("NOT_FOUND", "The selected customer is unavailable.", 404);
  }
  if (input.contactId && (!input.contact?.exists || input.contact.id !== input.contactId)) {
    throw new WhatsAppError("NOT_FOUND", "The selected contact is unavailable.", 404);
  }
  if (input.contactId && input.contact?.customerId !== input.customerId) {
    throw new WhatsAppError("FORBIDDEN", "The selected contact does not belong to the selected customer.", 403);
  }

  const customerName = String(input.customer.data.companyName || input.customer.data.customerName || input.customer.data.name || "").trim();
  const contactName = input.contactId
    ? String(input.contact?.data.name || input.contact?.data.contactName || "").trim()
    : "";
  const conversationUpdate = {
    customerId: input.customerId,
    customerName,
    contactId: input.contactId,
    contactName,
    linkMethod: "manual",
    linkConfidence: "high",
    needsCustomerAssignment: false,
    updatedBy: input.actorUserId,
    searchTokens: buildSearchTokens([
      customerName,
      contactName,
      input.conversation.phoneNumberNormalized,
      input.conversation.phoneNumberWaId,
      input.conversation.jobNumber,
    ]),
  };
  return {
    conversationUpdate,
    audit: {
      action: "CONVERSATION_ASSOCIATED",
      result: "success",
      conversationId: input.conversationId,
      customerId: input.customerId,
      contactId: input.contactId,
      userId: input.actorUserId,
    },
  };
}
