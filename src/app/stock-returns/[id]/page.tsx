"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import { hasPrivilegedRole } from "@/lib/accessControl";
import StockSlipDocument from "@/components/inventory/StockSlipDocument";
import UserAvatar from "@/components/shared/UserAvatar";

const auditTimestamp = (value: any) => value?.toDate?.()?.toLocaleString?.("en-ZA") || (value instanceof Date ? value.toLocaleString("en-ZA") : value ? new Date(value).toLocaleString("en-ZA") : "Timestamp not recorded");

export default function DerequisitionSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [slip, setSlip] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [signature, setSignature] = useState("");
  const [canReceive, setCanReceive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slipHistory, setSlipHistory] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const currentUser = getAuth().currentUser;
      const [slipSnapshot, globalUserSnapshot, companyUserSnapshot] = await Promise.all([
        getDoc(doc(clientDb, "companies", COMPANY_ID, "partsReturns", id)),
        currentUser ? getDoc(doc(clientDb, "users", currentUser.uid)) : Promise.resolve(null),
        currentUser ? getDoc(doc(clientDb, "companies", COMPANY_ID, "users", currentUser.uid)) : Promise.resolve(null),
      ]);
      if (!slipSnapshot.exists()) return;
      const data = { id: slipSnapshot.id, ...slipSnapshot.data() } as any;
      const user = { ...(globalUserSnapshot?.exists() ? globalUserSnapshot.data() : {}), ...(companyUserSnapshot?.exists() ? companyUserSnapshot.data() : {}) } as any;
      setCanReceive(user.permissions?.["Pick and issue requested stock"] === true || hasPrivilegedRole(user.primaryRole || user.role));
      setSlip(data); setItems((data.items || []).map((item: any) => ({ ...item, receivedQty: Number(item.receivedQty ?? item.returnQty ?? 0) }))); setSignature(data.signedByName || "");
    }
    void load();
  }, [id]);

  useEffect(() => onSnapshot(collection(clientDb, "companies", COMPANY_ID, "partsReturns", id, "history"), (snapshot) => {
    setSlipHistory(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort((a: any, b: any) => Number(a.createdAt?.seconds || 0) - Number(b.createdAt?.seconds || 0)));
  }), [id]);

  async function signOff() {
    if (!canReceive) return alert("You do not have stock-picking permission.");
    if (!signature.trim()) return alert("Enter the stock receiver's full name.");
    if (items.some((item) => Number(item.receivedQty) !== Number(item.returnQty))) return alert("The full selected quantity must be received for every returned line.");
    if (!window.confirm("Complete this derequisition and return the selected materials to stock?")) return;
    setSaving(true);
    try {
      const currentUser = getAuth().currentUser;
      await Promise.all(items.map(async (item) => {
        const returnedQty = Number(item.receivedQty || 0);
        if (item.inventoryId) {
          const inventoryRef = doc(clientDb, "companies", COMPANY_ID, "inventory", item.inventoryId);
          const materialRef = doc(clientDb, "companies", COMPANY_ID, "jobs", slip.jobId, "materials", item.materialId);
          const movementRef = doc(collection(clientDb, "companies", COMPANY_ID, "inventory_transactions"));
          const serialRef = item.serialId ? doc(clientDb, "companies", COMPANY_ID, "inventory_serials", item.serialId) : null;
          await runTransaction(clientDb, async (transaction) => {
            const inventorySnapshot = await transaction.get(inventoryRef);
            if (!inventorySnapshot.exists()) throw new Error(`Inventory item ${item.partNumber || ""} was not found.`);
            const inventory = inventorySnapshot.data(); const locationId = item.sourceId || "MAIN"; const beforeQty = Number(inventory.warehouseStock?.[locationId] || 0); const sourceType = String(item.sourceType || "").toLowerCase();
            transaction.update(inventoryRef, { warehouseStock: { ...(inventory.warehouseStock || {}), [locationId]: beforeQty + returnedQty }, warehouseTotal: locationId === "MAIN" || sourceType === "warehouse" ? Number(inventory.warehouseTotal || 0) + returnedQty : Number(inventory.warehouseTotal || 0), vanTotal: sourceType === "rav" ? Number(inventory.vanTotal || 0) + returnedQty : Number(inventory.vanTotal || 0), grandTotal: Number(inventory.grandTotal || 0) + returnedQty, updatedAt: serverTimestamp() });
            transaction.set(movementRef, { inventoryId: item.inventoryId, partNumber: item.partNumber || "", description: item.description || "", type: "IN", qty: returnedQty, beforeQty, afterQty: beforeQty + returnedQty, locationId, locationName: item.sourceName || locationId, referenceType: "DEREQ", movementType: "DEREQ", documentNumber: slip.derequisitionNumber || id, referenceNumber: slip.jobNumber || slip.jobId, jobId: slip.jobId, partsReturnId: id, userId: currentUser?.uid || "", userName: signature.trim(), createdAt: serverTimestamp() });
            if (serialRef) transaction.update(serialRef, { status: "available", locationId, locationName: item.sourceName || locationId, jobId: "", jobNumber: "", returnedAt: serverTimestamp(), returnedLocationId: locationId, returnedLocationName: item.sourceName || locationId, returnReference: slip.derequisitionNumber || id, returnedById: currentUser?.uid || "", returnedByName: signature.trim(), updatedAt: serverTimestamp() });
            transaction.delete(materialRef);
          });
        } else if (item.materialId) await deleteDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", slip.jobId, "materials", item.materialId));
      }));
      await updateDoc(doc(clientDb, "companies", COMPANY_ID, "partsReturns", id), { items, status: "completed", signedById: currentUser?.uid || "", signedByName: signature.trim(), signedAt: serverTimestamp(), completedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await updateDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", slip.jobId), { partsReturnStatus: "completed", activePartsReturnId: "", updatedAt: serverTimestamp() });
      await addDoc(collection(clientDb, "companies", COMPANY_ID, "partsReturns", id, "history"), { action: "Completed", details: "Returned materials received, restored to stock and removed from the job", userId: currentUser?.uid || "", userName: signature.trim(), createdAt: serverTimestamp() });
      const completedAt = new Date();
      setSlip((current: any) => ({ ...current, status: "completed", signedByName: signature.trim(), signedAt: completedAt, completedAt }));
      alert("Derequisition completed. Returned materials were restored to stock and removed from the job.");
    } catch (error) { console.error("Unable to complete derequisition", error); alert("Unable to complete the derequisition slip."); }
    finally { setSaving(false); }
  }

  if (!slip) return <main className="p-8 font-bold text-gray-500">Loading derequisition slip…</main>;
  const completed = slip.status === "completed";
  const historyRows = [
    { id: "created", action: "Created", details: `Parts derequisition ${slip.derequisitionNumber || ""} created`, userName: slip.requestedByName || "FleetFix User", createdAt: slip.requestedAt || slip.createdAt },
    ...slipHistory,
    ...(!slipHistory.some((entry) => entry.action === "Completed") && slip.signedByName ? [{ id: "legacy-completed", action: "Completed", details: "Returned materials received and restored to stock", userName: slip.signedByName, createdAt: slip.signedAt || slip.completedAt }] : []),
  ];
  return <main className="min-h-screen bg-[#f4f7fb] p-4 md:p-6"><div className="mx-auto grid w-full max-w-[1800px] items-start gap-6 xl:grid-cols-[minmax(0,1152px)_minmax(320px,1fr)]"><section className="w-full rounded-3xl border bg-white p-6 shadow-sm"><header className="flex flex-wrap justify-between gap-4 border-b pb-5"><div><p className="text-xs font-black uppercase tracking-widest text-blue-600">Stock Derequisition Slip</p><h1 className="mt-2 text-3xl font-black">{slip.derequisitionNumber || "Parts Derequisition"}</h1><p className="mt-1 font-bold text-gray-700">Returned Materials — Job {slip.jobNumber}</p><p className="mt-1 text-gray-500">Created by {slip.requestedByName || "FleetFix User"}</p></div><Link href={`/jobs/${slip.jobId}`} className="rounded-xl border px-4 py-2 font-bold">Open Job</Link></header>
    {!canReceive && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">Stock-picking permission is required to receive and complete this return.</p>}
    <div className="mt-6 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-gray-50 text-left"><th className="p-3">Part Number</th><th className="p-3">Description</th><th className="p-3">Serial Number</th><th className="p-3">Return To</th><th className="p-3">Issued Qty</th><th className="p-3">Returned Qty</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.materialId || index} className="border-b"><td className="p-3 font-black text-blue-700">{item.partNumber || "—"}</td><td className="p-3">{item.description || "—"}</td><td className="p-3">{item.serialNumber || "—"}</td><td className="p-3">{item.sourceName || "Main Stock"}</td><td className="p-3">{item.returnQty}</td><td className="p-3"><input type="number" min={0} max={item.returnQty} disabled={!canReceive || completed} value={item.receivedQty} onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, receivedQty: Number(event.target.value) } : entry))} className="w-24 rounded-lg border p-2" /></td></tr>)}</tbody></table></div>
    <div className="mt-6 rounded-2xl border p-5"><label className="font-black">Stock Receiver Full Name</label><input disabled={!canReceive || completed} value={signature} onChange={(event) => setSignature(event.target.value)} className="mt-2 h-12 w-full rounded-xl border px-4" placeholder="Enter stock receiver full name" /><div className="mt-4 flex justify-end"><button disabled={!canReceive || completed || saving} onClick={() => void signOff()} className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-40">{saving ? "Completing…" : "Receive, Restock & Complete"}</button></div>{completed && <p className="mt-4 font-black text-emerald-700">Stock receiver: {slip.signedByName || "Not recorded"} · {(slip.signedAt?.toDate?.() || slip.signedAt || slip.completedAt?.toDate?.() || slip.completedAt) ? new Date(slip.signedAt?.toDate?.() || slip.signedAt || slip.completedAt?.toDate?.() || slip.completedAt).toLocaleString("en-ZA") : "Timestamp not recorded"}</p>}</div>
  </section><aside className="flex min-w-0 justify-center rounded-3xl border bg-white p-5 shadow-sm"><StockSlipDocument type="derequisition" record={{ ...slip, items }} items={items} /></aside></div><section className="mx-auto mt-6 w-full max-w-[1800px] overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Audit Trail</p><h2 className="mt-0.5 text-xl font-black">Slip History</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] table-fixed text-xs"><colgroup><col className="w-[16%]" /><col className="w-[22%]" /><col className="w-[38%]" /><col className="w-[24%]" /></colgroup><thead className="border-b bg-gray-50 text-left uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-2">Timestamp</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Change / Details</th><th className="px-4 py-2">User</th></tr></thead><tbody>{historyRows.map((entry: any) => <tr key={entry.id} className="border-b last:border-b-0 hover:bg-blue-50/40"><td className="px-4 py-2 tabular-nums text-gray-500">{auditTimestamp(entry.createdAt)}</td><td className="px-4 py-2 font-black text-gray-900">{entry.action}</td><td className="px-4 py-2 text-gray-700">{entry.details || "—"}</td><td className="px-4 py-2"><div className="flex items-center gap-2"><UserAvatar user={entry.userName || "FleetFix User"} size="sm" /><span className="truncate font-bold">{entry.userName || "FleetFix User"}</span></div></td></tr>)}</tbody></table></div></section></main>;
}
