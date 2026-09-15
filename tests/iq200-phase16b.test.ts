import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const service = () => source("src/lib/iq200/service.ts");
const listing = () => service().slice(service().indexOf("export async function listIQ200Sessions"), service().indexOf("export async function createIQ200Session"));
const dto = () => service().slice(service().indexOf("function sessionEntry"), service().indexOf("function validateJobId"));

const assertListing = (pattern: RegExp) => assert.match(listing(), pattern);

test("P16B.1 modern sessions query updatedAt and createdAt", () => {
    assertListing(/orderBy\("updatedAt", "desc"\)\.limit\(50\)/);
    assertListing(/orderBy\("createdAt", "desc"\)\.limit\(50\)/);
});

test("P16B.2 legacy sessions can be retrieved through createdAt", () => {
    assertListing(/const \[updatedSessions, createdSessions\] = await Promise\.all\(\[/);
    assertListing(/createdSessions/);
});

test("P16B.3 updatedAt is preferred for ordering", () => {
    assertListing(/effectiveAt: entry\.updatedAt \?\? entry\.createdAt/);
});

test("P16B.4 createdAt is the fallback ordering timestamp", () => {
    assertListing(/updatedAt: sessionOrderValue\(data\.updatedAt\), createdAt: sessionOrderValue\(data\.createdAt\)/);
    assertListing(/entry\.updatedAt \?\? entry\.createdAt/);
});

test("P16B.5 records without either timestamp are excluded", () => {
    assertListing(/\.filter\(\(entry\): entry is typeof entry & \{ effectiveAt: number \} => entry\.effectiveAt !== null\)/);
});

test("P16B.6 malformed updatedAt safely falls back to createdAt", () => {
    assert.match(service(), /function sessionOrderValue\(value: unknown\): number \| null/);
    assert.match(service(), /const normalized = dateValue\(value\)/);
    assert.match(service(), /catch \{\s*return null;/);
    assertListing(/entry\.updatedAt \?\? entry\.createdAt/);
});

test("P16B.7 malformed createdAt without updatedAt is excluded", () => {
    assert.match(service(), /Date\.parse\(normalized\)/);
    assertListing(/effectiveAt !== null/);
});

test("P16B.8 missing companyId remains compatible", () => {
    assertListing(/data\.companyId === undefined \|\| data\.companyId === context\.companyId/);
});

test("P16B.9 missing jobId remains compatible", () => {
    assertListing(/data\.jobId === undefined \|\| data\.jobId === snapshot\.id/);
});

test("P16B.10 mismatched companyId is excluded", () => {
    assertListing(/data\.companyId === undefined \|\| data\.companyId === context\.companyId/);
});

test("P16B.11 mismatched jobId is excluded", () => {
    assertListing(/data\.jobId === undefined \|\| data\.jobId === snapshot\.id/);
});

test("P16B.12 compatibility query results are deduplicated by ID", () => {
    assertListing(/const documents = new Map<string, FirebaseFirestore\.QueryDocumentSnapshot>\(\)/);
    assertListing(/documents\.set\(doc\.id, doc\)/);
});

test("P16B.13 merged sessions are sorted newest first", () => {
    assertListing(/\.sort\(\(a, b\) => b\.effectiveAt - a\.effectiveAt/);
});

test("P16B.14 equal timestamps use ascending document IDs", () => {
    assertListing(/a\.doc\.id\.localeCompare\(b\.doc\.id\)/);
});

test("P16B.15 final session result is bounded to 50", () => {
    assertListing(/\.slice\(0, 50\)/);
});

test("P16B.16 each candidate query remains bounded", () => {
    const matches = listing().match(/\.limit\(50\)/g) || [];
    assert.equal(matches.length, 2);
});

test("P16B.17 browser session DTO remains allowlisted", () => {
    assert.match(dto(), /id,/);
    assert.match(dto(), /initialQuestion:/);
    assert.match(dto(), /state:/);
    assert.match(dto(), /responseStatus:/);
    assert.match(dto(), /createdAt:/);
});

test("P16B.18 updatedAt remains absent from the browser DTO", () => {
    assert.doesNotMatch(dto(), /updatedAt/);
});

test("P16B.19 raw stored fields are not spread into the DTO", () => {
    assert.doesNotMatch(dto(), /\.\.\.(value|data)/);
});

test("P16B.20 authorized job lookup remains before session retrieval", () => {
    assertListing(/const \{ snapshot \} = await authorisedJob\(context, jobId\)/);
    assertListing(/authorisedJob\(context, jobId\)[\s\S]*sessionRoot/);
});

test("P16B.21 listing performs no Firestore write", () => {
    assert.doesNotMatch(listing(), /\.create\(|\.update\(|\.delete\(|runTransaction|batch\./);
});

test("P16B.22 listing performs no provider execution", () => {
    assert.doesNotMatch(listing(), /OpenAI|provider|generateContent|runHostedReasoning/);
});

test("P16B.23 listing performs no reasoning execution", () => {
    assert.doesNotMatch(listing(), /reasonAboutIQ200Session|reasoningService|configuredReasoningProvider/);
});

test("P16B.24 Phase 15B idempotent creation remains present", () => {
    assert.match(service(), /SESSION_CREATE_IDEMPOTENCY_KEY/);
    assert.match(service(), /transaction\.create\(bindingRef/);
});

test("P16B.25 Phase 13D explicit session selection remains present", () => {
    assert.match(service(), /validateSessionId\(sessionId\)/);
    assert.match(service(), /iq200_sessions"\)\.doc\(sessionId\)/);
});

test("P16B.26 Phase 13D-2 assessment retrieval remains bounded and newest-first", () => {
    assert.match(service(), /where\("success", "==", true\)/);
    assert.match(service(), /orderBy\("createdAt", "desc"\)/);
    assert.match(service(), /IQ200_ASSESSMENT_CANDIDATE_LIMIT/);
});
