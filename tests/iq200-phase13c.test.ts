import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deduplicateHistoricalCandidates,
  HISTORY_DEFAULT_RESULTS,
  HISTORY_MAX_FAULT_SCORE,
  HISTORY_MAX_RESULTS,
  normalizeFaultCode,
  parseHistoryFilters,
  rankHistoricalJobs,
  scoreHistoricalJob,
  selectHistoricalEnrichmentShortlist,
  type NormalizedHistoryJob,
} from "../src/lib/iq200/historyCore.ts";

const source = (path: string) => readFileSync(path, "utf8");
const filters = { q: "", faultCode: "", vehicleOnly: false, limit: 10 };
const job = (overrides: Partial<NormalizedHistoryJob> = {}): NormalizedHistoryJob => ({
  id: "job", jobNumber: "J1", date: null, vehicleId: "", registration: "", fleetNumber: "", make: "", model: "",
  vehicleType: "", description: "", faultCodes: [], findings: [], repairs: [], parts: [], components: [], status: "",
  outcome: "", previousJobNumber: "", reopened: false, incomplete: true, cancelled: false, ...overrides,
});

test("P13C.1 exact vehicle ID qualifies", () => {
  assert.match(scoreHistoricalJob(job({ vehicleId: "veh-1" }), job({ id: "old", vehicleId: "veh-1" }), filters)!.reasons.join(" "), /Same vehicle/);
});

test("P13C.2 normalized registration qualifies", () => {
  assert.match(scoreHistoricalJob(job({ registration: "CA 123-GP" }), job({ id: "old", registration: "ca-123 gp" }), filters)!.reasons.join(" "), /Same registration/);
});

test("P13C.3 valid previous-job relationship qualifies", () => {
  assert.match(scoreHistoricalJob(job({ previousJobNumber: "J100" }), job({ id: "old", jobNumber: "J-100" }), filters)!.reasons.join(" "), /Previous job linked/);
});

test("P13C.4 contradictory identity prevents link-only qualification", () => {
  assert.equal(scoreHistoricalJob(job({ vehicleId: "veh-a", previousJobNumber: "J1" }), job({ id: "old", vehicleId: "veh-b", jobNumber: "J1" }), filters), null);
});

test("P13C.5 technical evidence independently qualifies a contradictory linked job", () => {
  const match = scoreHistoricalJob(job({ vehicleId: "veh-a", previousJobNumber: "J1", faultCodes: ["P0087"] }), job({ id: "old", vehicleId: "veh-b", jobNumber: "J1", faultCodes: ["P0087"] }), filters)!;
  assert.ok(match);
  assert.doesNotMatch(match.reasons.join(" "), /Previous job linked/);
});

test("P13C.6 exact fault code qualifies", () => {
  assert.match(scoreHistoricalJob(job({ faultCodes: ["P0087"] }), job({ id: "old", faultCodes: ["P0087"] }), filters)!.reasons.join(" "), /P0087/);
});

test("P13C.7 partial fault-code collision is excluded", () => {
  assert.equal(scoreHistoricalJob(job({ faultCodes: ["P008"] }), job({ id: "old", faultCodes: ["P0087"] }), filters), null);
});

test("P13C.8 supported equivalent fault-code formatting normalizes", () => {
  assert.equal(normalizeFaultCode(" p 0087 "), "P0087");
  assert.ok(scoreHistoricalJob(job({ faultCodes: ["P 0087"] }), job({ id: "old", faultCodes: ["p0087"] }), filters));
});

test("P13C.9 duplicate fault codes do not inflate score", () => {
  const once = scoreHistoricalJob(job({ faultCodes: ["P0087"] }), job({ id: "old", faultCodes: ["P0087"] }), filters)!;
  const repeated = scoreHistoricalJob(job({ faultCodes: ["P0087", "P0087"] }), job({ id: "old", faultCodes: ["P0087", "P0087"] }), filters)!;
  assert.equal(repeated.score, once.score);
});

test("P13C.10 fault-code contribution is capped", () => {
  const codes = ["P0001", "P0002", "P0003", "P0004"];
  assert.equal(scoreHistoricalJob(job({ faultCodes: codes }), job({ id: "old", faultCodes: codes }), filters)!.score, HISTORY_MAX_FAULT_SCORE);
});

