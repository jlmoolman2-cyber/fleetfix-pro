import "server-only";

import { Timestamp, type DocumentData, type DocumentSnapshot, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { ServerAccessError, type ServerUserContext } from "@/lib/serverAuth";
import { authorisedJob } from "./service";
import { deduplicateHistoricalCandidates, normalizeFaultCode, normalizeIdentifier, normalizeLabel, parseHistoryFilters, rankHistoricalJobs, selectHistoricalEnrichmentShortlist, type NormalizedHistoryJob } from "./historyCore";

const QUERY_LIMIT = 50;
const RECENT_LIMIT = 120;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function strings(value: unknown) {
  if (!Array.isArray(value)) return text(value) ? [text(value)] : [];
  return value.flatMap((item) => typeof item === "string" ? [item.trim()] : item && typeof item === "object" ? [text((item as DocumentData).name || (item as DocumentData).description || (item as DocumentData).code || (item as DocumentData).partNumber)] : []).filter(Boolean).slice(0, 100);
}
function iso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
}
function faultCodes(data: DocumentData) {
  const values = [...strings(data.faultCodes), ...strings(data.diagnosticCodes), ...strings(data.faultCode), ...strings(data.diagnostics), ...strings(data.faults)];
  return [...new Set(values.map(normalizeFaultCode).filter(Boolean))].slice(0, 30);
}
function isReopened(data: DocumentData) {
  if (data.reopened === true || data.isReopened === true) return true;
  return Array.isArray(data.statusHistory) && data.statusHistory.some((item: DocumentData) => /reopen|return(ed)?\s+to\s+work/i.test(text(item?.statusName || item?.status)));
}
function normalizeJob(id: string, data: DocumentData): NormalizedHistoryJob {
  const status = text(data.statusName || data.status);
  const cancelled = /cancel|vehicle not found/i.test(status) || data.cancelled === true;
  const incomplete = cancelled || !data.isCompleted && !data.closedAt && !/complete|closed|returned to service/i.test(status);
  const vehicle = data.vehicle || data.vehicleDetails || {};
  return {
    id, jobNumber: text(data.jobNumber) || id, date: iso(data.completedAt || data.closedAt || data.dateBooked || data.bookingDateTime || data.createdAt),
    vehicleId: text(data.vehicleId || data.customerVehicleId || vehicle.id),
    registration: normalizeIdentifier(data.vehicleRegNo || data.vehicleRegistration || data.registrationNumber || vehicle.regNo || vehicle.registrationNumber),
    fleetNumber: normalizeIdentifier(data.vehicleFleetNo || data.fleetNumber || data.fleetNo || vehicle.fleetNo || vehicle.fleetNumber),
    make: normalizeLabel(data.vehicleMake || vehicle.make || vehicle.vehicleMake), model: normalizeLabel(data.vehicleModel || vehicle.model || vehicle.vehicleModel), vehicleType: normalizeLabel(data.vehicleType || vehicle.type || vehicle.vehicleType),
    description: text(data.complaint || data.description || data.jobDescription || data.reportedFault || data.problemDescription),
    faultCodes: faultCodes(data),
    findings: strings(data.technicianFindings || data.findings || data.technicianFinding || data.diagnosticFindings),
    repairs: strings(data.repairPerformed || data.repairAction || data.correctiveAction || data.workPerformed || data.resolution),
    parts: strings(data.materials || data.usedMaterials || data.parts || data.items), components: strings(data.components || data.systems || data.component || data.system).map(normalizeLabel),
    status, outcome: text(data.completionOutcome || data.outcome || data.finalOutcome), previousJobNumber: normalizeIdentifier(data.previousJobNumber || data.statusFieldValues?.previousJobNumber || data.dynamicFields?.previousJobNumber),
    reopened: isReopened(data), incomplete, cancelled,
  };
}

