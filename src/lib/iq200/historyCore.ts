export const HISTORY_MAX_QUERY_LENGTH = 200;
export const HISTORY_MAX_FAULT_CODE_LENGTH = 64;
export const HISTORY_MAX_RESULTS = 20;
export const HISTORY_DEFAULT_RESULTS = 10;
export const HISTORY_MAX_CANDIDATES = 300;
export const HISTORY_MAX_TOKENS = 24;
export const HISTORY_MAX_FAULT_SCORE = 160;
export const HISTORY_MAX_TEXT_SCORE = 40;
export const HISTORY_MAX_ENRICHMENT_CANDIDATES = 40;

export type HistoryFilters = { q: string; faultCode: string; vehicleOnly: boolean; limit: number };
export type NormalizedHistoryJob = {
  id: string; jobNumber: string; date: string | null; vehicleId: string; registration: string; fleetNumber: string;
  make: string; model: string; vehicleType: string; description: string; faultCodes: string[]; findings: string[];
  repairs: string[]; parts: string[]; components: string[]; status: string; outcome: string; previousJobNumber: string;
  reopened: boolean; incomplete: boolean; cancelled: boolean;
};
export type HistoricalMatch = { score: number; reasons: string[]; strongestEvidenceTier: number; strongTechnicalEvidenceCount: number };

const COMMON_WORDS = new Set([
  "and", "are", "but", "check", "checked", "checking", "component", "engine", "fault", "for", "from",
  "issue", "job", "not", "part", "problem", "repair", "repaired", "replace", "replaced", "service", "system",
  "test", "tested", "testing", "that", "the", "this", "truck", "unit", "vehicle", "was", "with",
]);
const GENERIC_COMPONENT_WORDS = new Set(["assembly", "component", "engine", "part", "system", "truck", "unit", "vehicle"]);

export function normalizeIdentifier(value: unknown) {
  return String(value || "").toUpperCase().replace(/[\s-]+/g, "").replace(/[^A-Z0-9]/g, "");
}
export function normalizeFaultCode(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "");
}
export function normalizeLabel(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
export function tokenize(value: unknown) {
  return [...new Set(normalizeLabel(value).split(" ").filter((token) => token.length >= 3 && !COMMON_WORDS.has(token)))].slice(0, HISTORY_MAX_TOKENS);
}
function overlap(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return [...new Set(left)].filter((value) => rightSet.has(value));
}
function normalizedRegistration(value: unknown) {
  const normalized = normalizeIdentifier(value);
  return normalized.length >= 3 ? normalized : "";
}
function meaningfulFaultCode(value: unknown) {
  const normalized = normalizeFaultCode(value);
  return /[A-Z]/.test(normalized) && /\d/.test(normalized) ? normalized : "";
}
function componentKeys(values: string[]) {
  return [...new Set(values.map((value) => normalizeLabel(value).split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_COMPONENT_WORDS.has(token) && !COMMON_WORDS.has(token)).join(" "))
    .filter(Boolean))];
}
function technicalText(job: NormalizedHistoryJob, query = "") {
  return tokenize([job.description, ...job.findings, ...job.repairs, ...job.parts, query].join(" "));
}
function dateTime(value: string | null) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function deduplicateHistoricalCandidates<T extends { id: string }>(currentJobId: string, candidates: T[], maximum = HISTORY_MAX_CANDIDATES) {
  const unique = new Map<string, T>();
  for (const candidate of candidates) {
    if (candidate.id !== currentJobId && unique.size < maximum) unique.set(candidate.id, candidate);
  }
  return [...unique.values()];
}
export function parseHistoryFilters(url: URL): HistoryFilters {
  const q = String(url.searchParams.get("q") || "").trim();
  const faultCode = String(url.searchParams.get("faultCode") || "").trim();
  const vehicleOnlyValue = url.searchParams.get("vehicleOnly");
  const limitValue = url.searchParams.get("limit");
  if (q.length > HISTORY_MAX_QUERY_LENGTH) throw new Error("INVALID_QUERY");
  if (faultCode.length > HISTORY_MAX_FAULT_CODE_LENGTH) throw new Error("INVALID_FAULT_CODE");
  if (vehicleOnlyValue && !["true", "false", "1", "0"].includes(vehicleOnlyValue)) throw new Error("INVALID_VEHICLE_ONLY");
  if (limitValue && !/^\d+$/.test(limitValue)) throw new Error("INVALID_LIMIT");
  const limit = limitValue ? Number(limitValue) : HISTORY_DEFAULT_RESULTS;
  if (limit < 1 || limit > HISTORY_MAX_RESULTS) throw new Error("INVALID_LIMIT");
  return { q, faultCode: normalizeFaultCode(faultCode), vehicleOnly: vehicleOnlyValue === "true" || vehicleOnlyValue === "1", limit };
}

