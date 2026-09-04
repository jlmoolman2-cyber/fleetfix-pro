import test from "node:test";
import assert from "node:assert/strict";
import { buildManualAssociation } from "../../src/lib/whatsapp/associationCore.ts";
import { userHasPermission } from "../../src/lib/whatsapp/permissions.ts";
import { OUTBOUND_WHATSAPP_ENABLED } from "../../src/lib/whatsapp/serviceWindow.ts";

const conversation = {
  phoneNumber: "+27823206967",
  phoneNumberNormalized: "+27823206967",
  phoneNumberWaId: "27823206967",
  jobId: "job-1",
  jobNumber: "JOB-1001",
  status: "unassigned",
};

function associate(contactId: string | null = null) {
  return buildManualAssociation({
    conversationId: "conversation-1",
    conversation,
    customerId: "customer-1",
    customer: { id: "customer-1", exists: true, data: { companyName: "ABC Logistics" } },
    contactId,
    contact: contactId ? { id: contactId, exists: true, customerId: "customer-1", data: { name: "John Smith" } } : null,
    actorUserId: "administrator-1",
  });
}

test("an unknown conversation can be associated with a customer only", () => {
  const result = associate();
  assert.equal(result.conversationUpdate.customerId, "customer-1");
  assert.equal(result.conversationUpdate.customerName, "ABC Logistics");
  assert.equal(result.conversationUpdate.contactId, null);
  assert.equal(result.conversationUpdate.contactName, "");
  assert.equal(result.conversationUpdate.linkMethod, "manual");
  assert.equal(result.conversationUpdate.needsCustomerAssignment, false);
});

test("an unknown conversation can be associated with a customer contact", () => {
  const result = associate("contact-1");
  assert.equal(result.conversationUpdate.contactId, "contact-1");
  assert.equal(result.conversationUpdate.contactName, "John Smith");
});

test("invalid and cross-tenant customer records are rejected", () => {
  assert.throws(() => buildManualAssociation({
    conversationId: "conversation-1", conversation, customerId: "customer-1",
    customer: { id: "customer-from-another-tenant", exists: true, data: {} },
    contactId: null, contact: null, actorUserId: "user-1",
  }), /selected customer is unavailable/i);
  assert.throws(() => buildManualAssociation({
    conversationId: "conversation-1", conversation, customerId: "missing-customer",
    customer: { id: "missing-customer", exists: false, data: {} },
    contactId: null, contact: null, actorUserId: "user-1",
  }), /selected customer is unavailable/i);
});

test("invalid contacts and contacts outside the selected customer are rejected", () => {
  assert.throws(() => buildManualAssociation({
    conversationId: "conversation-1", conversation, customerId: "customer-1",
    customer: { id: "customer-1", exists: true, data: {} }, contactId: "missing-contact",
    contact: { id: "missing-contact", exists: false, customerId: "customer-1", data: {} }, actorUserId: "user-1",
  }), /selected contact is unavailable/i);
  assert.throws(() => buildManualAssociation({
    conversationId: "conversation-1", conversation, customerId: "customer-1",
    customer: { id: "customer-1", exists: true, data: {} }, contactId: "contact-1",
    contact: { id: "contact-1", exists: true, customerId: "customer-2", data: {} }, actorUserId: "user-1",
  }), /does not belong to the selected customer/i);
});

test("association regenerates search tokens and writes the expected audit event", () => {
  const result = associate("contact-1");
  assert.ok(result.conversationUpdate.searchTokens.includes("abc logistics"));
  assert.ok(result.conversationUpdate.searchTokens.includes("john smith"));
  assert.ok(result.conversationUpdate.searchTokens.includes("27823206967"));
  assert.ok(result.conversationUpdate.searchTokens.includes("job-1001"));
  assert.deepEqual(result.audit, {
    action: "CONVERSATION_ASSOCIATED", result: "success", conversationId: "conversation-1",
    customerId: "customer-1", contactId: "contact-1", userId: "administrator-1",
  });
});

test("association preserves phone, WhatsApp identity, job assignment, and status", () => {
  const updated = { ...conversation, ...associate("contact-1").conversationUpdate };
  assert.equal(updated.phoneNumberNormalized, conversation.phoneNumberNormalized);
  assert.equal(updated.phoneNumberWaId, conversation.phoneNumberWaId);
  assert.equal(updated.jobId, conversation.jobId);
  assert.equal(updated.jobNumber, conversation.jobNumber);
  assert.equal(updated.status, conversation.status);
});

test("Manage WhatsApp conversations is required and remains granted to administrators", () => {
  assert.equal(userHasPermission({ permissions: { "Manage WhatsApp conversations": false } }, "Manage WhatsApp conversations"), false);
  assert.equal(userHasPermission({ primaryRole: "Administrator" }, "Manage WhatsApp conversations"), true);
});

test("manual association does not enable outbound WhatsApp sending", () => {
  assert.equal(OUTBOUND_WHATSAPP_ENABLED, false);
});
