"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getAuth } from "firebase/auth";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp } from "firebase/firestore";

import { hasPermission, hasPrivilegedRole } from "@/lib/accessControl";
import { getAuditActor } from "@/lib/audit";
import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

export default function LinkedGrvPage() {
  const { id } = useParams<{ id: string }>();
  const [purchaseOrder, setPurchaseOrder] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      getDoc(doc(clientDb, "companies", COMPANY_ID, "purchase_orders", id)),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "inventory_transactions")),
    ]).then(([purchaseOrderSnapshot, transactionSnapshot]) => {
      if (purchaseOrderSnapshot.exists()) setPurchaseOrder({ id: purchaseOrderSnapshot.id, ...purchaseOrderSnapshot.data() });
      const linked = transactionSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).filter((item: any) => item.type === "grv" && item.purchaseOrderId === id).sort((a: any, b: any) => Number(a.createdAt?.seconds || 0) - Number(b.createdAt?.seconds || 0));
      setTransactions(linked);
      setEditedQuantities(Object.fromEntries(linked.map((item: any) => [item.id, Number(item.qty || 0)])));
    }).finally(() => setLoading(false));
    const user = getAuth().currentUser;
    if (user) Promise.all([getDoc(doc(clientDb, "companies", COMPANY_ID, "users", user.uid)), getDoc(doc(clientDb, "users", user.uid))]).then(([companyUser, globalUser]) => {
      const data = { ...(globalUser.data() || {}), ...(companyUser.data() || {}) } as any;
      setCanEdit(hasPrivilegedRole(data.primaryRole || data.role) || hasPermission(data.permissions, "Edit GRVs"));
    });
  }, [id]);

  async function saveChanges() {
    const changed = transactions.filter((item) => Number(editedQuantities[item.id]) !== Number(item.qty || 0));
    if (!changed.length) return setEditing(false);
    if (changed.some((item) => !Number.isFinite(Number(editedQuantities[item.id])) || Number(editedQuantities[item.id]) < 0)) return alert("GRV quantities cannot be negative.");
    if (!confirm("Save GRV quantity changes? Inventory stock and purchase-order receipt totals will be adjusted.")) return;
    setSaving(true);
    try {
      const actor = getAuditActor();
      await runTransaction(clientDb, async (transaction) => {
        const purchaseOrderRef = doc(clientDb, "companies", COMPANY_ID, "purchase_orders", id);
        const purchaseOrderSnapshot = await transaction.get(purchaseOrderRef);
        if (!purchaseOrderSnapshot.exists()) throw new Error("Purchase order not found.");
        const stockChanges = Array.from(changed.reduce((map, item) => {
          const location = item.warehouse || item.locationId || "MAIN";
          const key = `${item.inventoryId}:${location}`;
          const existing = map.get(key) || { inventoryId: item.inventoryId, location, partNumber: item.partNumber, difference: 0 };
          existing.difference += Number(editedQuantities[item.id] || 0) - Number(item.qty || 0);
          map.set(key, existing);
          return map;
        }, new Map<string, { inventoryId: string; location: string; partNumber: string; difference: number }>()).values()) as Array<{ inventoryId: string; location: string; partNumber: string; difference: number }>;
        const inventoryRefs = stockChanges.map((item) => doc(clientDb, "companies", COMPANY_ID, "inventory", item.inventoryId));
        const inventorySnapshots = await Promise.all(inventoryRefs.map((itemRef) => transaction.get(itemRef)));
        stockChanges.forEach((item, index) => {
          const inventorySnapshot = inventorySnapshots[index];
          if (!inventorySnapshot.exists()) throw new Error(`Inventory item ${item.partNumber || item.inventoryId} not found.`);
          const inventory = inventorySnapshot.data();
          const warehouseStock = { ...(inventory.warehouseStock || {}) };
          const locationQty = Number(warehouseStock[item.location] || 0) + item.difference;
          if (locationQty < 0) throw new Error(`Insufficient ${item.location} stock to reduce ${item.partNumber || "this item"}.`);
          warehouseStock[item.location] = locationQty;
          transaction.update(inventoryRefs[index], { warehouseStock, warehouseTotal: Number(inventory.warehouseTotal || 0) + item.difference, grandTotal: Number(inventory.grandTotal || 0) + item.difference, updatedAt: serverTimestamp(), lastChangedById: actor.userId, lastChangedByName: actor.userName });
        });
        changed.forEach((item) => {
          const newQty = Number(editedQuantities[item.id] || 0);
          transaction.update(doc(clientDb, "companies", COMPANY_ID, "inventory_transactions", item.id), { qty: newQty, editedAt: serverTimestamp(), editedById: actor.userId, editedByName: actor.userName });
        });
        const finalTransactions = transactions.map((item) => ({ ...item, qty: editedQuantities[item.id] ?? item.qty }));
        const receivedQuantities: Record<string, number> = {};
        finalTransactions.forEach((item) => { const key = item.inventoryId || item.partNumber; receivedQuantities[key] = Number(receivedQuantities[key] || 0) + Number(item.qty || 0); });
        const purchaseOrder = purchaseOrderSnapshot.data();
        const orderedLines = (purchaseOrder.lines || []).filter((line: any) => (line.lineType || "item") !== "description");
        const fullyReceived = orderedLines.length > 0 && orderedLines.every((line: any) => Number(receivedQuantities[line.inventoryId || line.code || line.partNumber] || 0) >= Number(line.qty || line.quantity || 0));
        transaction.update(purchaseOrderRef, { receivedQuantities, receivedQty: Object.values(receivedQuantities).reduce((sum, qty) => sum + qty, 0), status: fullyReceived ? "closed" : "open", receiptStatus: fullyReceived ? "fully_received" : "partial_received", fullyReceived, partiallyReceived: !fullyReceived, updatedAt: serverTimestamp(), lastChangedById: actor.userId, lastChangedByName: actor.userName });
        transaction.set(doc(collection(purchaseOrderRef, "history")), { action: "GRV_EDITED", details: "Linked GRV quantities edited; inventory and receipt totals recalculated.", status: fullyReceived ? "closed" : "open", userId: actor.userId, userName: actor.userName, userEmail: actor.userEmail, createdAt: serverTimestamp() });
      });
      setTransactions((current) => current.map((item) => ({ ...item, qty: editedQuantities[item.id] ?? item.qty })));
      setEditing(false);
    } catch (error) { alert(error instanceof Error ? error.message : "GRV changes could not be saved."); } finally { setSaving(false); }
  }

  const totalQuantity = useMemo(() => transactions.reduce((total, item) => total + Number(item.qty || 0), 0), [transactions]);
  const totalValue = useMemo(() => transactions.reduce((total, item) => total + Number(item.qty || 0) * Number(item.costPrice || 0), 0), [transactions]);
  const receiptNumber = purchaseOrder?.grvNumber || `GRV-${purchaseOrder?.purchaseOrderNumber || id.slice(0, 8).toUpperCase()}`;

  if (loading) return <main className="p-8 font-bold text-gray-500">Loading linked GRV…</main>;
  return <main className="min-h-screen bg-[#f4f7fb] p-5 md:p-8"><div className="mx-auto max-w-6xl"><header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Goods Received</p><h1 className="mt-2 text-4xl font-black">{receiptNumber}</h1></div><div className="flex gap-2 print:hidden">{canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className="rounded-xl bg-amber-500 px-5 py-3 font-black text-white">Edit GRV</button>}{editing && <><button type="button" onClick={() => { setEditing(false); setEditedQuantities(Object.fromEntries(transactions.map((item) => [item.id, Number(item.qty || 0)]))); }} className="rounded-xl border px-5 py-3 font-bold">Cancel</button><button disabled={saving} type="button" onClick={() => void saveChanges()} className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save GRV"}</button></>}<button type="button" onClick={() => window.print()} className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white">Print / PDF</button></div></header>
    <section className="rounded-3xl border bg-white p-6 shadow-sm"><div className="grid gap-5 md:grid-cols-4"><Info label="Purchase Order" value={purchaseOrder?.purchaseOrderNumber || id} /><Info label="Supplier" value={purchaseOrder?.supplier || transactions[0]?.supplierName} /><Info label="Reference" value={purchaseOrder?.referenceNumber || transactions[0]?.reference} /><Info label="Stock Location" value={transactions[0]?.warehouse || "—"} /></div></section>
    <section className="mt-5 overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-xl font-black">Received Items</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-5 py-3 text-left">Part Number</th><th className="px-5 py-3 text-left">Description</th><th className="px-5 py-3 text-right">Quantity</th><th className="px-5 py-3 text-right">Cost</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3 text-left">Received</th><th className="px-5 py-3 text-left">User</th></tr></thead><tbody>{transactions.map((item) => <tr key={item.id} className="border-t"><td className="px-5 py-4 font-black">{item.partNumber || "—"}</td><td className="px-5 py-4">{item.description || "—"}</td><td className="px-5 py-4 text-right">{editing ? <input type="number" min="0" step="1" value={editedQuantities[item.id] ?? 0} onChange={(event) => setEditedQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))} className="w-24 rounded-lg border px-3 py-2 text-right" /> : Number(item.qty || 0)}</td><td className="px-5 py-4 text-right">R {Number(item.costPrice || 0).toFixed(2)}</td><td className="px-5 py-4 text-right font-bold">R {(Number(editing ? editedQuantities[item.id] : item.qty || 0) * Number(item.costPrice || 0)).toFixed(2)}</td><td className="px-5 py-4">{formatDate(item.createdAt)}</td><td className="px-5 py-4">{item.editedByName || item.userName || "—"}</td></tr>)}{transactions.length === 0 && <tr><td colSpan={7} className="p-10 text-center font-bold text-gray-400">No linked GRV transactions found.</td></tr>}</tbody><tfoot className="border-t-2 bg-gray-50 font-black"><tr><td colSpan={2} className="px-5 py-4">Totals</td><td className="px-5 py-4 text-right">{totalQuantity}</td><td /><td className="px-5 py-4 text-right">R {totalValue.toFixed(2)}</td><td colSpan={2} /></tr></tfoot></table></div></section>
  </div></main>;
}

function Info({ label, value }: { label: string; value?: string }) { return <div><p className="text-xs font-black uppercase text-gray-400">{label}</p><p className="mt-1 font-bold text-gray-900">{value || "—"}</p></div>; }
function formatDate(value: any) { const date = value?.toDate?.() || (value ? new Date(value) : null); return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-ZA", { hour12: false }) : "—"; }
