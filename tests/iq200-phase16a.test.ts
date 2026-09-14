import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { knownFixMatch, parseStoredKnownFix, knownFixTransitionAllowed, type JobApplicability, type KnownFixSearch } from "../src/lib/iq200/knownFixCore.ts";

const source = (path: string) => readFileSync(path, "utf8");
const core = () => source("src/lib/iq200/knownFixCore.ts");
const service = () => source("src/lib/iq200/knownFixService.ts");
const companyId = "company-a";
const job: JobApplicability = { make: "scania", model: "g460", vehicleType: "truck", engineFamily: "dc13", faultCodes: ["P0087"], text: "low fuel pressure" };
const search: KnownFixSearch = { q: "", faultCode: "", component: "", limit: 10 };
const valid = (overrides: Record<string, unknown> = {}) => ({
    companyId,
    title: "Rail pressure verification",
    category: "Fuel system",
    vehicleMake: "Scania",
    vehicleModel: "G460",
    vehicleType: "Truck",
    engineFamily: "DC13",
    otherApplicability: "",
    systemComponent: "fuel pressure",
    symptoms: ["low pressure"],
    faultCodes: ["P0087"],
    diagnosticProcedure: "Measure rail pressure during crank.",
    expectedValues: "Use the approved manufacturer range.",
    findingsConditions: "Confirm the measured pressure is outside specification.",
    repairProcedure: "Repair only after verification.",
    requiredTools: ["approved gauge"],
    partsComponents: [],
    safetyWarnings: "Depressurize before service.",
    technicalCautions: "",
    notes: "",
    sourceReference: "FUEL-17",
    relatedHistoricalJobIds: [],
    status: "APPROVED",
    active: true,
    revision: 2,
    createdBy: "user-a",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedBy: "user-a",
    updatedAt: "2026-01-01T00:00:00.000Z",
    approvedBy: "admin-a",
    approvedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
});

test("P16A.1 valid stored Known Fix is canonicalized and accepted", () => {
    const parsed = parseStoredKnownFix(valid(), companyId);
    assert.ok(parsed);
    assert.equal(parsed.title, "Rail pressure verification");
    assert.deepEqual(parsed.faultCodes, ["P0087"]);
    assert.equal(parsed.revision, 2);
});

test("P16A.2 missing legacy companyId is accepted", () => {
    const record = valid();
    delete (record as Record<string, unknown>).companyId;
    assert.ok(parseStoredKnownFix(record, companyId));
});

test("P16A.3 contradictory companyId is rejected", () => {
    assert.equal(parseStoredKnownFix(valid({ companyId: "company-b" }), companyId), null);
});

test("P16A.4 malformed title is rejected", () => {
    assert.equal(parseStoredKnownFix(valid({ title: { text: "bad" } }), companyId), null);
    assert.equal(parseStoredKnownFix(valid({ title: "" }), companyId), null);
});

test("P16A.5 malformed summary or fix text is rejected", () => {
    assert.equal(parseStoredKnownFix(valid({ diagnosticProcedure: { text: "bad" } }), companyId), null);
    assert.equal(parseStoredKnownFix(valid({ repairProcedure: ["bad"] }), companyId), null);
});

test("P16A.6 oversized stored strings are rejected", () => {
    assert.equal(parseStoredKnownFix(valid({ notes: "x".repeat(8001) }), companyId), null);
    assert.equal(parseStoredKnownFix(valid({ title: "x".repeat(161) }), companyId), null);
});

test("P16A.7 malformed fault-code arrays are rejected", () => {
    assert.equal(parseStoredKnownFix(valid({ faultCodes: "P0087" }), companyId), null);
    assert.equal(parseStoredKnownFix(valid({ faultCodes: ["P0087", { value: "bad" }] }), companyId), null);
});

test("P16A.8 non-string and oversized arrays are rejected", () => {
    assert.equal(parseStoredKnownFix(valid({ symptoms: ["valid", 3] }), companyId), null);
    assert.equal(parseStoredKnownFix(valid({ requiredTools: Array.from({ length: 41 }, () => "tool") }), companyId), null);
});

test("P16A.9 invalid lifecycle and active values are rejected", () => {
    assert.equal(parseStoredKnownFix(valid({ status: "UNKNOWN" }), companyId), null);
    assert.equal(parseStoredKnownFix(valid({ active: "true" }), companyId), null);
});

test("P16A.10 malformed applicability fields are rejected", () => {
    assert.equal(parseStoredKnownFix(valid({ vehicleMake: { value: "Scania" } }), companyId), null);
    assert.equal(parseStoredKnownFix(valid({ systemComponent: "x".repeat(101) }), companyId), null);
});

test("P16A.11 malformed revision values are rejected", () => {
    for (const revision of [0, -1, 1.5, "2", Number.NaN, Infinity]) assert.equal(parseStoredKnownFix(valid({ revision }), companyId), null);
});

test("P16A.12 arbitrary objects cannot reach the canonical record", () => {
    assert.equal(parseStoredKnownFix(valid({ notes: { secret: "value" } }), companyId), null);
    const parsed = parseStoredKnownFix(valid(), companyId)!;
    assert.equal(typeof parsed.notes, "string");
    assert.equal(Array.isArray(parsed.symptoms), true);
});

