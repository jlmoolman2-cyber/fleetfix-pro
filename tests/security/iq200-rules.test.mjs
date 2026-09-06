import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-fleetfix",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "companies/company-a/users/user-a"), { active: true, primaryRole: "Technician/Artisan/Tradesman", permissions: { "View jobs": true, "Use IQ200 Technician Assist": true } });
    await setDoc(doc(db, "companies/company-a/users/admin-a"), { active: true, primaryRole: "Administrator" });
    await setDoc(doc(db, "companies/company-a/users/owner-a"), { active: true, primaryRole: "Business Owner" });
    await setDoc(doc(db, "companies/company-a/users/permissions-a"), { active: true, primaryRole: "Other", permissions: { "View IQ200 Known Fixes": true, "Manage IQ200 Known Fixes": true, "Approve IQ200 Known Fixes": true } });
    await setDoc(doc(db, "companies/company-a/users/iq200-a"), { active: true, primaryRole: "Other", permissions: { "View jobs": true, "Use IQ200 Technician Assist": true } });
    await setDoc(doc(db, "companies/company-a/jobs/job-a"), { companyId: "company-a", jobNumber: "NJ0001" });
    await setDoc(doc(db, "companies/company-a/jobs/job-a/iq200_sessions/session-a"), { companyId: "company-a", jobId: "job-a", createdBy: "user-a" });
    await setDoc(doc(db, "companies/company-a/jobs/job-a/iq200_sessions/session-a/interactions/interaction-a"), { companyId: "company-a", jobId: "job-a", sessionId: "session-a", requestedBy: "user-a" });
    await setDoc(doc(db, "companies/company-a/jobs/job-a/iq200_sessions/session-a/hosted_controls/lease"), { companyId: "company-a", state: "ACTIVE" });
    await setDoc(doc(db, "companies/company-a/iq200_known_fixes/fix-a"), { companyId: "company-a", status: "APPROVED", active: true });
    await setDoc(doc(db, "companies/company-a/iq200_hosted_controls/company_1"), { companyId: "company-a", count: 1 });
    await setDoc(doc(db, "companies/company-b/users/user-b"), { active: true, primaryRole: "Technician/Artisan/Tradesman" });
    await setDoc(doc(db, "companies/company-b/jobs/job-b"), { companyId: "company-b", jobNumber: "NJ0002" });
    await setDoc(doc(db, "companies/company-b/jobs/job-b/iq200_sessions/session-b"), { companyId: "company-b", jobId: "job-b", createdBy: "user-b" });
    await setDoc(doc(db, "companies/company-b/jobs/job-b/iq200_sessions/session-b/interactions/interaction-b"), { companyId: "company-b", jobId: "job-b", sessionId: "session-b", requestedBy: "user-b" });
  });
});

async function assertAllKnownFixOperationsFail(db, companyId = "company-a") {
  const existing=doc(db,`companies/${companyId}/iq200_known_fixes/fix-a`);
  await assertFails(getDoc(existing));
  await assertFails(getDocs(collection(db,`companies/${companyId}/iq200_known_fixes`)));
  await assertFails(setDoc(doc(db,`companies/${companyId}/iq200_known_fixes/new`),{status:"APPROVED"}));
  await assertFails(updateDoc(existing,{title:"tampered"}));
  await assertFails(deleteDoc(existing));
}

test("Known Fix records remain server-only for every browser identity and operation", async () => {
  await assertAllKnownFixOperationsFail(environment.unauthenticatedContext().firestore());
  for (const uid of ["user-a", "admin-a", "owner-a", "permissions-a", "iq200-a"]) {
    await assertAllKnownFixOperationsFail(environment.authenticatedContext(uid).firestore());
  }
});

test("Known Fix parent wildcard cannot expose another company", async () => {
  await assertAllKnownFixOperationsFail(environment.authenticatedContext("user-a").firestore(), "company-b");
});

after(async () => environment?.cleanup());

test("authorised job user retains normal job access but cannot bypass IQ200 APIs through Firestore", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertSucceeds(getDoc(doc(db, "companies/company-a/jobs/job-a")));
  await assertAllSessionOperationsFail(db);
});