test("P13C.11 meaningful component relationship qualifies", () => {
  assert.match(scoreHistoricalJob(job({ components: ["Fuel pressure pump"] }), job({ id: "old", components: ["fuel-pressure pump"] }), filters)!.reasons.join(" "), /Same component/);
});

test("P13C.12 unrelated component is excluded", () => {
  assert.equal(scoreHistoricalJob(job({ components: ["fuel pump"] }), job({ id: "old", components: ["brake modulator"] }), filters), null);
});

test("P13C.13 meaningful multi-token technical overlap qualifies", () => {
  assert.ok(scoreHistoricalJob(job({ description: "low rail pressure during cranking" }), job({ id: "old", description: "rail pressure low when cranking" }), filters));
});

test("P13C.14 a single weak shared token is excluded", () => {
  assert.equal(scoreHistoricalJob(job({ description: "pressure drops suddenly" }), job({ id: "old", description: "pressure stable elsewhere" }), filters), null);
});

test("P13C.15 generic workshop words are excluded", () => {
  assert.equal(scoreHistoricalJob(job({ description: "truck engine fault checked and repaired" }), job({ id: "old", description: "vehicle engine fault tested and replaced" }), filters), null);
});

test("P13C.16 same make only is excluded", () => {
  assert.equal(scoreHistoricalJob(job({ make: "scania" }), job({ id: "old", make: "scania" }), filters), null);
});

test("P13C.17 same model only is excluded", () => {
  assert.equal(scoreHistoricalJob(job({ model: "r500" }), job({ id: "old", model: "r500" }), filters), null);
});

test("P13C.18 same vehicle type only is excluded", () => {
  assert.equal(scoreHistoricalJob(job({ vehicleType: "truck" }), job({ id: "old", vehicleType: "truck" }), filters), null);
});

test("P13C.19 same fleet number only is excluded", () => {
  assert.equal(scoreHistoricalJob(job({ fleetNumber: "F-10" }), job({ id: "old", fleetNumber: "F10" }), filters), null);
});

test("P13C.20 empty and noisy data is safely excluded", () => {
  assert.equal(scoreHistoricalJob(job({ registration: "-", faultCodes: ["-"], components: ["system"] }), job({ id: "old", registration: " ", faultCodes: ["-"], components: ["component"] }), filters), null);
});

test("P13C.21 component evidence is not double counted as generic text", () => {
  const match = scoreHistoricalJob(job({ description: "fuel pump", components: ["fuel pump"] }), job({ id: "old", description: "fuel pump", components: ["fuel pump"] }), filters)!;
  assert.equal(match.score, 45);
  assert.equal(match.strongTechnicalEvidenceCount, 1);
});

test("P13C.22 repeated text tokens do not inflate score", () => {
  const once = scoreHistoricalJob(job({ description: "rail pressure" }), job({ id: "old", description: "rail pressure" }), filters)!;
  const repeated = scoreHistoricalJob(job({ description: "rail rail pressure pressure" }), job({ id: "old", description: "rail rail pressure pressure" }), filters)!;
  assert.equal(repeated.score, once.score);
});

test("P13C.23 strong evidence outranks weak ranking metadata", () => {
  const strong = scoreHistoricalJob(job({ vehicleId: "v1" }), job({ id: "strong", vehicleId: "v1" }), filters)!;
  const technical = scoreHistoricalJob(job({ description: "rail pressure", make: "scania", model: "r500", vehicleType: "truck" }), job({ id: "weak", description: "rail pressure", make: "scania", model: "r500", vehicleType: "truck" }), filters)!;
  assert.ok(strong.score > technical.score);
});

test("P13C.24 ranking has a deterministic document-ID tie-break", () => {
  const current = job({ vehicleId: "v1" });
  const ranked = rankHistoricalJobs(current, [job({ id: "b", vehicleId: "v1" }), job({ id: "a", vehicleId: "v1" })], filters);
  assert.deepEqual(ranked.map((item) => item.candidate.id), ["a", "b"]);
});

test("P13C.25 candidate deduplication keeps one candidate per document", () => {
  assert.deepEqual(deduplicateHistoricalCandidates("current", [{ id: "old", source: "first" }, { id: "old", source: "last" }]), [{ id: "old", source: "last" }]);
});

