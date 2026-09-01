"use client";

import Link from "next/link";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { Fragment, useEffect, useMemo, useState } from "react";
import { hasPermission } from "@/lib/accessControl";
import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";
import { effectivePermissions } from "@/lib/permissions";
import { canReceiveNotification, type NotificationPreferences } from "@/lib/notificationPreferences";

const timestamp = (input: any) => input?.toDate?.()?.toLocaleString("en-ZA") || (input ? new Date(input).toLocaleString("en-ZA") : "Pending timestamp");
const relatedJobNumber = (item: any) => item.jobNumber || item.relatedJobNumber || String(item.title || item.message || "").match(/\bFF[A-Z0-9-]*\d+\b/i)?.[0]?.toUpperCase() || "—";
const relatedJobId = (item: any) => item.jobId || item.relatedJobId || "";
const notificationTypeLabel = (type: string) => ({
  "parts-request": "Parts Requisition",
  "parts-derequisition": "Parts Derequisition",
  "rav-replenishment": "RAV Replenishment",
  "user_job_comment": "User Job Comment",
  "customer_job_comment": "Customer Job Comment",
  "customer_quote_approval": "Customer Quote Approval",
  "query_follow_up": "Query Follow-up",
}[type] || type.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
const isForUser = (item: any, userId: string) => {
  const recipientIds = Array.isArray(item.recipientIds) ? item.recipientIds : [];
  if (item.recipientId) return item.recipientId === userId;
  if (item.assignedUserId) return item.assignedUserId === userId;
  if (recipientIds.length) return recipientIds.includes(userId);
  return true;
};
const approvalState = (item: any) => item.approved === true || String(item.approvalStatus || item.documentStatus || "").toLowerCase() === "approved" ? "Approved" : "Pending";
const relatedDocuments = (item: any) => {
  const documents: Array<{ number: string; href: string }> = [];
  const add = (number: any, href = "") => {
    const value = String(number || "").trim();
    if (value && value !== "—" && !documents.some((entry) => entry.number === value)) documents.push({ number: value, href });
  };
  (Array.isArray(item.relatedDocuments) ? item.relatedDocuments : []).forEach((entry: any) => typeof entry === "string" ? add(entry, item.sourcePath || "") : add(entry.number || entry.documentNumber || entry.name, entry.href || entry.path || item.sourcePath || ""));
  [item.documentNumber, item.requisitionNumber, item.derequisitionNumber, item.purchaseOrderNumber, item.quoteNumber, item.invoiceNumber, item.grvNumber, item.stockTakeNumber].forEach((number) => add(number, item.sourcePath || ""));
  const matches = String(`${item.title || ""} ${item.message || ""}`).match(/\b(?:(?:DREQ|REQ|GRV|ST|TRF)-[A-Z0-9]+|(?:PO|QUO|QUOTE|INV)-?[0-9][A-Z0-9]*)\b/gi) || [];
  matches.forEach((number) => add(number.toUpperCase(), item.sourcePath || ""));
  return documents;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({});
  const [statusFilter, setStatusFilter] = useState<"pending" | "finalized" | "all">("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [purchaseOrderSuppliers, setPurchaseOrderSuppliers] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkFinalizing, setBulkFinalizing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(clientDb, "companies", COMPANY_ID, "notifications"), (snapshot) => setItems(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))));
    const unsubscribeUsers = onSnapshot(collection(clientDb, "companies", COMPANY_ID, "users"), (snapshot) => setUserNames(Object.fromEntries(snapshot.docs.map((entry) => { const data = entry.data(); return [entry.id, data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.email || "FleetFix User"]; }))));
    const unsubscribePurchaseOrders = onSnapshot(collection(clientDb, "companies", COMPANY_ID, "purchase_orders"), (snapshot) => setPurchaseOrderSuppliers(Object.fromEntries(snapshot.docs.map((entry) => [entry.id, String(entry.data().supplierName || entry.data().supplier || "")]))));
    const unsubscribeAuth = onAuthStateChanged(getAuth(), (user) => setCurrentUserId(user?.uid || ""));
    setSoundEnabled(window.localStorage.getItem("fleetfix-notification-sound") !== "off");
    return () => { unsubscribe(); unsubscribeUsers(); unsubscribePurchaseOrders(); unsubscribeAuth(); };
  }, []);

  useEffect(() => {
    if (!currentUserId) { setNotificationPreferences({}); return; }
    void getDoc(doc(clientDb, "companies", COMPANY_ID, "users", currentUserId)).then((snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      setPermissions(effectivePermissions(data));
      setNotificationPreferences(data.notificationPreferences || {});
    });
  }, [currentUserId]);

  const notificationTypes = useMemo(() => currentUserId ? Array.from(new Set(items.filter((item) => isForUser(item, currentUserId) && canReceiveNotification(item, notificationPreferences)).map((item) => item.type).filter(Boolean))).sort() : [], [items, currentUserId, notificationPreferences]);
  const visible = useMemo(() => {
    if (!currentUserId) return [];
    const sorted = items.filter((item) => isForUser(item, currentUserId) && canReceiveNotification(item, notificationPreferences) && (statusFilter === "all" || (statusFilter === "finalized" ? item.finalized === true : item.finalized !== true)) && (typeFilter === "all" || item.type === typeFilter)).sort((a, b) => Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0));
    const unique = new Map<string, any>();
    sorted.forEach((item) => { const key = `${item.type || "notification"}|${item.sourcePath || item.title || item.id}|${item.recipientId || item.assignedUserId || currentUserId}`; if (!unique.has(key)) unique.set(key, item); });
    return Array.from(unique.values());
  }, [items, currentUserId, notificationPreferences, statusFilter, typeFilter]);
  const canFinalize = hasPermission(permissions, "Finalize notifications");
  const canView = hasPermission(permissions, "View notifications");
  const selectable = visible.filter((item) => !item.finalized);
  const allSelected = selectable.length > 0 && selectable.every((item) => selectedIds.includes(item.id));

  async function finalize(item: any) {
    if (!canFinalize) return alert("You do not have permission to finalize notifications.");
    if (!window.confirm("Mark this notification as finalized? The source history record will remain stored.")) return;
    const user = getAuth().currentUser;
    await updateDoc(doc(clientDb, "companies", COMPANY_ID, "notifications", item.id), { status: "finalized", finalized: true, finalizedAt: serverTimestamp(), finalizedById: user?.uid || "", finalizedByName: user?.displayName || user?.email || "Authorized user" });
    setSelectedIds((current) => current.filter((id) => id !== item.id));
  }

  async function bulkFinalize() {
    if (!canFinalize) return alert("You do not have permission to finalize notifications.");
    const ids = selectedIds.filter((id) => items.some((item) => item.id === id && !item.finalized));
    if (ids.length === 0) return alert("Select at least one active notification.");
    if (!window.confirm(`Finalize ${ids.length} selected notification${ids.length === 1 ? "" : "s"}? Source history records will remain stored.`)) return;
    setBulkFinalizing(true);
    try {
      const user = getAuth().currentUser;
      const batch = writeBatch(clientDb);
      ids.forEach((id) => batch.update(doc(clientDb, "companies", COMPANY_ID, "notifications", id), { status: "finalized", finalized: true, finalizedAt: serverTimestamp(), finalizedById: user?.uid || "", finalizedByName: user?.displayName || user?.email || "Authorized user" }));
      await batch.commit();
      setSelectedIds([]);
    } catch (error) {
      console.error("Unable to bulk finalize notifications", error);
      alert("Unable to finalize the selected notifications.");
    } finally { setBulkFinalizing(false); }
  }

  if (currentUserId && !canView) return <main className="p-8"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-800">You do not have permission to view notifications.</div></main>;

  return <main className="module-list-page w-full bg-[#f5f7fb] px-3 py-5 md:px-6">
    <div className="w-full max-w-none">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Communication</p><h1 className="mt-1 text-3xl font-black">Notifications</h1><p className="mt-1 text-sm text-gray-500">Customer approvals, stock forms and job activity requiring attention.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "pending" | "finalized" | "all")} className="h-10 rounded-lg border bg-white px-3 text-sm font-bold"><option value="pending">Pending notifications</option><option value="finalized">Finalized notifications</option><option value="all">Pending & finalized</option></select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-lg border bg-white px-3 text-sm font-bold"><option value="all">All Notification Types</option>{notificationTypes.map((type) => <option key={type} value={type}>{notificationTypeLabel(String(type))}</option>)}</select>
          <label className="flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold"><input type="checkbox" checked={soundEnabled} onChange={(event) => { const enabled = event.target.checked; setSoundEnabled(enabled); window.localStorage.setItem("fleetfix-notification-sound", enabled ? "on" : "off"); window.dispatchEvent(new CustomEvent("fleetfix-notification-sound-change", { detail: enabled })); }} /> Sound</label>
          <button type="button" disabled={!canFinalize || selectedIds.length === 0 || bulkFinalizing} onClick={() => void bulkFinalize()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{bulkFinalizing ? "Finalizing…" : `Finalize Selected (${selectedIds.length})`}</button>
        </div>
      </div>
      <section className="module-list-scroll mt-4 rounded-2xl border bg-white shadow-sm">
        <table className="w-full min-w-[1450px] table-fixed text-[13px] leading-5 [font-family:Arial,Helvetica,sans-serif]">
          <colgroup><col className="w-[3%]" /><col className="w-[8%]" /><col className="w-[14%]" /><col className="w-[17%]" /><col className="w-[13%]" /><col className="w-[7%]" /><col className="w-[9%]" /><col className="w-[8%]" /><col className="w-[9%]" /><col className="w-[6%]" /><col className="w-[6%]" /></colgroup>
          <thead className="border-b bg-gray-50 text-left uppercase tracking-wider text-gray-500"><tr><th className="px-3 py-2 text-center"><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : selectable.map((item) => item.id))} disabled={selectable.length === 0} aria-label="Select all active notifications" /></th><th className="px-3 py-2">Job Number</th><th className="px-3 py-2">Notification</th><th className="px-3 py-2">Details</th><th className="px-3 py-2">Related Documents</th><th className="px-3 py-2">Approval</th><th className="px-3 py-2">Created</th><th className="px-3 py-2">Sent By</th><th className="px-3 py-2">Intended For</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
          <tbody>
            {visible.map((item) => <Fragment key={item.id}><tr className={`border-b font-normal ${item.finalized ? "bg-gray-50 text-gray-500" : "bg-white text-gray-900 hover:bg-blue-50/40"}`}>
              <td className="px-3 py-2.5 text-center"><input type="checkbox" disabled={item.finalized} checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} aria-label={`Select ${item.title || "notification"}`} /></td>
              <td className="truncate px-3 py-2.5 font-bold">{relatedJobId(item) ? <Link href={`/jobs/${relatedJobId(item)}`} className="text-blue-700 hover:underline">{relatedJobNumber(item)}</Link> : relatedJobNumber(item)}</td>
              <td className="truncate px-3 py-2.5 font-semibold text-gray-950" title={item.title}>{item.title || "Notification"}</td>
              <td className="truncate px-3 py-2.5 text-gray-800" title={item.message}>{item.message || "—"}</td>
              <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{relatedDocuments(item).length ? relatedDocuments(item).map((document) => document.href ? <Link key={document.number} href={document.href} className="font-bold text-blue-700 hover:underline">{document.number}</Link> : <span key={document.number} className="font-bold text-blue-700">{document.number}</span>) : "—"}</div></td>
              <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${approvalState(item) === "Approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{approvalState(item)}</span></td>
              <td className="px-3 py-2 tabular-nums">{timestamp(item.createdAt)}</td>
              <td className="truncate px-3 py-2" title={item.createdByName}>{item.createdByName || "System"}</td>
              <td className="truncate px-3 py-2" title={item.recipientName || item.assignedUserName || userNames[item.recipientId || item.assignedUserId]}>{item.recipientName || item.assignedUserName || userNames[item.recipientId || item.assignedUserId] || (!item.recipientId && !item.assignedUserId ? "All users" : "FleetFix User")}</td>
              <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${item.finalized ? "bg-gray-200 text-gray-600" : "bg-amber-100 text-amber-800"}`}>{item.finalized ? "Finalized" : "Active"}</span>{item.finalized && <div className="mt-1 truncate text-[10px]">{item.finalizedByName || "Authorized user"}</div>}</td>
              <td className="px-2 py-1.5 text-right"><div className="flex flex-wrap justify-end gap-1"><button type="button" onClick={() => setExpandedIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} className="inline-flex h-6 items-center justify-center rounded-md border px-2 text-[10px] font-bold leading-none text-gray-700">{expandedIds.includes(item.id) ? "Collapse" : "Details"}</button>{item.sourcePath && <Link href={item.sourcePath} className="inline-flex h-6 items-center justify-center rounded-md border px-2 text-[10px] font-bold leading-none text-blue-700">Open</Link>}{!item.finalized && <button type="button" disabled={!canFinalize} onClick={() => void finalize(item)} className="inline-flex h-6 items-center justify-center rounded-md bg-emerald-600 px-2 text-[10px] font-black leading-none text-white disabled:opacity-40">Finalize</button>}</div></td>
            </tr>
            {expandedIds.includes(item.id) && <tr className="border-b bg-blue-50/50"><td colSpan={11} className="p-4"><div className="grid gap-4 rounded-xl border border-blue-100 bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-7">
              <div className="md:col-span-2 xl:col-span-7"><p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Complete Notification</p><p className="mt-1 whitespace-pre-wrap break-words text-base font-black text-gray-950">{item.title || "Notification"}</p></div>
              <div className="md:col-span-2 xl:col-span-7"><p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Full Details</p>{item.type === "purchase_order_instructions" ? <div className="mt-2 overflow-hidden rounded-lg border bg-gray-50 text-sm"><div className="grid grid-cols-[150px_1fr] border-b px-3 py-2"><span className="font-black text-gray-600">Supplier Name:</span><span className="font-bold text-gray-950">{item.supplierName || purchaseOrderSuppliers[item.purchaseOrderId] || "—"}</span></div><div className="grid grid-cols-[150px_1fr] border-b px-3 py-2"><span className="font-black text-gray-600">Method:</span><span>{item.instructionMethod || "—"}</span></div><div className="grid grid-cols-[150px_1fr] border-b px-3 py-2"><span className="font-black text-gray-600">Payment:</span><span>{item.paymentInstruction || "—"}</span></div><div className="grid grid-cols-[150px_1fr] px-3 py-2"><span className="font-black text-gray-600">Instruction:</span><span className="font-black uppercase text-emerald-700">{item.proceedInstruction || "Proceed"}</span></div></div> : <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">{item.message || "—"}</p>}</div>
              <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Job Number</p><p className="mt-1 font-bold">{relatedJobNumber(item)}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Approval</p><p className="mt-1 font-bold">{approvalState(item)}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Created</p><p className="mt-1 font-bold">{timestamp(item.createdAt)}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Status</p><p className="mt-1 font-bold">{item.finalized ? "Finalized" : "Active"}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Sent By</p><p className="mt-1 break-words font-bold">{item.createdByName || "System"}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Intended For</p><p className="mt-1 break-words font-bold">{item.recipientName || item.assignedUserName || userNames[item.recipientId || item.assignedUserId] || "All users"}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Related Documents</p><div className="mt-1 flex flex-wrap gap-3">{relatedDocuments(item).length ? relatedDocuments(item).map((document) => document.href ? <Link key={document.number} href={document.href} className="font-black text-blue-700 hover:underline">{document.number}</Link> : <span key={document.number} className="font-black text-blue-700">{document.number}</span>) : "—"}</div></div>
            </div></td></tr>}
            </Fragment>)}
            {visible.length === 0 && <tr><td colSpan={11} className="p-10 text-center font-bold text-gray-400">No notifications match the selected filters.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  </main>;
}
