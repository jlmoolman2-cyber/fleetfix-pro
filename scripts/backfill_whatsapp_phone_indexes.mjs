import admin from "firebase-admin";

function normalize(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("27")) return `+${digits}`;
  if (digits.startsWith("0")) return `+27${digits.slice(1)}`;
  return String(value).startsWith("+") ? `+${digits}` : null;
}

const companyId = process.argv.find((value) => value.startsWith("--company="))?.split("=")[1];
const apply = process.argv.includes("--apply");
if (!companyId) throw new Error("Provide --company=<company-id>. Dry-run is the default.");
if (apply && process.env.ALLOW_PHONE_BACKFILL !== "true") throw new Error("Set ALLOW_PHONE_BACKFILL=true to apply changes.");
admin.initializeApp();
const db = admin.firestore();
let changed = 0;
let invalidRecords = 0;
const ownership = new Map();
for (const collectionName of ["customers", "contacts"]) {
  const snapshots = collectionName === "customers"
    ? [await db.collection(`companies/${companyId}/customers`).get()]
    : await Promise.all((await db.collection(`companies/${companyId}/customers`).listDocuments()).map((customer) => customer.collection("contacts").get()));
  for (const snapshot of snapshots) for (const document of snapshot.docs) {
    const data = document.data();
    const rawValues = [data.primaryContactNumber, data.mobile, data.whatsappNumberE164].filter((value) => String(value || "").trim());
    const values = rawValues.map(normalize).filter(Boolean);
    const normalizedPhoneNumbers = [...new Set(values)];
    if (rawValues.length && !normalizedPhoneNumbers.length) {
      invalidRecords += 1;
      console.log(`INVALID ${document.ref.path}`);
    }
    if (!normalizedPhoneNumbers.length) continue;
    for (const phone of normalizedPhoneNumbers) ownership.set(phone, [...(ownership.get(phone) || []), document.ref.path]);
    changed += 1;
    console.log(`${apply ? "UPDATE" : "WOULD UPDATE"} ${document.ref.path}: ${normalizedPhoneNumbers.join(", ")}`);
    if (apply) await document.ref.set({ companyId, normalizedPhoneNumbers }, { merge: true });
  }
}
const ambiguous = [...ownership.entries()].filter(([, paths]) => paths.length > 1);
for (const [phone, paths] of ambiguous) console.log(`AMBIGUOUS ${phone}: ${paths.length} records`);
console.log(`${apply ? "Updated" : "Dry-run found"} ${changed} records.`);
console.log(`Invalid records: ${invalidRecords}. Ambiguous normalized numbers: ${ambiguous.length}.`);
