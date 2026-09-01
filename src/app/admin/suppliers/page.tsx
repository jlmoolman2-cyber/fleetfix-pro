"use client";

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

export default function SupplierSetupPage() {
  const [prefix, setPrefix] = useState("SUP-");
  const [nextNumber, setNextNumber] = useState(1);
  const [padding, setPadding] = useState(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(clientDb, "companies", COMPANY_ID, "settings", "supplierSettings")).then((snapshot) => {
      const numbering = snapshot.data()?.supplierNumbering || {};
      setPrefix(String(numbering.prefix ?? "SUP-"));
      setNextNumber(Math.max(1, Number(numbering.nextNumber || 1)));
      setPadding(Math.min(10, Math.max(1, Number(numbering.padding || 5))));
    }).catch(console.error);
  }, []);

  async function saveSettings() {
    setSaving(true);
    try {
      await setDoc(doc(clientDb, "companies", COMPANY_ID, "settings", "supplierSettings"), {
        supplierNumbering: { prefix: prefix.trim(), nextNumber: Math.max(1, nextNumber), padding: Math.min(10, Math.max(1, padding)) },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      alert("Supplier numbering settings saved.");
    } catch (error) {
      console.error(error);
      alert("Unable to save supplier numbering settings.");
    } finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-[#f5f7fb] p-6">
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-black">Supplier Setup</h1><p className="mt-2 text-sm text-gray-500">Configure automatic supplier-code numbering.</p></div><button type="button" disabled={saving} onClick={() => void saveSettings()} className="rounded-2xl bg-blue-600 px-6 py-3 font-black text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button></div>
      <div className="mt-7 grid gap-5 md:grid-cols-3">
        <label><span className="mb-2 block text-sm font-bold">Supplier Code Prefix</span><input value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="SUP-" className="h-12 w-full rounded-xl border px-4" /></label>
        <label><span className="mb-2 block text-sm font-bold">Next Supplier Number</span><input type="number" min="1" value={nextNumber} onChange={(event) => setNextNumber(Math.max(1, Number(event.target.value || 1)))} className="h-12 w-full rounded-xl border px-4" /></label>
        <label><span className="mb-2 block text-sm font-bold">Number Digits</span><input type="number" min="1" max="10" value={padding} onChange={(event) => setPadding(Math.min(10, Math.max(1, Number(event.target.value || 1))))} className="h-12 w-full rounded-xl border px-4" /></label>
      </div>
      <div className="mt-5 rounded-2xl bg-blue-50 px-5 py-4 text-sm text-blue-800"><b>Next automatic code:</b> <span className="ml-2 font-black">{prefix.trim()}{String(nextNumber).padStart(padding, "0")}</span></div>
    </div>
  </main>;
}