test("P16A.13 malformed records are filtered before both DTO functions", () => {
    const value = service();
    assert.match(value, /parseStoredKnownFix\(doc\.data\(\), context\.companyId\)/);
    assert.match(value, /function adminDto\(id: string, data: StoredKnownFix\)/);
    assert.match(value, /function technicianDto\(id: string, data: StoredKnownFix/);
});

test("P16A.14 one malformed record does not hide a valid record", () => {
    const records = [valid({ title: { invalid: true } }), valid({ title: "Valid record" })];
    const accepted = records.map((record) => parseStoredKnownFix(record, companyId)).filter((record): record is NonNullable<typeof record> => Boolean(record));
    assert.deepEqual(accepted.map((record) => record.title), ["Valid record"]);
});

test("P16A.15 valid approved active Known Fix remains applicable", () => {
    const parsed = parseStoredKnownFix(valid(), companyId)!;
    const match = knownFixMatch(job, parsed, search);
    assert.ok(match && match.score > 0);
});

test("P16A.16 Draft and inactive records remain unavailable to technicians", () => {
    const draft = parseStoredKnownFix(valid({ status: "DRAFT", active: false }), companyId)!;
    const inactive = parseStoredKnownFix(valid({ status: "INACTIVE", active: false }), companyId)!;
    assert.equal(draft.status === "APPROVED" && draft.active === true, false);
    assert.equal(inactive.status === "APPROVED" && inactive.active === true, false);
});

test("P16A.17 valid admin fields remain canonical and available", () => {
    const parsed = parseStoredKnownFix(valid(), companyId)!;
    for (const field of ["title", "status", "active", "revision", "createdBy", "approvedBy"]) assert.ok(field in parsed, field);
});

test("P16A.18 lifecycle transition behavior remains unchanged", () => {
    assert.equal(knownFixTransitionAllowed("DRAFT", "approve"), true);
    assert.equal(knownFixTransitionAllowed("APPROVED", "inactivate"), true);
    assert.equal(knownFixTransitionAllowed("INACTIVE", "approve"), false);
});

test("P16A.19 mutation paths parse existing records before lifecycle use", () => {
    const value = service();
    const update = value.slice(value.indexOf("export async function updateKnownFix"), value.indexOf("export async function changeKnownFixStatus"));
    assert.match(update, /parseStoredKnownFix\(snap\.data\(\), context\.companyId\)/);
    assert.match(update, /if \(!stored\) throw new ServerAccessError\("NOT_FOUND"/);
    assert.match(value, /parseStoredKnownFix\(snap\.data\(\), context\.companyId\)/);
});

test("P16A.20 malformed reads never invoke reasoning or provider code", () => {
    const value = service();
    assert.doesNotMatch(value, /reasonAboutIQ200Session|runHostedReasoning|configuredReasoningProvider|OpenAI/);
    assert.match(core(), /export function parseStoredKnownFix/);
});

test("P16A.21 DRAFT record with approvedBy:null and approvedAt:null is accepted", () => {
    const parsed = parseStoredKnownFix(valid({ status: "DRAFT", active: false, approvedBy: null, approvedAt: null }), companyId);
    assert.ok(parsed);
    assert.equal(parsed.approvedBy, "");
    assert.equal(parsed.approvedAt, null);
});

test("P16A.22 newly-created-storage-shaped DRAFT record parses successfully", () => {
    const record = valid({
        status: "DRAFT",
        active: false,
        revision: 1,
        createdBy: "user-a",
        createdAt: null,
        updatedBy: "user-a",
        updatedAt: null,
        approvedBy: null,
        approvedAt: null,
    });
    const parsed = parseStoredKnownFix(record, companyId);
    assert.ok(parsed);
    assert.equal(parsed.status, "DRAFT");
    assert.equal(parsed.approvedBy, "");
    assert.equal(parsed.approvedAt, null);
});

test("P16A.23 admin DTO compatibility for unapproved records remains approvedBy:\"\"", () => {
    const parsed = parseStoredKnownFix(valid({ status: "DRAFT", active: false, approvedBy: null, approvedAt: null, createdBy: undefined, updatedBy: undefined }), companyId)!;
    assert.equal(parsed.approvedBy, "");
    assert.equal(parsed.createdBy, "");
    assert.equal(parsed.updatedBy, "");
});

test("P16A.24 malformed object/number approvedBy is rejected", () => {
    assert.equal(parseStoredKnownFix(valid({ approvedBy: { id: "user-a" } }), companyId), null);
    assert.equal(parseStoredKnownFix(valid({ approvedBy: 12345 }), companyId), null);
});

test("P16A.25 valid APPROVED records still work", () => {
    const parsed = parseStoredKnownFix(valid({ status: "APPROVED", active: true, approvedBy: "admin-a", approvedAt: "2026-01-01T00:00:00.000Z" }), companyId);
    assert.ok(parsed);
    assert.equal(parsed.status, "APPROVED");
    assert.equal(parsed.approvedBy, "admin-a");
});

test("P16A.26 malformed records remain excluded alongside valid null-actor records", () => {
    const records = [valid({ createdBy: { bad: true } }), valid({ status: "DRAFT", active: false, approvedBy: null, approvedAt: null })];
    const accepted = records.map((record) => parseStoredKnownFix(record, companyId)).filter((record): record is NonNullable<typeof record> => Boolean(record));
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0]!.approvedBy, "");
});
