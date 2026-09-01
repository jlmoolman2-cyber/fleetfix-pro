import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-fleetfix",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "companies/company-a/users/admin-a"), {
        active: true,
        primaryRole: "Administrator",
        permissions: { "Manage job settings": true, "Manage user permissions": true },
      }),
      setDoc(doc(db, "companies/company-a/users/user-a"), {
        active: true,
        primaryRole: "Technician/Artisan/Tradesman",
        permissions: { "View jobs": true, "Edit jobs": true },
      }),
      setDoc(doc(db, "companies/company-b/users/user-b"), {
        active: true,
        primaryRole: "Technician/Artisan/Tradesman",
        permissions: { "View jobs": true },
      }),
      setDoc(doc(db, "companies/company-a/jobs/job-1"), { jobNumber: "JOB-1", status: "Open" }),
      setDoc(doc(db, "companies/company-b/jobs/job-2"), { jobNumber: "JOB-2", status: "Open" }),
      setDoc(doc(db, "companies/company-a/statuses/open"), { name: "Open", active: true }),
      setDoc(doc(db, "companies/company-a/whatsappSettings/config"), { enabled: true, phoneNumberId: "phone-a" }),
      setDoc(doc(db, "companies/company-b/whatsappSettings/config"), { enabled: true, phoneNumberId: "phone-b" }),
      setDoc(doc(db, "companies/company-a/whatsappConversations/conversation-a"), { companyId: "company-a", phoneNumberWaId: "27111111111" }),
      setDoc(doc(db, "companies/company-b/whatsappConversations/conversation-b"), { companyId: "company-b", phoneNumberWaId: "27222222222" }),
      setDoc(doc(db, "companies/company-a/whatsappMessages/message-a"), { companyId: "company-a", conversationId: "conversation-a" }),
      setDoc(doc(db, "companies/company-b/whatsappMessages/message-b"), { companyId: "company-b", conversationId: "conversation-b" }),
    ]);
    await uploadBytes(
      ref(context.storage(), "companies/company-a/jobs/job-1/attachments/existing.txt"),
      new TextEncoder().encode("existing"),
      { contentType: "text/plain" },
    );
  });
});

after(async () => {
  await environment.cleanup();
});

test("unauthenticated Firestore access is denied", async () => {
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "companies/company-a/jobs/job-1")));
});

test("active company member can read and write operational company records", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertSucceeds(getDoc(doc(db, "companies/company-a/jobs/job-1")));
  await assertSucceeds(setDoc(doc(db, "companies/company-a/jobs/job-3"), { jobNumber: "JOB-3", status: "Open" }));
  await assertSucceeds(setDoc(doc(db, "companies/company-a/jobs/job-1/notes/note-1"), { text: "Checked battery", createdAt: serverTimestamp() }));
});

test("company A member cannot access company B", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(getDoc(doc(db, "companies/company-b/jobs/job-2")));
  await assertFails(setDoc(doc(db, "companies/company-b/jobs/job-4"), { jobNumber: "JOB-4" }));
});

test("normal user cannot change another user's permissions", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(updateDoc(doc(db, "companies/company-a/users/admin-a"), {
    permissions: { "Manage user permissions": false },
  }));
});

test("normal user cannot promote their own role or permissions", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(updateDoc(doc(db, "companies/company-a/users/user-a"), {
    primaryRole: "Administrator",
    permissions: { "Manage user permissions": true },
  }));
});

test("normal user cannot write sensitive administrative configuration", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertSucceeds(getDoc(doc(db, "companies/company-a/statuses/open")));
  await assertFails(setDoc(doc(db, "companies/company-a/statuses/closed"), { name: "Closed" }));
});

test("administrator can manage users and job configuration", async () => {
  const db = environment.authenticatedContext("admin-a").firestore();
  await assertSucceeds(setDoc(doc(db, "companies/company-a/statuses/closed"), { name: "Closed", active: true }));
  await assertSucceeds(updateDoc(doc(db, "companies/company-a/users/user-a"), {
    permissions: { "View jobs": true, "Edit jobs": false },
  }));
});

test("browser writes to protected WhatsApp collections are denied for users and administrators", async () => {
  const protectedCollections = [
    "whatsappMessages",
    "whatsappConversations",
    "whatsappWebhookEvents",
    "whatsappSendRequests",
    "whatsappAuditLog",
    "whatsappDeliveryStatuses",
    "whatsappRateLimits",
    "whatsappSettings",
  ];
  for (const uid of ["user-a", "admin-a"]) {
    const db = environment.authenticatedContext(uid).firestore();
    for (const collectionName of protectedCollections) {
      await assertFails(setDoc(doc(db, `companies/company-a/${collectionName}/test`), { value: "blocked" }));
    }
  }
});

test("WhatsApp records and phone-number settings are isolated between companies", async () => {
  const companyAUser = environment.authenticatedContext("user-a").firestore();
  const companyAAdmin = environment.authenticatedContext("admin-a").firestore();
  await assertFails(getDoc(doc(companyAUser, "companies/company-b/whatsappConversations/conversation-b")));
  await assertFails(getDoc(doc(companyAUser, "companies/company-b/whatsappMessages/message-b")));
  await assertFails(getDoc(doc(companyAAdmin, "companies/company-b/whatsappSettings/config")));
  await assertSucceeds(getDoc(doc(companyAAdmin, "companies/company-a/whatsappSettings/config")));
});

test("Admin SDK-equivalent rules-disabled context can write protected WhatsApp collections", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await assertSucceeds(setDoc(
      doc(context.firestore(), "companies/company-a/whatsappWebhookEvents/event-1"),
      { state: "received", createdAt: serverTimestamp() },
    ));
  });
});

test("unauthenticated Storage access is denied", async () => {
  await assertFails(getBytes(ref(
    environment.unauthenticatedContext().storage(),
    "companies/company-a/jobs/job-1/attachments/existing.txt",
  )));
  const objectRef = ref(environment.unauthenticatedContext().storage(), "companies/company-a/jobs/job-1/attachments/test.txt");
  await assertFails(uploadBytes(objectRef, new TextEncoder().encode("blocked"), { contentType: "text/plain" }));
});

test("company member can use company Storage and other-company member cannot", async () => {
  const path = "companies/company-a/jobs/job-1/attachments/test.txt";
  const memberRef = ref(environment.authenticatedContext("user-a").storage(), path);
  await assertSucceeds(uploadBytes(memberRef, new TextEncoder().encode("allowed"), { contentType: "text/plain" }));
  await assertSucceeds(getBytes(memberRef));
  await assertFails(getBytes(ref(environment.authenticatedContext("user-b").storage(), path)));
});