export function scoreHistoricalJob(current: NormalizedHistoryJob, candidate: NormalizedHistoryJob, filters: HistoryFilters): HistoricalMatch | null {
  let score = 0;
  const reasons: string[] = [];
  const currentVehicleId = current.vehicleId.trim(), candidateVehicleId = candidate.vehicleId.trim();
  const currentRegistration = normalizedRegistration(current.registration), candidateRegistration = normalizedRegistration(candidate.registration);
  const currentFleet = normalizedRegistration(current.fleetNumber), candidateFleet = normalizedRegistration(candidate.fleetNumber);
  const sameVehicle = Boolean(currentVehicleId && candidateVehicleId && currentVehicleId === candidateVehicleId);
  const sameRegistration = Boolean(currentRegistration && candidateRegistration && currentRegistration === candidateRegistration);
  const sameFleet = Boolean(currentFleet && candidateFleet && currentFleet === candidateFleet);
  const identityConflict = Boolean(currentVehicleId && candidateVehicleId && currentVehicleId !== candidateVehicleId)
    || Boolean(currentRegistration && candidateRegistration && currentRegistration !== candidateRegistration);
  const linkedPreviousJob = Boolean(current.previousJobNumber && current.previousJobNumber === normalizeIdentifier(candidate.jobNumber));
  const validPreviousJob = linkedPreviousJob && !identityConflict;
  if (sameVehicle) { score += 120; reasons.push("Same vehicle"); }
  if (validPreviousJob) { score += 110; reasons.push("Previous job linked to this job"); }
  if (sameRegistration) { score += 100; reasons.push("Same registration number"); }

  const requestedFaults = [...new Set((filters.faultCode ? [filters.faultCode] : current.faultCodes).map(meaningfulFaultCode).filter(Boolean))];
  const candidateFaults = [...new Set(candidate.faultCodes.map(meaningfulFaultCode).filter(Boolean))];
  const sharedFaults = overlap(requestedFaults, candidateFaults);
  if (sharedFaults.length) {
    score += Math.min(HISTORY_MAX_FAULT_SCORE, sharedFaults.length * 80);
    reasons.push(...sharedFaults.slice(0, 2).map((code) => `Same fault code: ${code}`));
  }

  const sharedComponents = overlap(componentKeys(current.components), componentKeys(candidate.components));
  const meaningfulComponent = sharedComponents.length > 0;
  if (meaningfulComponent) { score += 45; reasons.push(`Same component/system: ${sharedComponents.slice(0, 3).join("/")}`); }

  const excludedTechnicalTokens = new Set([...sharedComponents.flatMap((component) => component.split(" ")), ...sharedFaults.flatMap(tokenize)]);
  const currentText = technicalText(current, filters.q).filter((token) => !excludedTechnicalTokens.has(token));
  const candidateText = technicalText(candidate).filter((token) => !excludedTechnicalTokens.has(token));
  const sharedText = overlap(currentText, candidateText);
  const coverage = sharedText.length / Math.max(1, Math.min(currentText.length, candidateText.length));
  const meaningfulText = sharedText.length >= 2 && coverage >= 0.25;
  if (meaningfulText) {
    score += Math.min(HISTORY_MAX_TEXT_SCORE, 16 + sharedText.length * 6 + Math.round(coverage * 8));
    reasons.push(`Similar technical history: ${sharedText.slice(0, 4).join(", ")}`);
  }

  const strongIdentity = sameVehicle || sameRegistration || validPreviousJob;
  const strongTechnicalEvidenceCount = sharedFaults.length + (meaningfulComponent ? 1 : 0) + (meaningfulText ? 1 : 0);
  if (filters.vehicleOnly && !(sameVehicle || sameRegistration)) return null;
  if (filters.faultCode && !sharedFaults.includes(filters.faultCode)) return null;
  if (filters.q && !meaningfulText && !meaningfulComponent && !sharedFaults.length) return null;
  if (!strongIdentity && strongTechnicalEvidenceCount === 0) return null;

  if (sameFleet) { score += 60; reasons.push("Same fleet number"); }
  if (current.make && current.model && current.make === candidate.make && current.model === candidate.model) { score += 28; reasons.push("Same vehicle make/model"); }
  if (current.vehicleType && current.vehicleType === candidate.vehicleType) { score += 12; reasons.push("Same vehicle type"); }
  if (!candidate.incomplete) score += 5;
  if (candidate.reopened) score -= 10;
  if (candidate.cancelled) score -= 20;
  return {
    score,
    reasons: [...new Set(reasons)].slice(0, 5),
    strongestEvidenceTier: strongIdentity ? 3 : sharedFaults.length ? 2 : 1,
    strongTechnicalEvidenceCount,
  };
}

