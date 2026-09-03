import "server-only";

import type { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { chooseJobLink, extractJobNumberCandidates, isActiveJob, uniqueEntityMatch, type ActiveJobCandidate } from "./linkingCore";
import type { LinkMethod } from "./models";
import { normalizedPhoneValues } from "./phoneIndex";
import { existingConversationJobContext, linkedJobsFromConversation, type LinkedJob } from "./jobAssociationCore";

export type ConversationLink = {
  existingConversationId: string | null;
  customerId: string | null;
  contactId: string | null;
  customerName: string | null;
  contactName: string | null;
  jobId: string | null;
  jobNumber: string | null;
  conversationJobId: string | null;
  conversationJobNumber: string | null;
  linkConfidence: "high" | "medium" | "none";
  linkMethod: LinkMethod;
  needsJobAssignment: boolean;
};

type EntityMatch = { customerId: string; contactId: string | null; customerName: string; contactName: string; source: "customer_phone" | "contact_phone" };

function normalizedLegacyPhone(data: DocumentData, defaultCountryCode: string): string[] {
  return normalizedPhoneValues([
    data.whatsappNumberE164, data.primaryContactNumber, data.mobile, data.phone,
    data.phone1, data.contactNumber, data.mobileNumber1,
  ], defaultCountryCode);
}

async function findExistingConversation(companyId: string, waId: string) {
  const snapshot = await adminDb.collection(`companies/${companyId}/whatsappConversations`)
    .where("phoneNumberWaId", "==", waId).limit(20).get();
  return snapshot.docs.find((document) => document.data().status !== "closed") || null;
}

async function findEntityMatches(companyId: string, normalizedPhone: string): Promise<EntityMatch[]> {
  const [customers, contacts] = await Promise.all([
    adminDb.collection(`companies/${companyId}/customers`).where("normalizedPhoneNumbers", "array-contains", normalizedPhone).limit(10).get(),
    adminDb.collectionGroup("contacts").where("companyId", "==", companyId)
      .where("normalizedPhoneNumbers", "array-contains", normalizedPhone).limit(10).get(),
  ]);
  const matches: EntityMatch[] = [];
  for (const customer of customers.docs) matches.push({
    customerId: customer.id, contactId: null,
    customerName: String(customer.data().companyName || customer.data().name || ""), contactName: "",
    source: "customer_phone",
  });
  for (const contact of contacts.docs) {
    const path = contact.ref.path.split("/");
    if (path[0] !== "companies" || path[1] !== companyId || path[2] !== "customers") continue;
    const customerId = path[3];
    const customer = await adminDb.doc(`companies/${companyId}/customers/${customerId}`).get();
    matches.push({
      customerId, contactId: contact.id,
      customerName: String(customer.data()?.companyName || customer.data()?.name || ""),
      contactName: String(contact.data().name || ""), source: "contact_phone",
    });
  }
  const unique = new Map(matches.map((match) => [`${match.customerId}:${match.contactId || ""}`, match]));
  return [...unique.values()];
}

function toJobCandidate(document: QueryDocumentSnapshot): ActiveJobCandidate {
  const data = document.data();
  return {
    id: document.id,
    jobNumber: String(data.jobNumber || document.id),
    customerId: String(data.customerId || ""),
    contactId: String(data.customerContactId || ""),
  };
}

async function activeJobsForEntity(companyId: string, entity: EntityMatch | null): Promise<ActiveJobCandidate[]> {
  if (!entity) return [];
  const snapshot = await adminDb.collection(`companies/${companyId}/jobs`)
    .where("customerId", "==", entity.customerId).get();
  const active = snapshot.docs.filter((document) => isActiveJob(document.data()));
  if (entity.contactId) {
    const direct = active.filter((document) => String(document.data().customerContactId || "") === entity.contactId);
    if (direct.length) return direct.map(toJobCandidate);
  }
  return active.map(toJobCandidate);
}

async function validatedExplicitJob(
  companyId: string,
  text: string,
  entity: EntityMatch | null,
  normalizedPhone: string,
  defaultCountryCode: string,
): Promise<ActiveJobCandidate | null> {
  const candidates = extractJobNumberCandidates(text);
  if (!candidates.length) return null;
  const snapshot = await adminDb.collection(`companies/${companyId}/jobs`).where("jobNumber", "in", candidates).get();
  const reasonable = snapshot.docs.filter((document) => {
    const job = document.data();
    if (entity) {
      if (String(job.customerId || "") !== entity.customerId) return false;
      return !entity.contactId || !job.customerContactId || String(job.customerContactId) === entity.contactId;
    }
    return normalizedLegacyPhone({
      whatsappNumberE164: job.customerContactNumber,
      primaryContactNumber: job.contactNumber,
    }, defaultCountryCode).includes(normalizedPhone);
  });
  return reasonable.length === 1 ? toJobCandidate(reasonable[0]) : null;
}

export async function linkIncomingConversation(input: {
  companyId: string;
  waId: string;
  normalizedPhone: string;
  messageText: string;
  defaultCountryCode: string;
}): Promise<ConversationLink> {
  const existing = await findExistingConversation(input.companyId, input.waId);
  if (existing) {
    const data = existing.data();
    const entity: EntityMatch | null = data.customerId ? {
      customerId: String(data.customerId), contactId: data.contactId ? String(data.contactId) : null,
      customerName: String(data.customerName || ""), contactName: String(data.contactName || ""),
      source: data.contactId ? "contact_phone" : "customer_phone",
    } : null;
    const storedJobs = linkedJobsFromConversation(data);
    const explicit = await validatedExplicitJob(input.companyId, input.messageText, entity, input.normalizedPhone, input.defaultCountryCode);
    const explicitLinked: LinkedJob | null = explicit ? {
      jobId: explicit.id, jobNumber: explicit.jobNumber, vehicleRegistration: "", fleetNumber: "", status: "",
      bookingAt: null, description: "", location: "",
    } : null;
    const context = existingConversationJobContext(storedJobs, explicitLinked);
    return {
      existingConversationId: existing.id,
      customerId: data.customerId || null,
      contactId: data.contactId || null,
      customerName: data.customerName || null,
      contactName: data.contactName || null,
      jobId: context.messageJobId,
      jobNumber: context.messageJobNumber,
      conversationJobId: context.conversationJobId,
      conversationJobNumber: context.conversationJobNumber,
      linkConfidence: data.linkConfidence || "high",
      linkMethod: "existing_conversation",
      needsJobAssignment: context.needsJobAssignment || data.needsJobAssignment === true,
    };
  }

  const matches = await findEntityMatches(input.companyId, input.normalizedPhone);
  const entity = uniqueEntityMatch(matches);
  const [activeJobs, explicitJob] = await Promise.all([
    activeJobsForEntity(input.companyId, entity),
    validatedExplicitJob(input.companyId, input.messageText, entity, input.normalizedPhone, input.defaultCountryCode),
  ]);
  const choice = chooseJobLink(activeJobs, explicitJob);
  if (!entity && !explicitJob) {
    return {
      existingConversationId: null, customerId: null, contactId: null, customerName: null, contactName: null, jobId: null, jobNumber: null,
      conversationJobId: null, conversationJobNumber: null,
      linkConfidence: "none", linkMethod: "unknown_number", needsJobAssignment: false,
    };
  }
  const customerId = entity?.customerId || explicitJob?.customerId || null;
  const contactId = entity?.contactId || explicitJob?.contactId || null;
  return {
    existingConversationId: null,
    customerId,
    contactId,
    customerName: entity?.customerName || null,
    contactName: entity?.contactName || null,
    jobId: choice.job?.id || null,
    jobNumber: choice.job?.jobNumber || null,
    conversationJobId: choice.job?.id || null,
    conversationJobNumber: choice.job?.jobNumber || null,
    linkConfidence: choice.job ? "high" : entity ? "medium" : "none",
    linkMethod: choice.method || entity?.source || "unknown_number",
    needsJobAssignment: choice.needsJobAssignment,
  };
}
