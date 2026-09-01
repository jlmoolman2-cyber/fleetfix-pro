"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";

import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import { formatDateTime24 } from "@/lib/dateTime";

const initialForm = {
  supplierCode: "",
  supplierName: "",
  address: "",
  contactName: "",
  contactSurname: "",
  cellNumber: "",
  email: "",
  preferredCommunication: "Email",
  communicationEmail: true,
  sendPurchaseOrders: true,
  sendRemittances: true,
  sendOrderUpdates: true,
  orderDeliveryUpdateMessages: [],
  communicationNotes: "",
  externalJobStatusId: "",
  externalJobMessageTemplateId: "",
};

export default function SupplierDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const supplierId = String(params.id);
  const [form, setForm] = useState<any>(initialForm);
  const [communications, setCommunications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribeSupplier = onSnapshot(
      doc(clientDb, "companies", COMPANY_ID, "suppliers", supplierId),
      (snapshot) => {
        if (snapshot.exists()) setForm({ ...initialForm, ...snapshot.data() });
        setLoading(false);
      }
    );
    const unsubscribeMessages = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "communicationQueue"),
      (snapshot) => setCommunications(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as any))
        .filter((item) => item.supplierId === supplierId || item.recipientId === supplierId)
        .sort((left, right) => (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0)))
    );
    const unsubscribeStatuses = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "statuses"),
      (snapshot) => setStatuses(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    );
    const unsubscribeTemplates = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "messageTemplates"),
      (snapshot) => setMessageTemplates(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    );
    return () => { unsubscribeSupplier(); unsubscribeMessages(); unsubscribeStatuses(); unsubscribeTemplates(); };
  }, [supplierId]);

  const setField = (field: string, value: any) => setForm((current: any) => ({ ...current, [field]: value }));
  const addUpdateMessage = () => setField("orderDeliveryUpdateMessages", [
    ...(form.orderDeliveryUpdateMessages || []),
    { id: crypto.randomUUID(), statusId: "", statusName: "", templateId: "", templateName: "", delayValue: 1, delayUnit: "hours" },
  ]);
  const updateMessage = (id: string, values: Record<string, any>) => setField(
    "orderDeliveryUpdateMessages",
    (form.orderDeliveryUpdateMessages || []).map((message: any) => message.id === id ? { ...message, ...values } : message)
  );
  const removeUpdateMessage = (id: string) => setField(
    "orderDeliveryUpdateMessages",
    (form.orderDeliveryUpdateMessages || []).filter((message: any) => message.id !== id)
  );

  async function saveSupplier() {
    if (!form.supplierName?.trim()) return alert("Supplier name is required.");
    const incompleteTimedMessage = form.sendOrderUpdates === true && (form.orderDeliveryUpdateMessages || []).some(
      (message: any) => !message.statusId || !message.templateId || Number(message.delayValue) < 0
    );
    if (incompleteTimedMessage) return alert("Each timed order and delivery message requires a status, message template, and valid delay.");
    try {
      setSaving(true);
      const settingsRef = doc(clientDb, "companies", COMPANY_ID, "settings", "supplierSettings");
      const supplierRef = doc(clientDb, "companies", COMPANY_ID, "suppliers", supplierId);
      await runTransaction(clientDb, async (transaction) => {
        const snapshot = await transaction.get(settingsRef);
        const numbering = snapshot.data()?.supplierNumbering || {};
        const manualCode = String(form.supplierCode || "").trim();
        const prefix = String(numbering.prefix ?? "SUP-").trim();
        const nextNumber = Math.max(1, Number(numbering.nextNumber || 1));
        const padding = Math.min(10, Math.max(1, Number(numbering.padding || 5)));
        const supplierCode = manualCode || `${prefix}${String(nextNumber).padStart(padding, "0")}`;
        if (!manualCode) transaction.set(settingsRef, { supplierNumbering: { prefix, padding, nextNumber: nextNumber + 1 }, updatedAt: serverTimestamp() }, { merge: true });
        transaction.set(supplierRef, { ...form, supplierCode, updatedAt: serverTimestamp() }, { merge: true });
      });
      alert("Supplier saved.");
    } catch (error) {
      console.error(error);
      alert("Unable to save supplier.");
    } finally { setSaving(false); }
  }

  async function removeSupplier() {
    if (!confirm(`Permanently remove ${form.supplierName || "this supplier"}?`)) return;
    await deleteDoc(doc(clientDb, "companies", COMPANY_ID, "suppliers", supplierId));
    router.push("/suppliers");
  }

  if (loading) return <main className="p-10">Loading supplier…</main>;

  const inputClass = "mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-blue-500";
  return <main className="min-h-screen bg-[#f5f7fb] p-6">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-widest text-gray-400">Suppliers</p><h1 className="mt-1 text-3xl font-black">{form.supplierName || "Supplier Details"}</h1></div>
        <div className="flex gap-2"><Link href="/suppliers" className="rounded-xl border bg-white px-5 py-3 font-bold">Back</Link><button onClick={removeSupplier} className="rounded-xl bg-red-50 px-5 py-3 font-bold text-red-700">Remove Supplier</button><button onClick={saveSupplier} disabled={saving} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save Supplier"}</button></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Supplier Details</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-gray-700">Supplier Code<input value={form.supplierCode} onChange={(event) => setField("supplierCode", event.target.value)} className={inputClass} placeholder="Leave blank to assign automatically" /><span className="mt-1 block text-xs font-normal text-gray-500">Optional. A configured supplier code is assigned when blank.</span></label>
            <label className="text-sm font-bold text-gray-700">Supplier Name<input value={form.supplierName} onChange={(event) => setField("supplierName", event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-bold text-gray-700">Contact Name<input value={form.contactName} onChange={(event) => setField("contactName", event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-bold text-gray-700">Contact Surname<input value={form.contactSurname} onChange={(event) => setField("contactSurname", event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-bold text-gray-700">Cell Number<input value={form.cellNumber} onChange={(event) => setField("cellNumber", event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-bold text-gray-700">Email Address<input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-bold text-gray-700 sm:col-span-2">Address<textarea rows={4} value={form.address} onChange={(event) => setField("address", event.target.value)} className={inputClass} /></label>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Communication Setup</h2>
          <p className="mt-1 text-sm text-gray-500">Choose how and when the system communicates with this supplier.</p>
          <label className="mt-5 block text-sm font-bold text-gray-700">Preferred Method<select value={form.preferredCommunication === "Do not contact" ? "Do not contact" : "Email"} onChange={(event) => setField("preferredCommunication", event.target.value)} className={inputClass}><option>Email</option><option>Do not contact</option></select></label>
          <label className="mt-5 block text-sm font-bold text-gray-700">External Job Status<select value={form.externalJobStatusId} onChange={(event) => { const status = statuses.find((item) => item.id === event.target.value); setForm((current: any) => ({ ...current, externalJobStatusId: event.target.value, externalJobStatusName: status?.name || "" })); }} className={inputClass}><option value="">Select linked status</option>{statuses.filter((status) => status.active !== false).map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label>
          <label className="mt-5 block text-sm font-bold text-gray-700">External Job Booking Message Template<select value={form.externalJobMessageTemplateId} onChange={(event) => { const template = messageTemplates.find((item) => item.id === event.target.value); setForm((current: any) => ({ ...current, externalJobMessageTemplateId: event.target.value, externalJobMessageTemplateName: template?.name || "" })); }} className={inputClass}><option value="">Select message template</option>{messageTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
          <div className="mt-5 space-y-3">
            {[
              ["communicationEmail", "Allow email communication"],
              ["sendPurchaseOrders", "Send purchase orders"],
              ["sendRemittances", "Send remittance notifications"],
              ["sendOrderUpdates", "Send order and delivery updates"],
            ].map(([field, label]) => <label key={field} className="flex items-center justify-between rounded-xl border border-gray-200 p-3 text-sm font-bold"><span>{label}</span><input type="checkbox" checked={form[field] === true} onChange={(event) => setField(field, event.target.checked)} className="h-5 w-5" /></label>)}
          </div>
          {form.sendOrderUpdates === true && <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
            <div className="flex items-center justify-between gap-3"><div><h3 className="font-black">Timed Order & Delivery Messages</h3><p className="mt-1 text-xs text-gray-500">Add multiple messages triggered after a selected job status change.</p></div><button type="button" onClick={addUpdateMessage} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Add Message</button></div>
            <div className="mt-4 space-y-3">{(form.orderDeliveryUpdateMessages || []).map((message: any, index: number) => <div key={message.id} className="rounded-xl border bg-white p-3">
              <div className="mb-3 flex items-center justify-between"><strong className="text-sm">Message {index + 1}</strong><button type="button" onClick={() => removeUpdateMessage(message.id)} className="text-xs font-bold text-red-600">Remove</button></div>
              <label className="block text-xs font-bold text-gray-600">After status changes to<select value={message.statusId} onChange={(event) => { const status = statuses.find((item) => item.id === event.target.value); updateMessage(message.id, { statusId: event.target.value, statusName: status?.name || "" }); }} className={inputClass}><option value="">Select status</option>{statuses.filter((status) => status.active !== false).map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label>
              <label className="mt-3 block text-xs font-bold text-gray-600">Message template<select value={message.templateId} onChange={(event) => { const template = messageTemplates.find((item) => item.id === event.target.value); updateMessage(message.id, { templateId: event.target.value, templateName: template?.name || "" }); }} className={inputClass}><option value="">Select template</option>{messageTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
              <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-bold text-gray-600">Send after<input type="number" min="0" value={message.delayValue} onChange={(event) => updateMessage(message.id, { delayValue: Math.max(0, Number(event.target.value) || 0) })} className={inputClass} /></label><label className="text-xs font-bold text-gray-600">Time unit<select value={message.delayUnit} onChange={(event) => updateMessage(message.id, { delayUnit: event.target.value })} className={inputClass}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label></div>
            </div>)}</div>
          </div>}
          <label className="mt-5 block text-sm font-bold text-gray-700">Communication Notes<textarea rows={3} value={form.communicationNotes} onChange={(event) => setField("communicationNotes", event.target.value)} className={inputClass} placeholder="Accounts contact, preferred times, special instructions…" /></label>
        </section>
      </div>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Communication History</h2><p className="mt-1 text-sm text-gray-500">Messages recorded against this supplier</p></div><span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold">{communications.length}</span></div>
        {communications.length === 0 ? <div className="mt-5 rounded-2xl border-2 border-dashed p-10 text-center text-gray-500">No supplier communication has been sent yet.</div> : <div className="mt-5 overflow-hidden rounded-2xl border">{communications.map((message) => <details key={message.id} className="border-b last:border-b-0"><summary className="grid cursor-pointer grid-cols-[1fr_auto] gap-3 px-4 py-3 hover:bg-gray-50"><span className="truncate font-bold">{message.subject || message.communicationName || "Supplier message"}</span><span className="text-xs text-gray-400">{message.createdAt?.toDate?.() ? formatDateTime24(message.createdAt.toDate()) : "Pending"}</span></summary><div className="border-t bg-gray-50 px-4 py-4 text-sm"><p className="whitespace-pre-wrap">{String(message.body || "No message body recorded").replace(/<[^>]*>/g, " ")}</p><p className="mt-3 text-xs text-gray-500">Status: {message.status || message.state || "pending"}</p></div></details>)}</div>}
      </section>
    </div>
  </main>;
}
