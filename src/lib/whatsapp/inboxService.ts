import "server-only";

import { FieldPath, FieldValue, Timestamp, type DocumentData, type Query } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type { ServerUserContext } from "./auth";
import { WhatsAppError } from "./errors";
import { requireWhatsAppPermission, userHasPermission } from "./permissions";
import { buildSearchTokens, searchToken } from "./search";
import { buildManualAssociation } from "./associationCore";
import { sortMessagePageNewestFirst } from "./messageCore";
import { assertJobCustomer, JOB_LINKED_AUDIT_ACTION, JOB_UNLINKED_AUDIT_ACTION, MESSAGE_JOB_ASSIGNED_AUDIT_ACTION, jobMatchesSearch, linkJob, linkedJobsFromConversation, messageJobContextJson, needsJobAssignmentForLatest, unlinkJob, type LinkedJob } from "./jobAssociationCore";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PAGE_SIZE = 30;

function requireId(value: unknown, label: string): string {
  const id = String(value || "");
  if (!ID_PATTERN.test(id)) throw new WhatsAppError("INVALID_INPUT", `${label} is invalid.`, 400);
  return id;
}

function iso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate(): Date }).toDate().toISOString();
  return null;
}

function vehicleRegistration(job: DocumentData): string {
  return String(job.vehicleRegNo || job.vehicleRegistration || job.registration || job.regNo || job.vehicle?.vehicleReg || job.vehicle?.regNo || "");
}

function fleetNumber(job: DocumentData): string {
  return String(job.vehicleFleetNo || job.fleetNumber || job.fleetNo || job.vehicle?.fleetNo || job.vehicle?.fleetNumber || "");
}

function jobLocation(job: DocumentData): string {
  return String(job.locationDetails?.name || (typeof job.location === "string" ? job.location : job.location?.name) || "");
}

function linkedJobJson(job: LinkedJob) {
  return { ...job, bookingAt: iso(job.bookingAt) };
}

function linkedJobFromDocument(id: string, job: DocumentData): LinkedJob {
  return {
    jobId: id,
    jobNumber: String(job.jobNumber || id),
    vehicleRegistration: vehicleRegistration(job),
    fleetNumber: fleetNumber(job),
    status: String(job.status || ""),
    bookingAt: job.bookingAt || job.bookedAt || job.createdAt || job.dateBooked || null,
    description: String(job.description || job.complaint || ""),
    location: jobLocation(job),
  };
}

function conversationSearchValues(data: DocumentData, linkedJobs: LinkedJob[], customerName = String(data.customerName || "")) {
  return [customerName, data.contactName, data.phoneNumberNormalized, data.phoneNumberWaId,
    ...linkedJobs.flatMap((job) => [job.jobNumber, job.vehicleRegistration, job.fleetNumber])];
}

function recentMessagesQuery(companyId: string, conversationId: string) {
  return adminDb.collection(`companies/${companyId}/whatsappMessages`)
    .where("conversationId", "==", conversationId)
    .orderBy("metaTimestamp", "desc").orderBy(FieldPath.documentId(), "desc").limit(50);
}

function latestInboundJobId(snapshot: FirebaseFirestore.QuerySnapshot): unknown {
  return snapshot.docs.find((document) => document.data().direction === "incoming")?.data().jobId || null;
}

function encodeCursor(data: { milliseconds: number; id: string }): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

function decodeCursor(value: string | null): { milliseconds: number; id: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Number.isFinite(parsed.milliseconds) || !ID_PATTERN.test(parsed.id)) throw new Error();
    return parsed;
  } catch { throw new WhatsAppError("INVALID_INPUT", "The pagination cursor is invalid.", 400); }
}

function capabilities(context: ServerUserContext) {
  return {
    view: userHasPermission(context.companyUser, "View conversations"),
    manage: userHasPermission(context.companyUser, "Manage conversations"),
    assign: userHasPermission(context.companyUser, "Assign conversations"),
    close: userHasPermission(context.companyUser, "Close conversations"),
  };
}

