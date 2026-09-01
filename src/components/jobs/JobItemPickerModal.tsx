"use client";

import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";

import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

export type JobCardItem = {
  id: string;
  inventoryId?: string;
  partNumber?: string;
  code?: string;
  description?: string;
  qty?: number;
  quantity?: number;
  sellPrice?: number;
  priceExcl?: number;
  taxRate?: number;
};

export default function JobItemPickerModal({ jobId, mode, onClose, onSelect }: {
  jobId: string;
  mode: "prompt" | "select" | null;
  onClose: () => void;
  onSelect: (items: JobCardItem[]) => void;
}) {
  const [stage, setStage] = useState<"prompt" | "select">("prompt");
  const [items, setItems] = useState<JobCardItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mode) return;
    setStage(mode);
    if (mode !== "select") return;
    void loadItems();
  }, [mode, jobId]);

  async function loadItems() {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", jobId, "materials"));
      const nextItems = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as JobCardItem));
      setItems(nextItems);
      setSelectedIds(nextItems.map((item) => item.id));
    } finally {
      setLoading(false);
    }
  }

  function showItems() {
    setStage("select");
    void loadItems();
  }

  if (!mode) return null;

  return <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="job-items-title">
    <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
      {stage === "prompt" ? <div className="p-8">
        <h2 id="job-items-title" className="text-2xl font-black">Add job items?</h2>
        <p className="mt-3 text-gray-600">Would you like to select booked items from this job card and add them to the document?</p>
        <div className="mt-8 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border px-5 py-3 font-bold">No, continue</button>
          <button type="button" onClick={showItems} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Yes, select items</button>
        </div>
      </div> : <>
        <div className="flex items-center justify-between border-b px-6 py-5">
          <div><h2 id="job-items-title" className="text-2xl font-black">Select job items</h2><p className="text-sm text-gray-500">Choose the items booked on the job card.</p></div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 font-bold text-gray-500">Close</button>
        </div>
        <div className="max-h-[55vh] overflow-auto p-6">
          {loading ? <div className="py-10 text-center font-bold text-gray-500">Loading job items…</div> : items.length === 0 ? <div className="rounded-2xl bg-gray-50 p-8 text-center text-gray-500">No items are booked on this job card.</div> : <div className="overflow-hidden rounded-2xl border">
            {items.map((item) => <label key={item.id} className="grid cursor-pointer grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b p-4 last:border-b-0 hover:bg-blue-50">
              <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} className="h-5 w-5 accent-blue-600" />
              <span><span className="block font-black">{item.description || "Unnamed item"}</span><span className="text-xs text-gray-500">{item.partNumber || item.code || "No part number"}</span></span>
              <span className="text-sm font-bold">Qty {Number(item.qty ?? item.quantity ?? 0)}</span>
              <span className="text-sm font-black">R {Number(item.sellPrice ?? item.priceExcl ?? 0).toFixed(2)}</span>
            </label>)}
          </div>}
        </div>
        <div className="flex justify-end gap-3 border-t px-6 py-5">
          <button type="button" onClick={onClose} className="rounded-xl border px-5 py-3 font-bold">Cancel</button>
          <button type="button" disabled={selectedIds.length === 0} onClick={() => onSelect(items.filter((item) => selectedIds.includes(item.id)))} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-40">Add selected items</button>
        </div>
      </>}
    </div>
  </div>;
}
