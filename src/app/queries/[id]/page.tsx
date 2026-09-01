"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";

import PageHeader from "@/app/components/PageHeader";
import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

export default function QueryDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [queryRecord, setQueryRecord] = useState<any>(null);

  useEffect(() => {
    getDoc(doc(clientDb, "companies", COMPANY_ID, "queries", id)).then((querySnapshot) => {
      if (querySnapshot.exists()) {
        setQueryRecord({ id: querySnapshot.id, ...querySnapshot.data() });
      }
    });
  }, [id]);

  if (!queryRecord) return <main className="p-8 font-bold text-gray-500">Loading query…</main>;

  return (
    <main className="min-h-screen bg-[#f4f7fb] p-5 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={queryRecord.subject || "Query"} subtitle="QUERY" />
        <a
          href={`/messages/compose?module=Query&documentId=${id}${queryRecord.jobId ? `&jobId=${queryRecord.jobId}` : ""}`}
          className="rounded-xl bg-emerald-600 px-6 py-3 font-black text-white"
        >
          Send
        </a>
      </div>
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="grid gap-5 md:grid-cols-3">
          <Info label="Customer" value={queryRecord.customerName} />
          <Info label="Assigned User" value={queryRecord.assignedUserName} />
          <Info label="Status" value={queryRecord.statusName || queryRecord.status} />
          <Info label="Type" value={queryRecord.queryType} />
          <Info label="Reference" value={queryRecord.referenceNumber} />
          <Info label="Linked Job" value={queryRecord.jobNumber} />
          {Object.entries(queryRecord.customFields || {}).map(([key, field]: [string, any]) => (
            <Info key={key} label={field.label || key} value={String(field.value || "")} />
          ))}
        </div>
        <div className="mt-6">
          <p className="text-xs font-black uppercase text-gray-400">Description</p>
          <p className="mt-2 whitespace-pre-wrap text-gray-800">{queryRecord.description}</p>
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase text-gray-400">{label}</p>
      <p className="mt-1 font-bold text-gray-900">{value || "—"}</p>
    </div>
  );
}
