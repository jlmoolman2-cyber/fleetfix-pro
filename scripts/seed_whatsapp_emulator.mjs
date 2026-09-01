import admin from "firebase-admin";
import { pathToFileURL } from "node:url";

/** @param {Record<string, string | undefined>} [env] */
export function assertEmulatorTarget(env = process.env) {
  if (!env.FIRESTORE_EMULATOR_HOST) throw new Error("Refusing to seed: FIRESTORE_EMULATOR_HOST is not set.");
  const projectId = env.GCLOUD_PROJECT || env.FIREBASE_CONFIG && JSON.parse(env.FIREBASE_CONFIG).projectId || "";
  if (!/^(demo-|emulator-)/.test(projectId)) throw new Error("Refusing to seed: use a demo-* or emulator-* project ID.");
  return projectId;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projectId = assertEmulatorTarget();
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const companyId = process.argv.find((value) => value.startsWith("--company="))?.split("=")[1] || "demo-whatsapp";
  const now = admin.firestore.Timestamp.now();
  const company = db.doc(`companies/${companyId}`);
  const batch = db.batch();
  batch.set(company, { name: "WhatsApp Inbox Demo", demoData: true, updatedAt: now }, { merge: true });
  batch.set(company.collection("users").doc("demo-agent"), { name: "Demo Service Advisor", active: true, permissions: { "View inbox": true, "View conversations": true, "Manage conversations": true, "Assign conversations": true, "Close conversations": true } }, { merge: true });
  batch.set(company.collection("customers").doc("demo-customer"), { companyName: "Demo Logistics", primaryContactNumber: "+27821234567", normalizedPhoneNumbers: ["+27821234567"], demoData: true }, { merge: true });
  batch.set(company.collection("jobs").doc("demo-job"), { jobNumber: "JOB-DEMO-1001", customerId: "demo-customer", vehicleRegistration: "CA 123-456", fleetNumber: "TRK-42", status: "Open", demoData: true }, { merge: true });
  const scenarios = [
    ["known-open", "+27821234567", "Demo Logistics", "demo-customer", "demo-job", "open", 2, false],
    ["unknown", "+27820000001", "", null, null, "unassigned", 1, true],
    ["needs-job", "+27820000002", "Demo Logistics", "demo-customer", null, "open", 0, true],
    ["assigned", "+27820000003", "Road Freight Demo", null, null, "open", 0, false],
    ["closed", "+27820000004", "Closed Demo", null, null, "closed", 0, false]
  ];
  for (const [id, phone, customerName, customerId, jobId, status, unreadCount, needsJobAssignment] of scenarios) {
    const conversation = company.collection("whatsappConversations").doc(id);
    batch.set(conversation, { companyId, phoneNumberNormalized: phone, customerName, customerId, jobId, jobNumber: jobId ? "JOB-DEMO-1001" : null, status, unreadCount, needsJobAssignment, assignedUserId: id === "assigned" ? "demo-agent" : null, assignedUserName: id === "assigned" ? "Demo Service Advisor" : "", lastMessageText: `Demo message for ${id}`, lastMessageAt: now, searchTokens: [String(phone), String(customerName).toLowerCase()], demoData: true });
    batch.set(company.collection("whatsappMessages").doc(`${id}-message`), { companyId, conversationId: id, direction: "incoming", messageType: "text", messageText: `Demo inbound message for ${id}`, status: "received", metaTimestamp: now, demoData: true });
  }
  await batch.commit();
  console.log(`Seeded isolated WhatsApp demo data in emulator company ${companyId}.`);
}