async function candidateSnapshots(companyId: string, currentId: string, current: DocumentData) {
  const jobs = adminDb.collection(`companies/${companyId}/jobs`);
  const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
  const add = (field: string, value: unknown) => { if (typeof value === "string" && value.trim()) queries.push(jobs.where(field, "==", value).limit(QUERY_LIMIT).get()); };
  add("vehicleId", current.vehicleId); add("customerVehicleId", current.customerVehicleId);
  add("vehicleRegNo", current.vehicleRegNo); add("vehicleRegistration", current.vehicleRegistration);
  add("vehicleFleetNo", current.vehicleFleetNo); add("fleetNumber", current.fleetNumber);
  add("jobNumber", current.previousJobNumber || current.statusFieldValues?.previousJobNumber || current.dynamicFields?.previousJobNumber);
  queries.push(jobs.orderBy("createdAt", "desc").limit(RECENT_LIMIT).get());
  const snapshots = await Promise.all(queries.slice(0, 8));
  // Registration and fleet normalization happens after retrieval. Older records with
  // differently formatted identifiers can therefore be missed unless another indexed
  // field finds them or they fall inside the bounded recent-job fallback. Results are
  // intentionally presented as related candidates, never as exhaustive vehicle history.
  return deduplicateHistoricalCandidates<QueryDocumentSnapshot>(currentId, snapshots.flatMap((snapshot) => snapshot.docs));
}

async function enrich(snapshot: DocumentSnapshot) {
  const [notes, materials, diagnostics, faults] = await Promise.all([
    snapshot.ref.collection("notes").limit(10).get(), snapshot.ref.collection("materials").limit(20).get(),
    snapshot.ref.collection("diagnostics").limit(10).get(), snapshot.ref.collection("faults").limit(10).get(),
  ]);
  const data = snapshot.data() || {};
  return normalizeJob(snapshot.id, {
    ...data,
    findings: [...strings(data.findings), ...notes.docs.map((doc) => text(doc.data().technicianFinding || doc.data().finding)).filter(Boolean)],
    materials: [...strings(data.materials), ...materials.docs.map((doc) => text(doc.data().partNumber || doc.data().description || doc.data().name)).filter(Boolean)],
    diagnostics: [...strings(data.diagnostics), ...diagnostics.docs.map((doc) => doc.data()), ...faults.docs.map((doc) => doc.data())],
  });
}

export async function searchIQ200History(context: ServerUserContext, jobId: string, requestUrl: string) {
  let filters;
  try { filters = parseHistoryFilters(new URL(requestUrl)); } catch { throw new ServerAccessError("INVALID_INPUT", "Historical search filters are invalid.", 400); }
  const { snapshot: currentSnapshot, data: currentData } = await authorisedJob(context, jobId);
  const candidates = await candidateSnapshots(context.companyId, currentSnapshot.id, currentData);
  const topLevelCandidates = candidates.map((candidate) => normalizeJob(candidate.id, candidate.data()));
  const shortlistIds = new Set(selectHistoricalEnrichmentShortlist(normalizeJob(currentSnapshot.id, currentData), topLevelCandidates, filters).map((candidate) => candidate.id));
  const [current, ...enrichedCandidates] = await Promise.all([
    enrich(currentSnapshot),
    ...candidates.filter((candidate) => shortlistIds.has(candidate.id)).map((candidate) => enrich(candidate)),
  ]);
  const results = rankHistoricalJobs(current, enrichedCandidates, filters).slice(0, filters.limit)
    .map(({ candidate, match }) => ({
      id: candidate.id, jobNumber: candidate.jobNumber, date: candidate.date, registration: candidate.registration, fleetNumber: candidate.fleetNumber,
      make: candidate.make, model: candidate.model, description: candidate.description, faultCodes: candidate.faultCodes,
      technicianFindings: candidate.findings.slice(0, 8), repairPerformed: candidate.repairs.slice(0, 8), partsUsed: candidate.parts.slice(0, 12),
      status: candidate.status, outcome: candidate.outcome, cancelled: candidate.cancelled, incomplete: candidate.incomplete, reopened: candidate.reopened,
      relevanceScore: match!.score, relevanceReasons: match!.reasons,
    }));
  return { results, meta: { considered: candidates.length, returned: results.length, limit: filters.limit } };
}
