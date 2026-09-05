import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canUseIQ200, IQ200_PERMISSION } from "../src/lib/iq200/permissions.ts";
import { authenticateRequestWith, readBearerToken, selectActiveMembership, ServerAccessError } from "../src/lib/serverAuthCore.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("IQ200 permission uses the existing role architecture", () => {
  assert.equal(IQ200_PERMISSION, "Use IQ200 Technician Assist");
  assert.equal(canUseIQ200({ primaryRole: "Technician/Artisan/Tradesman" }), true);
  assert.equal(canUseIQ200({ primaryRole: "Technician/Artisan/Tradesman", permissions: { [IQ200_PERMISSION]: false } }), false);
  assert.equal(canUseIQ200({ primaryRole: "Technician/Artisan/Tradesman", permissions: { "View jobs": false } }), false);
  assert.equal(canUseIQ200({ primaryRole: "Other", permissions: { "View jobs": true } }), false);
  assert.equal(canUseIQ200({ primaryRole: "Other", permissions: { "View jobs": true, [IQ200_PERMISSION]: true } }), true);
});

test("authentication rejects absent, malformed, and expired credentials", async () => {
  assert.throws(() => readBearerToken(new Request("http://localhost")), (error: unknown) => error instanceof ServerAccessError && error.status === 401);
  assert.throws(() => readBearerToken(new Request("http://localhost", { headers: { authorization: "Basic forged" } })), (error: unknown) => error instanceof ServerAccessError && error.status === 401);
  for (const token of ["malformed", "expired"]) {
    await assert.rejects(
      authenticateRequestWith(
        new Request("http://localhost", { headers: { authorization: `Bearer ${token}` } }),
        async () => { throw new Error("Firebase token rejected"); },
        async () => ({ uid: "must-not-resolve" }),
      ),
      (error: unknown) => error instanceof ServerAccessError && error.code === "AUTH_REQUIRED" && error.status === 401,
    );
  }
});

test("inactive and ambiguous memberships are rejected and claims cannot select another company", () => {
  assert.throws(() => selectActiveMembership([{ companyId: "company-a", active: false }]), (error: unknown) => error instanceof ServerAccessError && error.status === 403);
  assert.throws(() => selectActiveMembership([{ companyId: "company-a", active: true }, { companyId: "company-b", active: true }]), (error: unknown) => error instanceof ServerAccessError && error.status === 403);
  assert.throws(() => selectActiveMembership([{ companyId: "company-a", active: true }], "company-b"), (error: unknown) => error instanceof ServerAccessError && error.status === 403);
  assert.equal(selectActiveMembership([{ companyId: "company-a", active: true }], "company-a").companyId, "company-a");
});

test("job entry point is permission controlled", () => {
  const page = source("src/app/jobs/[id]/page.tsx");
  assert.match(page, /resolvedPermissions\["View jobs"\]/);
  assert.match(page, /resolvedPermissions\["Use IQ200 Technician Assist"\]/);
  assert.match(page, /canUseIQ200 && <Link/);
  assert.match(page, /ASK IQ200/);
});

test("context and session APIs authenticate every direct request", () => {
  for (const path of ["src/app/api/iq200/jobs/[jobId]/context/route.ts", "src/app/api/iq200/jobs/[jobId]/sessions/route.ts"]) {
    assert.match(source(path), /authenticateServerRequest/);
    assert.match(source(path), /safeServerErrorResponse/);
  }
});

test("server access rejects unauthenticated requests and ambiguous tenant membership", () => {
  const auth = source("src/lib/serverAuth.ts");
  const core = source("src/lib/serverAuthCore.ts");
  assert.match(core, /authorization\.startsWith\("Bearer "\)/);
  assert.match(auth, /verifyIdToken\(token, true\)/);
  assert.match(core, /active\.length > 1/);
  assert.match(core, /companyId === claimedCompanyId/);
});

test("job context and sessions are always rooted in the authenticated company", () => {
  const service = source("src/lib/iq200/service.ts");
  assert.match(service, /companies\/\$\{context\.companyId\}\/jobs\/\$\{jobId\}/);
  assert.doesNotMatch(service, /body\.companyId|input\.companyId|request\.companyId/);
  assert.match(service, /snapshot\.data\(\)\?\.companyId.*context\.companyId/);
  assert.match(service, /throw new ServerAccessError\("NOT_FOUND"/);
});

test("session audit fields bind company job and creator", () => {
  const service = source("src/lib/iq200/service.ts");
  for (const field of ["companyId: context.companyId", "jobId: snapshot.id", "sessionId: ref.id", "createdBy: context.uid", "createdAt: FieldValue.serverTimestamp()", "updatedAt: FieldValue.serverTimestamp()"]) assert.ok(service.includes(field), field);
  assert.match(service, /collection\("iq200_sessions"\)/);
});

test("session APIs return only UI-required fields and retain audit fields server-side", () => {
  const service = source("src/lib/iq200/service.ts");
  const serializer = service.slice(service.indexOf("function sessionEntry"), service.indexOf("function validateJobId"));
  assert.doesNotMatch(serializer, /companyId|jobId|createdBy|openedBy/);
  assert.match(service, /companyId: context\.companyId/);
  assert.match(service, /createdBy: context\.uid/);
});

test("browser access to IQ200 sessions is denied by Firestore rules", () => {
  const rules = source("firestore.rules");
  assert.match(rules, /match \/iq200_sessions\/\{sessionId\}\/\{document=\*\*\}[\s\S]*allow read, write: if false/);
  assert.match(rules, /jobCollection != 'iq200_sessions'/);
  assert.match(rules, /collectionId != 'jobs'/);
});

test("Phase 1 uses a controlled placeholder and does not fabricate diagnosis", () => {
  const page = source("src/app/jobs/[id]/iq200/page.tsx");
  const service = source("src/lib/iq200/service.ts");
  assert.match(page, /AI diagnosis is not enabled in Phase 1/);
  assert.match(service, /responseStatus: "AI_NOT_ENABLED"/);
  assert.doesNotMatch(service, /openai|gemini|generateContent|chatCompletion/i);
});

test("IQ200 conversations remain separate from job notes", () => {
  const service = source("src/lib/iq200/service.ts");
  assert.match(service, /collection\("iq200_sessions"\)/);
  assert.doesNotMatch(service, /collection\("notes"\)\.doc|collection\("notes"\)\.add/);
});

test("IQ200 code does not depend on WhatsApp implementation", () => {
  const iq200 = source("src/lib/iq200/service.ts") + source("src/lib/iq200/permissions.ts") + source("src/app/jobs/[id]/iq200/page.tsx");
  assert.doesNotMatch(iq200, /lib\/whatsapp|api\/whatsapp|WhatsApp/);
});