function conversationJson(id: string, data: DocumentData) {
  const linkedJobs = linkedJobsFromConversation(data).map(linkedJobJson);
  return {
    id,
    customerId: data.customerId || null,
    contactId: data.contactId || null,
    customerName: String(data.customerName || ""),
    contactName: String(data.contactName || ""),
    jobId: data.jobId || null,
    jobNumber: data.jobNumber || null,
    phoneNumber: String(data.phoneNumberNormalized || data.phoneNumber || ""),
    assignedUserId: data.assignedUserId || null,
    assignedUserName: String(data.assignedUserName || ""),
    status: String(data.status || "open"),
    unreadCount: Math.max(0, Number(data.unreadCount || 0)),
    lastMessageText: String(data.lastMessageText || "").slice(0, 500),
    lastMessageAt: iso(data.lastMessageAt),
    lastInboundAt: iso(data.lastInboundAt),
    serviceWindowExpiresAt: iso(data.serviceWindowExpiresAt),
    needsJobAssignment: data.needsJobAssignment === true,
    linkMethod: String(data.linkMethod || ""),
    linkedJobs,
  };
}

export async function listConversations(context: ServerUserContext, url: URL) {
  requireWhatsAppPermission(context.companyUser, "View inbox");
  const scope = url.searchParams.get("scope") || "all";
  const search = String(url.searchParams.get("search") || "").trim().slice(0, 80);
  const assignedUser = String(url.searchParams.get("assignedUser") || "");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  let query: Query = adminDb.collection(`companies/${context.companyId}/whatsappConversations`);
  const boundedPostFilters: Array<(data: DocumentData) => boolean> = [];

  if (search) query = query.where("searchTokens", "array-contains", searchToken(search));
  else if (startDate || endDate) {
    if (startDate) query = query.where("lastMessageAt", ">=", Timestamp.fromDate(new Date(`${startDate}T00:00:00.000Z`)));
    if (endDate) query = query.where("lastMessageAt", "<=", Timestamp.fromDate(new Date(`${endDate}T23:59:59.999Z`)));
  } else if (assignedUser && ID_PATTERN.test(assignedUser)) query = query.where("assignedUserId", "==", assignedUser);
  else if (scope === "unread") query = query.where("unreadCount", ">", 0);
  else if (scope === "open") query = query.where("status", "==", "open");
  else if (scope === "closed") query = query.where("status", "==", "closed");
  else if (scope === "unassigned") query = query.where("status", "==", "unassigned");
  else if (scope === "mine") query = query.where("assignedUserId", "==", context.uid);
  else if (scope === "needs-job") query = query.where("needsJobAssignment", "==", true);

  if (search || startDate || endDate || assignedUser) {
    if (scope === "unread") boundedPostFilters.push((data) => Number(data.unreadCount || 0) > 0);
    if (scope === "open") boundedPostFilters.push((data) => data.status === "open");
    if (scope === "closed") boundedPostFilters.push((data) => data.status === "closed");
    if (scope === "unassigned") boundedPostFilters.push((data) => data.status === "unassigned");
    if (scope === "mine") boundedPostFilters.push((data) => data.assignedUserId === context.uid);
    if (scope === "needs-job") boundedPostFilters.push((data) => data.needsJobAssignment === true);
  }
  query = query.orderBy("lastMessageAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.milliseconds), cursor.id);
  const snapshot = await query.limit(boundedPostFilters.length ? 100 : PAGE_SIZE + 1).get();
  const filtered = snapshot.docs.filter((document) => boundedPostFilters.every((filter) => filter(document.data())));
  const page = filtered.slice(0, PAGE_SIZE);
  const usersSnapshot = await adminDb.collection(`companies/${context.companyId}/users`).limit(100).get();
  const items = page.map((document) => conversationJson(document.id, document.data()));
  const last = page.at(-1);
  return {
    items,
    nextCursor: (filtered.length > PAGE_SIZE || snapshot.size > page.length) && last
      ? encodeCursor({ milliseconds: last.data().lastMessageAt?.toMillis?.() || 0, id: last.id }) : null,
    currentUserId: context.uid,
    users: usersSnapshot.docs.filter((document) => document.data().active !== false).map((document) => ({
      id: document.id,
      name: String(document.data().name || document.data().displayName || `${document.data().firstName || ""} ${document.data().lastName || ""}`.trim() || document.data().email || "FleetFix user"),
    })),
    capabilities: capabilities(context),
  };
}

async function conversationDocument(context: ServerUserContext, conversationId: string) {
  const id = requireId(conversationId, "Conversation ID");
  const snapshot = await adminDb.doc(`companies/${context.companyId}/whatsappConversations/${id}`).get();
  if (!snapshot.exists) throw new WhatsAppError("NOT_FOUND", "This WhatsApp conversation no longer exists.", 404);
  return snapshot;
}

export async function getConversation(context: ServerUserContext, conversationId: string, jobSearch = "") {
  requireWhatsAppPermission(context.companyUser, "View conversations");
  const conversation = await conversationDocument(context, conversationId);
  const data = conversation.data() || {};
  const usersSnapshot = await adminDb.collection(`companies/${context.companyId}/users`).limit(100).get();
  let jobsQuery: Query = adminDb.collection(`companies/${context.companyId}/jobs`);
  if (data.customerId) jobsQuery = jobsQuery.where("customerId", "==", data.customerId);
  const jobsSnapshot = await jobsQuery.limit(100).get();
  const needle = jobSearch.trim().toLowerCase().slice(0, 80);
  const jobs = jobsSnapshot.docs.map((document) => {
    const job = document.data();
    const linked = linkedJobFromDocument(document.id, job);
    return {
      id: linked.jobId,
      jobNumber: linked.jobNumber,
      customerId: job.customerId || null,
      vehicleRegistration: linked.vehicleRegistration,
      fleetNumber: linked.fleetNumber,
      status: linked.status,
      active: job.isClosed !== true && job.isCompleted !== true && job.archived !== true,
      bookingAt: iso(linked.bookingAt) || String(linked.bookingAt || "") || null,
      description: linked.description,
      location: linked.location,
    };
  }).filter((job) => jobMatchesSearch({ ...job, jobId: job.id, bookingAt: job.bookingAt }, needle)).slice(0, 30);
  return {
    conversation: conversationJson(conversation.id, data),
    users: usersSnapshot.docs.filter((document) => document.data().active !== false).map((document) => ({
      id: document.id,
      name: String(document.data().name || document.data().displayName || `${document.data().firstName || ""} ${document.data().lastName || ""}`.trim() || document.data().email || "FleetFix user"),
    })),
    jobs,
    capabilities: capabilities(context),
  };
}

export async function findAssociationOptions(context: ServerUserContext, search: string) {
  requireWhatsAppPermission(context.companyUser, "Manage conversations");
  const needle = String(search || "").trim().toLowerCase().slice(0, 80);
  if (needle.length < 2) return { customers: [] };
  const needleDigits = needle.replace(/\D/g, "");
  const matches = (value: string) => value.toLowerCase().includes(needle) ||
    (needleDigits.length >= 3 && value.replace(/\D/g, "").includes(needleDigits));
  const [customersSnapshot, contactsSnapshot] = await Promise.all([
    adminDb.collection(`companies/${context.companyId}/customers`).limit(100).get(),
    adminDb.collectionGroup("contacts").where("companyId", "==", context.companyId).limit(200).get(),
  ]);
  const contactsByCustomer = new Map<string, Array<{ id: string; name: string; phoneNumber: string }>>();
  for (const contact of contactsSnapshot.docs) {
    const path = contact.ref.path.split("/");
    if (path[0] !== "companies" || path[1] !== context.companyId || path[2] !== "customers" || path[4] !== "contacts") continue;
    const data = contact.data();
    const customerId = path[3];
    const option = {
      id: contact.id,
      name: String(data.name || data.contactName || "Contact"),
      phoneNumber: String(data.mobile || data.whatsappNumberE164 || data.phone || data.contactNumber || ""),
    };
    const values = contactsByCustomer.get(customerId) || [];
    values.push(option);
    contactsByCustomer.set(customerId, values);
  }
  const customers = customersSnapshot.docs.flatMap((customer) => {
    const data = customer.data();
    const name = String(data.companyName || data.customerName || data.name || "Customer");
    const phoneNumber = String(data.primaryContactNumber || data.whatsappNumberE164 || data.phone || data.contactNumber || "");
    const contacts = contactsByCustomer.get(customer.id) || [];
    const customerMatches = matches(`${name} ${phoneNumber}`);
    const matchingContacts = contacts.filter((contact) => matches(`${contact.name} ${contact.phoneNumber}`));
    if (!customerMatches && !matchingContacts.length) return [];
    return [{ id: customer.id, name, phoneNumber, contacts: customerMatches ? contacts : matchingContacts }];
  }).slice(0, 25);
  return { customers };
}

export async function listMessages(context: ServerUserContext, conversationId: string, url: URL) {
  requireWhatsAppPermission(context.companyUser, "View conversations");
  const conversation = await conversationDocument(context, conversationId);
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  let query: Query = adminDb.collection(`companies/${context.companyId}/whatsappMessages`)
    .where("conversationId", "==", conversation.id)
    .orderBy("metaTimestamp", "desc").orderBy(FieldPath.documentId(), "desc");
  if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.milliseconds), cursor.id);
  const snapshot = await query.limit(51).get();
  const page = snapshot.docs.slice(0, 50);
  const messages = sortMessagePageNewestFirst(page.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      direction: data.direction === "outgoing" ? "outgoing" : "incoming",
      messageType: String(data.messageType || "text"),
      messageText: String(data.messageText || "").slice(0, 4096),
      ...messageJobContextJson(data),
      status: String(data.status || "received"),
      timestamp: iso(data.metaTimestamp || data.createdAt),
      failureReason: data.status === "failed" ? String(data.failureReason || "Message failed").slice(0, 200) : null,
      mediaType: data.mediaType || null,
      mediaFilename: data.mediaFilename || null,
      mediaMimeType: data.mediaMimeType || null,
      mediaSize: Number(data.mediaSize || 0),
      mediaIngestionStatus: data.mediaIngestionStatus || null,
      mediaFailureReason: data.mediaIngestionStatus === "failed" ? String(data.mediaFailureReason || "Media unavailable").slice(0, 200) : null,
    };
  }));
  const oldest = page.at(-1);
  return {
    messages,
    nextCursor: snapshot.size > 50 && oldest
      ? encodeCursor({ milliseconds: oldest.data().metaTimestamp?.toMillis?.() || 0, id: oldest.id }) : null,
  };
}

