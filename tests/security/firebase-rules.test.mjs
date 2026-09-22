import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
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
      setDoc(doc(db, "companies/company-a/communicationTemplates/template-a"), { companyId: "company-a", channel: "email" }),
      setDoc(doc(db, "companies/company-b/communicationTemplates/template-b"), { companyId: "company-b", channel: "whatsapp" }),
      setDoc(doc(db, "companies/company-a/communicationRulePlans/rule-a"), { companyId: "company-a", channel: "email" }),
      setDoc(doc(db, "companies/company-b/communicationRulePlans/rule-b"), { companyId: "company-b", channel: "whatsapp" }),
      setDoc(doc(db, "companies/company-a/communicationExecutions/execution-a"), { companyId: "company-a", channel: "email", status: "READY" }),
      setDoc(doc(db, "companies/company-b/communicationExecutions/execution-b"), { companyId: "company-b", channel: "whatsapp", status: "READY" }),
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

test("status rules preserve custom management and reject client canonical assignment", async () => {
  const db = environment.authenticatedContext("admin-a").firestore();
  const custom = doc(db, "companies/company-a/statuses/custom");
  await assertSucceeds(setDoc(custom, { name: "Awaiting Parts", active: false }));
  await assertSucceeds(updateDoc(custom, { active: true, startTimer: true }));
  await assertFails(setDoc(doc(db, "companies/company-a/statuses/canonical"), {
    name: "Job Complete",
    systemKey: "job_complete",
  }));
  await assertFails(updateDoc(custom, { systemKey: "job_booked" }));
  await assertSucceeds(deleteDoc(custom));
});

test("unauthorized and cross-company users cannot mutate statuses", async () => {
  const normalDb = environment.authenticatedContext("user-a").firestore();
  const otherDb = environment.authenticatedContext("user-b").firestore();
  await assertFails(setDoc(doc(normalDb, "companies/company-a/statuses/custom-2"), { name: "Custom" }));
  await assertFails(updateDoc(doc(otherDb, "companies/company-a/statuses/open"), { active: false }));
});

test("canonical and invalid status metadata fail closed for browser mutation", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "companies/company-a/statuses/booked"), {
      name: "Job Booked",
      systemKey: "job_booked",
      active: true,
    });
    await setDoc(doc(db, "companies/company-a/statuses/invalid"), {
      name: "Invalid",
      systemKey: "unsupported",
      active: true,
    });
  });
  const db = environment.authenticatedContext("admin-a").firestore();
  const canonical = doc(db, "companies/company-a/statuses/booked");
  const invalid = doc(db, "companies/company-a/statuses/invalid");
  await assertSucceeds(updateDoc(canonical, { name: "Booked", active: false }));
  await assertFails(updateDoc(canonical, { systemKey: "onroute" }));
  await assertFails(updateDoc(canonical, { systemKey: null }));
  await assertFails(deleteDoc(canonical));
  await assertFails(updateDoc(invalid, { name: "Repair attempt" }));
  await assertFails(updateDoc(invalid, { systemKey: "job_booked" }));
  await assertFails(deleteDoc(invalid));
});

test("unrelated administrative permissions remain unchanged", async () => {
  const db = environment.authenticatedContext("admin-a").firestore();
  await assertSucceeds(setDoc(doc(db, "companies/company-a/jobTypes/repair"), { name: "Repair" }));
  await assertFails(setDoc(doc(environment.authenticatedContext("user-a").firestore(), "companies/company-a/jobTypes/repair-2"), { name: "Repair" }));
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

test("communication templates remain server-only and company-isolated", async () => {
  for (const uid of ["user-a", "admin-a"]) {
    const db = environment.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, "companies/company-a/communicationTemplates/template-a")));
    await assertFails(setDoc(doc(db, "companies/company-a/communicationTemplates/new-template"), {
      companyId: "company-a",
      channel: "email",
    }));
    await assertFails(getDoc(doc(db, "companies/company-b/communicationTemplates/template-b")));
  }
});

test("communication rule plans remain server-only and company-isolated", async () => {
  for (const uid of ["user-a", "admin-a"]) {
    const db = environment.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, "companies/company-a/communicationRulePlans/rule-a")));
    await assertFails(setDoc(doc(db, "companies/company-a/communicationRulePlans/new-rule"), { companyId: "company-a", channel: "email" }));
    await assertFails(getDoc(doc(db, "companies/company-b/communicationRulePlans/rule-b")));
  }
});

test("communication executions remain server-only and company-isolated", async () => {
  for (const uid of ["user-a", "admin-a"]) {
    const db = environment.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, "companies/company-a/communicationExecutions/execution-a")));
    await assertFails(setDoc(doc(db, "companies/company-a/communicationExecutions/new-execution"), { companyId: "company-a", status: "SENT" }));
    await assertFails(updateDoc(doc(db, "companies/company-a/communicationExecutions/execution-a"), { status: "SENT" }));
    await assertFails(getDoc(doc(db, "companies/company-b/communicationExecutions/execution-b")));
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

// ── IQ200 Knowledge Storage boundary (Phase 24D-2A) ──────────────────────

