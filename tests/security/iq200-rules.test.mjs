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
    await setDoc(doc(db, "companies/company-a/jobs/job-a"), { companyId: "company-a", jobNumber: "NJ0001" });
    await setDoc(doc(db, "companies/company-a/jobs/job-a/iq200_sessions/session-a"), { companyId: "company-a", jobId: "job-a", createdBy: "user-a" });
    await setDoc(doc(db, "companies/company-b/users/user-b"), { active: true, primaryRole: "Technician/Artisan/Tradesman" });
    await setDoc(doc(db, "companies/company-b/jobs/job-b"), { companyId: "company-b", jobNumber: "NJ0002" });
    await setDoc(doc(db, "companies/company-b/jobs/job-b/iq200_sessions/session-b"), { companyId: "company-b", jobId: "job-b", createdBy: "user-b" });
  });
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
