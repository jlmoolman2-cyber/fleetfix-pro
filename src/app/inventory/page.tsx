"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  RotateCcw,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";
import * as XLSX from "xlsx";
import ModuleSearchField from "@/components/ModuleSearchField";

import {
  collection,
  addDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";
import { formatDateTime24 } from "@/lib/dateTime";

import PageHeader from "@/app/components/PageHeader";
import UserAvatar, { userDisplayName } from "@/components/shared/UserAvatar";
import { COMPANY_ID } from "@/lib/company";

interface InventoryItem {

  id: string;

  imageUrl?: string;

  qrCodeUrl?: string;

  partNumber?: string;

  description?: string;

  crossReferences?: string;

  category?: string;

  brand?: string;

  warehouseTotal?: number;

  vanTotal?: number;

  grandTotal?: number;

  sellPrice?: number;

  isActive?: boolean;

  lastChangedByName?: string;

  lastChangedAt?: any;
  customFields?: Record<string, any>;
  [key: string]: any;
}

interface CustomFieldDefinition { id: string; label: string; type?: string; required?: boolean; }

const importFields = [
  ["partNumber", "Part Number", "text"], ["description", "Description", "text"], ["stockItemType", "Stock Item Type", "text"],
  ["crossReferences", "Cross References", "text"], ["category", "Category", "text"], ["brand", "Brand", "text"], ["unit", "Unit", "text"],
  ["barcode", "Barcode", "text"], ["costPrice", "Cost Price", "number"], ["markupPercent", "Markup %", "number"], ["sellPrice", "Sell Price", "number"],
  ["warehouseTotal", "Warehouse Stock", "number"], ["vanTotal", "Van Stock", "number"], ["grandTotal", "Total Stock", "number"],
  ["quantityTracking", "Quantity Tracking", "boolean"], ["serialNumberTracking", "Serial Number Tracking", "boolean"], ["isActive", "Status", "boolean"],
] as const;

const inventoryColumns = [
  { key: "image", label: "Image" },
  { key: "qr", label: "QR" },
  { key: "partNumber", label: "Part Number" },
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "warehouse", label: "Warehouse" },
  { key: "vans", label: "Vans" },
  { key: "total", label: "Total" },
  { key: "sellPrice", label: "Sell Price" },
  { key: "status", label: "Status" },
  { key: "lastChangedBy", label: "User" },
  { key: "lastChangedAt", label: "Last Changed" },
] as const;

type InventoryColumnKey =
  (typeof inventoryColumns)[number]["key"];

const defaultColumnOrder = inventoryColumns.map(
  (column) => column.key
);

const columnOrderStorageKey =
  "fleetfix.inventory.columnOrder";

