import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deduplicateHistoricalCandidates, HISTORY_MAX_RESULTS, normalizeFaultCode, normalizeIdentifier, parseHistoryFilters, scoreHistoricalJob, type NormalizedHistoryJob } from "../src/lib/iq200/historyCore.ts";

const source = (path: string) => readFileSync(path, "utf8");
const base = (overrides: Partial<NormalizedHistoryJob> = {}): NormalizedHistoryJob => ({ id: "job", jobNumber: "NJ1", date: null, vehicleId: "vehicle-a", registration: "ABC123GP", fleetNumber: "F12", make: "scania", model: "g460", vehicleType: "truck", description: "engine cranks but does not start when hot", faultCodes: ["AST-03119"], findings: [], repairs: [], parts: [], components: ["fuel system"], status: "Completed", outcome: "Returned to service", previousJobNumber: "", reopened: false, incomplete: false, cancelled: false, ...overrides });
const filters = { q: "", faultCode: "", vehicleOnly: false, limit: 10 };

test("same vehicle, registration, fleet, linked job and fault code rank deterministically", () => {
  const current = base({ previousJobNumber: "NJ0" });
  assert.ok(scoreHistoricalJob(current, base({ jobNumber: "NJ0" }), filters)!.score > scoreHistoricalJob(current, base({ vehicleId: "other", registration: "other", fleetNumber: "other", faultCodes: [] }), filters)!.score);
  assert.match(scoreHistoricalJob(current, base(), filters)!.reasons.join(" "), /Same vehicle/);
  assert.equal(normalizeIdentifier(" ab-c 123 gp "), "ABC123GP"); assert.equal(normalizeFaultCode(" ast-03119 "), "AST-03119");
});

test("similar symptom is lower ranked than structured matches", () => {
  const exact = scoreHistoricalJob(base(), base(), filters)!;
  const symptom = scoreHistoricalJob(base(), base({ vehicleId: "x", registration: "x", fleetNumber: "x", make: "volvo", model: "fh", vehicleType: "van", faultCodes: [], description: "hot engine cranks without starting" }), filters)!;
  assert.ok(exact.score > symptom.score);
  const textOnly = scoreHistoricalJob(base({ faultCodes: [] }), base({ vehicleId: "x", registration: "x", fleetNumber: "x", make: "x", model: "x", vehicleType: "x", faultCodes: [], components: [] }), filters)!;
  const faultOnly = scoreHistoricalJob(base(), base({ vehicleId: "x", registration: "x", fleetNumber: "x", make: "x", model: "x", vehicleType: "x", description: "unrelated", components: [] }), filters)!;
  assert.ok(faultOnly.score > textOnly.score, "exact fault-code match must outrank free text alone");
});

test("current job is excluded and candidates found through multiple paths are deduplicated", () => {
  const candidates = deduplicateHistoricalCandidates("current", [{ id: "current", source: "recent" }, { id: "old", source: "vehicle" }, { id: "old", source: "registration" }]);
  assert.deepEqual(candidates, [{ id: "old", source: "registration" }]);
});

test("vehicle-only and fault-code controls filter unrelated history", () => {
  const unrelated = base({ vehicleId: "x", registration: "x", fleetNumber: "x" });
  assert.equal(scoreHistoricalJob(base(), unrelated, { ...filters, vehicleOnly: true }), null);
  assert.equal(scoreHistoricalJob(base(), base({ faultCodes: [] }), { ...filters, faultCode: "AST-03119" }), null);
});

test("cancelled and reopened history is penalized and remains labelled", () => {
  const completed = scoreHistoricalJob(base(), base(), filters)!;
  assert.ok(completed.score > scoreHistoricalJob(base(), base({ cancelled: true, incomplete: true }), filters)!.score);
  assert.ok(completed.score > scoreHistoricalJob(base(), base({ reopened: true }), filters)!.score);
});

test("incomplete history does not crash", () => {
  assert.doesNotThrow(() => scoreHistoricalJob(base(), base({ vehicleId: "", registration: "", fleetNumber: "", description: "", faultCodes: [], findings: [], repairs: [], parts: [], components: [] }), filters));
});

test("query limits and malformed parameters are rejected", () => {
  assert.equal(parseHistoryFilters(new URL("http://local?limit=20")).limit, HISTORY_MAX_RESULTS);
  for (const query of ["limit=21", "limit=nope", "vehicleOnly=maybe", `q=${"x".repeat(201)}`, `faultCode=${"x".repeat(65)}`]) assert.throws(() => parseHistoryFilters(new URL(`http://local?${query}`)));
});

test("history API reuses Phase 1 auth and ignores browser companyId", () => {
  const route = source("src/app/api/iq200/jobs/[jobId]/history/route.ts"); const service = source("src/lib/iq200/historyService.ts");
  assert.match(route, /authenticateServerRequest/); assert.match(service, /authorisedJob\(context, jobId\)/); assert.match(service, /companies\/\$\{companyId\}\/jobs/);
  assert.doesNotMatch(service, /searchParams\.get\("companyId"\)|body\.companyId/); assert.match(source("src/lib/iq200/historyCore.ts"), /HISTORY_MAX_CANDIDATES = 300/); assert.match(service, /slice\(0, filters\.limit\)/);
});

test("history response is allowlisted and does not return raw records or company identity", () => {
  const service = source("src/lib/iq200/historyService.ts"); const response = service.slice(service.indexOf(".map(({ candidate, match }) => ({"), service.indexOf("return { results"));
  assert.doesNotMatch(response, /companyId|createdBy|updatedBy|membership|\.\.\.candidate/);
  for (const field of ["jobNumber", "relevanceScore", "relevanceReasons", "technicianFindings", "repairPerformed", "partsUsed"]) assert.ok(response.includes(field));
});

test("UI describes history as context rather than diagnosis", () => {
  const page = source("src/app/jobs/[id]/iq200/page.tsx"); assert.match(page, /Related repair history/i); assert.match(page, /not a diagnosis/i); assert.match(page, /AI diagnosis is not enabled/i); assert.doesNotMatch(page, /All previous repairs/i);
  assert.match(source("src/lib/iq200/historyService.ts"), /never as exhaustive vehicle history/);
});

test("Phase 2 has no WhatsApp or external AI dependency", () => {
  const implementation = source("src/lib/iq200/historyCore.ts") + source("src/lib/iq200/historyService.ts") + source("src/app/jobs/[id]/iq200/page.tsx"); assert.doesNotMatch(implementation, /whatsapp|openai|gemini|embedding|vector/i);
});
