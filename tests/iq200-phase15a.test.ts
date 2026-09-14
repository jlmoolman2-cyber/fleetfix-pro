import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { knownFixEditBehavior, knownFixMatch, knownFixTransitionAllowed, type JobApplicability, type KnownFixSearch } from "../src/lib/iq200/knownFixCore.ts";

const source = (path: string) => readFileSync(path, "utf8");
const history = () => source("src/lib/iq200/historyService.ts");
const service = () => source("src/lib/iq200/service.ts");
const knownFix = () => source("src/lib/iq200/knownFixService.ts");
const reasoning = () => source("src/lib/iq200/reasoningService.ts");

test("P15A.1 historical candidates accept matching or missing companyId only", () => {
  const value = history();
  assert.match(value, /function hasCompatibleCompany\(data: DocumentData, companyId: string\)/);
  assert.match(value, /data\.companyId === undefined \|\| data\.companyId === companyId/);
  const retrieval = value.slice(value.indexOf("const candidates ="), value.indexOf("const topLevelCandidates"));
  assert.match(retrieval, /filter\(\(candidate\) => hasCompatibleCompany\(candidate\.data\(\), context\.companyId\)\)/);
});

test("P15A.2 contradictory historical candidates are removed before enrichment and ranking", () => {
  const value = history();
  const body = value.slice(value.indexOf("export async function searchIQ200History"));
  const filterIndex = body.indexOf(".filter((candidate) => hasCompatibleCompany");
  const enrichIndex = body.indexOf("enrich(candidate)");
  const rankIndex = body.indexOf("rankHistoricalJobs");
  assert.ok(filterIndex >= 0 && filterIndex < enrichIndex, "tenant filtering must precede enrichment");
  assert.ok(filterIndex < rankIndex, "tenant filtering must precede ranking");
  assert.match(value, /candidates\.filter\(\(candidate\) => shortlistIds\.has\(candidate\.id\)\)\.map\(\(candidate\) => enrich\(candidate\)\)/);
});

test("P15A.3 history evidence cannot reintroduce excluded candidates", () => {
  const value = reasoning();
  assert.match(value, /searchIQ200History\(context,jobId/);
  const historyValue = history();
  assert.match(historyValue, /\.filter\(\(candidate\) => hasCompatibleCompany\(candidate\.data\(\), context\.companyId\)\)/);
  assert.doesNotMatch(value, /candidateSnapshots\(|enrich\(/);
});

test("P15A.4 session listing accepts matching or missing identity fields", () => {
  const value = service();
  const listing = value.slice(value.indexOf("export async function listIQ200Sessions"), value.indexOf("export async function createIQ200Session"));
  assert.match(listing, /data\.companyId === undefined \|\| data\.companyId === context\.companyId/);
  assert.match(listing, /data\.jobId === undefined \|\| data\.jobId === snapshot\.id/);
  assert.match(listing, /\.filter\(\(doc\) =>/);
  assert.match(listing, /\.map\(\(doc\) => sessionEntry\(doc\.id, doc\.data\(\)\)\)/);
});

test("P15A.5 contradictory session companyId and jobId cannot be projected", () => {
  const value = service();
  const listing = value.slice(value.indexOf("export async function listIQ200Sessions"), value.indexOf("export async function createIQ200Session"));
  const filterIndex = listing.indexOf(".filter((doc)");
  const mapIndex = listing.indexOf(".map((doc)");
  assert.ok(filterIndex >= 0 && filterIndex < mapIndex, "session identity filtering must precede DTO projection");
  assert.match(listing, /&& \(data\.jobId === undefined \|\| data\.jobId === snapshot\.id\)/);
  assert.match(value, /data\?\.companyId !== context\.companyId/);
  assert.match(value, /data\?\.jobId !== jobSnapshot\.id/);
});

test("P15A.6 Known Fix technician reads require matching or missing companyId", () => {
  const value = knownFix();
  assert.match(value, /function hasCompatibleCompany\(data: DocumentData, companyId: string\)/);
  const search = value.slice(value.indexOf("export async function searchKnownFixesForJob"), value.indexOf("export async function listKnownFixes"));
  assert.match(search, /hasCompatibleCompany\(doc\.data\(\), context\.companyId\) && doc\.data\(\)\.active === true/);
  assert.match(search, /where\("status", "==", "APPROVED"\)/);
});

test("P15A.7 Known Fix admin reads exclude contradictory companyId before DTO output", () => {
  const value = knownFix();
  const listing = value.slice(value.indexOf("export async function listKnownFixes"), value.indexOf("export async function createKnownFix"));
  assert.match(listing, /snapshot\.docs\.filter\(\(doc\)=>hasCompatibleCompany\(doc\.data\(\),context\.companyId\)\)\.map\(\(doc\)=>adminDto/);
  assert.match(value, /if\s*\(!hasCompatibleCompany\(currentData, context\.companyId\)\)\s*throw new ServerAccessError\("NOT_FOUND"/);
  assert.match(value, /if\s*\(!hasCompatibleCompany\(data,context\.companyId\)\)throw new ServerAccessError\("NOT_FOUND"/);
});

test("P15A.8 Known Fix matching and lifecycle behavior remain unchanged", () => {
  const search: KnownFixSearch = { q: "", faultCode: "", component: "", limit: 10 };
  const job: JobApplicability = { make: "mercedes", model: "actros", vehicleType: "truck", engineFamily: "om471", faultCodes: ["B10EE"], text: "air conditioning not cooling" };
  const fix = { title: "AC compressor clutch check", category: "", vehicleMake: "Mercedes", vehicleModel: "Actros", vehicleType: "Truck", engineFamily: "OM471", systemComponent: "air conditioning", symptoms: ["cabin not cooling"], faultCodes: ["B10EE"], diagnosticProcedure: "Measure vent temperature", repairProcedure: "" };
  assert.ok(knownFixMatch(job, fix, search));
  assert.equal(knownFixMatch(job, { ...fix, vehicleMake: "Volvo" }, search), null);
  assert.equal(knownFixTransitionAllowed("DRAFT", "approve"), true);
  assert.equal(knownFixTransitionAllowed("INACTIVE", "approve"), false);
  assert.equal(knownFixTransitionAllowed("APPROVED", "inactivate"), true);
  assert.equal(knownFixEditBehavior("APPROVED"), "revision");
  assert.equal(knownFixEditBehavior("INACTIVE"), "denied");
});

test("P15A.9 existing tenant, permission, and DTO boundaries remain present", () => {
  assert.match(service(), /requireIQ200Access\(context\)/);
  assert.match(history(), /authorisedJob\(context, jobId\)/);
  assert.match(knownFix(), /authorisedJob\(context, jobId\)/);
  assert.match(knownFix(), /function technicianDto/);
  assert.match(knownFix(), /function adminDto/);
  assert.doesNotMatch(knownFix().slice(knownFix().indexOf("function technicianDto"), knownFix().indexOf("export async function searchKnownFixesForJob")), /companyId|createdBy|approvedBy|updatedBy/);
});
