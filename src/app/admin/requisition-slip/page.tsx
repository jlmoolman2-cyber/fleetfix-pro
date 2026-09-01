"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

const defaults = { requisitionTitle: "PARTS REQUISITION", derequisitionTitle: "PARTS DEREQUISITION", fontSize: 10, showLogo: true, showCompanyAddress: true, showCompanyContact: true, showJobNumber: true, showCustomer: true, showRequestedBy: true, showSignature: true, footerText: "" };

export default function RequisitionSlipSettingsPage() {
  const [settings, setSettings] = useState<any>(defaults);
  const [saving, setSaving] = useState(false);
  useEffect(() => { getDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "requisition_slip")).then((snapshot) => { if (snapshot.exists()) setSettings({ ...defaults, ...snapshot.data() }); }); }, []);
  const update = (key: string, value: any) => setSettings((current: any) => ({ ...current, [key]: value }));
  async function save() { setSaving(true); try { await setDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "requisition_slip"), { ...settings, fontSize: Number(settings.fontSize || 10), updatedAt: serverTimestamp() }, { merge: true }); alert("Requisition slip settings saved."); } finally { setSaving(false); } }
  return <main className="min-h-screen bg-[#f4f7fb] p-6"><div className="mx-auto max-w-5xl"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-gray-400">Admin / Inventory</p><h1 className="mt-2 text-3xl font-black">Requisition Slip Setup</h1><p className="mt-2 text-gray-500">Customize requisition and derequisition slips for 80 mm roll printers.</p></div><Link href="/admin" className="rounded-xl border bg-white px-4 py-2 font-bold">Back</Link></div>
    <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Slip Titles and Text</h2><div className="mt-5 grid gap-5 md:grid-cols-2"><label className="font-bold">Requisition title<input value={settings.requisitionTitle} onChange={(e) => update("requisitionTitle", e.target.value)} className="mt-2 h-12 w-full rounded-xl border px-4" /></label><label className="font-bold">Derequisition title<input value={settings.derequisitionTitle} onChange={(e) => update("derequisitionTitle", e.target.value)} className="mt-2 h-12 w-full rounded-xl border px-4" /></label><label className="font-bold">Font size<input type="number" min="8" max="14" value={settings.fontSize} onChange={(e) => update("fontSize", Number(e.target.value))} className="mt-2 h-12 w-full rounded-xl border px-4" /></label><label className="font-bold md:col-span-2">Footer text<textarea value={settings.footerText} onChange={(e) => update("footerText", e.target.value)} rows={4} className="mt-2 w-full rounded-xl border p-4" /></label></div></section>
    <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Header and Visible Fields</h2><p className="mt-1 text-sm text-gray-500">Company header information comes from the same Company Details used by Job Forms.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{[["showLogo","Company logo"],["showCompanyAddress","Company address"],["showCompanyContact","Company telephone and email"],["showJobNumber","Job number"],["showCustomer","Customer"],["showRequestedBy","Created by"],["showSignature","Signature section"]].map(([key,label]) => <label key={key} className="flex items-center gap-3 rounded-xl border p-4 font-bold"><input type="checkbox" checked={settings[key] !== false} onChange={(e) => update(key, e.target.checked)} className="h-5 w-5 accent-blue-600" />{label}</label>)}</div></section>
    <div className="mt-6 flex justify-end"><button disabled={saving} onClick={() => void save()} className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save Slip Settings"}</button></div>
  </div></main>;
}
