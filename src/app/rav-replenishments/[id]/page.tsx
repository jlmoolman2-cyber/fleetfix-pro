"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

export default function RavReplenishmentSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [slip, setSlip] = useState<any>(null);
  useEffect(() => { void getDoc(doc(clientDb, "companies", COMPANY_ID, "ravReplenishments", id)).then((snapshot) => { if (snapshot.exists()) setSlip({ id: snapshot.id, ...snapshot.data() }); }); }, [id]);
  if (!slip) return <main className="p-8 font-bold text-gray-500">Loading RAV replenishment slip…</main>;
  return <main className="min-h-screen bg-[#f4f7fb] p-5 md:p-8"><section className="mx-auto max-w-6xl rounded-3xl border bg-white p-6 shadow-sm"><header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5"><div><p className="text-xs font-black uppercase tracking-widest text-blue-600">RAV Stock Replenishment Slip</p><h1 className="mt-2 text-3xl font-black">{slip.replenishmentNumber}</h1><p className="mt-1 font-bold">{slip.ravName}</p><p className="text-gray-500">Created from job {slip.jobNumber}</p></div><div className="flex gap-2 print:hidden"><Link href={`/jobs/${slip.jobId}`} className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-bold">Open Job</Link><button type="button" onClick={() => window.print()} className="inline-flex h-10 w-auto shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-4 text-sm font-black text-white">Print Slip</button></div></header><div className="mt-6 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left"><tr><th className="p-3">Part Number</th><th className="p-3">Description</th><th className="p-3">Serial Number</th><th className="p-3 text-right">Replenish Qty</th></tr></thead><tbody>{(slip.items || []).map((item: any, index: number) => <tr key={item.materialId || index} className="border-b"><td className="p-3 font-black text-blue-700">{item.partNumber || "—"}</td><td className="p-3">{item.description || "—"}</td><td className="p-3 font-mono text-xs">{item.serialNumber || "—"}</td><td className="p-3 text-right font-black">{item.qty}</td></tr>)}</tbody></table></div><footer className="mt-8 grid gap-6 border-t pt-6 md:grid-cols-2"><div><p className="font-black">Prepared by</p><p>{slip.createdByName || "FleetFix User"}</p></div><div><p className="font-black">RAV assigned user</p><p>{slip.assignedUserName || "Not assigned"}</p></div></footer></section></main>;
}
