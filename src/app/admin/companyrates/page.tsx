"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { Plus, Save, Trash2 } from "lucide-react";
import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";
import { CompanyRateCategory, CompanyRateLine } from "@/lib/companyRates";

const categories: Array<{ id: CompanyRateCategory; title: string; description: string; unit: string }> = [
  { id: "labour", title: "Labour", description: "Status timer duration multiplied by the hourly client rate.", unit: "per hour" },
  { id: "travelTime", title: "Travel Time", description: "Travel-status timer duration multiplied by the hourly client rate.", unit: "per hour" },
  { id: "travelling", title: "Travelling", description: "Total kilometres travelled multiplied by the client kilometre rate.", unit: "per km" },
];
const timeZones = ["Africa/Johannesburg", "Africa/Windhoek", "Africa/Maputo", "Africa/Harare", "UTC"];
const weekDays = [
  { id: 1, label: "Monday" }, { id: 2, label: "Tuesday" }, { id: 3, label: "Wednesday" },
  { id: 4, label: "Thursday" }, { id: 5, label: "Friday" }, { id: 6, label: "Saturday" }, { id: 0, label: "Sunday" },
];

function newRate(category: CompanyRateCategory): CompanyRateLine {
  return { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, category, name: category === "labour" ? "Normal labour" : category === "travelTime" ? "Normal travel time" : "Travelling rate", rate: 0, cpk: 0, weekDays: [], statusIds: [], statusNames: [], startTime: category === "travelling" ? "" : "08:00", endTime: category === "travelling" ? "" : "17:00", timeZone: "Africa/Johannesburg", active: true };
}