export function compareHistoricalMatches(left: { candidate: NormalizedHistoryJob; match: HistoricalMatch }, right: { candidate: NormalizedHistoryJob; match: HistoricalMatch }) {
  return right.match.score - left.match.score
    || right.match.strongestEvidenceTier - left.match.strongestEvidenceTier
    || right.match.strongTechnicalEvidenceCount - left.match.strongTechnicalEvidenceCount
    || dateTime(right.candidate.date) - dateTime(left.candidate.date)
    || normalizeIdentifier(left.candidate.jobNumber).localeCompare(normalizeIdentifier(right.candidate.jobNumber))
    || left.candidate.id.localeCompare(right.candidate.id);
}
export function rankHistoricalJobs(current: NormalizedHistoryJob, candidates: NormalizedHistoryJob[], filters: HistoryFilters) {
  return candidates.map((candidate) => ({ candidate, match: scoreHistoricalJob(current, candidate, filters) }))
    .filter((item): item is { candidate: NormalizedHistoryJob; match: HistoricalMatch } => item.match !== null)
    .sort(compareHistoricalMatches);
}
export function selectHistoricalEnrichmentShortlist(current: NormalizedHistoryJob, candidates: NormalizedHistoryJob[], filters: HistoryFilters) {
  const maximum = Math.min(HISTORY_MAX_ENRICHMENT_CANDIDATES, Math.max(filters.limit * 2, HISTORY_MAX_RESULTS));
  const preliminary = candidates.map((candidate) => ({ candidate, match: scoreHistoricalJob(current, candidate, filters) }));
  preliminary.sort((left, right) => {
    if (left.match && right.match) return compareHistoricalMatches(left as { candidate: NormalizedHistoryJob; match: HistoricalMatch }, right as { candidate: NormalizedHistoryJob; match: HistoricalMatch });
    if (left.match) return -1;
    if (right.match) return 1;
    return dateTime(right.candidate.date) - dateTime(left.candidate.date)
      || normalizeIdentifier(left.candidate.jobNumber).localeCompare(normalizeIdentifier(right.candidate.jobNumber))
      || left.candidate.id.localeCompare(right.candidate.id);
  });
  return preliminary.slice(0, maximum).map((item) => item.candidate);
}
