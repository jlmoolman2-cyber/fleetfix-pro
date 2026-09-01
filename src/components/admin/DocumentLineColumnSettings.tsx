"use client";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useEffect, useState } from "react";

import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

export const documentLineColumns = [
  { id: "code", label: "Code" },
  { id: "description", label: "Description" },
  { id: "quantity", label: "Quantity" },
  { id: "cost", label: "Cost" },
  { id: "markup", label: "Markup %" },
  { id: "priceExcl", label: "Price Excl" },
  { id: "priceIncl", label: "Price Incl" },
  { id: "discount", label: "Discount %" },
  { id: "taxRate", label: "Tax Rate" },
  { id: "profit", label: "Profit" },
  { id: "totalExcl", label: "Total Excl" },
  { id: "totalIncl", label: "Total Incl" },
] as const;

export const defaultDocumentLineColumnIds = documentLineColumns.map(
  (column) => column.id,
);

export default function DocumentLineColumnSettings({
  type,
}: {
  type: "quote" | "invoice";
}) {
  const [viewIds, setViewIds] = useState<string[]>(
    defaultDocumentLineColumnIds,
  );
  const [printIds, setPrintIds] = useState<string[]>(
    defaultDocumentLineColumnIds,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(
      doc(clientDb, "companies", COMPANY_ID, "documentSettings", type),
    ).then((snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      const legacyIds = Array.isArray(data.lineColumns)
        ? data.lineColumns
        : defaultDocumentLineColumnIds;
      setViewIds(
        Array.isArray(data.viewLineColumns) ? data.viewLineColumns : legacyIds,
      );
      setPrintIds(
        Array.isArray(data.printLineColumns)
          ? data.printLineColumns
          : legacyIds,
      );
    });
  }, [type]);

  async function save() {
    setSaving(true);
    try {
      await setDoc(
        doc(clientDb, "companies", COMPANY_ID, "documentSettings", type),
        {
          lineColumns: viewIds,
          viewLineColumns: viewIds,
          printLineColumns: printIds,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      alert(`${type === "quote" ? "Quote" : "Invoice"} line columns saved.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900">
            Item Detail Columns
          </h2>
          <p className="mt-1 text-gray-500">
            Choose which columns users view and which columns appear on preview
            and print.
          </p>
        </div>
        <button
          data-admin-action="true"
          onClick={save}
          disabled={saving || viewIds.length === 0 || printIds.length === 0}
          className="rounded-2xl bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Columns"}
        </button>
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
        <div className="grid grid-cols-[minmax(0,1fr)_90px_90px] bg-gray-100 px-4 py-3 text-xs font-black uppercase text-gray-500">
          <span>Column</span>
          <span className="text-center">View</span>
          <span className="text-center">Print</span>
        </div>
        {documentLineColumns.map((column) => (
          <div
            key={column.id}
            className="grid grid-cols-[minmax(0,1fr)_90px_90px] items-center border-t border-gray-200 px-4 py-3 font-bold text-gray-700 first:border-t-0"
          >
            <span>
              {column.label}
              {column.id === "description" ? " (required)" : ""}
            </span>
            <label
              className="flex cursor-pointer justify-center"
              title={`Show ${column.label} on screen`}
            >
              <input
                type="checkbox"
                checked={viewIds.includes(column.id)}
                disabled={column.id === "description"}
                onChange={(event) =>
                  setViewIds((current) =>
                    event.target.checked
                      ? [...current, column.id]
                      : current.filter((id) => id !== column.id),
                  )
                }
                className="h-5 w-5 accent-blue-600"
              />
            </label>
            <label
              className="flex cursor-pointer justify-center"
              title={`Print ${column.label}`}
            >
              <input
                type="checkbox"
                checked={printIds.includes(column.id)}
                onChange={(event) =>
                  setPrintIds((current) =>
                    event.target.checked
                      ? [...current, column.id]
                      : current.filter((id) => id !== column.id),
                  )
                }
                className="h-5 w-5 accent-purple-600"
              />
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
