"use client";

import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { clientDb } from "@/lib/firebaseClient";
import {
  auditFields,
  creationAuditFields,
} from "@/lib/audit";
import { currentUserIsAdministrator } from "@/lib/authorization";
import { resolvedStockByLocation, stockTotals } from "@/lib/inventoryStock";

interface InventoryItem {
  id: string;
  partNumber?: string;
  description?: string;
  brand?: string;
  crossReferences?: string;
  warehouseStock?: Record<string, number>;
  warehouseTotal?: number;
  vanTotal?: number;
}

interface StockLocation {
  id: string;
  name: string;
  type: "warehouse" | "rav";
}

export default function StockAdjustmentsPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [adjustment, setAdjustment] = useState(0);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(clientDb, "companies", "comp_001", "inventory"),
      (snapshot) => {
        setInventory(
          snapshot.docs.map((inventoryDoc) => ({
            id: inventoryDoc.id,
            ...(inventoryDoc.data() as Omit<InventoryItem, "id">),
          }))
        );
      }
    );

    async function loadLocations() {
      const [warehouseSnapshot, ravSnapshot, settingsSnapshot] = await Promise.all([
        getDocs(
          collection(
            clientDb,
            "companies",
            "comp_001",
            "inventory_settings",
            "setup",
            "warehouses"
          )
        ),
        getDocs(
          collection(
            clientDb,
            "companies",
            "comp_001",
            "inventory_settings",
            "setup",
            "rav"
          )
        ),
        getDoc(doc(clientDb, "companies", "comp_001", "inventory_settings", "setup")),
      ]);

      setAllowNegativeStock(settingsSnapshot.exists() && settingsSnapshot.data().allowNegativeStock === true);

      const loadedLocations: StockLocation[] = [
        ...warehouseSnapshot.docs.map((locationDoc) => ({
          id: locationDoc.id,
          name: String(locationDoc.data().name || locationDoc.id),
          type: "warehouse" as const,
        })),
        ...ravSnapshot.docs.map((locationDoc) => ({
          id: locationDoc.id,
          name: String(locationDoc.data().name || locationDoc.id),
          type: "rav" as const,
        })),
      ];

      const nextLocations =
        loadedLocations.length > 0
          ? loadedLocations
          : [{ id: "MAIN", name: "MAIN", type: "warehouse" as const }];

      setLocations(nextLocations);
      setLocationId((current) => current || nextLocations[0].id);
    }

    loadLocations();
    return () => unsubscribe();
  }, []);

  const filteredInventory = useMemo(() => {
    const normalize = (value?: string) =>
      (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const compactSearch = normalize(inventorySearch);

    if (compactSearch.length < 2) return inventory;

    const searchParts = inventorySearch
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(normalize)
      .filter((part) => part.length >= 2);

    return inventory.filter((item) =>
      [
        item.partNumber,
        item.description,
        item.brand,
        item.crossReferences,
      ]
        .map(normalize)
        .some(
          (value) =>
            value.includes(compactSearch) ||
            searchParts.some((part) => value.includes(part))
        )
    );
  }, [inventory, inventorySearch]);

  const selectedItem = inventory.find(
    (item) => item.id === selectedItemId
  );
  const resolvedStock = resolvedStockByLocation(selectedItem, locations);
  const currentQuantity = Number(resolvedStock[locationId] || 0);
  const adjustedQuantity = currentQuantity + adjustment;

  async function processAdjustment() {
    if (!(await currentUserIsAdministrator())) {
      alert("Administrator access is required for stock adjustments.");
      return;
    }
    if (!selectedItem) {
      alert("Select an inventory item");
      return;
    }
    if (!locationId) {
      alert("Select a stock location");
      return;
    }
    if (adjustment === 0) {
      alert("Enter a positive or negative adjustment");
      return;
    }
    if (!allowNegativeStock && adjustedQuantity < 0) {
      alert("The adjustment cannot reduce stock below zero");
      return;
    }
    if (!reason.trim()) {
      alert("Enter a reason for the adjustment");
      return;
    }

    try {
      setSaving(true);
      const updatedStock = {
        ...resolvedStock,
        [locationId]: adjustedQuantity,
      };
      const { warehouseTotal, vanTotal, grandTotal } = stockTotals(updatedStock, locations);

      const batch = writeBatch(clientDb);
      batch.update(
        doc(
          clientDb,
          "companies",
          "comp_001",
          "inventory",
          selectedItem.id
        ),
        {
          warehouseStock: updatedStock,
          warehouseTotal,
          vanTotal,
          grandTotal,
          updatedAt: serverTimestamp(),
          ...auditFields("ADJUST"),
        }
      );

      const transactionRef = doc(
        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_transactions"
        )
      );
      const selectedLocation = locations.find(
        (location) => location.id === locationId
      );
      batch.set(transactionRef, {
        inventoryId: selectedItem.id,
        partNumber: selectedItem.partNumber || "",
        description: selectedItem.description || "",
        type: "adjustment",
        referenceType: "ADJUSTMENT",
        movementType: "ADJUSTMENT",
        documentNumber: `ADJ-${transactionRef.id.slice(0, 8).toUpperCase()}`,
        warehouse: locationId,
        locationName: selectedLocation?.name || locationId,
        qty: Math.abs(adjustment),
        adjustment,
        beforeQty: currentQuantity,
        afterQty: adjustedQuantity,
        reference: reference.trim(),
        notes: reason.trim(),
        ...creationAuditFields(),
        lastAction: "ADJUST",
      });

      await batch.commit();
      alert("Stock adjustment processed");
      setInventorySearch("");
      setSelectedItemId("");
      setAdjustment(0);
      setReference("");
      setReason("");
    } catch (error) {
      console.error(error);
      alert("Failed to process stock adjustment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] p-6">
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
              Inventory / Stock Control
            </div>
            <h1 className="text-4xl font-black text-gray-900">
              Stock Adjustment
            </h1>
          </div>
          <Link
            href="/inventory"
            className="inline-flex h-12 items-center rounded-2xl bg-gray-200 px-5 text-sm font-bold hover:bg-gray-300"
          >
            Back
          </Link>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="grid grid-cols-1 gap-10 xl:grid-cols-3">
            <section className="space-y-6 xl:col-span-2">
              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6">
                <h2 className="mb-5 text-xl font-black text-gray-900">
                  Select Inventory
                </h2>
                <label className="mb-2 block text-sm font-bold text-gray-700">
                  Search or Select Inventory Item
                </label>
                <input
                  type="text"
                  list="adjustment-inventory-options"
                  value={inventorySearch}
                  onChange={(event) => {
                    const value = event.target.value;
                    setInventorySearch(value);
                    const match = inventory.find(
                      (item) =>
                        `${item.partNumber || ""} - ${item.description || ""}` ===
                        value
                    );
                    setSelectedItemId(match?.id || "");
                  }}
                  placeholder="Search part number, description, brand or cross references..."
                  className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5 outline-none focus:border-blue-500"
                />
                <datalist id="adjustment-inventory-options">
                  {filteredInventory.map((item) => (
                    <option
                      key={item.id}
                      value={`${item.partNumber || ""} - ${item.description || ""}`}
                    />
                  ))}
                </datalist>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6">
                <h2 className="mb-5 text-xl font-black text-gray-900">
                  Adjustment Details
                </h2>
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-gray-700">
                      Reference
                    </label>
                    <input
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-gray-700">
                      Reason *
                    </label>
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={4}
                      placeholder="Explain why stock is being adjusted"
                      className="w-full rounded-2xl border-2 border-gray-200 bg-white p-5 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">
                  Stock Location
                </label>
                <select
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                  className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5"
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">
                  Adjustment Quantity
                </label>
                <input
                  type="number"
                  value={adjustment}
                  onChange={(event) =>
                    setAdjustment(Number(event.target.value))
                  }
                  className="h-14 w-full rounded-2xl border-2 border-gray-200 px-5"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Use a positive number to add stock or a negative number to
                  remove stock.
                </p>
              </div>

              <div className="space-y-4 rounded-3xl border border-gray-200 bg-gray-50 p-6">
                <div className="flex justify-between">
                  <span className="font-bold text-gray-500">
                    Current Quantity
                  </span>
                  <span className={currentQuantity < 0 ? "font-black text-red-600" : "font-black"}>{currentQuantity.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-gray-500">Adjustment</span>
                  <span
                    className={
                      adjustment >= 0
                        ? "font-black text-green-600"
                        : "font-black text-red-600"
                    }
                  >
                    {adjustment >= 0 ? "+" : ""}
                    {adjustment.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                  <span className="text-lg font-black">New Quantity</span>
                  <span className={`text-3xl font-black ${adjustedQuantity < 0 ? "text-red-600" : "text-blue-600"}`}>
                    {adjustedQuantity.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={processAdjustment}
                disabled={saving}
                className="h-16 w-full rounded-3xl bg-blue-600 text-lg font-black text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Processing..." : "Process Adjustment"}
              </button>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
