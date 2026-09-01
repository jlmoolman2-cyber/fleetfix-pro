"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Hash, Settings2 } from "lucide-react";
import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

const defaults = { requireSupplier: true, requirePurchaseOrderLines: true, defaultVatRate: 15, defaultNotes: "", numberingEnabled: true, prefix: "PO", currentSequence: "00000", instructionMethods: ["Collect from supplier", "Supplier delivery", "Courier collection"], paymentOptions: ["Account", "EFT", "Card", "Cash on collection"], instructionOptions: ["Proceed", "Cancelled", "Customer Sending Parts", "Await Delivery", "Collect From Courier on Arrival"] };

export default function PurchaseOrderSettingsPage() {
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const settingsRef = useMemo(() => doc(clientDb, "companies", COMPANY_ID, "purchase_order_settings", "general"), []);

  useEffect(() => {
    getDoc(settingsRef).then((snapshot) => {
      if (snapshot.exists()) setSettings({ ...defaults, ...snapshot.data() });
    }).finally(() => setLoading(false));
  }, [settingsRef]);

  const width = Math.max(1, settings.currentSequence.length);
  const nextSequence = String((Number(settings.currentSequence) || 0) + 1).padStart(width, "0");

  async function saveSettings() {
    if (!settings.prefix.trim()) return alert("Purchase Order Prefix is required.");
    if (!/^\d+$/.test(settings.currentSequence)) return alert("Current Sequence must contain numbers only.");
    try {
      setSaving(true);
      const cleanedSettings = {
        ...settings,
        prefix: settings.prefix.trim().toUpperCase(),
        instructionMethods: settings.instructionMethods.map((value) => value.trim()).filter(Boolean),
        paymentOptions: settings.paymentOptions.map((value) => value.trim()).filter(Boolean),
        instructionOptions: settings.instructionOptions.map((value) => value.trim()).filter(Boolean),
      };
      await setDoc(settingsRef, { ...cleanedSettings, updatedAt: serverTimestamp() }, { merge: true });
      setSettings(cleanedSettings);
      alert("Purchase Order settings saved.");
    } catch (error) {
      console.error(error);
      alert("Unable to save Purchase Order settings.");
    } finally { setSaving(false); }
  }

  const inputClass = "mt-2 h-14 w-full rounded-2xl border border-gray-300 bg-white px-5 text-base font-bold outline-none focus:border-blue-500";
  return <main className="min-h-screen w-full bg-[#f4f7fb] p-5 md:p-8"><div className="w-full max-w-none">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">Admin / Purchase Order Settings</p><h1 className="mt-2 text-4xl font-black">Purchase Order Settings</h1><p className="mt-2 text-gray-500">Configure purchase-order rules and numbering.</p></div><div className="flex gap-3"><Link href="/admin" className="rounded-2xl border bg-white px-6 py-4 font-bold">Back</Link><button onClick={saveSettings} disabled={saving || loading} className="rounded-2xl bg-blue-600 px-7 py-4 font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save Settings"}</button></div></header>
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"><div className="flex items-center gap-4 border-b p-6"><span className="flex size-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><Settings2 size={28} /></span><div><h2 className="text-2xl font-black">General Purchase Order Settings</h2><p className="text-sm text-gray-500">Control the information required when creating purchase orders.</p></div></div><div className="grid gap-5 p-6 md:grid-cols-2">
        <label className="flex items-center justify-between rounded-2xl border p-4 font-bold">Require Supplier<input type="checkbox" checked={settings.requireSupplier} onChange={(event) => setSettings({ ...settings, requireSupplier: event.target.checked })} className="size-5" /></label>
        <label className="flex items-center justify-between rounded-2xl border p-4 font-bold">Require Purchase Order Lines<input type="checkbox" checked={settings.requirePurchaseOrderLines} onChange={(event) => setSettings({ ...settings, requirePurchaseOrderLines: event.target.checked })} className="size-5" /></label>
        <label className="text-sm font-black uppercase tracking-wide text-gray-500">Default VAT Rate (%)<input type="number" min="0" max="100" value={settings.defaultVatRate} onChange={(event) => setSettings({ ...settings, defaultVatRate: Number(event.target.value) || 0 })} className={inputClass} /></label>
        <label className="text-sm font-black uppercase tracking-wide text-gray-500">Default Purchase Order Notes<input value={settings.defaultNotes} onChange={(event) => setSettings({ ...settings, defaultNotes: event.target.value })} className={inputClass} /></label>
      </div></section>
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-4 border-b p-6"><span className="flex size-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Settings2 size={28} /></span><div><h2 className="text-2xl font-black">Purchase Order Instructions</h2><p className="text-sm text-gray-500">Configure the selectable fulfilment methods and payment instructions used after approval.</p></div></div>
        <div className="grid gap-5 p-6 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-black uppercase tracking-wide text-gray-500">Methods (one option per line)<textarea rows={9} value={settings.instructionMethods.join("\n")} onChange={(event) => setSettings({ ...settings, instructionMethods: event.target.value.split("\n") })} className="mt-2 w-full resize-y rounded-2xl border border-gray-300 bg-white p-5 text-base font-bold normal-case outline-none focus:border-blue-500" placeholder="Enter a method, then press Enter to add another line" /></label>
          <label className="text-sm font-black uppercase tracking-wide text-gray-500">Payment Options (one option per line)<textarea rows={9} value={settings.paymentOptions.join("\n")} onChange={(event) => setSettings({ ...settings, paymentOptions: event.target.value.split("\n") })} className="mt-2 w-full resize-y rounded-2xl border border-gray-300 bg-white p-5 text-base font-bold normal-case outline-none focus:border-blue-500" placeholder="Enter a payment option, then press Enter to add another line" /></label>
          <label className="text-sm font-black uppercase tracking-wide text-gray-500">Instructions (one option per line)<textarea rows={9} value={settings.instructionOptions.join("\n")} onChange={(event) => setSettings({ ...settings, instructionOptions: event.target.value.split("\n") })} className="mt-2 w-full resize-y rounded-2xl border border-gray-300 bg-white p-5 text-base font-bold normal-case outline-none focus:border-blue-500" placeholder="Enter an instruction, then press Enter to add another line" /></label>
        </div>
      </section>
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"><div className="flex items-center gap-4 border-b p-6"><span className="flex size-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-700"><Hash size={28} /></span><div><h2 className="text-2xl font-black">Purchase Order Numbering</h2><p className="text-sm text-gray-500">Configure the automatic purchase-order number sequence.</p></div></div><div className="grid gap-5 p-6 md:grid-cols-2">
        <label className="flex items-center justify-between rounded-2xl border p-4 font-bold md:col-span-2">Automatic Numbering Enabled<input type="checkbox" checked={settings.numberingEnabled} onChange={(event) => setSettings({ ...settings, numberingEnabled: event.target.checked })} className="size-5" /></label>
        <label className="text-sm font-black uppercase tracking-wide text-gray-500">Purchase Order Prefix<input value={settings.prefix} onChange={(event) => setSettings({ ...settings, prefix: event.target.value.toUpperCase() })} className={inputClass} /></label>
        <label className="text-sm font-black uppercase tracking-wide text-gray-500">Current Sequence<input inputMode="numeric" value={settings.currentSequence} onChange={(event) => setSettings({ ...settings, currentSequence: event.target.value.replace(/\D/g, "") })} className={inputClass} /></label>
        <div className="rounded-3xl bg-blue-50 p-6"><p className="text-xs font-black uppercase tracking-wide text-blue-500">Last Purchase Order</p><p className="mt-3 text-3xl font-black text-blue-700">{settings.prefix}{settings.currentSequence}</p></div>
        <div className="rounded-3xl bg-green-50 p-6"><p className="text-xs font-black uppercase tracking-wide text-green-500">Next Purchase Order</p><p className="mt-3 text-3xl font-black text-green-700">{settings.prefix}{nextSequence}</p></div>
      </div></section>
    </div>
  </div></main>;
}
