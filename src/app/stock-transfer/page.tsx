"use client";

import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
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

interface AppUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  active?: boolean;
}

export default function StockTransferPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "inventory"),
      (snapshot) =>
        setInventory(
          snapshot.docs.map((inventoryDoc) => ({
            id: inventoryDoc.id,
            ...(inventoryDoc.data() as Omit<InventoryItem, "id">),
          }))
        )
    );

    const unsubscribeUsers = onSnapshot(
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

    async function loadLocations() {
      const [warehouseSnapshot, ravSnapshot, settingsSnapshot] = await Promise.all([
        getDocs(
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "inventory_settings",
            "setup",
            "warehouses"
          )
        ),
        getDocs(
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "inventory_settings",
            "setup",
            "rav"
          )
        ),
        getDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "setup")),
      ]);

      setAllowNegativeStock(settingsSnapshot.exists() && settingsSnapshot.data().allowNegativeStock === true);

      const nextLocations: StockLocation[] = [
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

      setLocations(nextLocations);
      setFromLocationId(nextLocations[0]?.id || "");
      setToLocationId(nextLocations[1]?.id || "");
    }

    loadLocations();
    return () => {
      unsubscribe();
      unsubscribeUsers();
    };
  }, []);

  const normalize = (value?: string) =>
    (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const filteredInventory = useMemo(() => {
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
  const fromLocation = locations.find(
    (location) => location.id === fromLocationId
  );
  const toLocation = locations.find(
    (location) => location.id === toLocationId
  );
  const selectedUser = users.find(
    (user) => user.id === selectedUserId
  );
  const selectedStock = resolvedStockByLocation(selectedItem, locations);
  const availableQuantity = Number(selectedStock[fromLocationId] || 0);
  const destinationQuantity = Number(selectedStock[toLocationId] || 0);

  async function processTransfer() {
    if (!(await currentUserIsAdministrator())) {
      alert("Administrator access is required for stock transfers.");
      return;
    }
    if (!selectedItem) {
      alert("Select an inventory item");
      return;
    }
    if (!selectedUser) {
      alert("Select a user");
      return;
    }
    if (!fromLocationId || !toLocationId) {
      alert("Select the From and To locations");
      return;
    }
    if (fromLocationId === toLocationId) {
      alert("From and To locations must be different");
      return;
    }
    if (quantity <= 0) {
      alert("Quantity must be greater than zero");
      return;
    }
    if (!allowNegativeStock && quantity > availableQuantity) {
      alert(`Insufficient stock. Available: ${availableQuantity.toFixed(2)}, required: ${quantity.toFixed(2)}.`);
      return;
    }
    if (!notes.trim()) {
      alert("Enter transfer notes");
      return;
    }

    try {
      setSaving(true);
      const selectedUserName =
        selectedUser.name ||
        `${selectedUser.firstName || ""} ${
          selectedUser.lastName || ""
        }`.trim() ||
        selectedUser.email ||
        "Unknown User";
      const inventoryRef = doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "inventory",
        selectedItem.id
      );

      await runTransaction(clientDb, async (transaction) => {
        const snapshot = await transaction.get(inventoryRef);
        if (!snapshot.exists()) {
          throw new Error("Inventory item no longer exists");
        }

        const currentData = snapshot.data();
        const currentStock = resolvedStockByLocation(currentData, locations);
        const currentFromQuantity = Number(
          currentStock[fromLocationId] || 0
        );
        const currentToQuantity = Number(currentStock[toLocationId] || 0);

        if (!allowNegativeStock && currentFromQuantity < quantity) {
          throw new Error(`Insufficient stock. Available: ${currentFromQuantity.toFixed(2)}, required: ${quantity.toFixed(2)}.`);
        }

        currentStock[fromLocationId] = currentFromQuantity - quantity;
        currentStock[toLocationId] = currentToQuantity + quantity;

        const { warehouseTotal, vanTotal, grandTotal } = stockTotals(currentStock, locations);

        transaction.update(inventoryRef, {
          warehouseStock: currentStock,
          warehouseTotal,
          vanTotal,
          grandTotal,
          updatedAt: serverTimestamp(),
          lastAction: "TRANSFER",
          lastChangedById: selectedUser.id,
          lastChangedByName: selectedUserName,
          lastChangedByEmail: selectedUser.email || "",
          lastChangedAt: serverTimestamp(),
        });

        const transferData = {
          inventoryId: selectedItem.id,
          partNumber: selectedItem.partNumber || "",
          description: selectedItem.description || "",
          type: "TRANSFER",
          qty: quantity,
          fromLocationId,
          fromLocationName: fromLocation?.name || fromLocationId,
          toLocationId,
          toLocationName: toLocation?.name || toLocationId,
          beforeQty: currentFromQuantity,
          afterQty: currentFromQuantity - quantity,
          locationId: fromLocationId,
          locationName: `${fromLocation?.name || fromLocationId} → ${toLocation?.name || toLocationId}`,
          referenceType: "STOCK_TRANSFER",
          referenceNumber: notes.trim(),
          notes: notes.trim(),
          createdById: selectedUser.id,
          createdByName: selectedUserName,
          createdByEmail: selectedUser.email || "",
          createdAt: serverTimestamp(),
        };

        transaction.set(
          doc(
            collection(
              clientDb,
              "companies",
              COMPANY_ID,
              "inventory_transactions"
            )
          ),
          transferData
        );
        transaction.set(
          doc(collection(inventoryRef, "movements")),
          transferData
        );
      });

      alert("Stock transfer completed");
      setInventorySearch("");
      setSelectedItemId("");
      setSelectedUserId("");
      setQuantity(1);
      setNotes("");
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to transfer stock"
      );
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
              Stock Transfer
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
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
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
                  list="transfer-inventory-options"
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
                <datalist id="transfer-inventory-options">
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
                  Transfer Details
                </h2>
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-gray-700">
                      User Name *
                    </label>
                    <select
                      value={selectedUserId}
                      onChange={(event) =>
                        setSelectedUserId(event.target.value)
                      }
                      className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5 outline-none focus:border-blue-500"
                    >
                      <option value="">Select user</option>
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
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-gray-700">
                      Notes *
                    </label>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={5}
                      placeholder="Enter the reason or reference for this transfer"
                      className="w-full rounded-2xl border-2 border-gray-200 bg-white p-5 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">
                  From *
                </label>
                <select
                  value={fromLocationId}
                  onChange={(event) =>
                    setFromLocationId(event.target.value)
                  }
                  className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5"
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({location.type === "rav" ? "RAV" : "Warehouse"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">
                  To *
                </label>
                <select
                  value={toLocationId}
                  onChange={(event) => setToLocationId(event.target.value)}
                  className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5"
                >
                  {locations.map((location) => (
                    <option
                      key={location.id}
                      value={location.id}
                      disabled={location.id === fromLocationId}
                    >
                      {location.name} ({location.type === "rav" ? "RAV" : "Warehouse"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-gray-700">
                  Quantity *
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(Number(event.target.value))
                  }
                  className="h-14 w-full rounded-2xl border-2 border-gray-200 px-5"
                />
              </div>

              <div className="space-y-4 rounded-3xl border border-gray-200 bg-gray-50 p-6">
                <div className="flex justify-between">
                  <span className="font-bold text-gray-500">
                    Available at From
                  </span>
                  <span className={availableQuantity < 0 ? "font-black text-red-600" : "font-black"}>{availableQuantity.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-gray-500">
                    From After Transfer
                  </span>
                  <span className={`font-black ${(availableQuantity - quantity) < 0 ? "text-red-600" : "text-orange-600"}`}>
                    {(availableQuantity - quantity).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                  <span className="font-black">To After Transfer</span>
                  <span className="text-2xl font-black text-green-600">
                    {(destinationQuantity + quantity).toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={processTransfer}
                disabled={saving}
                className="h-16 w-full rounded-3xl bg-blue-600 text-lg font-black text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Transferring..." : "Transfer Stock"}
              </button>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
