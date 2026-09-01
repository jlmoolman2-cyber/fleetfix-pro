"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

export default function StockSlipDocument({ type, record, items, children }: { type: "requisition" | "derequisition"; record: any; items: any[]; children?: React.ReactNode }) {
  const [company, setCompany] = useState<any>({});
  const [settings, setSettings] = useState<any>({});
  useEffect(() => { Promise.all([getDoc(doc(clientDb, "companies", COMPANY_ID)), getDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "requisition_slip"))]).then(([companySnap, settingsSnap]) => { setCompany(companySnap.exists() ? companySnap.data() : {}); setSettings(settingsSnap.exists() ? settingsSnap.data() : {}); }); }, []);
  const isRequest = type === "requisition";
  const number = isRequest ? record.requisitionNumber : record.derequisitionNumber;
  const title = isRequest ? settings.requisitionTitle || "PARTS REQUISITION" : settings.derequisitionTitle || "PARTS DEREQUISITION";
  return <>
    <style jsx global>{`
      .stock-slip-paper { width: 72.1mm; max-width: 72.1mm; min-height: 40mm; margin: 0 auto; background: white; color: #111; font-family: Arial, sans-serif; font-size: ${Number(settings.fontSize || 10)}px; }
      @media print { @page { size: 80mm auto; margin: 3.95mm; } html, body { width: 80mm; margin: 0 !important; padding: 0 !important; background: white !important; } body * { visibility: hidden; } .stock-slip-paper, .stock-slip-paper * { visibility: visible; } .stock-slip-paper { position: absolute; left: 0; top: 0; width: 72.1mm; max-height: 3276mm; margin: 0; box-shadow: none !important; } .stock-slip-no-print { display: none !important; } }
    `}</style>
    <div className="stock-slip-no-print mx-auto mb-4 flex max-w-[72.1mm] justify-end"><button type="button" onClick={() => window.print()} className="inline-flex h-10 w-auto shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-4 text-sm font-black text-white">Print Slip</button></div>
    <article className="stock-slip-paper border border-black p-[3mm] shadow-lg">
      <header className="border-b-2 border-black pb-2 text-center">
        {settings.showLogo !== false && company.logo && <img src={company.logo} alt={company.companyName || "Company logo"} className="mx-auto mb-1 max-h-12 max-w-[50mm] object-contain" />}
        <div className="text-sm font-black">{company.companyName || "FleetFix"}</div>
        {settings.showCompanyAddress !== false && company.physicalAddress && <div className="whitespace-pre-line text-[9px]">{company.physicalAddress}</div>}
        {settings.showCompanyContact !== false && <div className="text-[9px]">{[company.telephone, company.email].filter(Boolean).join(" · ")}</div>}
      </header>
      <section className="py-2 text-center"><h1 className="text-sm font-black">{title}</h1><div className="font-black">{number || "Pending Number"}</div></section>
      <section className="border-y border-black py-1.5 text-[9px]">
        {settings.showJobNumber !== false && <div><b>Job:</b> {record.jobNumber || record.jobId}</div>}
        {settings.showCustomer !== false && record.customerName && <div><b>Customer:</b> {record.customerName}</div>}
        {settings.showRequestedBy !== false && <div><b>Created by:</b> {record.requestedByName || "FleetFix User"}</div>}
      </section>
      <table className="mt-2 w-full table-fixed border-collapse text-[9px]"><thead><tr className="border-y border-black"><th className="w-[24%] py-1 text-left">Part</th><th className="w-[43%] text-left">Description</th><th className="w-[11%] text-right">Req</th><th className="w-[11%] text-right">Pick</th><th className="w-[11%] text-right">Issue</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.materialId || index} className="border-b border-dotted border-gray-500 align-top"><td className="break-words py-1 font-bold">{item.partNumber || "—"}</td><td className="break-words py-1">{item.description || "—"}{item.serialNumber ? <div>S/N: {item.serialNumber}</div> : null}</td><td className="py-1 text-right">{item.requestedQty ?? item.returnQty ?? 0}</td><td className="py-1 text-right">{isRequest ? item.pickedQty ?? 0 : "—"}</td><td className="py-1 text-right">{isRequest ? item.issuedQty ?? 0 : item.receivedQty ?? 0}</td></tr>)}</tbody></table>
      {isRequest && record.quantityVariance && <div className="mt-2 border border-black p-2 text-[9px]"><div className="font-bold uppercase">Quantity variance reason</div><div className="mt-1 whitespace-pre-wrap">{record.quantityVarianceReason || "Not recorded"}</div></div>}
      {children}
      {settings.showSignature !== false && <section className="mt-4 border-t border-black pt-2"><div><b>{isRequest ? "Stock picker" : "Stock receiver"}:</b> {record.signedByName || "Not completed"}</div><div className="mt-1"><b>Completed:</b> {record.signedAt?.toDate?.()?.toLocaleString?.("en-ZA") || record.completedAt?.toDate?.()?.toLocaleString?.("en-ZA") || "Not completed"}</div></section>}
      {settings.footerText && <footer className="mt-4 border-t border-black pt-2 text-center text-[8px] whitespace-pre-line">{settings.footerText}</footer>}
    </article>
  </>;
}
