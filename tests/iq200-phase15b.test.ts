import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createIQ200SessionIdempotencyKey } from "../src/lib/iq200/client.ts";

const source = (path: string) => readFileSync(path, "utf8");
const service = () => source("src/lib/iq200/service.ts");
const route = () => source("src/app/api/iq200/jobs/[jobId]/sessions/route.ts");
const client = () => source("src/lib/iq200/client.ts");
const page = () => source("src/app/jobs/[id]/iq200/page.tsx");
const rules = () => source("firestore.rules");

test("P15B.1 first keyed request creates one random public session and binding", () => {
  const value = service();
  assert.match(value, /const sessionRoot = snapshot\.ref\.collection\("iq200_sessions"\)/);
  assert.match(value, /const bindingRef = sessionRoot\.doc\(SESSION_IDEMPOTENCY_PARENT\)\.collection\("bindings"\)\.doc\(idempotencyKey\)/);
  assert.match(value, /const sessionRef = sessionRoot\.doc\(\)/);
  assert.match(value, /transaction\.create\(sessionRef, session\)/);
  assert.match(value, /transaction\.create\(bindingRef/);
});

test("P15B.2 replay returns the existing session without creating another", () => {
  const value = service();
  assert.match(value, /if \(bindingSnapshot\.exists\)/);
  assert.match(value, /return \{ created: false, session: sessionEntry\(sessionId, session\) \}/);
  const replay = value.slice(value.indexOf("if (bindingSnapshot.exists)"), value.indexOf("const sessionRef = sessionRoot.doc();"));
  assert.doesNotMatch(replay, /transaction\.create/);
});

test("P15B.3 first and replay responses preserve the minimal session DTO", () => {
  const value = service();
  assert.match(value, /return \{ created: true, session: \{ id: ref\.id, initialQuestion: question, state: "CONTEXT_READY", responseStatus: "AI_NOT_ENABLED" \} \}/);
  assert.match(value, /return \{ created: true, session: \{ id: sessionRef\.id, initialQuestion: question, state: "CONTEXT_READY", responseStatus: "AI_NOT_ENABLED" \} \}/);
  assert.match(value, /return \{ created: false, session: sessionEntry\(sessionId, session\) \}/);
});

test("P15B.4 simultaneous same-key requests are serialized by one transaction", () => {
  const value = service();
  assert.match(value, /return adminDb\.runTransaction\(async \(transaction\) =>/);
  assert.match(value, /const bindingSnapshot = await transaction\.get\(bindingRef\)/);
  assert.ok(value.indexOf("transaction.create(bindingRef") > value.indexOf("transaction.get(bindingRef)"));
  assert.doesNotMatch(value, /bindingRef\.get\(\)[\s\S]*?sessionRef\.create/);
});

test("P15B.5 a fresh key creates a legitimate second session", () => {
  const value = service();
  assert.match(value, /\.doc\(idempotencyKey\)/);
  assert.match(value, /const sessionRef = sessionRoot\.doc\(\)/);
  assert.match(value, /idempotencyKey, question, sessionId: sessionRef\.id/);
});

test("P15B.6 identical questions remain independent when the key changes", () => {
  const value = page();
  assert.match(value, /existingCreate\?\.question === submitted/);
  assert.match(value, /createIQ200SessionIdempotencyKey\(\)/);
  assert.match(value, /sessionCreateKeyRef\.current = \{ question: submitted, key: createKey \}/);
});

test("P15B.7 the scoped binding cannot cross-bind another job", () => {
  const value = service();
  assert.match(value, /binding\.jobId !== snapshot\.id/);
  assert.match(value, /session\.jobId !== snapshot\.id/);
  assert.match(value, /companies\/\$\{context\.companyId\}\/jobs\/\$\{jobId\}/);
});

test("P15B.8 the scoped binding cannot cross-bind another company", () => {
  const value = service();
  assert.match(value, /binding\.companyId !== context\.companyId/);
  assert.match(value, /session\.companyId !== context\.companyId/);
  assert.match(value, /authorisedJob\(context, jobId\)/);
});

test("P15B.9 the scoped binding cannot cross-bind another authenticated user", () => {
  const value = service();
  assert.match(value, /binding\.userId !== context\.uid/);
  assert.match(value, /session\.createdBy !== context\.uid/);
  assert.match(value, /userId: context\.uid/);
});

test("P15B.10 malformed keyed requests fail safely", () => {
  const value = service();
  assert.match(value, /hasIdempotencyKey = Object\.prototype\.hasOwnProperty\.call\(body, "idempotencyKey"\)/);
  assert.match(value, /const idempotencyKey = typeof body\.idempotencyKey === "string"/);
  assert.match(value, /SESSION_CREATE_IDEMPOTENCY_KEY\.test\(idempotencyKey\)/);
  assert.match(value, /The session idempotency key is invalid\./);
});

test("P15B.11 missing keys retain the approved legacy non-idempotent behavior", () => {
  const value = service();
  const legacy = value.slice(value.indexOf("if (!hasIdempotencyKey)"), value.indexOf("if (!SESSION_CREATE_IDEMPOTENCY_KEY"));
  assert.match(legacy, /const ref = snapshot\.ref\.collection\("iq200_sessions"\)\.doc\(\)/);
  assert.match(legacy, /await ref\.create\(/);
  assert.doesNotMatch(legacy, /runTransaction|bindingRef/);
});

test("P15B.12 corrupt or mismatched bindings fail closed", () => {
  const value = service();
  assert.match(value, /The session idempotency binding is invalid\./);
  assert.match(value, /throw new ServerAccessError\("CONFLICT"/);
  assert.match(value, /binding\.idempotencyKey !== idempotencyKey/);
  assert.match(value, /binding\.question !== question/);
});

test("P15B.13 a missing bound session fails closed", () => {
  const value = service();
  assert.match(value, /if \(!sessionSnapshot\.exists \|\| session\.companyId !== context\.companyId/);
  assert.match(value, /session\.sessionId !== sessionId/);
  assert.match(value, /throw new ServerAccessError\("CONFLICT", "The session idempotency binding is invalid\./);
});

test("P15B.14 session creation keeps authentication and IQ200 permission enforcement", () => {
  assert.match(route(), /authenticateServerRequest\(request\)/);
  assert.match(service(), /authorisedJob\(context, jobId\)/);
  assert.match(service(), /requireIQ200Access\(context\)/);
});

test("P15B.15 session creation has no reasoning or provider call", () => {
  const value = service();
  const create = value.slice(value.indexOf("export async function createIQ200Session"), value.indexOf("/* ═"));
  assert.doesNotMatch(create, /reasonAboutIQ200Session|configuredReasoningProvider|runHostedReasoning|provider\(/);
  assert.doesNotMatch(route(), /reasonAboutIQ200Session|runHostedReasoning|OpenAI|openai/);
});

test("P15B.16 route returns 201 for create and 200 for replay without a replay DTO field", () => {
  const value = route();
  assert.match(value, /status: result\.created \? 201 : 200/);
  assert.match(value, /Response\.json\(\{ session: result\.session \}/);
  assert.doesNotMatch(value, /replayed|idempotencyKey/);
});

test("P15B.17 browser session storage remains denied by existing rules", () => {
  assert.match(rules(), /match \/iq200_sessions\/\{sessionId\}\/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(service(), /SESSION_IDEMPOTENCY_PARENT = "__idempotency__"/);
});

test("P15B.18 client keys are cryptographically random opaque UUIDs", () => {
  assert.match(client(), /return crypto\.randomUUID\(\)/);
  const first = createIQ200SessionIdempotencyKey();
  const second = createIQ200SessionIdempotencyKey();
  assert.match(first, /^[A-Za-z0-9_-]{16,128}$/);
  assert.match(second, /^[A-Za-z0-9_-]{16,128}$/);
  assert.notEqual(first, second);
});

test("P15B.19 client reuses a key only for the same unresolved question", () => {
  const value = page();
  assert.match(value, /existingCreate\?\.question === submitted\s*\?\s*existingCreate\.key\s*:\s*createIQ200SessionIdempotencyKey\(\)/);
  assert.match(value, /if \(sessionCreateKeyRef\.current\?\.key === createKey\) sessionCreateKeyRef\.current = null/);
  assert.match(value, /body: JSON\.stringify\(\{ question: submitted, idempotencyKey: createKey \}\)/);
});

test("P15B.20 client cleanup clears unresolved create identity and preserves existing guards", () => {
  const value = page();
  assert.match(value, /sessionCreateKeyRef\.current = null/);
  assert.match(value, /tryAcquireSubmissionGuard\(guard\)/);
  assert.match(value, /submissionAbortRef\.current\?\.abort\(\)/);
  assert.match(value, /isCurrentJob\(\)/);
});