test("P13C.26 current job is excluded from candidates", () => {
  assert.deepEqual(deduplicateHistoricalCandidates("current", [{ id: "current" }, { id: "old" }]), [{ id: "old" }]);
});

test("P13C.27 bounded enrichment shortlist retains candidates that can gain technical evidence", () => {
  const current = job({ description: "rail pressure low" });
  const candidate = job({ id: "old", jobNumber: "J2" });
  const shortlist = selectHistoricalEnrichmentShortlist(current, [candidate], { ...filters, limit: 1 });
  assert.deepEqual(shortlist.map((item) => item.id), ["old"]);
  assert.ok(scoreHistoricalJob(current, { ...candidate, description: "rail pressure low" }, filters));
});

test("P13C.28 hardened rescoring backfills after an enriched rejection", () => {
  const current = job({ faultCodes: ["P0087"] });
  const enriched = [job({ id: "reject" }), job({ id: "a", faultCodes: ["P0087"] }), job({ id: "b", faultCodes: ["P0087"] })];
  assert.deepEqual(rankHistoricalJobs(current, enriched, filters).slice(0, 2).map((item) => item.candidate.id), ["a", "b"]);
});

test("P13C.29 tenant query path remains company scoped", () => {
  const service = source("src/lib/iq200/historyService.ts");
  assert.match(service, /collection\(`companies\/\$\{companyId\}\/jobs`\)/);
  assert.match(service, /authorisedJob\(context, jobId\)/);
  assert.doesNotMatch(service, /body\.companyId|searchParams\.get\("companyId"\)/);
});

test("P13C.30 browser history DTO remains explicitly allowlisted", () => {
  const service = source("src/lib/iq200/historyService.ts");
  const projection = service.slice(service.indexOf(".map(({ candidate, match }) => ({"), service.indexOf("return { results"));
  assert.match(projection, /relevanceScore:/);
  assert.doesNotMatch(projection, /companyId|vehicleId|previousJobNumber|createdBy|updatedBy|\.\.\.candidate/);
});

test("P13C.31 maximum browser result limit remains 20", () => {
  assert.equal(HISTORY_MAX_RESULTS, 20);
  assert.throws(() => parseHistoryFilters(new URL("http://local?limit=21")));
});

test("P13C.32 default history result limit remains 10", () => {
  assert.equal(HISTORY_DEFAULT_RESULTS, 10);
  assert.equal(parseHistoryFilters(new URL("http://local")).limit, 10);
});

test("P13C.33 reasoning history contract remains five stable HISTORY_n references", () => {
  const core = source("src/lib/iq200/reasoningCore.ts");
  const service = source("src/lib/iq200/reasoningService.ts");
  assert.match(core, /REASONING_HISTORY_MAX = 5/);
  assert.match(service, /history\.results\.slice\(0,REASONING_HISTORY_MAX\)/);
  assert.match(service, /reference:`HISTORY_\$\{index\+1\}`/);
});

test("P13C.34 exact fault code in descriptions is not double counted as technical text", () => {
  const match = scoreHistoricalJob(
    job({ faultCodes: ["AST-03119"], description: "AST-03119" }),
    job({ id: "old", faultCodes: ["AST-03119"], description: "AST-03119" }),
    filters,
  )!;
  assert.ok(match);
  assert.equal(match.score, 80);
  assert.match(match.reasons.join(" "), /Same fault code: AST-03119/);
  assert.doesNotMatch(match.reasons.join(" "), /Similar technical history/);
  assert.equal(match.strongTechnicalEvidenceCount, 1);
});

test("P13C.35 multi-token overlap below 25 percent is excluded", () => {
  const match = scoreHistoricalJob(
    job({ description: "rail pressure alpha bravo charlie delta echo foxtrot golf hotel" }),
    job({ id: "old", description: "rail pressure injector circuit voltage signal wiring connector harness sensor" }),
    filters,
  );
  assert.equal(match, null);
});

test("P13C.36 same make and model alone is excluded", () => {
  assert.equal(
    scoreHistoricalJob(
      job({ make: "scania", model: "r500" }),
      job({ id: "old", make: "scania", model: "r500" }),
      filters,
    ),
    null,
  );
});
