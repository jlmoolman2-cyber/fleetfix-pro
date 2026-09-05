import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { ServerAccessError, type ServerUserContext } from "@/lib/serverAuth";
import { requireIQ200Access } from "./access";

const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateValue(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function statusEntry(entry: unknown) {
  const data = entry && typeof entry === "object" ? entry as DocumentData : {};
  return {
    status: text(data.statusName || data.status),
    enteredAt: dateValue(data.enteredAt || data.createdAt || data.updatedAt),
    updatedBy: text(data.updatedByName || data.createdByName),
  };
}

function diagnosticEntry(entry: unknown) {
  const data = entry && typeof entry === "object" ? entry as DocumentData : {};
  return {
    id: text(data.id),
    code: text(data.code || data.faultCode || data.diagnosticCode),
    description: text(data.description || data.faultDescription || data.message),
    status: text(data.status),
    source: text(data.source || data.system || data.module),
    value: typeof data.value === "string" || typeof data.value === "number" ? data.value : null,
    recordedAt: dateValue(data.recordedAt || data.createdAt || data.updatedAt),
  };
}

function sessionEntry(id: string, value: DocumentData) {
  return {
    id,
    initialQuestion: text(value.initialQuestion),
    state: text(value.state),
    responseStatus: text(value.responseStatus),
    createdAt: dateValue(value.createdAt),
    updatedAt: dateValue(value.updatedAt),
  };
}

function validateJobId(jobId: string) {
  if (!JOB_ID.test(jobId)) throw new ServerAccessError("INVALID_INPUT", "The job ID is invalid.", 400);
}

export async function authorisedJob(context: ServerUserContext, jobId: string) {
  requireIQ200Access(context);
  validateJobId(jobId);
  const snapshot = await adminDb.doc(`companies/${context.companyId}/jobs/${jobId}`).get();
  if (!snapshot.exists || (snapshot.data()?.companyId && snapshot.data()?.companyId !== context.companyId)) {
    throw new ServerAccessError("NOT_FOUND", "The requested job was not found.", 404);
  }
  return { snapshot, data: snapshot.data() || {} };
}

async function linkedVehicle(companyId: string, job: DocumentData) {
  const vehicleId = text(job.vehicleId || job.customerVehicleId);
  if (!vehicleId) return null;
  const candidates = [adminDb.doc(`companies/${companyId}/vehicles/${vehicleId}`)];
  if (text(job.customerId)) candidates.push(adminDb.doc(`companies/${companyId}/customers/${job.customerId}/fleet/${vehicleId}`));
  const snapshots = await adminDb.getAll(...candidates);
  const match = snapshots.find((snapshot) => snapshot.exists);
  return match ? { id: match.id, ...(match.data() || {}) } : null;
}

export async function getIQ200JobContext(context: ServerUserContext, jobId: string) {
  const { snapshot, data: job } = await authorisedJob(context, jobId);
  const customerId = text(job.customerId);
  const [customerSnapshot, vehicle, notesSnapshot, diagnosticsSnapshot, faultsSnapshot] = await Promise.all([
    customerId ? adminDb.doc(`companies/${context.companyId}/customers/${customerId}`).get() : null,
    linkedVehicle(context.companyId, job),
    snapshot.ref.collection("notes").orderBy("createdAt", "asc").limit(250).get(),
    snapshot.ref.collection("diagnostics").limit(100).get(),
    snapshot.ref.collection("faults").limit(100).get(),
  ]);
  const customer = customerSnapshot?.exists ? customerSnapshot.data() || {} : {};
  const vehicleData = vehicle || job.vehicle || job.vehicleDetails || {};
  const assigned = Array.isArray(job.assignedUsers) ? job.assignedUsers.map((user: DocumentData) => ({
    id: text(user.id || user.uid),
    name: text(user.name || user.displayName || `${text(user.firstName)} ${text(user.surname || user.lastName)}`),
  })) : [];
  const diagnostics = [
    ...(Array.isArray(job.diagnostics) ? job.diagnostics : []),
    ...(Array.isArray(job.faults) ? job.faults : []),
    ...diagnosticsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    ...faultsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  ];

  return {
    companyId: context.companyId,
    job: {
      id: snapshot.id,
      number: text(job.jobNumber) || snapshot.id,
      status: text(job.status || job.statusName),
      customer: customerId ? { id: customerId, name: text(customer.customerName || customer.name || job.customerName) } : null,
      vehicle: {
        id: text(vehicleData.id || job.vehicleId),
        registrationNumber: text(vehicleData.regNo || vehicleData.vehicleReg || vehicleData.registrationNumber || vehicleData.registration || job.vehicleRegistration),
        fleetNumber: text(vehicleData.fleetNo || vehicleData.fleetNumber || job.fleetNumber),
        make: text(vehicleData.vehicleMake || vehicleData.make || job.vehicleMake),
        model: text(vehicleData.vehicleModel || vehicleData.model || job.vehicleModel),
        type: text(vehicleData.vehicleType || vehicleData.type || job.vehicleType),
      },
      description: text(job.description || job.jobDescription || job.reportedFault || job.problemDescription),
      location: text(job.locationDetails?.name || job.locationName || (typeof job.location === "string" ? job.location : "") || job.breakdownLocation),
      bookingDateTime: dateValue(job.bookingDateTime || job.bookingDate || job.dateBooked || job.createdAt),
      assignedTechnicians: assigned.length ? assigned : text(job.assignedTo || job.assignedTechnician) ? [{ id: text(job.assignedUserId || job.assignedTechnicianId), name: text(job.assignedTo || job.assignedTechnician) }] : [],
      previousJobNumber: text(job.previousJobNumber || job.statusFieldValues?.previousJobNumber || job.dynamicFields?.previousJobNumber),
      statusHistory: (Array.isArray(job.statusHistory) ? job.statusHistory : []).map(statusEntry),
      notes: notesSnapshot.docs.map((doc) => {
        const note = doc.data();
        return { id: doc.id, text: text(note.comment || note.text || note.note), author: text(note.createdByName || note.userName || note.authorName), createdAt: dateValue(note.createdAt) };
      }),
      diagnostics: diagnostics.map(diagnosticEntry),
    },
    currentUser: {
      id: context.uid,
      name: text(context.companyUser.name || context.companyUser.displayName || `${text(context.companyUser.firstName)} ${text(context.companyUser.lastName)}`) || text(context.token.name || context.token.email),
    },
  };
}

export async function listIQ200Sessions(context: ServerUserContext, jobId: string) {
  const { snapshot } = await authorisedJob(context, jobId);
  const sessions = await snapshot.ref.collection("iq200_sessions").orderBy("updatedAt", "desc").limit(50).get();
  return { sessions: sessions.docs.map((doc) => sessionEntry(doc.id, doc.data())) };
}

export async function createIQ200Session(context: ServerUserContext, jobId: string, input: unknown) {
  const { snapshot } = await authorisedJob(context, jobId);
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const question = text(body.question);
  if (!question || question.length > 4000) throw new ServerAccessError("INVALID_INPUT", "Enter a question of no more than 4,000 characters.", 400);
  const ref = snapshot.ref.collection("iq200_sessions").doc();
  await ref.create({
    companyId: context.companyId,
    jobId: snapshot.id,
    sessionId: ref.id,
    createdBy: context.uid,
    openedBy: context.uid,
    initialQuestion: question,
    state: "CONTEXT_READY",
    responseStatus: "AI_NOT_ENABLED",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { session: { id: ref.id, initialQuestion: question, state: "CONTEXT_READY", responseStatus: "AI_NOT_ENABLED" } };
}