export default function CompanyRatesPage() {
  const [rates, setRates] = useState<CompanyRateLine[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [settings, statusSnapshot] = await Promise.all([
          getDoc(doc(clientDb, "companies", COMPANY_ID, "companyRates", "settings")),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "statuses")),
        ]);
        setRates(settings.exists() && Array.isArray(settings.data().rates) ? settings.data().rates : []);
        setStatuses(statusSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      } finally { setLoading(false); }
    }
    void load();
  }, []);

  function updateRate(id: string, changes: Partial<CompanyRateLine>) { setRates((current) => current.map((rate) => rate.id === id ? { ...rate, ...changes } : rate)); }
  function selectedStatusIds(rate: CompanyRateLine) { return Array.isArray(rate.statusIds) ? rate.statusIds : rate.statusId ? [rate.statusId] : []; }
  function toggleStatus(rate: CompanyRateLine, statusId: string, checked: boolean) {
    const nextIds = checked ? [...new Set([...selectedStatusIds(rate), statusId])] : selectedStatusIds(rate).filter((id) => id !== statusId);
    const nextNames = nextIds.map((id) => statuses.find((status) => status.id === id)?.name).filter(Boolean) as string[];
    updateRate(rate.id, { statusIds: nextIds, statusNames: nextNames, statusId: "", statusName: "" });
  }
  function toggleWeekDay(rate: CompanyRateLine, dayId: number, checked: boolean) {
    const selected = Array.isArray(rate.weekDays) ? rate.weekDays : [];
    updateRate(rate.id, { weekDays: checked ? [...new Set([...selected, dayId])] : selected.filter((id) => id !== dayId) });
  }
  async function save() {
    setSaving(true);
    try {
      await setDoc(doc(clientDb, "companies", COMPANY_ID, "companyRates", "settings"), { rates: rates.map((rate) => ({ ...rate, rate: Number(rate.rate || 0), cpk: Number(rate.cpk || 0) })), updatedAt: serverTimestamp() }, { merge: true });
      window.dispatchEvent(new Event("fleetfix:changes-saved"));
      alert("Company rates saved.");
    } finally { setSaving(false); }
  }

  if (loading) return <main className="min-h-screen bg-[#f5f7fb] p-8 font-bold text-gray-500">Loading company rates...</main>;
  return <main className="min-h-screen bg-[#f5f7fb] p-6"><div className="mx-auto max-w-[1500px]">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Admin / Company</p><h1 className="mt-2 text-3xl font-black">Company Rates</h1><p className="mt-2 text-sm text-gray-500">Configure rates charged to clients from job time and travelling activity.</p></div><div className="flex gap-3"><Link href="/admin" className="rounded-xl border bg-white px-5 py-3 font-bold">Back to Admin</Link><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving..." : "Save Rates"}</button></div></header>
    <div className="space-y-6">{categories.map((category) => { const categoryRates = rates.filter((rate) => rate.category === category.id); return <section key={category.id} className="company-rate-section relative overflow-visible rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-3xl border-b bg-slate-50 px-6 py-5"><div><h2 className="text-xl font-black">{category.title}</h2><p className="mt-1 text-sm text-gray-500">{category.description}</p></div><button type="button" onClick={() => setRates((current) => [...current, newRate(category.id)])} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />Add Rate Line</button></div>
      <div className="space-y-3 p-5">{categoryRates.map((rate) => <div key={rate.id} className={`grid items-end gap-3 rounded-2xl border p-4 ${category.id === "travelling" ? "lg:grid-cols-[1.3fr_1fr_1fr_1fr_auto_auto]" : "lg:grid-cols-[1.2fr_1fr_1fr_0.7fr_0.7fr_1fr_0.8fr_auto_auto]"}`}>
        <label className="text-xs font-bold text-gray-600">Rate name<input value={rate.name} onChange={(event) => updateRate(rate.id, { name: event.target.value })} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-medium text-gray-900" /></label>
        <label className="text-xs font-bold text-gray-600">Days of week<details className="relative mt-1 text-sm font-normal text-gray-900"><summary className="flex h-11 cursor-pointer list-none items-center justify-between rounded-xl border bg-white px-3"><span className="truncate">{!rate.weekDays?.length ? "All days" : rate.weekDays.length === 1 ? weekDays.find((day) => day.id === rate.weekDays?.[0])?.label : `${rate.weekDays.length} days selected`}</span><span className="text-gray-400">▼</span></summary><div className="absolute left-0 top-12 z-50 w-56 rounded-xl border bg-white p-2 shadow-xl"><button type="button" onClick={() => updateRate(rate.id, { weekDays: [] })} className="mb-1 w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-blue-700 hover:bg-blue-50">Use all days</button>{weekDays.map((day) => <label key={day.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-50"><input type="checkbox" checked={rate.weekDays?.includes(day.id) || false} onChange={(event) => toggleWeekDay(rate, day.id, event.target.checked)} /><span>{day.label}</span></label>)}</div></details></label>
        {category.id !== "travelling" && <label className="text-xs font-bold text-gray-600">Linked statuses<details className="relative mt-1 text-sm font-normal text-gray-900"><summary className="flex h-11 cursor-pointer list-none items-center justify-between rounded-xl border bg-white px-3"><span className="truncate">{selectedStatusIds(rate).length === 0 ? "All statuses" : selectedStatusIds(rate).length === 1 ? statuses.find((status) => status.id === selectedStatusIds(rate)[0])?.name || "1 status" : `${selectedStatusIds(rate).length} statuses selected`}</span><span className="text-gray-400">▾</span></summary><div className="absolute left-0 top-12 z-50 max-h-72 w-[280px] overflow-y-auto rounded-xl border bg-white p-2 shadow-xl"><button type="button" onClick={() => updateRate(rate.id, { statusIds: [], statusNames: [], statusId: "", statusName: "" })} className="mb-1 w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-blue-700 hover:bg-blue-50">Use all statuses</button>{statuses.map((status) => <label key={status.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-50"><input type="checkbox" checked={selectedStatusIds(rate).includes(status.id)} onChange={(event) => toggleStatus(rate, status.id, event.target.checked)} /><span>{status.name || status.id}</span></label>)}</div></details></label>}
        {category.id !== "travelling" && <label className="text-xs font-bold text-gray-600">From<input type="time" value={rate.startTime || ""} onChange={(event) => updateRate(rate.id, { startTime: event.target.value })} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm text-gray-900" /></label>}
        {category.id !== "travelling" && <label className="text-xs font-bold text-gray-600">To<input type="time" value={rate.endTime || ""} onChange={(event) => updateRate(rate.id, { endTime: event.target.value })} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm text-gray-900" /></label>}
        {category.id !== "travelling" && <label className="text-xs font-bold text-gray-600">Timezone<select value={rate.timeZone || "Africa/Johannesburg"} onChange={(event) => updateRate(rate.id, { timeZone: event.target.value })} className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm text-gray-900">{timeZones.map((zone) => <option key={zone}>{zone}</option>)}</select></label>}
        <label className="text-xs font-bold text-gray-600">Rate ({category.unit})<input type="number" min="0" step="0.01" value={rate.rate} onChange={(event) => updateRate(rate.id, { rate: Number(event.target.value) })} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-bold text-gray-900" /></label>
        {category.id === "travelling" && <label className="text-xs font-bold text-gray-600">CPK (cost per km)<input type="number" min="0" step="0.01" value={rate.cpk || 0} onChange={(event) => updateRate(rate.id, { cpk: Number(event.target.value) })} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-bold text-gray-900" /></label>}
        <label className="flex h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" checked={rate.active !== false} onChange={(event) => updateRate(rate.id, { active: event.target.checked })} className="h-4 w-4" />Active</label>
        <button type="button" onClick={() => setRates((current) => current.filter((item) => item.id !== rate.id))} className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 text-red-600 hover:bg-red-50" aria-label={`Delete ${rate.name}`}><Trash2 className="h-4 w-4" /></button>
      </div>)}{categoryRates.length === 0 && <div className="rounded-2xl border border-dashed p-8 text-center text-sm font-bold text-gray-400">No {category.title.toLowerCase()} rates configured. Add the first rate line.</div>}</div>
    </section>; })}</div>
  </div></main>;
}