export default function InventoryPage() {

  const [inventory, setInventory] =
    useState<InventoryItem[]>([]);
  const [userProfiles, setUserProfiles] = useState<any[]>([]);

  const [search, setSearch] =
    useState("");

  const [columnOrder, setColumnOrder] =
    useState<InventoryColumnKey[]>(defaultColumnOrder);

  const [hiddenColumns, setHiddenColumns] =
    useState<InventoryColumnKey[]>([]);
  const [sort, setSort] = useState<{ key: InventoryColumnKey; direction: "asc" | "desc" }>({ key: "partNumber", direction: "asc" });
  const [columnWidths, setColumnWidths] = useState<Partial<Record<InventoryColumnKey, number>>>({});
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Record<string, any>[]>([]);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [showInventoryActions, setShowInventoryActions] = useState(false);

  useEffect(() => {
    Promise.all([
      getDocs(collection(clientDb, "users")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "users")),
    ]).then(([globalUsers, companyUsers]) => {
      const profiles = new Map<string, any>();
      globalUsers.docs.forEach((entry) => profiles.set(entry.id, { id: entry.id, ...entry.data() }));
      companyUsers.docs.forEach((entry) => profiles.set(entry.id, { ...profiles.get(entry.id), id: entry.id, ...entry.data() }));
      setUserProfiles([...profiles.values()]);
    }).catch((error) => console.error("Unable to load inventory user avatar colours", error));
  }, []);

  useEffect(() => {
    const storedOrder = window.localStorage.getItem(
      columnOrderStorageKey
    );

    if (storedOrder) {
      try {
        const parsedOrder = JSON.parse(storedOrder);
        const isValidOrder =
          Array.isArray(parsedOrder) &&
          parsedOrder.length === defaultColumnOrder.length &&
          defaultColumnOrder.every((key) =>
            parsedOrder.includes(key)
          );

        if (isValidOrder) {
          setColumnOrder(parsedOrder);
        }
      } catch {
        window.localStorage.removeItem(
          columnOrderStorageKey
        );
      }
    }

    try {
      const storedHiddenColumns = JSON.parse(
        window.localStorage.getItem(
          `${columnOrderStorageKey}.hidden`
        ) || "[]"
      );
      if (Array.isArray(storedHiddenColumns)) {
        setHiddenColumns(
          storedHiddenColumns.filter((key) =>
            defaultColumnOrder.includes(key)
          )
        );
      }
    } catch {
      window.localStorage.removeItem(
        `${columnOrderStorageKey}.hidden`
      );
    }

    try {
      const storedWidths = JSON.parse(window.localStorage.getItem(`${columnOrderStorageKey}.widths`) || "{}");
      if (storedWidths && typeof storedWidths === "object") setColumnWidths(storedWidths);
    } catch {
      window.localStorage.removeItem(`${columnOrderStorageKey}.widths`);
    }
  }, []);

  const visibleColumnOrder = columnOrder.filter(
    (key) => !hiddenColumns.includes(key)
  );

  function toggleColumn(key: InventoryColumnKey) {
    setHiddenColumns((current) => {
      const next = current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key];

      window.localStorage.setItem(
        `${columnOrderStorageKey}.hidden`,
        JSON.stringify(next)
      );
      return next;
    });
  }

  function moveColumn(
    key: InventoryColumnKey,
    direction: -1 | 1
  ) {
    setColumnOrder((currentOrder) => {
      const currentIndex = currentOrder.indexOf(key);
      const nextIndex = currentIndex + direction;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= currentOrder.length
      ) {
        return currentOrder;
      }

      const nextOrder = [...currentOrder];
      [nextOrder[currentIndex], nextOrder[nextIndex]] = [
        nextOrder[nextIndex],
        nextOrder[currentIndex],
      ];

      window.localStorage.setItem(
        columnOrderStorageKey,
        JSON.stringify(nextOrder)
      );

      return nextOrder;
    });
  }

  function resetColumnOrder() {
    setColumnOrder(defaultColumnOrder);
    setHiddenColumns([]);
    window.localStorage.removeItem(
      columnOrderStorageKey
    );
    window.localStorage.removeItem(
      `${columnOrderStorageKey}.hidden`
    );
    setColumnWidths({});
    window.localStorage.removeItem(`${columnOrderStorageKey}.widths`);
  }

  function inventorySortValue(item: InventoryItem, key: InventoryColumnKey) {
    if (key === "image") return item.imageUrl || "";
    if (key === "qr") return item.qrCodeUrl || "";
    if (key === "warehouse") return Number(item.warehouseTotal || 0);
    if (key === "vans") return Number(item.vanTotal || 0);
    if (key === "total") return Number(item.grandTotal || 0);
    if (key === "sellPrice") return Number(item.sellPrice || 0);
    if (key === "status") return item.isActive ? "Active" : "Inactive";
    if (key === "lastChangedAt") return item.lastChangedAt?.seconds || item.lastChangedAt?.toMillis?.() || 0;
    return String(item[key] || "");
  }

  function startColumnResize(event: React.MouseEvent, key: InventoryColumnKey) {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[key] || (key === "image" || key === "qr" ? 90 : 160);
    const move = (moveEvent: MouseEvent) => setColumnWidths((current) => ({ ...current, [key]: Math.max(70, startWidth + moveEvent.clientX - startX) }));
    const stop = () => {
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", stop);
      setColumnWidths((current) => { window.localStorage.setItem(`${columnOrderStorageKey}.widths`, JSON.stringify(current)); return current; });
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", stop);
  }

  useEffect(() => {

    const unsub = onSnapshot(

      collection(
        clientDb,
        "companies",
        "comp_001",
        "inventory"
      ),

      (snapshot) => {

        const items: InventoryItem[] =

          snapshot.docs.map((doc) => {

            const data =
              doc.data();

            return {

              id:
                doc.id,

              ...data,

              imageUrl:
                data.imageUrl ||
                "https://placehold.co/80x80/png",

              qrCodeUrl:
                data.qrCodeUrl ||

                `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${data.partNumber || "UNKNOWN"}`,

              partNumber:
                data.partNumber || "",

              description:
                data.description || "",

              crossReferences:
                data.crossReferences || "",

              category:
                data.category || "",

              brand:
                data.brand || "",

              warehouseTotal:
                data.warehouseTotal || 0.00,

              vanTotal:
                data.vanTotal || 0.00,

              grandTotal:
                data.grandTotal || 0.00,

              sellPrice:
                data.sellPrice || 0.00,

              isActive:
                data.isActive ?? true,

              lastChangedByName:
                data.lastChangedByName ||
                data.createdByName ||
                "",
              lastChangedById:
                data.lastChangedById ||
                data.updatedById ||
                data.createdById ||
                "",

              lastChangedAt:
                data.lastChangedAt ||
                data.updatedAt ||
                data.createdAt ||
                null,
            };
          });

        setInventory(items);
      }
    );

    return () => unsub();

  }, []);

  useEffect(() => onSnapshot(collection(clientDb, "companies", "comp_001", "inventory_settings", "setup", "custom_fields"), (snapshot) => {
    setCustomFieldDefinitions(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<CustomFieldDefinition, "id">) })));
  }), []);

  const filteredInventory =

    inventory.filter((item) => {

      const normalizeSearchValue = (value?: string) =>
        (value || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

      const compactSearch =
        normalizeSearchValue(search);

      if (compactSearch.length < 2) {
        return true;
      }

      const searchableValues = [
        item.partNumber,
        item.description,
        item.brand,
        item.crossReferences,
      ].map(normalizeSearchValue);

      const searchParts = search
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(normalizeSearchValue)
        .filter((part) => part.length >= 2);

      return searchableValues.some(
        (value) =>
          value.includes(compactSearch) ||
          searchParts.some((part) => value.includes(part))
      );
    });

  const sortedInventory = [...filteredInventory].sort((left, right) => {
    const leftValue = inventorySortValue(left, sort.key);
    const rightValue = inventorySortValue(right, sort.key);
    const result = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? result : -result;
  });

  function exportInventory() {
    const exportFields: Array<{ label: string; value: (item: InventoryItem) => string | number }> = [
      { label: "Part Number", value: (item) => item.partNumber || "" },
      { label: "Description", value: (item) => item.description || "" },
      { label: "Stock Item Type", value: (item) => item.stockItemType || "" },
      { label: "Cross References", value: (item) => item.crossReferences || "" },
      { label: "Category", value: (item) => item.category || "" },
      { label: "Brand", value: (item) => item.brand || "" },
      { label: "Unit", value: (item) => item.unit || "" },
      { label: "Barcode", value: (item) => item.barcode || "" },
      { label: "Cost Price", value: (item) => Number(item.costPrice || 0) },
      { label: "Markup %", value: (item) => Number(item.markupPercent || 0) },
      { label: "Sell Price", value: (item) => Number(item.sellPrice || 0) },
      { label: "Warehouse Stock", value: (item) => Number(item.warehouseTotal || 0) },
      { label: "Van Stock", value: (item) => Number(item.vanTotal || 0) },
      { label: "Total Stock", value: (item) => Number(item.grandTotal || 0) },
      { label: "Quantity Tracking", value: (item) => item.quantityTracking ? "Yes" : "No" },
      { label: "Serial Number Tracking", value: (item) => item.serialNumberTracking ? "Yes" : "No" },
      { label: "Status", value: (item) => item.isActive === false ? "Inactive" : "Active" },
    ];
    const rows = sortedInventory.map((item) => {
      const row: Record<string, string | number> = Object.fromEntries(exportFields.map((field) => [field.label, field.value(item)]));
      customFieldDefinitions.forEach((field) => {
        const value = item.customFields?.[field.id];
        row[field.label] = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
      });
      return row;
    });
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [
      ...exportFields.map((field) => ({ wch: Math.min(42, Math.max(field.label.length + 2, 14)) })),
      ...customFieldDefinitions.map((field) => ({ wch: Math.min(42, Math.max(field.label.length + 2, 14)) })),
    ];
    if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Inventory");
    XLSX.writeFile(workbook, `FleetFix-Inventory-${search.trim() ? "Filtered" : "All"}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function readImportFile(file: File) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const available = [...importFields.map(([key, label]) => ({ key, label })), ...customFieldDefinitions.map((field) => ({ key: `customFields.${field.id}`, label: field.label }))];
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    setImportHeaders(headers);
    setImportRows(rows);
    setImportMapping(Object.fromEntries(headers.map((header) => [header, available.find((field) => normalize(field.key) === normalize(header) || normalize(field.label) === normalize(header))?.key || ""])));
    setShowImport(true);
  }

  async function importInventoryItems() {
    if (!Object.values(importMapping).includes("partNumber")) return alert("Map one spreadsheet column to Part Number before importing.");
    setImporting(true);
    try {
      const snapshot = await getDocs(collection(clientDb, "companies", "comp_001", "inventory"));
      const existing = new Map(snapshot.docs.map((entry) => [String(entry.data().partNumber || "").trim().toLowerCase(), entry.ref]));
      let created = 0;
      let updated = 0;
      for (const row of importRows) {
        const values: Record<string, any> = { customFields: {} };
        Object.entries(importMapping).forEach(([header, target]) => {
          if (!target) return;
          const raw = row[header];
          if (target.startsWith("customFields.")) { values.customFields[target.slice(13)] = raw; return; }
          const field = importFields.find(([key]) => key === target);
          values[target] = field?.[2] === "number" ? Number(raw || 0) : field?.[2] === "boolean" ? ["true", "yes", "1", "active"].includes(String(raw).trim().toLowerCase()) : raw;
        });
        const partNumber = String(values.partNumber || "").trim();
        if (!partNumber) continue;
        values.partNumber = partNumber;
        if (!Object.keys(values.customFields).length) delete values.customFields;
        const existingRef = existing.get(partNumber.toLowerCase());
        if (existingRef) { await updateDoc(existingRef, { ...values, updatedAt: serverTimestamp() }); updated += 1; }
        else { const createdRef = await addDoc(collection(clientDb, "companies", "comp_001", "inventory"), { ...values, isActive: values.isActive ?? true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); existing.set(partNumber.toLowerCase(), createdRef); created += 1; }
      }
      alert(`Inventory import completed. ${created} created and ${updated} updated.`);
      setShowImport(false);
      setImportRows([]);
    } catch (error) {
      console.error("Inventory import failed", error);
      alert("Inventory import failed. Check the spreadsheet mapping and try again.");
    } finally { setImporting(false); }
  }

  return (

    <div className="module-list-page bg-[#f5f7fb]">

      {showImport && <div className="fixed inset-0 z-[500] grid place-items-center bg-black/50 p-4"><section className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">Import Inventory from Excel</h2><p className="mt-1 text-sm text-gray-500">Map every spreadsheet column to an inventory field. Part Number is required.</p></div><button type="button" onClick={() => setShowImport(false)} className="rounded-xl border px-4 py-2 font-bold">Close</button></div><div className="mt-6 overflow-hidden rounded-2xl border"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left"><th className="p-3 font-black">Spreadsheet Column</th><th className="p-3 font-black">Sample Value</th><th className="p-3 font-black">Inventory Field</th></tr></thead><tbody>{importHeaders.map((header) => <tr key={header} className="border-t"><td className="p-3 font-bold">{header}</td><td className="max-w-xs truncate p-3 text-gray-500">{String(importRows[0]?.[header] ?? "")}</td><td className="p-3"><select value={importMapping[header] || ""} onChange={(event) => setImportMapping((current) => ({ ...current, [header]: event.target.value }))} className="h-10 w-full rounded-lg border px-3"><option value="">Do not import</option><optgroup label="Inventory Fields">{importFields.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</optgroup>{customFieldDefinitions.length > 0 && <optgroup label="Custom Fields">{customFieldDefinitions.map((field) => <option key={field.id} value={`customFields.${field.id}`}>{field.label}</option>)}</optgroup>}</select></td></tr>)}</tbody></table></div><div className="mt-5 flex flex-wrap items-center justify-between gap-4"><p className="text-sm font-bold text-gray-500">{importRows.length} spreadsheet row(s) ready. Existing exact part numbers will be updated.</p><div className="flex gap-3"><button type="button" onClick={() => setShowImport(false)} className="rounded-xl border px-5 py-3 font-bold">Cancel</button><button type="button" disabled={importing || importRows.length === 0 || !Object.values(importMapping).includes("partNumber")} onClick={() => void importInventoryItems()} className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-40">{importing ? "Importing…" : "Import Items"}</button></div></div></section></div>}

      <div className="module-list-content relative p-6">

        <PageHeader />

        <div className="module-list-content w-full">

          {/* ACTION BAR */}
          <div className="
            flex
            flex-wrap
            items-center
            justify-between
            gap-4
            mb-0
            md:absolute
            md:right-6
            md:top-6
          ">

            <div />

            {/* ACTION BUTTONS */}
            <div className="
              flex
              flex-wrap
              gap-3
            ">

              <Link
                href="/inventory/new"
                className="
                  inline-flex
                  flex-col
                  items-center
                  justify-center
                  bg-blue-600
                  hover:bg-blue-700
                  text-white
                  px-6
                  h-11
                  rounded-2xl
                  text-sm
                  font-black
                  leading-tight
                  transition
                "
              >
                + Add<br />Inventory
              </Link>

              <div className="relative">
                <button type="button" onClick={() => setShowInventoryActions((current) => !current)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 text-sm font-bold text-white transition hover:bg-blue-600">Inventory Actions <span aria-hidden="true">▼</span></button>
                {showInventoryActions && <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white py-2 shadow-xl">
                  <Link href="/inventory/labels" onClick={() => setShowInventoryActions(false)} className="block w-full px-5 py-3 text-left text-sm font-bold text-gray-800 hover:bg-gray-100">Print Stock Labels</Link>
                  <button type="button" onClick={() => { setShowInventoryActions(false); exportInventory(); }} className="block w-full px-5 py-3 text-left text-sm font-bold text-gray-800 hover:bg-gray-100">Export Excel ({filteredInventory.length})</button>
                  <label className="block cursor-pointer px-5 py-3 text-sm font-bold text-gray-800 hover:bg-gray-100">Import Excel<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { setShowInventoryActions(false); const file = event.target.files?.[0]; if (file) void readImportFile(file); event.target.value = ""; }} /></label>
                  <div className="my-1 border-t" />
                  <Link href="/grv" onClick={() => setShowInventoryActions(false)} className="block px-5 py-3 text-sm font-bold text-gray-800 hover:bg-gray-100">GRV</Link>
                  <Link href="/purchase-orders" onClick={() => setShowInventoryActions(false)} className="block px-5 py-3 text-sm font-bold text-gray-800 hover:bg-gray-100">Purchase Orders</Link>
                  <Link href="/stock-adjustments" onClick={() => setShowInventoryActions(false)} className="block px-5 py-3 text-sm font-bold text-gray-800 hover:bg-gray-100">Stock Adjustment</Link>
                  <Link href="/stock-transfer" onClick={() => setShowInventoryActions(false)} className="block px-5 py-3 text-sm font-bold text-gray-800 hover:bg-gray-100">Stock Transfer</Link>
                  <Link href="/stock-take" onClick={() => setShowInventoryActions(false)} className="block px-5 py-3 text-sm font-bold text-red-700 hover:bg-red-50">Stock Take</Link>
                </div>}
              </div>

            </div>

          </div>

          {/* SEARCH AND COLUMN ARRANGEMENT */}
          <div className="
            bg-white
            border
            border-gray-200
            rounded-3xl
            p-3
            shadow-sm
            mb-3
            md:absolute
            md:right-96
            md:top-6
            md:mb-0
            md:w-[420px]
            md:border-0
            md:bg-transparent
            md:p-0
            md:shadow-none
          ">

            <div className="flex items-center gap-3">
              <ModuleSearchField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search part number, description, brand or cross references..."
                className="min-w-0 flex-1"
              />

              <details className="relative">
                <summary
                  className="
                    flex
                    h-11
                    w-11
                    cursor-pointer
                    list-none
                    items-center
                    justify-center
                    rounded-2xl
                    border-2
                    border-gray-200
                    bg-white
                    text-gray-600
                    transition
                    hover:border-blue-300
                    hover:bg-blue-50
                    hover:text-blue-700
                    focus:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-blue-500
                    [&::-webkit-details-marker]:hidden
                  "
                  aria-label="Arrange inventory columns"
                  title="Arrange columns"
                >
                  <Columns3 aria-hidden="true" size={22} />
                </summary>

                <div className="
                  absolute
                  right-0
                  z-30
                  mt-2
                  w-72
                  rounded-2xl
                  border
                  border-gray-200
                  bg-white
                  p-3
                  shadow-xl
                ">
                  <div className="
                    flex
                    items-center
                    justify-between
                    px-2
                    pb-2
                  ">
                    <p className="text-sm font-black text-gray-900">
                      Arrange columns
                    </p>
                    <button
                      type="button"
                      onClick={resetColumnOrder}
                      className="
                        inline-flex
                        items-center
                        gap-1
                        rounded-lg
                        px-2
                        py-1
                        text-xs
                        font-bold
                        text-gray-500
                        hover:bg-gray-100
                        hover:text-gray-800
                      "
                    >
                      <RotateCcw size={13} aria-hidden="true" />
                      Reset
                    </button>
                  </div>

                  <ol className="space-y-1">
                    {columnOrder.map((key, index) => {
                      const column = inventoryColumns.find(
                        (item) => item.key === key
                      );

                      return (
                        <li
                          key={key}
                          className="
                            flex
                            items-center
                            gap-2
                            rounded-xl
                            bg-gray-50
                            px-3
                            py-2
                          "
                        >
                          <input
                            type="checkbox"
                            checked={!hiddenColumns.includes(key)}
                            onChange={() => toggleColumn(key)}
                            aria-label={`Show ${column?.label}`}
                            className="h-4 w-4"
                          />
                          <span className="
                            flex-1
                            text-sm
                            font-semibold
                            text-gray-700
                          ">
                            {column?.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => moveColumn(key, -1)}
                            disabled={index === 0}
                            className="
                              rounded-lg
                              p-1.5
                              text-gray-500
                              hover:bg-white
                              hover:text-blue-700
                              disabled:cursor-not-allowed
                              disabled:opacity-25
                            "
                            aria-label={`Move ${column?.label} left`}
                            title="Move left"
                          >
                            <ArrowUp size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveColumn(key, 1)}
                            disabled={
                              index === columnOrder.length - 1
                            }
                            className="
                              rounded-lg
                              p-1.5
                              text-gray-500
                              hover:bg-white
                              hover:text-blue-700
                              disabled:cursor-not-allowed
                              disabled:opacity-25
                            "
                            aria-label={`Move ${column?.label} right`}
                            title="Move right"
                          >
                            <ArrowDown size={15} aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </details>
            </div>

          </div>

          {/* TABLE */}
          <div className="
            module-list-panel
            bg-white
            border
            border-gray-200
            rounded-3xl
            overflow-hidden
            shadow-sm
          ">

            <div className="module-list-scroll">

              <table className="w-full table-fixed text-xs [&_td]:!py-1 [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td]:whitespace-nowrap">

                <colgroup>{visibleColumnOrder.map((key) => <col key={key} style={{ width: columnWidths[key] || (key === "image" || key === "qr" ? 90 : 160) }} />)}</colgroup>

                <thead>

                  <tr className="
                    bg-gray-50
                    border-b
                    border-gray-200
                    text-left
                    uppercase
                    tracking-wider
                    text-[10px]
                    text-gray-500
                  ">

                    {visibleColumnOrder.map((key) => (
                      <th
                        key={key}
                        className="relative px-4 py-3 font-black"
                      >
                        <button type="button" onClick={() => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }))} className="inline-flex max-w-full items-center gap-1 hover:text-blue-700">
                          <span className="truncate">{inventoryColumns.find((column) => column.key === key)?.label}</span>
                          <span aria-hidden="true">{sort.key === key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                        <span onMouseDown={(event) => startColumnResize(event, key)} className="absolute right-0 top-0 h-full w-3 cursor-col-resize border-r-2 border-transparent hover:border-blue-500" title="Drag to resize column" />
                      </th>
                    ))}

                  </tr>

                </thead>

                <tbody>

                  {sortedInventory.map((item) => (

                    <tr
                      key={item.id}

                      onClick={() => {
                        window.location.href =
                          `/inventory/${item.id}`;
                      }}

                      className="
                        border-b
                        border-gray-100
                        hover:bg-blue-50
                        transition
                        cursor-pointer
                        text-xs
                        font-semibold
                        text-slate-700
                      "
                    >

                      {visibleColumnOrder.map((columnKey) => {
                        switch (columnKey) {
                        case "image":
                          return (
                      <td key={columnKey} className="px-4 py-2">

                        <div className="
                          h-10
                          w-10
                          rounded-xl
                          overflow-hidden
                          border
                          border-gray-200
                          bg-white
                        ">

                          <Image
                            src={
                              item.imageUrl ||
                              "https://placehold.co/80x80/png"
                            }
                            alt="Item"
                            width={80}
                            height={80}
                            className="
                              h-full
                              w-full
                              object-cover
                            "
                          />

                        </div>

                      </td>
                          );
                        case "qr":
                          return (
                      <td key={columnKey} className="px-4 py-2">

                        <div className="
                          h-10
                          w-10
                          rounded-xl
                          overflow-hidden
                          border
                          border-gray-200
                          bg-white
                          p-1
                        ">

                          <Image
                            src={
                              item.qrCodeUrl ||
                              "https://placehold.co/80x80/png"
                            }
                            alt="QR"
                            width={80}
                            height={80}
                            className="
                              h-full
                              w-full
                              object-contain
                            "
                          />

                        </div>

                      </td>
                          );
                        case "partNumber":
                          return (
                      <td key={columnKey} className="
                        px-4
                        py-2
                        font-black
                        text-blue-600
                      ">
                        {item.partNumber}
                      </td>
                          );
                        case "description":
                          return (
                      <td key={columnKey} className="
                        px-4
                        py-2
                      ">
                        {item.description}
                      </td>
                          );
                        case "category":
                          return (
                      <td key={columnKey} className="px-4 py-2">
                        {item.category}
                      </td>
                          );
                        case "brand":
                          return (
                      <td key={columnKey} className="px-4 py-2">
                        {item.brand}
                      </td>
                          );
                        case "warehouse":
                          const warehouseQuantity = Number(item.warehouseTotal || 0);
                          return (
                      <td key={columnKey} className={`
                        px-4
                        py-2
                        ${warehouseQuantity < 0 ? "font-black text-red-600" : ""}
                      `}>
                        {warehouseQuantity.toFixed(2)}
                      </td>
                          );
                        case "vans":
                          const vanQuantity = Number(item.vanTotal || 0);
                          return (
                      <td key={columnKey} className={`
                        px-4
                        py-2
                        ${vanQuantity < 0 ? "font-black text-red-600" : ""}
                      `}>
                        {vanQuantity.toFixed(2)}
                      </td>
                          );
                        case "total":
                          const totalQuantity = Number(item.grandTotal || 0);
                          return (
                      <td key={columnKey} className={`
                        px-4
                        py-2
                        ${totalQuantity < 0 ? "font-black text-red-600" : ""}
                      `}>
                        {totalQuantity.toFixed(2)}
                      </td>
                          );
                        case "sellPrice":
                          return (
                      <td key={columnKey} className="
                        px-4
                        py-2
                      ">
                        R{" "}
                        {Number(
                          item.sellPrice || 0
                        ).toFixed(2)}
                      </td>
                          );
                        case "status":
                          return (
                      <td key={columnKey} className="px-4 py-2">

                        <div
                          className={`
                            inline-flex
                            items-center
                            px-3
                            py-1
                            rounded-full
                            text-xs
                            font-semibold

                            ${item.isActive

                              ? "bg-green-100 text-green-700"

                              : "bg-red-100 text-red-700"
                            }
                          `}
                        >

                          {
                            item.isActive
                              ? "ACTIVE"
                              : "INACTIVE"
                          }

                        </div>

                      </td>
                          );
                        case "lastChangedBy":
                          return (
                            <td
                              key={columnKey}
                              className="px-4 py-2"
                            >
                              {item.lastChangedByName ? <UserAvatar user={userProfiles.find((user) => user.id === item.lastChangedById) || userProfiles.find((user) => userDisplayName(user).toLowerCase() === String(item.lastChangedByName).toLowerCase()) || item.lastChangedByName} /> : "—"}
                            </td>
                          );
                        case "lastChangedAt":
                          return (
                            <td
                              key={columnKey}
                              className="whitespace-nowrap px-4 py-2"
                            >
                              {item.lastChangedAt?.toDate
                                ? formatDateTime24(item.lastChangedAt.toDate())
                                : "—"}
                            </td>
                          );
                        }
                      })}
                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