test("IQ200 knowledge Storage path is denied to company members and admin", async () => {
  const iq200Path = "companies/company-a/iq200/documents/doc-1/original/source.pdf";
  for (const uid of ["user-a", "admin-a"]) {
    const storage = environment.authenticatedContext(uid).storage();
    await assertFails(getBytes(ref(storage, iq200Path)));
    await assertFails(uploadBytes(ref(storage, iq200Path), new TextEncoder().encode("test"), { contentType: "application/pdf" }));
  }
});

test("IQ200 knowledge Storage create is denied on derivative paths too", async () => {
  const p = "companies/company-a/iq200/documents/doc-2/derivative/page-1.png";
  const storage = environment.authenticatedContext("user-a").storage();
  await assertFails(uploadBytes(ref(storage, p), new TextEncoder().encode("test"), { contentType: "application/octet-stream" }));
});

test("IQ200 knowledge Storage update and delete are denied to company members", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(
      ref(context.storage(), "companies/company-a/iq200/documents/doc-seeded/original/source.pdf"),
      new TextEncoder().encode("seeded-pdf"),
      { contentType: "application/pdf" },
    );
  });
  const seededPath = "companies/company-a/iq200/documents/doc-seeded/original/source.pdf";
  const memberCtx = environment.authenticatedContext("user-a");
  const adminCtx = environment.authenticatedContext("admin-a");
  await assertFails(getBytes(ref(memberCtx.storage(), seededPath)));
  await assertFails(uploadBytes(ref(memberCtx.storage(), seededPath), new TextEncoder().encode("overwritten"), { contentType: "application/pdf" }));
  await assertFails(getBytes(ref(adminCtx.storage(), seededPath)));
  await assertFails(uploadBytes(ref(adminCtx.storage(), seededPath), new TextEncoder().encode("overwritten"), { contentType: "application/pdf" }));
});

test("IQ200 knowledge Storage is denied to non-members", async () => {
  const iq200Path = "companies/company-a/iq200/documents/doc-1/original/source.pdf";
  const nonMember = environment.authenticatedContext("user-b");
  await assertFails(getBytes(ref(nonMember.storage(), iq200Path)));
  await assertFails(uploadBytes(ref(nonMember.storage(), iq200Path), new TextEncoder().encode("test"), { contentType: "application/pdf" }));
});

test("existing non-IQ200 company Storage behavior is preserved after IQ200 exclusion", async () => {
  const storage = environment.authenticatedContext("user-a").storage();
  await assertSucceeds(getBytes(ref(storage, "companies/company-a/jobs/job-1/attachments/existing.txt")));
  await assertSucceeds(uploadBytes(
    ref(storage, "companies/company-a/jobs/job-1/attachments/new-test.txt"),
    new TextEncoder().encode("new content"),
    { contentType: "text/plain" },
  ));
});

// ── IQ200 Knowledge Firestore boundary (Phase 24D-2A) ────────────────────

test("IQ200 documents collection is denied to company members and admin", async () => {
  for (const uid of ["user-a", "admin-a"]) {
    const db = environment.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, "companies/company-a/iq200_documents/doc-1")));
    await assertFails(setDoc(doc(db, "companies/company-a/iq200_documents/doc-new"), {
      title: "Test", processingStatus: "PENDING", approvalStatus: "DRAFT",
    }));
  }
});

test("IQ200 documents update and delete are denied to company members", async () => {
  await environment.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "companies/company-a/iq200_documents/doc-update"), {
      title: "Seeded", processingStatus: "PENDING", approvalStatus: "DRAFT",
    });
  });
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(updateDoc(doc(db, "companies/company-a/iq200_documents/doc-update"), { title: "Modified" }));
  await assertFails(deleteDoc(doc(db, "companies/company-a/iq200_documents/doc-update")));
});

test("IQ200 documents descendants are denied to company members", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(getDoc(doc(db, "companies/company-a/iq200_documents/doc-1/pages/page-1")));
  await assertFails(setDoc(doc(db, "companies/company-a/iq200_documents/doc-1/pages/page-1"), {
    pageIndex: 0, displayPageNumber: "1",
  }));
});

test("IQ200 documents are denied to non-members", async () => {
  const db = environment.authenticatedContext("user-b").firestore();
  await assertFails(getDoc(doc(db, "companies/company-a/iq200_documents/doc-1")));
  await assertFails(setDoc(doc(db, "companies/company-a/iq200_documents/doc-new"), { title: "Test" }));
});

test("IQ200 idempotency keys collection is denied to company members", async () => {
  for (const uid of ["user-a", "admin-a"]) {
    const db = environment.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, "companies/company-a/iq200_idempotency_keys/key-1")));
    await assertFails(setDoc(doc(db, "companies/company-a/iq200_idempotency_keys/key-new"), {
      documentId: "doc-1", createdAt: serverTimestamp(),
    }));
  }
});

test("IQ200 content hashes collection is denied to company members", async () => {
  for (const uid of ["user-a", "admin-a"]) {
    const db = environment.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, "companies/company-a/iq200_content_hashes/abc123")));
    await assertFails(setDoc(doc(db, "companies/company-a/iq200_content_hashes/abc123"), {
      documentId: "doc-1", createdAt: serverTimestamp(),
    }));
  }
});

test("existing unrelated company Firestore access is preserved after IQ200 exclusion", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertSucceeds(getDoc(doc(db, "companies/company-a/jobs/job-1")));
  await assertSucceeds(getDoc(doc(db, "companies/company-a/statuses/open")));
});
