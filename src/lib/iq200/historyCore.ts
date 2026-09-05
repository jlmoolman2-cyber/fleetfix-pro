export const HISTORY_MAX_QUERY_LENGTH = 200;
export const HISTORY_MAX_FAULT_CODE_LENGTH = 64;
export const HISTORY_MAX_RESULTS = 20;
export const HISTORY_DEFAULT_RESULTS = 10;
export const HISTORY_MAX_CANDIDATES = 300;
export const HISTORY_MAX_TOKENS = 24;

export type HistoryFilters = { q: string; faultCode: string; vehicleOnly: boolean; limit: number };

export type NormalizedHistoryJob = {
  id: string;
  jobNumber: string;
  date: string | null;
  vehicleId: string;
  registration: string;
  fleetNumber: string;
  make: string;
  model: string;
  vehicleType: string;
  description: string;
  faultCodes: string[];
  findings: string[];
  repairs: string[];
  parts: string[];
  components: string[];
  status: string;
  outcome: string;
  previousJobNumber: string;
  reopened: boolean;
  incomplete: boolean;
  cancelled: boolean;
};

const COMMON_WORDS = new Set(["and", "the", "for", "with", "from", "this", "that", "vehicle", "job", "was", "are", "but", "not"]);

export function normalizeIdentifier(value: unknown) {
  return String(value || "").toUpperCase().replace(/[\s-]+/g, "").replace(/[^A-Z0-9]/g, "");
}

export function normalizeFaultCode(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeLabel(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function tokenize(value: unknown) {
  return [...new Set(normalizeLabel(value).split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !COMMON_WORDS.has(token)))].slice(0, HISTORY_MAX_TOKENS);
}

function overlap(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
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

export function scoreHistoricalJob(current: NormalizedHistoryJob, candidate: NormalizedHistoryJob, filters: HistoryFilters) {
  let score = 0;
  const reasons: string[] = [];
  const sameVehicle = Boolean(current.vehicleId && candidate.vehicleId && current.vehicleId === candidate.vehicleId);
  const sameRegistration = Boolean(current.registration && candidate.registration && current.registration === candidate.registration);
  const sameFleet = Boolean(current.fleetNumber && candidate.fleetNumber && current.fleetNumber === candidate.fleetNumber);
  if (sameVehicle) { score += 120; reasons.push("Same vehicle"); }
  if (sameRegistration) { score += 100; reasons.push("Same registration number"); }
  if (sameFleet) { score += 90; reasons.push("Same fleet number"); }
  if (current.previousJobNumber && current.previousJobNumber === normalizeIdentifier(candidate.jobNumber)) { score += 110; reasons.push("Previous job linked to this job"); }

  const requestedFaults = filters.faultCode ? [filters.faultCode] : current.faultCodes;
  for (const code of overlap(requestedFaults, candidate.faultCodes)) {
    score += 80;
    reasons.push(`Same fault code: ${code}`);
  }

  const currentText = tokenize([current.description, ...current.findings, ...current.components, filters.q].join(" "));
  const candidateText = tokenize([candidate.description, ...candidate.findings, ...candidate.repairs, ...candidate.components, ...candidate.parts].join(" "));
  const shared = overlap(currentText, candidateText);
  const similarity = currentText.length ? shared.length / new Set([...currentText, ...candidateText]).size : 0;
  const sameMakeModel = Boolean(current.make && current.model && current.make === candidate.make && current.model === candidate.model);
  if (sameMakeModel) { score += 28; reasons.push(shared.length ? `Same make/model with similar ${shared.slice(0, 3).join("/")} context` : "Same vehicle make/model"); }
  if (current.vehicleType && current.vehicleType === candidate.vehicleType) { score += 12; reasons.push("Same vehicle type"); }
  if (shared.length) { score += Math.min(60, Math.round(similarity * 48) + Math.min(shared.length * 3, 12)); reasons.push(`Similar history: ${shared.slice(0, 4).join(", ")}`); }
  if (candidate.components.some((component) => current.components.includes(component))) { score += 20; reasons.push("Same component/system"); }
  if (!candidate.incomplete) score += 5;
  if (candidate.reopened) score -= 10;
  if (candidate.cancelled) score -= 20;

  if (filters.vehicleOnly && !(sameVehicle || sameRegistration || sameFleet)) return null;
  if (filters.faultCode && !candidate.faultCodes.includes(filters.faultCode)) return null;
  if (filters.q && !overlap(tokenize(filters.q), candidateText).length) return null;
  if (!reasons.length || score <= 0) return null;
  return { score, reasons: [...new Set(reasons)].slice(0, 5) };
}
