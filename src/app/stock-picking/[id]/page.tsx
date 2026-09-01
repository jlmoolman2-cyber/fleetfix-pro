"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDoc, collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import { hasPrivilegedRole } from "@/lib/accessControl";
import StockSlipDocument from "@/components/inventory/StockSlipDocument";
import UserAvatar from "@/components/shared/UserAvatar";

const auditTimestamp = (value: any) => value?.toDate?.()?.toLocaleString?.("en-ZA") || (value instanceof Date ? value.toLocaleString("en-ZA") : value ? new Date(value).toLocaleString("en-ZA") : "Timestamp not recorded");

export default function StockPickingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [request, setRequest] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [signature, setSignature] = useState("");
  const [varianceReason, setVarianceReason] = useState("");
  const [canPick, setCanPick] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slipHistory, setSlipHistory] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const currentUser = getAuth().currentUser;
      const [requestSnapshot, globalUserSnapshot, companyUserSnapshot] = await Promise.all([
        getDoc(doc(clientDb, "companies", COMPANY_ID, "partsRequests", id)),
        currentUser ? getDoc(doc(clientDb, "users", currentUser.uid)) : Promise.resolve(null),
        currentUser ? getDoc(doc(clientDb, "companies", COMPANY_ID, "users", currentUser.uid)) : Promise.resolve(null),
      ]);
      if (!requestSnapshot.exists()) return;
      const data = { id: requestSnapshot.id, ...requestSnapshot.data() } as any;
      const user = { ...(globalUserSnapshot?.exists() ? globalUserSnapshot.data() : {}), ...(companyUserSnapshot?.exists() ? companyUserSnapshot.data() : {}) } as any;
      setCanPick(user.permissions?.["Pick and issue requested stock"] === true || hasPrivilegedRole(user.primaryRole || user.role));
      setRequest(data);
      setItems((data.items || []).map((item: any) => ({ ...item, pickedQty: Number(item.pickedQty || 0), issuedQty: Number(item.issuedQty || 0) })));
      setSignature(data.signedByName || "");
      setVarianceReason(data.quantityVarianceReason || "");
    }
    void load();
  }, [id]);

  useEffect(() => onSnapshot(collection(clientDb, "companies", COMPANY_ID, "partsRequests", id, "history"), (snapshot) => {
    setSlipHistory(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).sort((a: any, b: any) => Number(a.createdAt?.seconds || 0) - Number(b.createdAt?.seconds || 0)));
  }), [id]);

  function changeQty(index: number, field: "pickedQty" | "issuedQty", value: number) {
    const quantity = Math.max(0, value);
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return field === "pickedQty"
        ? { ...item, pickedQty: quantity, issuedQty: quantity }
        : { ...item, issuedQty: quantity };
    }));
  }

  async function save(signOff: boolean) {
    if (!canPick) return alert("You do not have stock-picking permission.");
    if (signOff && !signature.trim()) return alert("Enter your name to sign the picking slip.");
    const hasQuantityVariance = items.some((item) => Number(item.pickedQty) !== Number(item.requestedQty) || Number(item.issuedQty) !== Number(item.requestedQty) || Number(item.pickedQty) !== Number(item.issuedQty));
    if (hasQuantityVariance && !varianceReason.trim()) return alert("Requested, picked and issued quantities differ. Enter a reason for the quantity difference before saving.");
    setSaving(true);
    try {
      const currentUser = getAuth().currentUser;
      const inventorySettingsSnapshot = signOff
        ? await getDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "setup"))
        : null;
      const allowNegativeStock = inventorySettingsSnapshot?.exists() === true
        && inventorySettingsSnapshot.data().allowNegativeStock === true;
      const actorName = currentUser?.displayName || currentUser?.email || signature.trim() || "Authorized user";
      const previousItems = new Map((request.items || []).map((item: any) => [String(item.materialId || item.inventoryId || item.partNumber), item]));
      const historyEntries: Array<{ action: string; details: string }> = [];
      items.forEach((item: any) => {
        const previous: any = previousItems.get(String(item.materialId || item.inventoryId || item.partNumber)) || {};
        if (Number(previous.pickedQty || 0) !== Number(item.pickedQty || 0)) historyEntries.push({ action: "Picked Quantity Changed", details: `${item.partNumber || item.description}: ${Number(previous.pickedQty || 0)} → ${Number(item.pickedQty || 0)}` });
        if (Number(previous.issuedQty || 0) !== Number(item.issuedQty || 0)) historyEntries.push({ action: "Issued Quantity Changed", details: `${item.partNumber || item.description}: ${Number(previous.issuedQty || 0)} → ${Number(item.issuedQty || 0)}` });
      });
      if (String(request.quantityVarianceReason || "") !== String(hasQuantityVariance ? varianceReason.trim() : "")) historyEntries.push({ action: "Variance Reason Changed", details: hasQuantityVariance ? varianceReason.trim() : "Variance reason cleared" });
      if (!signOff && historyEntries.length === 0) historyEntries.push({ action: "Picking Progress Saved", details: "Picking slip saved without quantity changes" });
      if (signOff) historyEntries.push({ action: "Signed Off", details: `Stock picked and issued by ${signature.trim()}` });
      if (signOff) await Promise.all(items.map(async (item) => {
        if (!item.inventoryId) return;
        const inventoryRef = doc(clientDb, "companies", COMPANY_ID, "inventory", item.inventoryId);
        const movementRef = doc(collection(clientDb, "companies", COMPANY_ID, "inventory_transactions"));
        await runTransaction(clientDb, async (transaction) => {
          const inventorySnapshot = await transaction.get(inventoryRef);
          if (!inventorySnapshot.exists()) throw new Error(`Inventory item ${item.partNumber || ""} was not found.`);
          const inventory = inventorySnapshot.data();
          const locationId = item.sourceId || "MAIN";
          const issuedQty = Number(item.issuedQty || 0);
          const beforeQty = Number(inventory.warehouseStock?.[locationId] || 0);
          if (!allowNegativeStock && beforeQty < issuedQty) {
            throw new Error(`Insufficient stock for ${item.partNumber || item.description || "inventory item"}. Available: ${beforeQty.toFixed(2)}, required: ${issuedQty.toFixed(2)}.`);
          }
          const sourceType = String(item.sourceType || "").toLowerCase();
          transaction.update(inventoryRef, {
            warehouseStock: { ...(inventory.warehouseStock || {}), [locationId]: beforeQty - issuedQty },
            warehouseTotal: locationId === "MAIN" || sourceType === "warehouse" ? Number(inventory.warehouseTotal || 0) - issuedQty : Number(inventory.warehouseTotal || 0),
            vanTotal: sourceType === "rav" ? Number(inventory.vanTotal || 0) - issuedQty : Number(inventory.vanTotal || 0),
            grandTotal: Number(inventory.grandTotal || 0) - issuedQty,
            updatedAt: serverTimestamp(),
          });
          transaction.set(movementRef, { inventoryId: item.inventoryId, partNumber: item.partNumber || "", description: item.description || "", type: "OUT", qty: issuedQty, beforeQty, afterQty: beforeQty - issuedQty, locationId, locationName: item.sourceName || locationId, referenceType: "JOB", movementType: "JOB", documentNumber: request.requisitionNumber || id, referenceNumber: request.jobNumber || request.jobId, jobId: request.jobId, partsRequestId: id, userId: currentUser?.uid || "", userName: signature.trim(), createdAt: serverTimestamp() });
        });
      }));
      await updateDoc(doc(clientDb, "companies", COMPANY_ID, "partsRequests", id), {
        items,
        status: signOff ? "issued" : "picking",
        pickedById: currentUser?.uid || "",
        pickedByName: currentUser?.displayName || currentUser?.email || signature.trim(),
        editedById: currentUser?.uid || "",
        editedByName: currentUser?.displayName || currentUser?.email || signature.trim() || "Authorized user",
        editedAt: serverTimestamp(),
        quantityVariance: hasQuantityVariance,
        quantityVarianceReason: hasQuantityVariance ? varianceReason.trim() : "",
        ...(signOff ? { signedById: currentUser?.uid || "", signedByName: signature.trim(), signedAt: serverTimestamp(), issuedAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      });
      await Promise.all(items.map((item) => {
        if (!item.materialId) return Promise.resolve();
        const issuedQty = Number(item.issuedQty || 0);
        return updateDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", request.jobId, "materials", item.materialId), {
          pickedQty: Number(item.pickedQty || 0),
          issuedQty,
          ...(signOff ? {
            qty: issuedQty,
            ...(Number.isFinite(Number(item.sellPrice)) ? { total: issuedQty * Number(item.sellPrice || 0) } : {}),
          } : {}),
          stockIssued: signOff,
          partsRequestId: id,
          updatedAt: serverTimestamp(),
        });
      }));
      if (signOff) await updateDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", request.jobId), { partsRequestStatus: "issued", activePartsRequestId: id, updatedAt: serverTimestamp() });
      await Promise.all(historyEntries.map((entry) => addDoc(collection(clientDb, "companies", COMPANY_ID, "partsRequests", id, "history"), { ...entry, userId: currentUser?.uid || "", userName: actorName, createdAt: serverTimestamp() })));
      setRequest((current: any) => ({ ...current, items, status: signOff ? "issued" : "picking", signedByName: signOff ? signature.trim() : current.signedByName, signedAt: signOff ? new Date() : current.signedAt, editedByName: currentUser?.displayName || currentUser?.email || signature.trim() || "Authorized user", editedAt: new Date(), quantityVariance: hasQuantityVariance, quantityVarianceReason: hasQuantityVariance ? varianceReason.trim() : "" }));
      alert(signOff ? "Picking completed. Issued quantities were updated on the job and deducted from stock." : "Picking progress saved.");
      if (signOff) router.push("/purchases?tab=requisitions");
    } catch (error) {
      console.error("Unable to save picking slip", error);
      alert(error instanceof Error ? error.message : "Unable to save the picking slip. No further changes were made.");
    } finally { setSaving(false); }
  }

  if (!request) return <main className="p-8 font-bold text-gray-500">Loading picking slip…</main>;
  const locked = request.status === "issued";
  const hasQuantityVariance = items.some((item) => Number(item.pickedQty) !== Number(item.requestedQty) || Number(item.issuedQty) !== Number(item.requestedQty) || Number(item.pickedQty) !== Number(item.issuedQty));
  const historyRows = [
    { id: "created", action: "Created", details: `Parts requisition ${request.requisitionNumber || ""} created`, userName: request.requestedByName || "FleetFix User", createdAt: request.requestedAt },
    ...slipHistory,
    ...(!slipHistory.some((entry) => entry.action === "Signed Off") && request.signedByName ? [{ id: "legacy-signed", action: "Signed Off", details: "Picking slip signed off", userName: request.signedByName, createdAt: request.signedAt }] : []),
  ];
  return <main className="min-h-screen bg-[#f4f7fb] p-4 md:p-6"><div className="mx-auto grid w-full max-w-[1800px] items-start gap-6 xl:grid-cols-[minmax(0,1152px)_minmax(320px,1fr)]"><section className="w-full rounded-3xl border bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5"><div><p className="text-xs font-black uppercase tracking-widest text-blue-600">Parts Requisition Picking Slip</p><h1 className="mt-2 text-3xl font-black">{request.requisitionNumber || "Parts Requisition"}</h1><p className="mt-1 font-bold text-gray-700">Job {request.jobNumber}</p><p className="mt-1 text-gray-500">Requested by {request.requestedByName || "FleetFix User"}</p></div><Link href={`/jobs/${request.jobId}`} className="rounded-xl border px-4 py-2 font-bold">Open Job</Link></div>
    {!canPick && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">Stock-picking permission is required to edit or sign this slip.</p>}
    <div className="mt-6 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-gray-50 text-left"><th className="p-3">Part Number</th><th className="p-3">Description</th><th className="p-3">Location</th><th className="p-3">Requested</th><th className="p-3">Picked</th><th className="p-3">Issued</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.materialId || index} className="border-b"><td className="p-3 font-black text-blue-700">{item.partNumber || "—"}</td><td className="p-3">{item.description || "—"}</td><td className="p-3">{item.sourceName || "Not selected"}</td><td className="p-3 font-bold">{item.requestedQty}</td><td className="p-3"><input type="number" min={0} disabled={!canPick || locked} value={item.pickedQty} onChange={(event) => changeQty(index, "pickedQty", Number(event.target.value))} className="w-24 rounded-lg border p-2" /></td><td className="p-3"><input type="number" min={0} disabled={!canPick || locked} value={item.issuedQty} onChange={(event) => changeQty(index, "issuedQty", Number(event.target.value))} className="w-24 rounded-lg border p-2" /></td></tr>)}</tbody></table></div>
    <div className="mt-6 rounded-2xl border p-5"><label className="font-black">Stock Picker Full Name</label><input disabled={!canPick || locked} value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Enter stock picker full name" className="mt-2 h-12 w-full rounded-xl border px-4" /><div className="mt-4 flex justify-end gap-3"><button disabled={!canPick || locked || saving} onClick={() => void save(false)} className="rounded-xl border px-5 py-3 font-bold">Save Picking Progress</button><button disabled={!canPick || locked || saving} onClick={() => void save(true)} className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-40">Pick, Issue & Complete</button></div>{locked && <p className="mt-4 font-black text-emerald-700">Stock picker: {request.signedByName} · {auditTimestamp(request.signedAt)}</p>}</div>
    {hasQuantityVariance && <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4"><p className="font-black text-amber-900">⚠ Quantity Difference</p><p className="mt-1 text-sm font-semibold text-amber-800">Requested, picked and issued quantities do not all match. A reason is required before saving or signing off.</p><label className="mt-3 block text-sm font-black text-amber-950">Reason for quantity difference *</label><textarea disabled={!canPick || locked} value={varianceReason} onChange={(event) => setVarianceReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-amber-300 bg-white p-3" placeholder="Explain the shortage, over-pick, substitution or other difference…" />{locked && !varianceReason.trim() && <p className="mt-2 font-bold text-red-700">No reason was recorded on this previously signed slip.</p>}</div>}
  </section><aside className="flex min-w-0 justify-center rounded-3xl border bg-white p-5 shadow-sm"><StockSlipDocument type="requisition" record={{ ...request, items, quantityVariance: hasQuantityVariance, quantityVarianceReason: varianceReason }} items={items} /></aside></div><section className="mx-auto mt-6 w-full max-w-[1800px] overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Audit Trail</p><h2 className="mt-0.5 text-xl font-black">Slip History</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] table-fixed text-xs"><colgroup><col className="w-[16%]" /><col className="w-[22%]" /><col className="w-[38%]" /><col className="w-[24%]" /></colgroup><thead className="border-b bg-gray-50 text-left uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-2">Timestamp</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Change / Details</th><th className="px-4 py-2">User</th></tr></thead><tbody>{historyRows.map((entry: any) => <tr key={entry.id} className="border-b last:border-b-0 hover:bg-blue-50/40"><td className="px-4 py-2 tabular-nums text-gray-500">{auditTimestamp(entry.createdAt)}</td><td className="px-4 py-2 font-black text-gray-900">{entry.action}</td><td className="px-4 py-2 text-gray-700">{entry.details || "—"}</td><td className="px-4 py-2"><div className="flex items-center gap-2"><UserAvatar user={entry.userName || "FleetFix User"} size="sm" /><span className="truncate font-bold">{entry.userName || "FleetFix User"}</span></div></td></tr>)}</tbody></table></div></section></main>;
}