export async function getMessageMedia(context: ServerUserContext, conversationId: string, messageId: string) {
  requireWhatsAppPermission(context.companyUser, "View conversations");
  const safeConversationId = requireId(conversationId, "Conversation ID");
  const safeMessageId = requireId(messageId, "Message ID");
  await conversationDocument(context, safeConversationId);
  const message = await adminDb.doc(`companies/${context.companyId}/whatsappMessages/${safeMessageId}`).get();
  const data = message.data() || {};
  if (!message.exists || data.conversationId !== safeConversationId || data.mediaIngestionStatus !== "stored") throw new WhatsAppError("NOT_FOUND", "WhatsApp media is unavailable.", 404);
  const storagePath = String(data.mediaStoragePath || "");
  if (!storagePath.startsWith(`companies/${context.companyId}/whatsapp-media/${safeMessageId}/`)) throw new WhatsAppError("FORBIDDEN", "WhatsApp media path is invalid.", 403);
  return { storagePath, contentType: String(data.mediaMimeType || "application/octet-stream"), filename: String(data.mediaFilename || "whatsapp-media") };
}

function auditRef(companyId: string) {
  return adminDb.collection(`companies/${companyId}/whatsappAuditLog`).doc();
}

export async function updateConversation(context: ServerUserContext, conversationId: string, body: unknown) {
  if (!body || typeof body !== "object") throw new WhatsAppError("INVALID_INPUT", "Conversation action is invalid.", 400);
  const input = body as Record<string, unknown>;
  const action = String(input.action || "");
  if (action === "associate-customer-contact") requireWhatsAppPermission(context.companyUser, "Manage conversations");
  const conversation = await conversationDocument(context, conversationId);
  const conversationRef = conversation.ref;

  if (action === "read") {
    requireWhatsAppPermission(context.companyUser, "View conversations");
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(conversationRef);
      if (!current.exists) throw new WhatsAppError("NOT_FOUND", "This WhatsApp conversation no longer exists.", 404);
      if (Number(current.data()?.unreadCount || 0) === 0) return;
      transaction.update(conversationRef, { unreadCount: 0, lastReadAt: FieldValue.serverTimestamp(), lastReadBy: context.uid, updatedAt: FieldValue.serverTimestamp() });
      transaction.create(auditRef(context.companyId), { companyId: context.companyId, action: "CONVERSATION_READ", result: "success", conversationId, userId: context.uid, createdAt: FieldValue.serverTimestamp() });
    });
  } else if (action === "assign-user") {
    requireWhatsAppPermission(context.companyUser, "Assign conversations");
    const userId = input.userId ? requireId(input.userId, "User ID") : null;
    let userName = "";
    if (userId) {
      const user = await adminDb.doc(`companies/${context.companyId}/users/${userId}`).get();
      if (!user.exists || user.data()?.active === false) throw new WhatsAppError("NOT_FOUND", "The selected employee is unavailable.", 404);
      userName = String(user.data()?.name || user.data()?.displayName || `${user.data()?.firstName || ""} ${user.data()?.lastName || ""}`.trim() || user.data()?.email || "FleetFix user");
    }
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(conversationRef);
      const previous = current.data()?.assignedUserId || null;
      if (previous === userId) return;
      transaction.update(conversationRef, { assignedUserId: userId, assignedUserName: userName, assignedAt: FieldValue.serverTimestamp(), assignedBy: context.uid, updatedAt: FieldValue.serverTimestamp() });
      transaction.create(auditRef(context.companyId), { companyId: context.companyId, action: "CONVERSATION_ASSIGNED", result: "success", conversationId, userId: context.uid, previousAssignedUserId: previous, assignedUserId: userId, createdAt: FieldValue.serverTimestamp() });
    });
  } else if (action === "assign-job" || action === "link-job") {
    requireWhatsAppPermission(context.companyUser, "Manage conversations");
    const jobId = requireId(input.jobId, "Job ID");
    const jobRef = adminDb.doc(`companies/${context.companyId}/jobs/${jobId}`);
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(conversationRef);
      const job = await transaction.get(jobRef);
      if (!current.exists) throw new WhatsAppError("NOT_FOUND", "This WhatsApp conversation no longer exists.", 404);
      if (!job.exists) throw new WhatsAppError("NOT_FOUND", "The selected FleetFix job no longer exists.", 404);
      const data = current.data() || {};
      const jobData = job.data() || {};
      assertJobCustomer(data.customerId, jobData.customerId);
      let customerName = String(data.customerName || "");
      if (!data.customerId && jobData.customerId) {
        const customer = await transaction.get(adminDb.doc(`companies/${context.companyId}/customers/${jobData.customerId}`));
        if (!customer.exists) throw new WhatsAppError("NOT_FOUND", "The selected job's customer no longer exists.", 404);
        customerName = String(customer.data()?.companyName || customer.data()?.customerName || customer.data()?.name || "");
      }
      const recentMessages = await transaction.get(recentMessagesQuery(context.companyId, conversationId));
      const linkedJob = linkedJobFromDocument(job.id, jobData);
      const association = linkJob(linkedJobsFromConversation(data), linkedJob);
      transaction.update(conversationRef, {
        linkedJobs: association.linkedJobs,
        jobId: association.jobId,
        jobNumber: association.jobNumber,
        customerId: data.customerId || jobData.customerId || null,
        customerName,
        needsJobAssignment: needsJobAssignmentForLatest(association.linkedJobs, latestInboundJobId(recentMessages)),
        jobAssignedAt: FieldValue.serverTimestamp(),
        jobAssignedBy: context.uid,
        searchTokens: buildSearchTokens(conversationSearchValues(data, association.linkedJobs, customerName)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(auditRef(context.companyId), {
        companyId: context.companyId, action: JOB_LINKED_AUDIT_ACTION, result: "success", conversationId,
        userId: context.uid, jobId: linkedJob.jobId, jobNumber: linkedJob.jobNumber, createdAt: FieldValue.serverTimestamp(),
      });
    });
  } else if (action === "unlink-job") {
    requireWhatsAppPermission(context.companyUser, "Manage conversations");
    const jobId = requireId(input.jobId, "Job ID");
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(conversationRef);
      if (!current.exists) throw new WhatsAppError("NOT_FOUND", "This WhatsApp conversation no longer exists.", 404);
      const data = current.data() || {};
      const recentMessages = await transaction.get(recentMessagesQuery(context.companyId, conversationId));
      const previous = linkedJobsFromConversation(data);
      const removed = previous.find((job) => job.jobId === jobId);
      const association = unlinkJob(previous, jobId);
      transaction.update(conversationRef, {
        linkedJobs: association.linkedJobs,
        jobId: association.jobId,
        jobNumber: association.jobNumber,
        needsJobAssignment: needsJobAssignmentForLatest(association.linkedJobs, latestInboundJobId(recentMessages)),
        searchTokens: buildSearchTokens(conversationSearchValues(data, association.linkedJobs)),
        jobUnlinkedAt: FieldValue.serverTimestamp(),
        jobUnlinkedBy: context.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(auditRef(context.companyId), {
        companyId: context.companyId, action: JOB_UNLINKED_AUDIT_ACTION, result: "success", conversationId,
        userId: context.uid, jobId, jobNumber: removed?.jobNumber || null, createdAt: FieldValue.serverTimestamp(),
      });
    });
  } else if (action === "associate-customer-contact") {
    const customerId = requireId(input.customerId, "Customer ID");
    const contactId = input.contactId ? requireId(input.contactId, "Contact ID") : null;
    const customerRef = adminDb.doc(`companies/${context.companyId}/customers/${customerId}`);
    const contactRef = contactId ? customerRef.collection("contacts").doc(contactId) : null;
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(conversationRef);
      const customer = await transaction.get(customerRef);
      const contact = contactRef ? await transaction.get(contactRef) : null;
      if (!current.exists) throw new WhatsAppError("NOT_FOUND", "This WhatsApp conversation no longer exists.", 404);
      const association = buildManualAssociation({
        conversationId,
        conversation: current.data() || {},
        customerId,
        customer: { id: customer.id, exists: customer.exists, data: customer.data() || {} },
        contactId,
        contact: contact ? { id: contact.id, exists: contact.exists, customerId: contact.ref.parent.parent!.id, data: contact.data() || {} } : null,
        actorUserId: context.uid,
      });
      transaction.update(conversationRef, { ...association.conversationUpdate, updatedAt: FieldValue.serverTimestamp() });
      transaction.create(auditRef(context.companyId), { companyId: context.companyId, ...association.audit, createdAt: FieldValue.serverTimestamp() });
    });
  } else if (action === "close" || action === "reopen") {
    requireWhatsAppPermission(context.companyUser, "Close conversations");
    const closing = action === "close";
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(conversationRef);
      const data = current.data() || {};
      const desired = closing ? "closed" : (data.customerId ? "open" : "unassigned");
      if (data.status === desired) return;
      transaction.update(conversationRef, {
        status: desired,
        closedAt: closing ? FieldValue.serverTimestamp() : null,
        closedBy: closing ? context.uid : null,
        reopenedAt: closing ? data.reopenedAt || null : FieldValue.serverTimestamp(),
        reopenedBy: closing ? data.reopenedBy || null : context.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(auditRef(context.companyId), { companyId: context.companyId, action: closing ? "CONVERSATION_CLOSED" : "CONVERSATION_REOPENED", result: "success", conversationId, userId: context.uid, createdAt: FieldValue.serverTimestamp() });
    });
  } else {
    throw new WhatsAppError("INVALID_INPUT", "Conversation action is not supported.", 400);
  }
  return getConversation(context, conversationId);
}

