"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Clock3, FileText, Hash, Settings2 } from "lucide-react";

import DocumentLineColumnSettings from "@/components/admin/DocumentLineColumnSettings";
import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

const defaults = {
  duePeriodDays: 0,
  paymentTerms: "Due On Receipt",
  defaultNote: "",
  numberingEnabled: true,
  prefix: "INV",
  currentSequence: "000000",
};

export default function InvoiceSettingsPage() {
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const settingsRef = useMemo(
    () => doc(clientDb, "companies", COMPANY_ID, "documentSettings", "invoice"),
    [],
  );

  useEffect(() => {
    getDoc(settingsRef)
      .then((snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSettings({
            ...defaults,
            ...data,
            currentSequence: String(data.currentSequence ?? defaults.currentSequence),
          });
        }
      })
      .finally(() => setLoading(false));
  }, [settingsRef]);

  const sequenceWidth = Math.max(1, settings.currentSequence.length);
  const nextSequence = String((Number(settings.currentSequence) || 0) + 1).padStart(sequenceWidth, "0");

  async function saveSettings() {
    const prefix = settings.prefix.trim().toUpperCase();
    if (!prefix) return alert("Invoice Prefix is required.");
    if (!/^\d+$/.test(settings.currentSequence)) return alert("Current Sequence must contain numbers only.");
    try {
      setSaving(true);
      await setDoc(settingsRef, { ...settings, prefix, updatedAt: serverTimestamp() }, { merge: true });
      setSettings((current) => ({ ...current, prefix }));
      alert("Invoice settings saved.");
    } catch (error) {
      console.error(error);
      alert("Unable to save Invoice settings.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "mt-2 h-14 w-full rounded-2xl border border-gray-300 bg-white px-5 text-base font-bold outline-none focus:border-blue-500";

  return (
    <main className="min-h-screen bg-[#f4f7fb] p-5 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">Admin / Invoice Settings</p>
            <h1 className="mt-2 text-4xl font-black">Invoice Settings</h1>
            <p className="mt-2 text-gray-500">Configure invoice numbering, payment periods and default notes.</p>
          </div>
          <button data-admin-save-target="true" type="button" onClick={() => void saveSettings()} disabled={loading || saving} className="rounded-2xl bg-blue-600 px-7 py-4 font-black text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </header>

        <DocumentLineColumnSettings type="invoice" />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-4 border-b p-6">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><Settings2 size={28} /></span>
              <div><h2 className="text-2xl font-black">General Invoice Settings</h2><p className="text-sm text-gray-500">Defaults used when invoices are created.</p></div>
            </div>
            <div className="grid gap-5 p-6 md:grid-cols-2">
              <label className="text-sm font-black uppercase tracking-wide text-gray-500"><Clock3 className="mr-2 inline" size={16} />Invoice Due Period
                <input type="number" min="0" value={settings.duePeriodDays} onChange={(event) => setSettings({ ...settings, duePeriodDays: Math.max(0, Number(event.target.value) || 0) })} className={inputClass} />
              </label>
              <label className="text-sm font-black uppercase tracking-wide text-gray-500">Payment Terms
                <select value={settings.paymentTerms} onChange={(event) => setSettings({ ...settings, paymentTerms: event.target.value })} className={inputClass}>
                  <option>Due On Receipt</option><option>7 Days</option><option>30 Days</option>
                </select>
              </label>
              <label className="text-sm font-black uppercase tracking-wide text-gray-500 md:col-span-2"><FileText className="mr-2 inline" size={16} />Invoice Note
                <textarea rows={5} value={settings.defaultNote} onChange={(event) => setSettings({ ...settings, defaultNote: event.target.value })} className="mt-2 w-full rounded-2xl border border-gray-300 p-5 text-base outline-none focus:border-blue-500" />
              </label>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-4 border-b p-6">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-700"><Hash size={28} /></span>
              <div><h2 className="text-2xl font-black">Invoice Numbering</h2><p className="text-sm text-gray-500">Configure the automatic invoice sequence.</p></div>
            </div>
            <div className="grid gap-5 p-6 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-2xl border p-4 font-bold md:col-span-2">Automatic Numbering Enabled
                <input type="checkbox" checked={settings.numberingEnabled} onChange={(event) => setSettings({ ...settings, numberingEnabled: event.target.checked })} className="size-5" />
              </label>
              <label className="text-sm font-black uppercase tracking-wide text-gray-500">Invoice Prefix
                <input value={settings.prefix} onChange={(event) => setSettings({ ...settings, prefix: event.target.value.toUpperCase() })} className={inputClass} />
              </label>
              <label className="text-sm font-black uppercase tracking-wide text-gray-500">Current Sequence
                <input inputMode="numeric" value={settings.currentSequence} onChange={(event) => setSettings({ ...settings, currentSequence: event.target.value.replace(/\D/g, "") })} className={inputClass} />
              </label>
              <div className="rounded-3xl bg-blue-50 p-6"><p className="text-xs font-black uppercase text-blue-500">Last Invoice</p><p className="mt-3 text-3xl font-black text-blue-700">{settings.prefix}{settings.currentSequence}</p></div>
              <div className="rounded-3xl bg-green-50 p-6"><p className="text-xs font-black uppercase text-green-500">Next Invoice</p><p className="mt-3 text-3xl font-black text-green-700">{settings.prefix}{nextSequence}</p></div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
