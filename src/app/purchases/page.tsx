"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import PurchaseOrdersListPage from "@/app/purchase-orders/list/page";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

type PurchaseTab = "orders" | "requisitions" | "derequisitions" | "replenishments";

export default function PurchasesPage() {
  const [activeTab, setActiveTab] = useState<PurchaseTab>("orders");
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [derequisitions, setDerequisitions] = useState<any[]>([]);
  const [replenishments, setReplenishments] = useState<any[]>([]);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab") as PurchaseTab | null;
    if (requestedTab && ["orders", "requisitions", "derequisitions", "replenishments"].includes(requestedTab)) setActiveTab(requestedTab);
    const subscribe = (name: string, setter: (rows: any[]) => void) => onSnapshot(collection(clientDb, "companies", COMPANY_ID, name), (snapshot) => setter(snapshot.docs.map((record) => ({ id: record.id, ...record.data() })).sort((a: any, b: any) => Number(b.createdAt?.seconds || b.requestedAt?.seconds || 0) - Number(a.createdAt?.seconds || a.requestedAt?.seconds || 0))));
    const unsubscribers = [subscribe("partsRequests", setRequisitions), subscribe("partsReturns", setDerequisitions), subscribe("ravReplenishments", setReplenishments)];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const tabs: Array<{ id: PurchaseTab; eyebrow: string; title: string; count?: number }> = [
    { id: "orders", eyebrow: "Purchase Orders", title: "Purchases" },
    { id: "requisitions", eyebrow: "Stock Forms", title: "Parts Requisitions", count: requisitions.length },
    { id: "derequisitions", eyebrow: "Stock Forms", title: "Parts Derequisitions", count: derequisitions.length },
    { id: "replenishments", eyebrow: "Stock Forms", title: "RAV Replenishments", count: replenishments.length },
  ];
  const selectTab = (tab: PurchaseTab) => { setActiveTab(tab); window.history.replaceState(null, "", tab === "orders" ? "/purchases" : `/purchases?tab=${tab}`); };
  const forms = activeTab === "requisitions" ? requisitions : activeTab === "derequisitions" ? derequisitions : replenishments;

  return <main className="module-list-page bg-[#f5f7fb]">
    <header className="shrink-0 border-b bg-white"><nav className="grid min-w-[980px] grid-cols-4 overflow-x-auto" aria-label="Purchase pages">{tabs.map((tab) => <button key={tab.id} type="button" onClick={() => selectTab(tab.id)} className={`border-b-4 border-r px-6 py-5 text-left transition last:border-r-0 ${activeTab === tab.id ? "border-b-blue-600 bg-blue-50/60" : "border-b-transparent bg-white hover:bg-gray-50"}`}><span className={`block text-[10px] font-black uppercase tracking-[0.2em] ${activeTab === tab.id ? "text-blue-500" : "text-gray-400"}`}>{tab.eyebrow}</span><span className={`mt-1 block text-2xl font-black ${activeTab === tab.id ? "text-blue-700" : "text-gray-900"}`}>{tab.title}{typeof tab.count === "number" ? <span className="ml-2 text-base text-gray-500">({tab.count})</span> : null}</span></button>)}</nav></header>
    {activeTab === "orders" ? <PurchaseOrdersListPage /> : <section className="module-list-content p-5 md:p-8"><div className="module-list-scroll rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[900px] text-sm"><thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500"><tr><th className="px-5 py-3">Number</th><th className="px-5 py-3">Job</th><th className="px-5 py-3">RAV / Customer</th><th className="px-5 py-3">Lines</th><th className="px-5 py-3">Quantity</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody>{forms.map((form: any) => { const href = activeTab === "requisitions" ? `/stock-picking/${form.id}` : activeTab === "derequisitions" ? `/stock-returns/${form.id}` : `/rav-replenishments/${form.id}`; const number = form.requisitionNumber || form.derequisitionNumber || form.replenishmentNumber || form.id; return <tr key={form.id} className="border-t"><td className="px-5 py-4 font-black text-blue-700">{number}</td><td className="px-5 py-4">{form.jobNumber || "—"}</td><td className="px-5 py-4">{form.ravName || form.customerName || "—"}</td><td className="px-5 py-4">{Array.isArray(form.items) ? form.items.length : 0}</td><td className="px-5 py-4">{form.totalQty ?? (form.items || []).reduce((sum: number, item: any) => sum + Number(item.requestedQty || item.returnQty || item.qty || 0), 0)}</td><td className="px-5 py-4 font-bold capitalize">{String(form.status || "open").replaceAll("_", " ")}</td><td className="px-5 py-4 text-right"><Link href={href} className="rounded-lg bg-blue-600 px-4 py-2 font-black text-white">Open Slip</Link></td></tr>; })}{forms.length === 0 && <tr><td colSpan={7} className="p-12 text-center font-bold text-gray-400">No forms found.</td></tr>}</tbody></table></div></section>}
  </main>;
}
