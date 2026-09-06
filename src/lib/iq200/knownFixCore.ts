import { normalizeFaultCode, normalizeLabel, tokenize } from "./historyCore.ts";

export const KNOWN_FIX_STATUSES = ["DRAFT", "APPROVED", "INACTIVE"] as const;
export const KNOWN_FIX_MAX_RESULTS = 20;
export const KNOWN_FIX_MAX_CANDIDATES = 100;
export const KNOWN_FIX_QUERY_MAX = 200;
export const KNOWN_FIX_FAULT_MAX = 64;
export const KNOWN_FIX_ID = /^[A-Za-z0-9_-]{1,128}$/;
export type KnownFixStatus = typeof KNOWN_FIX_STATUSES[number];
export type KnownFixSearch = { q: string; faultCode: string; component: string; limit: number };
export type JobApplicability = { make: string; model: string; vehicleType: string; engineFamily: string; faultCodes: string[]; text: string };

const FIELDS = ["title", "category", "vehicleMake", "vehicleModel", "vehicleType", "engineFamily", "otherApplicability", "systemComponent", "diagnosticProcedure", "expectedValues", "findingsConditions", "repairProcedure", "safetyWarnings", "technicalCautions", "notes", "sourceReference"] as const;
const ARRAYS = ["symptoms", "faultCodes", "requiredTools", "partsComponents", "relatedHistoricalJobIds"] as const;
const ALLOWED_INPUT_FIELDS = new Set<string>([...FIELDS, ...ARRAYS]);
export function parseKnownFixSearch(url: URL): KnownFixSearch {
  const q = String(url.searchParams.get("q") || "").trim(); const faultCode = String(url.searchParams.get("faultCode") || "").trim(); const component = String(url.searchParams.get("component") || "").trim(); const raw = url.searchParams.get("limit");
  if (q.length > KNOWN_FIX_QUERY_MAX || component.length > 100 || faultCode.length > KNOWN_FIX_FAULT_MAX || raw && !/^\d+$/.test(raw)) throw new Error("INVALID_SEARCH");
  const limit = raw ? Number(raw) : 10; if (limit < 1 || limit > KNOWN_FIX_MAX_RESULTS) throw new Error("INVALID_SEARCH");
  return { q, component, faultCode: normalizeFaultCode(faultCode), limit };
}
function cleanText(value: unknown, max: number) { if (value == null) return ""; if (typeof value !== "string") throw new Error("INVALID_INPUT"); const result = value.trim(); if (result.length > max) throw new Error("INVALID_INPUT"); return result; }
function cleanArray(value: unknown, count: number, length: number) { if (value == null) return []; if (!Array.isArray(value) || value.length > count) throw new Error("INVALID_INPUT"); return [...new Set(value.map((item) => cleanText(item, length)).filter(Boolean))]; }
export function validateKnownFixInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT"); const input = value as Record<string, unknown>; const output: Record<string, unknown> = {};
  if (Object.keys(input).some((field) => !ALLOWED_INPUT_FIELDS.has(field))) throw new Error("INVALID_INPUT");
  for (const field of FIELDS) output[field] = cleanText(input[field], field === "title" ? 160 : ["category", "vehicleMake", "vehicleModel", "vehicleType", "engineFamily", "systemComponent"].includes(field) ? 100 : 8000);
  if (!output.title) throw new Error("INVALID_INPUT");
  for (const field of ARRAYS) output[field] = cleanArray(input[field], field === "relatedHistoricalJobIds" ? 20 : 40, field === "faultCodes" ? KNOWN_FIX_FAULT_MAX : field === "relatedHistoricalJobIds" ? 128 : 300);
  if (!(output.relatedHistoricalJobIds as string[]).every((id) => KNOWN_FIX_ID.test(id))) throw new Error("INVALID_INPUT");
  return output;
}
export function knownFixMatch(job: JobApplicability, fix: Record<string, unknown>, search: KnownFixSearch) {
  const make = normalizeLabel(fix.vehicleMake); const model = normalizeLabel(fix.vehicleModel); const type = normalizeLabel(fix.vehicleType); const engine = normalizeLabel(fix.engineFamily); const generic = !make && !model && !type && !engine;
  if (make && make !== job.make || model && model !== job.model || type && type !== job.vehicleType || engine && engine !== job.engineFamily) return null;
  const codes = Array.isArray(fix.faultCodes) ? fix.faultCodes.map(normalizeFaultCode) : []; const requested = search.faultCode ? [search.faultCode] : job.faultCodes; const matchedCodes = requested.filter((code) => codes.includes(code));
  const component = normalizeLabel(fix.systemComponent); if (search.component && !component.includes(normalizeLabel(search.component))) return null;
  const fixText = [fix.title, fix.category, fix.systemComponent, ...(Array.isArray(fix.symptoms) ? fix.symptoms : []), fix.diagnosticProcedure, fix.repairProcedure].join(" "); const shared = tokenize(`${job.text} ${search.q}`).filter((token) => tokenize(fixText).includes(token)); if (search.q && !tokenize(search.q).some((token) => tokenize(fixText).includes(token))) return null;
  let score = matchedCodes.length * 120; const reasons: string[] = matchedCodes.map((code) => `Exact fault code: ${code}`);
  if (make && model) { score += 90; reasons.push("Exact make/model applicability"); } else if (make) { score += 45; reasons.push("Same vehicle make"); } if (type) { score += 25; reasons.push("Same vehicle type"); } if (engine && engine === job.engineFamily) { score += 70; reasons.push("Same engine/family"); } if (component) { score += 35; reasons.push(`Component/system: ${component}`); } if (shared.length) { score += Math.min(30, shared.length * 5); reasons.push(`Similar symptoms: ${shared.slice(0, 4).join(", ")}`); } if (generic) { score += 5; reasons.push("Generic approved guidance"); }
  return score > 0 ? { score, reasons: [...new Set(reasons)].slice(0, 5) } : null;
}
