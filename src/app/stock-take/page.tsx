"use client";

import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { Search } from "lucide-react";
import ModuleSearchField from "@/components/ModuleSearchField";
import { useEffect, useMemo, useState } from "react";

import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import { creationAuditFields } from "@/lib/audit";
import { formatDateTime24 } from "@/lib/dateTime";

interface InventoryItem {
  id: string;
  partNumber?: string;
  description?: string;
  category?: string;
  brand?: string;
  costPrice?: number;
}

interface StockTakeTemplate {
  id: string;
  name: string;
  itemIds: string[];
  createdBy?: string;
  createdAt?: any;
}

interface StockTake {
  id: string;
  name: string;
  status: string;
  templateName?: string;
  employee?: string;
  warehouseName?: string;
  scheduledDate?: string;
  createdBy?: string;
  createdAt?: any;
}

interface StockLocation {
  id: string;
  name: string;
  type: "warehouse" | "rav";
}

interface AppUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  active?: boolean;
}

export default function StockTakePage() {
  const [activeView, setActiveView] =
    useState<"takes" | "templates">("takes");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [templates, setTemplates] = useState<StockTakeTemplate[]>([]);
  const [stockTakes, setStockTakes] = useState<StockTake[]>([]);
  const [stockLocations, setStockLocations] =
    useState<StockLocation[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [search, setSearch] = useState("");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showStockTakeModal, setShowStockTakeModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [templateName, setTemplateName] = useState("");
  const [templateItemIds, setTemplateItemIds] = useState<string[]>([]);
  const [availableSearch, setAvailableSearch] = useState("");
  const [includedSearch, setIncludedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [minimumCost, setMinimumCost] = useState("");
  const [maximumCost, setMaximumCost] = useState("");

  const [stockTakeName, setStockTakeName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().slice(0, 16)
  );

  useEffect(() => {
    const unsubInventory = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "inventory"),
      (snapshot) =>
        setInventory(
          snapshot.docs.map((inventoryDoc) => ({
            id: inventoryDoc.id,
            ...(inventoryDoc.data() as Omit<InventoryItem, "id">),
          }))
        )
    );

    const unsubTemplates = onSnapshot(
      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "stock_take_templates"
      ),
      (snapshot) =>
        setTemplates(
          snapshot.docs.map((templateDoc) => ({
            id: templateDoc.id,
            ...(templateDoc.data() as Omit<StockTakeTemplate, "id">),
          }))
        )
    );

    const unsubStockTakes = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "stock_takes"),
      (snapshot) =>
        setStockTakes(
          snapshot.docs.map((stockTakeDoc) => ({
            id: stockTakeDoc.id,
            ...(stockTakeDoc.data() as Omit<StockTake, "id">),
          }))
        )
    );

    const unsubWarehouses = onSnapshot(
      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "inventory_settings",
        "setup",
        "warehouses"
      ),
      (snapshot) =>
        setStockLocations((current) => [
          ...current.filter((location) => location.type !== "warehouse"),
          ...snapshot.docs.map((locationDoc) => ({
            id: locationDoc.id,
            name: String(locationDoc.data().name || locationDoc.id),
            type: "warehouse" as const,
          })),
        ])
    );

    const unsubRavs = onSnapshot(
      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "inventory_settings",
        "setup",
        "rav"
      ),
      (snapshot) =>
        setStockLocations((current) => [
          ...current.filter((location) => location.type !== "rav"),
          ...snapshot.docs.map((locationDoc) => ({
            id: locationDoc.id,
            name: String(locationDoc.data().name || locationDoc.id),
            type: "rav" as const,
          })),
        ])
    );

    const unsubUsers = onSnapshot(
      collection(clientDb, "users"),
      (snapshot) =>
        setUsers(
          snapshot.docs
            .map((userDoc) => ({
              id: userDoc.id,
              ...(userDoc.data() as Omit<AppUser, "id">),
            }))
            .filter((user) => user.active !== false)
        )
    );

    return () => {
      unsubInventory();
      unsubTemplates();
      unsubStockTakes();
      unsubWarehouses();
      unsubRavs();
      unsubUsers();
    };
  }, []);

  useEffect(() => {
    if (!selectedLocationId && stockLocations.length > 0) {
      setSelectedLocationId(stockLocations[0].id);
    }
  }, [selectedLocationId, stockLocations]);

  const normalize = (value?: string) =>
    (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const filteredStockTakes = stockTakes.filter((stockTake) => {
    const term = normalize(search);
    if (!term) return true;
    return [
      stockTake.name,
      stockTake.status,
      stockTake.templateName,
      stockTake.employee,
      stockTake.warehouseName,
    ].some((value) => normalize(value).includes(term));
  });

  const filteredTemplates = templates.filter((template) =>
    normalize(template.name).includes(normalize(search))
  );

  const availableItems = useMemo(
    () =>
      inventory.filter(
        (item) =>
          !templateItemIds.includes(item.id) &&
          (!categoryFilter || item.category === categoryFilter) &&
          (!brandFilter || item.brand === brandFilter) &&
          (minimumCost === "" ||
            Number(item.costPrice || 0) >= Number(minimumCost)) &&
          (maximumCost === "" ||
            Number(item.costPrice || 0) <= Number(maximumCost)) &&
          [item.partNumber, item.description, item.brand, item.category].some(
            (value) => normalize(value).includes(normalize(availableSearch))
          )
      ),
    [
      inventory,
      templateItemIds,
      availableSearch,
      categoryFilter,
      brandFilter,
      minimumCost,
      maximumCost,
    ]
  );

  const categories = Array.from(
    new Set(inventory.map((item) => item.category).filter(Boolean))
  ) as string[];
  const brands = Array.from(
    new Set(inventory.map((item) => item.brand).filter(Boolean))
  ) as string[];

  const includedItems = useMemo(
    () =>
      inventory.filter(
        (item) =>
          templateItemIds.includes(item.id) &&
          [item.partNumber, item.description, item.brand, item.category].some(
            (value) => normalize(value).includes(normalize(includedSearch))
          )
      ),
    [inventory, templateItemIds, includedSearch]
  );

  async function saveTemplate() {
    if (!templateName.trim()) {
      alert("Enter a template name");
      return;
    }
    if (templateItemIds.length === 0) {
      alert("Add at least one inventory item");
      return;
    }

    try {
      setSaving(true);
      await addDoc(
        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "stock_take_templates"
        ),
        {
          name: templateName.trim(),
          itemIds: templateItemIds,
          itemCount: templateItemIds.length,
          ...creationAuditFields(),
        }
      );
      setShowTemplateModal(false);
      setTemplateName("");
      setTemplateItemIds([]);
      setActiveView("templates");
    } finally {
      setSaving(false);
    }
  }

  async function saveStockTake() {
    const template = templates.find(
      (entry) => entry.id === selectedTemplateId
    );
    const selectedLocation = stockLocations.find(
      (location) => location.id === selectedLocationId
    );
    const selectedEmployee = users.find(
      (user) => user.id === selectedEmployeeId
    );
    if (!stockTakeName.trim()) {
      alert("Enter a stock take name");
      return;
    }
    if (!template) {
      alert("Select an item template");
      return;
    }
    if (!selectedLocation) {
      alert("Select a warehouse or RAV");
      return;
    }
    if (!selectedEmployee) {
      alert("Select an employee");
      return;
    }

    const employeeName =
      selectedEmployee.name ||
      `${selectedEmployee.firstName || ""} ${
        selectedEmployee.lastName || ""
      }`.trim() ||
      selectedEmployee.email ||
      "Unknown User";

    try {
      setSaving(true);
      await addDoc(
        collection(clientDb, "companies", COMPANY_ID, "stock_takes"),
        {
          name: stockTakeName.trim(),
          status: "Counting",
          templateId: template.id,
          templateName: template.name,
          itemIds: template.itemIds,
          counts: {},
          warehouseId: selectedLocation.id,
          warehouseName: selectedLocation.name,
          warehouseType: selectedLocation.type,
          employeeId: selectedEmployee.id,
          employee: employeeName,
          scheduledDate,
          ...creationAuditFields(),
        }
      );
      setShowStockTakeModal(false);
      setStockTakeName("");
      setSelectedTemplateId("");
      setSelectedEmployeeId("");
      setActiveView("takes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] p-6">
      <div className="w-full">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
              Inventory / Stock Control
            </div>
            <h1 className="text-4xl font-black text-gray-900">Stock Take</h1>
          </div>
          <button
            type="button"
            onClick={() =>
              activeView === "takes"
                ? setShowStockTakeModal(true)
                : setShowTemplateModal(true)
            }
            className="
              inline-flex
              flex-col
              h-11
              items-center
              rounded-2xl
              bg-blue-600
              px-6
              text-sm
              font-black
              leading-tight
              text-white
              shadow-sm
              hover:bg-blue-700
            "
          >
            + Add<br />{activeView === "takes" ? "Stock Take" : "Template"}
          </button>
        </div>

        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <ModuleSearchField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search stock takes..."
                className="w-80"
              />
            </div>

          </div>

          <div className="flex gap-2 border-b border-gray-200 px-5 pt-4">
            <button
              onClick={() => setActiveView("takes")}
              className={`border-b-2 px-4 py-3 text-sm font-black ${
                activeView === "takes"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500"
              }`}
            >
              Stock Takes
            </button>
            <button
              onClick={() => setActiveView("templates")}
              className={`border-b-2 px-4 py-3 text-sm font-black ${
                activeView === "templates"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500"
              }`}
            >
              Item Templates
            </button>
          </div>

          <div className="overflow-x-auto">
            {activeView === "takes" ? (
              <table className="w-full min-w-[1200px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-5 py-4">Name</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Template</th>
                    <th className="px-5 py-4">Employee</th>
                    <th className="px-5 py-4">Scheduled Date</th>
                    <th className="px-5 py-4">Warehouse</th>
                    <th className="px-5 py-4">Created By</th>
                    <th className="px-5 py-4">Created Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStockTakes.map((stockTake) => (
                    <tr
                      key={stockTake.id}
                      className="border-b border-gray-100 hover:bg-blue-50"
                    >
                      <td className="px-5 py-4 font-black text-blue-700">
                        {stockTake.name}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex min-w-36 justify-center rounded-lg bg-sky-100 px-3 py-1 text-xs font-bold text-blue-700">
                          {stockTake.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">{stockTake.templateName}</td>
                      <td className="px-5 py-4">{stockTake.employee || "—"}</td>
                      <td className="px-5 py-4">
                        {stockTake.scheduledDate
                          ? formatDateTime24(new Date(stockTake.scheduledDate))
                          : "—"}
                      </td>
                      <td className="px-5 py-4">{stockTake.warehouseName}</td>
                      <td className="px-5 py-4">{stockTake.createdBy}</td>
                      <td className="px-5 py-4">
                        {stockTake.createdAt?.toDate?.()
                          ? formatDateTime24(stockTake.createdAt.toDate())
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {filteredStockTakes.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center text-gray-400">
                        No stock takes found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-5 py-4">Name</th>
                    <th className="px-5 py-4">Items</th>
                    <th className="px-5 py-4">Created By</th>
                    <th className="px-5 py-4">Created Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map((template) => (
                    <tr
                      key={template.id}
                      className="border-b border-gray-100 hover:bg-blue-50"
                    >
                      <td className="px-5 py-4 font-black text-blue-700">
                        {template.name}
                      </td>
                      <td className="px-5 py-4">
                        {template.itemIds?.length || 0}
                      </td>
                      <td className="px-5 py-4">{template.createdBy}</td>
                      <td className="px-5 py-4">
                        {template.createdAt?.toDate?.()
                          ? formatDateTime24(template.createdAt.toDate())
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {filteredTemplates.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-16 text-center text-gray-400">
                        No item templates found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showTemplateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f5f7fb] p-6">
          <div className="mx-auto w-full max-w-6xl">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                  Stock Take / Item Templates
                </div>
                <h1 className="text-4xl font-black text-gray-900">
                  Add Item Template
                </h1>
              </div>
              <div className="flex gap-3">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gray-200 px-5 text-sm font-black text-gray-700 hover:bg-gray-300"
              >
                ← Back to Templates
              </button>
              <button
                onClick={saveTemplate}
                disabled={saving}
                className="h-12 rounded-2xl bg-blue-600 px-8 font-black text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="mb-7 rounded-3xl border border-gray-200 bg-gray-50 p-6">
              <h2 className="mb-5 text-xl font-black text-gray-900">
                Template Details
              </h2>
              <label className="mb-2 block text-sm font-bold text-gray-700">
                Stock Take Template Name *
              </label>
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Enter a descriptive template name"
                className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5 outline-none focus:border-blue-500"
              />
            </div>

            <h3 className="mb-3 text-lg font-black">
              Filter and choose Inventory Items to Include.
            </h3>
            <div className="
              mb-4
              grid
              grid-cols-1
              gap-3
              md:grid-cols-4
            ">
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-11 rounded-xl border border-gray-200 bg-white px-4"
              >
                <option value="">Category</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                value={brandFilter}
                onChange={(event) => setBrandFilter(event.target.value)}
                className="h-11 rounded-xl border border-gray-200 bg-white px-4"
              >
                <option value="">Brand / Supplier</option>
                {brands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={minimumCost}
                onChange={(event) => setMinimumCost(event.target.value)}
                placeholder="Min Cost"
                className="h-11 rounded-xl border border-gray-200 px-4"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={maximumCost}
                onChange={(event) => setMaximumCost(event.target.value)}
                placeholder="Max Cost"
                className="h-11 rounded-xl border border-gray-200 px-4"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <ItemPicker
                title={`Available Items (${availableItems.length})`}
                items={availableItems}
                search={availableSearch}
                onSearch={setAvailableSearch}
                actionLabel="+"
                onAction={(id) =>
                  setTemplateItemIds((current) => [...current, id])
                }
                onAll={() =>
                  setTemplateItemIds(inventory.map((item) => item.id))
                }
                allLabel="Add All"
              />
              <ItemPicker
                title={`Items in ${templateName || "Template"} (${includedItems.length})`}
                items={includedItems}
                search={includedSearch}
                onSearch={setIncludedSearch}
                actionLabel="−"
                onAction={(id) =>
                  setTemplateItemIds((current) =>
                    current.filter((itemId) => itemId !== id)
                  )
                }
                onAll={() => setTemplateItemIds([])}
                allLabel="Remove All"
              />
            </div>
            </div>
          </div>
        </div>
      )}

      {showStockTakeModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f5f7fb] p-6">
          <div className="mx-auto w-full max-w-4xl">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                  Stock Take / New
                </div>
                <h1 className="text-4xl font-black text-gray-900">
                  Add Stock Take
                </h1>
              </div>
              <div className="flex gap-3">
              <button
                onClick={() => setShowStockTakeModal(false)}
                className="h-12 rounded-2xl bg-gray-200 px-5 text-sm font-black text-gray-700 hover:bg-gray-300"
              >
                Back
              </button>
              <button
                onClick={saveStockTake}
                disabled={saving}
                className="h-12 rounded-2xl bg-blue-600 px-7 font-black text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Stock Take"}
              </button>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6">
              <h2 className="mb-5 text-xl font-black text-gray-900">
                Stock Take Details
              </h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
              <Field label="Stock Take Name">
                <input
                  value={stockTakeName}
                  onChange={(event) => setStockTakeName(event.target.value)}
                  placeholder="Enter a descriptive stock take name"
                  className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5 outline-none focus:border-blue-500"
                />
              </Field>
              </div>
              <Field label="Item Template">
                <select
                  value={selectedTemplateId}
                  onChange={(event) =>
                    setSelectedTemplateId(event.target.value)
                  }
                  className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5 outline-none focus:border-blue-500"
                >
                  <option value="">Select template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Warehouse / RAV">
                <select
                  value={selectedLocationId}
                  onChange={(event) =>
                    setSelectedLocationId(event.target.value)
                  }
                  className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5 outline-none focus:border-blue-500"
                >
                  <option value="">Select warehouse or RAV</option>
                  {stockLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} —{" "}
                      {location.type === "rav" ? "RAV" : "Warehouse"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Employee">
                <select
                  value={selectedEmployeeId}
                  onChange={(event) =>
                    setSelectedEmployeeId(event.target.value)
                  }
                  className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5 outline-none focus:border-blue-500"
                >
                  <option value="">Select employee</option>
                  {users.map((user) => {
                    const displayName =
                      user.name ||
                      `${user.firstName || ""} ${
                        user.lastName || ""
                      }`.trim() ||
                      user.email ||
                      "Unnamed User";

                    return (
                      <option key={user.id} value={user.id}>
                        {displayName}
                        {user.email && displayName !== user.email
                          ? ` — ${user.email}`
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field label="Scheduled Date">
                <input
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.target.value)}
                  className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5 outline-none focus:border-blue-500"
                />
              </Field>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-gray-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function ItemPicker({
  title,
  items,
  search,
  onSearch,
  actionLabel,
  onAction,
  onAll,
  allLabel,
}: {
  title: string;
  items: InventoryItem[];
  search: string;
  onSearch: (value: string) => void;
  actionLabel: string;
  onAction: (id: string) => void;
  onAll: () => void;
  allLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <div className="mb-3 font-black">{title}</div>
      <div className="mb-3 flex gap-2">
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search items..."
          className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 px-4"
        />
        <button
          type="button"
          onClick={onAll}
          className="rounded-xl border border-blue-500 px-4 text-sm font-bold text-blue-700"
        >
          {allLabel}
        </button>
      </div>
      <div className="h-[430px] space-y-2 overflow-y-auto pr-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl p-3 hover:bg-gray-50"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">
                {item.description || item.partNumber}
              </div>
              <div className="text-xs text-gray-500">{item.partNumber}</div>
            </div>
            <button
              type="button"
              onClick={() => onAction(item.id)}
              className="h-9 w-9 rounded-lg border border-blue-500 text-xl font-bold text-blue-600"
            >
              {actionLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
