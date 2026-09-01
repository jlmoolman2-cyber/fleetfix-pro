"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useParams } from "next/navigation";

import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import { formatDateTime24 } from "@/lib/dateTime";

const initialForm = { name: "", activationAt: "", frequency: "monthly", vehicleId: "", jobTypeId: "", location: "", description: "", assignedUserIds: [] as string[] };

export default function CustomerRecurringJobsPage() {
  const customerId = String(useParams().id);
  const [customer, setCustomer] = useState<any>(null);
  const [recurringJobs, setRecurringJobs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [jobTypes, setJobTypes] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [startStatus, setStartStatus] = useState<any>(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    getDoc(doc(clientDb, "companies", COMPANY_ID, "customers", customerId)).then((snapshot) => snapshot.exists() && setCustomer({ id: snapshot.id, ...snapshot.data() }));
    Promise.all([
      getDocs(collection(clientDb, "companies", COMPANY_ID, "vehicles")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "jobTypes")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "job_locations")),
      getDocs(collection(clientDb, "users")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "statuses")),
    ]).then(([vehicleSnapshot, typeSnapshot, locationSnapshot, userSnapshot, statusSnapshot]) => {
      setVehicles(vehicleSnapshot.docs.map((item) => ({ id: item.id, ...item.data() } as any)).filter((vehicle: any) => vehicle.customerId === customerId));
      setJobTypes(typeSnapshot.docs.map((item) => ({ id: item.id, ...item.data() } as any)).filter((type: any) => type.active !== false));
      setLocations(locationSnapshot.docs.map((item) => ({ id: item.id, ...item.data() } as any)));
      setUsers(userSnapshot.docs.map((item) => ({ id: item.id, ...item.data() } as any)).filter((user: any) => user.active !== false));
      setStartStatus(statusSnapshot.docs.map((item) => ({ id: item.id, ...item.data() } as any)).find((status: any) => status.startStatus === true && status.active !== false));
    }).catch(console.error);
    return onSnapshot(collection(clientDb, "companies", COMPANY_ID, "recurringJobs"), (snapshot) => {
      setRecurringJobs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as any)).filter((item: any) => item.customerId === customerId).sort((left: any, right: any) => (left.nextActivation?.toMillis?.() || 0) - (right.nextActivation?.toMillis?.() || 0)));
    });
  }, [customerId]);

  async function saveRecurringJob() {
    if (!form.name.trim() || !form.activationAt || !form.jobTypeId || !form.description.trim() || form.assignedUserIds.length === 0) return alert("Name, activation date/time, job type, description, and at least one allocated user are required.");
    if (!startStatus) return alert("Configure an active Start Status before creating recurring jobs.");
    const activationDate = new Date(form.activationAt);
    if (Number.isNaN(activationDate.getTime())) return alert("Enter a valid activation date and time.");
    const vehicle = vehicles.find((item) => item.id === form.vehicleId);
    const jobType = jobTypes.find((item) => item.id === form.jobTypeId);
    const assignedUsers = users.filter((user) => form.assignedUserIds.includes(user.id)).map((user) => ({ id: user.id, name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email, email: user.email || "" }));
    try {
      setSaving(true);
      await addDoc(collection(clientDb, "companies", COMPANY_ID, "recurringJobs"), {
        name: form.name.trim(), customerId, customerName: customer?.companyName || customer?.customerName || "Customer",
        vehicleId: vehicle?.id || "", vehicleRegNo: vehicle?.regNo || vehicle?.vehicleReg || "", vehicleFleetNo: vehicle?.fleetNo || "", vehicleMake: vehicle?.vehicleMake || vehicle?.make || "", vehicleModel: vehicle?.vehicleModel || vehicle?.model || "",
        jobTypeId: jobType?.id || "", jobType: jobType?.name || "", location: form.location, description: form.description.trim(),
        assignedUserIds: form.assignedUserIds, assignedUsers, frequency: form.frequency, nextActivation: activationDate,
        startStatusId: startStatus.id, startStatusName: startStatus.name, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setForm(initialForm); setShowForm(false);
    } catch (error) { console.error(error); alert("Unable to save recurring job."); } finally { setSaving(false); }
  }

  async function toggleActive(item: any) { await updateDoc(doc(clientDb, "companies", COMPANY_ID, "recurringJobs", item.id), { active: item.active === false, updatedAt: serverTimestamp() }); }
  async function remove(item: any) { if (confirm(`Remove recurring job ${item.name}?`)) await deleteDoc(doc(clientDb, "companies", COMPANY_ID, "recurringJobs", item.id)); }

  const inputClass = "mt-2 h-12 w-full rounded-xl border border-gray-300 bg-white px-4 outline-none focus:border-blue-500";
  return <main className="min-h-screen bg-[#f5f7fb]">
    <header className="border-b bg-white px-6 py-4"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Customers</p><h1 className="text-3xl font-black">Recurring Jobs</h1></div><Link href={`/customers/${customerId}`} className="rounded-xl border px-5 py-3 font-bold">Back</Link></div></header>
    <div className="flex">
      <aside className="min-h-screen w-[260px] border-r bg-white p-4"><nav className="space-y-2"><Link href={`/customers/${customerId}`} className="block rounded-2xl px-5 py-3 font-bold hover:bg-gray-100">Details</Link><Link href={`/customers/${customerId}/contacts`} className="block rounded-2xl px-5 py-3 font-bold hover:bg-gray-100">Contacts</Link><Link href={`/customers/${customerId}/jobs`} className="block rounded-2xl px-5 py-3 font-bold hover:bg-gray-100">Jobs</Link><Link href={`/customers/${customerId}/recurring-jobs`} className="block rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white">Recurring Jobs</Link><Link href={`/customers/${customerId}/system-dm`} className="block rounded-2xl px-5 py-3 font-bold hover:bg-gray-100">System DM</Link><Link href={`/customers/${customerId}/attachments`} className="block rounded-2xl px-5 py-3 font-bold hover:bg-gray-100">Attachments</Link></nav></aside>
      <div className="min-w-0 flex-1 p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-2xl font-black">{customer?.companyName || customer?.customerName || "Customer"}</h2><p className="text-sm text-gray-500">Scheduled jobs activate as booked jobs and notify allocated users.</p></div><button onClick={() => setShowForm((value) => !value)} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">{showForm ? "Cancel" : "+ Add Recurring Job"}</button></div>
        {showForm && <section className="mb-6 rounded-3xl border bg-white p-6 shadow-sm"><h3 className="text-xl font-black">Recurring Job Booking</h3><div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold">Recurring Job Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} /></label>
          <label className="text-sm font-bold">Activation Date and Time<input type="datetime-local" value={form.activationAt} onChange={(event) => setForm({ ...form, activationAt: event.target.value })} className={inputClass} /></label>
          <label className="text-sm font-bold">Repeat<select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })} className={inputClass}><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
          <label className="text-sm font-bold">Job Type<select value={form.jobTypeId} onChange={(event) => setForm({ ...form, jobTypeId: event.target.value })} className={inputClass}><option value="">Select job type</option>{jobTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-bold">Customer Vehicle<select value={form.vehicleId} onChange={(event) => setForm({ ...form, vehicleId: event.target.value })} className={inputClass}><option value="">No vehicle</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.regNo || item.vehicleReg || item.fleetNo || item.id}</option>)}</select></label>
          <label className="text-sm font-bold">Job Location<select value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className={inputClass}><option value="">Select location</option>{locations.map((item) => <option key={item.id} value={item.name || item.addressText}>{item.name || item.addressText}</option>)}</select></label>
          <label className="text-sm font-bold md:col-span-2">Job Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="mt-2 w-full rounded-xl border border-gray-300 p-4" /></label>
          <div className="md:col-span-2"><p className="text-sm font-bold">Allocated Users *</p><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{users.map((user) => <label key={user.id} className="flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold"><input type="checkbox" checked={form.assignedUserIds.includes(user.id)} onChange={(event) => setForm({ ...form, assignedUserIds: event.target.checked ? [...form.assignedUserIds, user.id] : form.assignedUserIds.filter((id) => id !== user.id) })} />{user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email}</label>)}</div></div>
        </div><div className="mt-5 flex justify-end"><button onClick={saveRecurringJob} disabled={saving} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save Recurring Job"}</button></div></section>}
        <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">{recurringJobs.length === 0 ? <div className="p-14 text-center text-gray-500">No recurring jobs configured.</div> : recurringJobs.map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-4 border-b p-5 last:border-b-0"><div><div className="flex items-center gap-2"><h3 className="font-black">{item.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.active !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{item.active !== false ? "Active" : "Inactive"}</span></div><p className="mt-1 text-sm text-gray-600">{item.jobType} · {item.frequency} · {(item.assignedUsers || []).map((user: any) => user.name).join(", ")}</p><p className="mt-1 text-xs text-gray-400">Next activation: {item.nextActivation?.toDate?.() ? formatDateTime24(item.nextActivation.toDate()) : "Not scheduled"}{item.lastJobNumber ? ` · Last job: ${item.lastJobNumber}` : ""}</p></div><div className="flex items-center gap-2"><button onClick={() => toggleActive(item)} className="rounded-lg border px-3 py-2 text-xs font-bold">{item.active !== false ? "Pause" : "Activate"}</button><button onClick={() => remove(item)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Remove</button></div></div>)}</section>
      </div>
    </div>
  </main>;
}