async function assertAllSessionOperationsFail(db) {
  const existing = doc(db, "companies/company-a/jobs/job-a/iq200_sessions/session-a");
  await assertFails(getDoc(existing));
  await assertFails(getDocs(collection(db, "companies/company-a/jobs/job-a/iq200_sessions")));
  await assertFails(setDoc(doc(db, "companies/company-a/jobs/job-a/iq200_sessions/new-session"), { companyId: "company-a" }));
  await assertFails(updateDoc(existing, { state: "tampered" }));
  await assertFails(deleteDoc(existing));
}

test("administrator and business owner browser clients remain denied", async () => {
  await assertAllSessionOperationsFail(environment.authenticatedContext("admin-a").firestore());
  await assertAllSessionOperationsFail(environment.authenticatedContext("owner-a").firestore());
});

test("reasoning interaction records remain server-only for every identity and operation", async () => {
  const interactionsPath = "companies/company-a/jobs/job-a/iq200_sessions/session-a/interactions";
  for (const uid of ["user-a", "admin-a", "owner-a", "iq200-a"]) {
    const db = environment.authenticatedContext(uid).firestore();
    const existing = doc(db, `${interactionsPath}/interaction-a`);
    await assertFails(getDoc(existing));
    await assertFails(getDocs(collection(db, interactionsPath)));
    await assertFails(setDoc(doc(db, `${interactionsPath}/forged`), { success: true, response: { summary: "tampered" } }));
    await assertFails(updateDoc(existing, { response: { summary: "tampered" } }));
    await assertFails(deleteDoc(existing));
  }
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), `${interactionsPath}/interaction-a`)));
});

test("interaction records cannot be read from another company", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  const foreign = doc(db, "companies/company-b/jobs/job-b/iq200_sessions/session-b/interactions/interaction-b");
  await assertFails(getDoc(foreign));
  await assertFails(getDocs(collection(db, "companies/company-b/jobs/job-b/iq200_sessions/session-b/interactions")));
});

async function assertAllHostedControlOperationsFail(db, companyId="company-a") {
  const path=`companies/${companyId}/iq200_hosted_controls`,existing=doc(db,`${path}/company_1`);
  await assertFails(getDoc(existing));
  await assertFails(getDocs(collection(db,path)));
  await assertFails(setDoc(doc(db,`${path}/forged`),{count:0}));
  await assertFails(updateDoc(existing,{count:0}));
  await assertFails(deleteDoc(existing));
}

test("hosted rate idempotency and audit controls remain server-only",async()=>{
  await assertAllHostedControlOperationsFail(environment.unauthenticatedContext().firestore());
  for(const uid of ["user-a","admin-a","owner-a","iq200-a"])await assertAllHostedControlOperationsFail(environment.authenticatedContext(uid).firestore());
  await assertAllHostedControlOperationsFail(environment.authenticatedContext("user-a").firestore(),"company-b");
});

test("hosted session leases remain server-only for every browser operation",async()=>{
  const path="companies/company-a/jobs/job-a/iq200_sessions/session-a/hosted_controls",existingPath=`${path}/lease`;
  for(const db of [environment.unauthenticatedContext().firestore(),...(["user-a","admin-a","owner-a","iq200-a"].map(uid=>environment.authenticatedContext(uid).firestore()))]){
    await assertFails(getDoc(doc(db,existingPath)));
    await assertFails(getDocs(collection(db,path)));
    await assertFails(setDoc(doc(db,`${path}/forged`),{state:"ACTIVE"}));
    await assertFails(updateDoc(doc(db,existingPath),{state:"SUCCEEDED"}));
    await assertFails(deleteDoc(doc(db,existingPath)));
  }
});

test("a company member cannot read or enumerate another company's IQ200 sessions", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(getDoc(doc(db, "companies/company-b/jobs/job-b/iq200_sessions/session-b")));
  await assertFails(getDocs(collection(db, "companies/company-b/jobs/job-b/iq200_sessions")));
});

test("unauthenticated browser cannot retrieve job or IQ200 session data", async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "companies/company-a/jobs/job-a")));
  await assertFails(getDoc(doc(db, "companies/company-a/jobs/job-a/iq200_sessions/session-a")));
});