export async function updateMessageJobContext(context: ServerUserContext, conversationId: string, body: unknown) {
  requireWhatsAppPermission(context.companyUser, "Manage conversations");
  if (!body || typeof body !== "object") throw new WhatsAppError("INVALID_INPUT", "Message action is invalid.", 400);
  const input = body as Record<string, unknown>;
  if (input.action !== "assign-job-context") throw new WhatsAppError("INVALID_INPUT", "Message action is not supported.", 400);
  const safeConversationId = requireId(conversationId, "Conversation ID");
  const messageId = requireId(input.messageId, "Message ID");
  const jobId = requireId(input.jobId, "Job ID");
  const conversationRef = adminDb.doc(`companies/${context.companyId}/whatsappConversations/${safeConversationId}`);
  const messageRef = adminDb.doc(`companies/${context.companyId}/whatsappMessages/${messageId}`);
  const jobRef = adminDb.doc(`companies/${context.companyId}/jobs/${jobId}`);
  let jobNumber = "";
  let needsJobAssignment = true;
  await adminDb.runTransaction(async (transaction) => {
    const conversation = await transaction.get(conversationRef);
    const message = await transaction.get(messageRef);
    const job = await transaction.get(jobRef);
    const recentMessages = await transaction.get(recentMessagesQuery(context.companyId, safeConversationId));
    if (!conversation.exists) throw new WhatsAppError("NOT_FOUND", "This WhatsApp conversation no longer exists.", 404);
    if (!message.exists || message.data()?.conversationId !== safeConversationId) throw new WhatsAppError("NOT_FOUND", "This WhatsApp message no longer exists.", 404);
    if (!job.exists) throw new WhatsAppError("NOT_FOUND", "The selected FleetFix job no longer exists.", 404);
    const linkedJobs = linkedJobsFromConversation(conversation.data() || {});
    if (!linkedJobs.some((linked) => linked.jobId === jobId)) throw new WhatsAppError("FORBIDDEN", "The selected job is not linked to this conversation.", 403);
    assertJobCustomer(conversation.data()?.customerId, job.data()?.customerId);
    jobNumber = String(job.data()?.jobNumber || job.id);
    const latestInbound = recentMessages.docs.find((document) => document.data().direction === "incoming");
    const latestJobId = latestInbound?.id === messageId ? jobId : latestInbound?.data().jobId || null;
    needsJobAssignment = needsJobAssignmentForLatest(linkedJobs, latestJobId);
    transaction.update(messageRef, { jobId, jobNumber, jobContextMethod: "manual", jobContextUpdatedAt: FieldValue.serverTimestamp(), jobContextUpdatedBy: context.uid, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(conversationRef, { needsJobAssignment, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(auditRef(context.companyId), { companyId: context.companyId, action: MESSAGE_JOB_ASSIGNED_AUDIT_ACTION, result: "success", conversationId: safeConversationId, messageId, jobId, jobNumber, userId: context.uid, createdAt: FieldValue.serverTimestamp() });
  });
  return { message: { id: messageId, jobId, jobNumber }, needsJobAssignment };
}

export async function unreadSummary(context: ServerUserContext) {
  requireWhatsAppPermission(context.companyUser, "View inbox");
  const aggregate = await adminDb.collection(`companies/${context.companyId}/whatsappConversations`).where("unreadCount", ">", 0).count().get();
  return { unreadConversations: aggregate.data().count };
}
