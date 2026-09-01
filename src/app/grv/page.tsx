"use client";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";
import { auditFields, creationAuditFields, getAuditActor } from "@/lib/audit";

import { useEffect, useRef, useState } from "react";

interface InventoryItem {
  id: string;

  partNumber?: string;

  description?: string;

  brand?: string;

  crossReferences?: string;

  costPrice?: number;

  markupPercent?: number;

  sellPrice?: number;

  warehouseStock?: {
    [key: string]: number;
  };
  serialNumberTracking?: boolean;
}

interface GRVLine {
  inventoryId: string;
  inventorySearch?: string;
  partNumber: string;
  description: string;
  qty: number;
  costPrice: number;
  markupPercent: number;
  sellPrice: number;
  serialNumberTracking: boolean;
  serialNumbers: string[];
}

interface Supplier {
  id: string;
  supplierCode?: string;
  supplierName?: string;
}

export default function GRVPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [selectedSupplier, setSelectedSupplier] = useState("");

  const [selectedItem, setSelectedItem] = useState("");

  const [inventorySearch, setInventorySearch] = useState("");

  const [lines, setLines] = useState<GRVLine[]>([]);

  const warehouse = "MAIN";
  const [mainWarehouseName, setMainWarehouseName] = useState("Main Warehouse");

  const [supplierInvoice, setSupplierInvoice] = useState("");

  const [saving, setSaving] = useState(false);

  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const purchaseOrderLoaded = useRef(false);

  const filteredInventory = inventory.filter((item) => {
    const normalizeSearchValue = (value?: string) =>
      (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    const compactSearch = normalizeSearchValue(inventorySearch);

    if (compactSearch.length < 2) {
      return true;
    }

    const searchableValues = [
      item.partNumber,
      item.description,
      item.brand,
      item.crossReferences,
    ].map(normalizeSearchValue);

    const searchParts = inventorySearch
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(normalizeSearchValue)
      .filter((part) => part.length >= 2);

    return searchableValues.some(
      (value) =>
        value.includes(compactSearch) ||
        searchParts.some((part) => value.includes(part)),
    );
  });

  const selectedInventoryItem = inventory.find(
    (item) => item.id === selectedItem,
  );

  const documentTotal = lines.reduce(
    (total, line) => total + line.qty * line.costPrice,
    0,
  );

  function addLine() {
    setLines((currentLines) => [
      ...currentLines,
      {
        inventoryId: "",
        inventorySearch: "",
        partNumber: "",
        description: "",
        qty: 1,
        costPrice: 0,
        markupPercent: 0,
        sellPrice: 0,
        serialNumberTracking: false,
        serialNumbers: [],
      },
    ]);
  }

  function selectLineInventory(index: number, item: InventoryItem) {
    setLines((currentLines) =>
      currentLines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              inventoryId: item.id,
              inventorySearch: [item.partNumber, item.description]
                .filter(Boolean)
                .join(" - "),
              partNumber: item.partNumber || "",
              description: item.description || "",
              costPrice: Number(item.costPrice || 0),
              markupPercent: Number(item.markupPercent || 0),
              sellPrice: Number(item.sellPrice || 0),
              serialNumberTracking: item.serialNumberTracking === true,
              serialNumbers: [],
            }
          : line,
      ),
    );
  }

  function updateLineQuantity(index: number, value: number) {
    setLines((currentLines) =>
      currentLines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, qty: Math.max(1, value) } : line,
      ),
    );
  }

  function updateLineCostPrice(index: number, costPrice: number) {
    setLines((currentLines) =>
      currentLines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              costPrice,
              sellPrice: Number(
                (costPrice * (1 + line.markupPercent / 100)).toFixed(2),
              ),
            }
          : line,
      ),
    );
  }

  function updateLineMarkup(index: number, markupPercent: number) {
    setLines((currentLines) =>
      currentLines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              markupPercent,
              sellPrice: Number(
                (line.costPrice * (1 + markupPercent / 100)).toFixed(2),
              ),
            }
          : line,
      ),
    );
  }

  function updateLineSellPrice(index: number, sellPrice: number) {
    setLines((currentLines) =>
      currentLines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              sellPrice,
              markupPercent:
                line.costPrice > 0
                  ? Number(
                      (
                        ((sellPrice - line.costPrice) / line.costPrice) *
                        100
                      ).toFixed(2),
                    )
                  : line.markupPercent,
            }
          : line,
      ),
    );
  }

  useEffect(() => {
    getDoc(doc(clientDb, "companies", "comp_001", "inventory_settings", "setup", "warehouses", "MAIN")).then((snapshot) => {
      if (snapshot.exists()) setMainWarehouseName(String(snapshot.data().name || "Main Warehouse"));
    }).catch((error) => console.error("Unable to load MAIN warehouse name", error));

    const unsub = onSnapshot(
      collection(clientDb, "companies", "comp_001", "inventory"),

      (snapshot) => {
        setInventory(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as any),
          })),
        );
      },
    );

    const unsubSuppliers = onSnapshot(
      collection(clientDb, "companies", "comp_001", "suppliers"),
      (snapshot) => {
        setSuppliers(
          snapshot.docs.map((supplierDoc) => ({
            id: supplierDoc.id,
            ...(supplierDoc.data() as Omit<Supplier, "id">),
          })),
        );
      },
    );

    return () => {
      unsub();
      unsubSuppliers();
    };
  }, []);

  useEffect(() => {
    const requestedPurchaseOrderId =
      new URLSearchParams(window.location.search).get("purchaseOrderId") || "";
    if (
      !requestedPurchaseOrderId ||
      purchaseOrderLoaded.current ||
      inventory.length === 0 ||
      suppliers.length === 0
    )
      return;
    purchaseOrderLoaded.current = true;
    getDoc(
      doc(
        clientDb,
        "companies",
        "comp_001",
        "purchase_orders",
        requestedPurchaseOrderId,
      ),
    ).then((snapshot) => {
      if (!snapshot.exists()) return;
      const purchaseOrder = snapshot.data() as any;
      setPurchaseOrderId(requestedPurchaseOrderId);
      const supplier = suppliers.find(
        (entry) =>
          entry.id === purchaseOrder.supplierId ||
          entry.supplierName === purchaseOrder.supplier,
      );
      if (supplier) setSelectedSupplier(supplier.id);
      setSupplierInvoice(
        purchaseOrder.purchaseOrderNumber ||
          purchaseOrder.referenceNumber ||
          "",
      );
      setLines(
        (Array.isArray(purchaseOrder.lines) ? purchaseOrder.lines : [])
          .filter(
            (line: any) => line.lineType !== "description" && line.inventoryId,
          )
          .map((line: any) => {
            const item = inventory.find(
              (entry) => entry.id === line.inventoryId,
            );
            const costPrice = Number(line.priceExcl ?? item?.costPrice ?? 0);
            const markupPercent = Number(item?.markupPercent ?? 0);
            return {
              inventoryId: line.inventoryId,
              inventorySearch: [
                line.code || item?.partNumber,
                line.description || item?.description,
              ]
                .filter(Boolean)
                .join(" - "),
              partNumber: line.code || item?.partNumber || "",
              description: line.description || item?.description || "",
              qty: Number(line.qty ?? line.quantity ?? 1),
              costPrice,
              markupPercent,
              sellPrice: Number(
                item?.sellPrice ?? costPrice * (1 + markupPercent / 100),
              ),
              serialNumberTracking: item?.serialNumberTracking === true,
              serialNumbers: [],
            };
          }),
      );
    });
  }, [inventory, suppliers]);

  async function processGRV() {
    try {
      setSaving(true);
      const auditActor = getAuditActor();

      if (lines.length === 0) {
        alert("Add at least one inventory line");

        return;
      }

      if (lines.some((line) => !line.inventoryId)) {
        alert("Select an inventory item for every GRV line");
        return;
      }

      const supplier = suppliers.find((entry) => entry.id === selectedSupplier);

      if (!supplier) {
        alert("Select supplier");
        return;
      }

      const serializedLines = lines.filter((line) => line.serialNumberTracking);
      const enteredSerials = serializedLines.flatMap((line) =>
        line.serialNumbers
          .map((serialNumber) => serialNumber.trim().toUpperCase())
          .filter(Boolean),
      );
      if (new Set(enteredSerials).size !== enteredSerials.length) {
        alert("Duplicate serial numbers are not allowed.");
        return;
      }
      for (const line of serializedLines) {
        if (
          line.serialNumbers
            .map((serialNumber) => serialNumber.trim())
            .filter(Boolean).length !== line.qty
        ) {
          alert(
            `Enter exactly ${line.qty} serial number(s) for ${line.partNumber}.`,
          );
          return;
        }
      }
      if (enteredSerials.length > 0) {
        await runTransaction(clientDb, async (transaction) => {
          const serialEntries = serializedLines.flatMap((line) =>
            line.serialNumbers.map((rawSerial) => {
              const serialNumber = rawSerial.trim().toUpperCase();
              return {
                line,
                serialNumber,
                serialRef: doc(
                  clientDb,
                  "companies",
                  "comp_001",
                  "inventory_serials",
                  encodeURIComponent(serialNumber),
                ),
              };
            }),
          );
          const existingSerials = await Promise.all(
            serialEntries.map((entry) => transaction.get(entry.serialRef)),
          );
          existingSerials.forEach((existing, index) => {
            if (existing.exists())
              throw new Error(
                `Serial number ${serialEntries[index].serialNumber} already exists.`,
              );
          });
          for (const { line, serialNumber, serialRef } of serialEntries) {
            transaction.set(serialRef, {
              serialNumber,
              inventoryId: line.inventoryId,
              partNumber: line.partNumber,
              description: line.description,
              status: "available",
              locationId: warehouse,
              locationName: mainWarehouseName,
              locationType: "warehouse",
              documentNumber: supplierInvoice,
              purchaseOrderId,
              receivedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            });
          }
        });
      }

      const grvBatchId = crypto.randomUUID();

      for (const line of lines) {
        const item = inventory.find((entry) => entry.id === line.inventoryId);

        if (!item) continue;

        const receivedQty = line.qty;

        const beforeQty = item.warehouseStock?.[warehouse] || 0;

        const afterQty = beforeQty + receivedQty;

        const updatedWarehouseStock: Record<string, number> = {
          ...item.warehouseStock,

          [warehouse]: afterQty,
        };

        const warehouseTotal = updatedWarehouseStock["MAIN"] || 0;

        const vanTotal =
          (updatedWarehouseStock["001_NVTS_L"] || 0) +
          (updatedWarehouseStock["002_NVTS_L"] || 0) +
          (updatedWarehouseStock["003_NVTS_L"] || 0) +
          (updatedWarehouseStock["005_NVTS_L"] || 0) +
          (updatedWarehouseStock["GRB_004_COMBINED"] || 0) +
          (updatedWarehouseStock["POWERSTAR"] || 0);

        const grandTotal = warehouseTotal + vanTotal;

        /* UPDATE INVENTORY */
        await updateDoc(
          doc(clientDb, "companies", "comp_001", "inventory", item.id),

          {
            warehouseStock: updatedWarehouseStock,

            warehouseTotal,

            vanTotal,

            grandTotal,

            costPrice: line.costPrice,

            markupPercent: line.markupPercent,

            sellPrice: line.sellPrice,

            updatedAt: serverTimestamp(),

            ...auditFields("PROCESS"),
          },
        );

        /* CREATE TRANSACTION */
        await addDoc(
          collection(
            clientDb,
            "companies",
            "comp_001",
            "inventory_transactions",
          ),

          {
            inventoryId: item.id,

            partNumber: item.partNumber,

            description: item.description,

            type: "grv",
            referenceType: "GRV",
            movementType: "GRV",
            documentNumber: `GRV-${grvBatchId.slice(0, 8).toUpperCase()}`,
            grvNumber: `GRV-${grvBatchId.slice(0, 8).toUpperCase()}`,

            warehouse,
            locationId: warehouse,
            locationName: mainWarehouseName,

            qty: receivedQty,

            costPrice: line.costPrice,

            markupPercent: line.markupPercent,

            sellPrice: line.sellPrice,

            beforeQty,

            afterQty,

            reference: supplierInvoice,

            supplierId: supplier.id,

            supplierName: supplier.supplierName || "",

            purchaseOrderId,

            grvBatchId,

            notes: "GRV Received",

            userId: auditActor.userId,

            userName: auditActor.userName,

            userEmail: auditActor.userEmail,

            ...creationAuditFields(),
          },
        );
      }

      if (purchaseOrderId) {
        const purchaseOrderRef = doc(
          clientDb,
          "companies",
          "comp_001",
          "purchase_orders",
          purchaseOrderId,
        );
        await runTransaction(clientDb, async (transaction) => {
          const purchaseOrderSnapshot = await transaction.get(purchaseOrderRef);
          if (!purchaseOrderSnapshot.exists())
            throw new Error("Linked purchase order was not found.");
          const purchaseOrder = purchaseOrderSnapshot.data();
          const receivedQuantities: Record<string, number> = {
            ...(purchaseOrder.receivedQuantities || {}),
          };
          lines.forEach((line) => {
            const key = line.inventoryId || line.partNumber;
            receivedQuantities[key] =
              Number(receivedQuantities[key] || 0) + Number(line.qty || 0);
          });
          const orderedLines = (
            Array.isArray(purchaseOrder.lines) ? purchaseOrder.lines : []
          ).filter((line: any) => (line.lineType || "item") !== "description");
          const fullyReceived =
            orderedLines.length > 0 &&
            orderedLines.every((line: any) => {
              const key = line.inventoryId || line.code || line.partNumber;
              return (
                Number(receivedQuantities[key] || 0) >=
                Number(line.qty ?? line.quantity ?? 0)
              );
            });
          transaction.update(purchaseOrderRef, {
            receivedQuantities,
            receivedQty: Object.values(receivedQuantities).reduce(
              (sum, quantity) => sum + Number(quantity || 0),
              0,
            ),
            status: fullyReceived ? "closed" : "open",
            receiptStatus: fullyReceived
              ? "fully_received"
              : "partial_received",
            fullyReceived,
            partiallyReceived: !fullyReceived,
            received: fullyReceived,
            ...(fullyReceived
              ? { receivedAt: serverTimestamp(), closedAt: serverTimestamp() }
              : { partialReceivedAt: serverTimestamp() }),
            updatedAt: serverTimestamp(),
            ...auditFields("PROCESS"),
          });
          const historyRef = doc(collection(purchaseOrderRef, "history"));
          transaction.set(historyRef, {
            action: fullyReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED",
            details: fullyReceived
              ? "All ordered quantities received through GRV; purchase order closed."
              : "Some ordered quantities received through GRV; purchase order remains open.",
            status: fullyReceived ? "closed" : "open",
            receiptStatus: fullyReceived
              ? "fully_received"
              : "partial_received",
            grvReference: supplierInvoice,
            receivedQuantities,
            userId: auditActor.userId,
            userName: auditActor.userName,
            userEmail: auditActor.userEmail,
            createdAt: serverTimestamp(),
          });
        });
      }

      alert(
        "GRV processed. The linked purchase order will move to Closed automatically when all ordered quantities have been received.",
      );

      setSelectedItem("");

      setInventorySearch("");

      setSupplierInvoice("");

      setSelectedSupplier("");

      setLines([]);
    } catch (error) {
      console.error(error);

      alert(error instanceof Error ? error.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  function printGrvLabels() {
    if (!lines.length) return alert("Add at least one GRV item before printing labels.");
    if (lines.some((line) => !line.inventoryId || Number(line.qty || 0) <= 0)) return alert("Select every GRV item and enter its received quantity first.");
    localStorage.setItem("fleetfix-grv-label-items", JSON.stringify(lines.map((line) => {
      const item = inventory.find((entry) => entry.id === line.inventoryId);
      return { ...(item || {}), id: line.inventoryId, partNumber: line.partNumber, description: line.description, sellPrice: line.sellPrice, costPrice: line.costPrice, labelQty: Math.floor(Number(line.qty || 0)) };
    })));
    window.open("/inventory/labels", "_blank", "noopener,noreferrer");
  }

  return (
    <div className="min-h-screen w-full bg-[#f5f7fb] px-3 py-6 md:px-6">
      <div className="w-full max-w-none">
        <div className="mb-6">
          <div
            className="
            mb-2
            text-xs
            font-bold
            uppercase
            tracking-[0.2em]
            text-gray-400
          "
          >
            Inventory / Receiving
          </div>

          <h1 className="text-4xl font-black text-gray-900">
            Goods Received Voucher
          </h1>
        </div>

        <div className="rounded-3xl border border-gray-300 bg-white p-5 shadow-sm md:p-7">
          <div
            className="
            grid
            grid-cols-1
            gap-5
            xl:grid-cols-3
          "
          >
            {/* GRV DETAILS */}
            <div
              className="
              order-0
              rounded-3xl
              border
              border-gray-200
              bg-gray-50
              p-6
              xl:col-span-3
            "
            >
              <h2 className="mb-5 text-xl font-black text-gray-900">
                GRV Details
              </h2>
              <div
                className="
                grid
                grid-cols-1
                gap-5
              "
              >
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Supplier *
                  </label>
                  <select
                    value={selectedSupplier}
                    onChange={(event) =>
                      setSelectedSupplier(event.target.value)
                    }
                    className="
                      h-14
                      w-full
                      rounded-2xl
                      border-2
                      border-gray-200
                      bg-white
                      px-5
                      outline-none
                      focus:border-blue-500
                    "
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.supplierCode
                          ? `${supplier.supplierCode} - `
                          : ""}
                        {supplier.supplierName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Supplier Invoice
                  </label>
                  <input
                    type="text"
                    value={supplierInvoice}
                    onChange={(event) => setSupplierInvoice(event.target.value)}
                    className="
                      h-14
                      w-full
                      rounded-2xl
                      border-2
                      border-gray-200
                      bg-white
                      px-5
                      outline-none
                      focus:border-blue-500
                    "
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Warehouse
                  </label>
                  <div className="flex h-14 w-full items-center justify-between rounded-2xl border-2 border-blue-200 bg-blue-50 px-5 font-black text-blue-950">
                    <span>{mainWarehouseName}</span>
                    <span className="rounded-full bg-blue-600 px-3 py-1 text-xs text-white">MAIN</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-gray-500">All received inventory is automatically booked into the primary MAIN warehouse.</p>
                </div>
              </div>
            </div>

            {/* INVENTORY */}
            <div
              className="
              rounded-3xl
              border
              border-gray-200
              bg-gray-50
              p-5
              order-2
              xl:col-span-3
              xl:row-start-2
              xl:row-span-1
            "
            >
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-gray-900">
                    Item Details
                  </h2>
                  <p className="text-sm text-gray-500">
                    Add inventory items being received.
                  </p>
                </div>
              </div>

              <label className="hidden text-sm font-bold text-gray-700 mb-2">
                Search or Select Inventory Item
              </label>

              <div
                className="hidden
                grid
                grid-cols-1
                gap-3
                md:grid-cols-[1fr_140px]
              "
              >
                <input
                  type="text"
                  list="grv-inventory-options"
                  placeholder="Search part number, description, brand or cross references..."
                  value={inventorySearch}
                  onChange={(e) => {
                    const value = e.target.value;
                    setInventorySearch(value);

                    const matchingItem = inventory.find(
                      (item) =>
                        `${item.partNumber || ""} - ${item.description || ""}` ===
                        value,
                    );

                    setSelectedItem(matchingItem?.id || "");
                  }}
                  className="
                  h-14
                  w-full
                  rounded-2xl
                  border-2
                  border-gray-200
                  bg-white
                  px-5
                  outline-none
                  focus:border-blue-500
                "
                />
                <button
                  type="button"
                  onClick={addLine}
                  className="
                  h-14
                  rounded-2xl
                  bg-blue-600
                  px-5
                  font-black
                  text-white
                  hover:bg-blue-700
                "
                >
                  Add Line
                </button>
              </div>

              <datalist id="grv-inventory-options">
                {filteredInventory.map((item) => (
                  <option
                    key={item.id}
                    value={`${item.partNumber || ""} - ${item.description || ""}`}
                  />
                ))}
              </datalist>

              {selectedInventoryItem && (
                <div
                  className="hidden
                  mt-5
                  grid
                  grid-cols-1
                  gap-4
                  rounded-2xl
                  border
                  border-blue-100
                  bg-blue-50
                  p-5
                  sm:grid-cols-2
                "
                >
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-blue-500">
                      Part Number
                    </div>
                    <div className="mt-1 font-black text-blue-900">
                      {selectedInventoryItem.partNumber || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-blue-500">
                      Description
                    </div>
                    <div className="mt-1 font-bold text-blue-900">
                      {selectedInventoryItem.description || "—"}
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                <table className="w-full min-w-[1250px] table-fixed text-sm">
                  <thead>
                    <tr
                      className="
                      border-b
                      border-gray-200
                      bg-gray-50
                      text-left
                      text-[11px]
                      font-black
                      uppercase
                      tracking-wider
                      text-gray-500
                    "
                    >
                      <th className="w-12 p-3 text-center">#</th>
                      <th className="w-64 p-3">Product / Service</th>
                      <th className="w-80 p-3">Description</th>
                      <th className="w-24 p-3 text-right">Qty</th>
                      <th className="w-52 p-3">Serial Numbers</th>
                      <th className="w-28 p-3 text-right">Cost</th>
                      <th className="w-24 p-3 text-right">Markup</th>
                      <th className="w-28 p-3 text-right">Rate</th>
                      <th className="w-28 p-3 text-right">Amount</th>
                      <th className="w-20 p-3 text-right">VAT</th>
                      <th className="w-16 p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td
                          colSpan={11}
                          className="px-4 py-10 text-center text-gray-400"
                        >
                          Search for an inventory item and add it as a line.
                        </td>
                      </tr>
                    ) : (
                      lines.map((line, index) => (
                        <tr
                          key={`${line.inventoryId}-${index}`}
                          className="border-b border-gray-100 align-top last:border-b-0"
                        >
                          <td className="p-2 text-center text-xs font-bold text-gray-400">
                            {index + 1}
                          </td>
                          <td className="p-2">
                            <input
                              list="grv-inventory-options"
                              value={
                                line.inventorySearch ??
                                [line.partNumber, line.description]
                                  .filter(Boolean)
                                  .join(" - ")
                              }
                              onChange={(event) => {
                                const value = event.target.value;
                                const item = inventory.find(
                                  (entry) =>
                                    [entry.partNumber, entry.description]
                                      .filter(Boolean)
                                      .join(" - ") === value,
                                );
                                if (item) selectLineInventory(index, item);
                                else
                                  setLines((current) =>
                                    current.map((entry, lineIndex) =>
                                      lineIndex === index
                                        ? {
                                            ...entry,
                                            inventoryId: "",
                                            inventorySearch: value,
                                          }
                                        : entry,
                                    ),
                                  );
                              }}
                              placeholder="Search product or service"
                              className="h-10 w-full rounded-lg border border-gray-200 px-3 font-semibold"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              value={line.description}
                              onChange={(event) =>
                                setLines((current) =>
                                  current.map((entry, lineIndex) =>
                                    lineIndex === index
                                      ? {
                                          ...entry,
                                          description: event.target.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                              className="h-10 w-full rounded-lg border border-gray-200 px-3"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="1"
                              value={line.qty}
                              onChange={(event) =>
                                updateLineQuantity(
                                  index,
                                  Number(event.target.value),
                                )
                              }
                              className="
                                h-10
                                w-full
                                rounded-lg
                                border
                                border-gray-200
                                px-3
                              "
                            />
                          </td>
                          <td className="p-2">
                            {line.serialNumberTracking ? (
                              <textarea
                                value={line.serialNumbers.join("\n")}
                                onChange={(event) =>
                                  setLines((current) =>
                                    current.map((entry, lineIndex) =>
                                      lineIndex === index
                                        ? {
                                            ...entry,
                                            serialNumbers:
                                              event.target.value.split(/\r?\n/),
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                                rows={Math.min(4, Math.max(1, line.qty))}
                                placeholder={`Enter ${line.qty} serial number(s), one per line`}
                                className="min-h-10 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                              />
                            ) : (
                              <span className="text-xs text-gray-400">
                                Not tracked
                              </span>
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.costPrice}
                              onChange={(event) =>
                                updateLineCostPrice(
                                  index,
                                  Number(event.target.value),
                                )
                              }
                              className="
                                h-10
                                w-full
                                rounded-lg
                                border
                                border-gray-200
                                px-3
                              "
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.markupPercent}
                              onChange={(event) =>
                                updateLineMarkup(
                                  index,
                                  Number(event.target.value),
                                )
                              }
                              className="
                                h-10
                                w-full
                                rounded-lg
                                border
                                border-gray-200
                                px-3
                              "
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.sellPrice}
                              onChange={(event) =>
                                updateLineSellPrice(
                                  index,
                                  Number(event.target.value),
                                )
                              }
                              className="
                                h-10
                                w-full
                                rounded-lg
                                border
                                border-gray-200
                                px-3
                              "
                            />
                          </td>
                          <td className="p-2 text-right font-black">
                            R {(line.qty * line.sellPrice).toFixed(2)}
                          </td>
                          <td className="p-2 text-right font-bold">15%</td>
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setLines((currentLines) =>
                                  currentLines.filter(
                                    (_, lineIndex) => lineIndex !== index,
                                  ),
                                )
                              }
                              className="h-10 w-full rounded-lg font-black text-red-600 hover:bg-red-50"
                              aria-label="Delete line"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={addLine}
                className="mt-3 rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700"
              >
                + Add Line
              </button>
            </div>

            {/* SUPPLIER */}
            <div className="hidden">
              <label className="mb-2 block text-sm font-bold text-gray-700">
                Supplier *
              </label>
              <select
                value={selectedSupplier}
                onChange={(event) => setSelectedSupplier(event.target.value)}
                className="
                  h-14
                  w-full
                  rounded-2xl
                  border-2
                  border-gray-200
                  bg-white
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.supplierCode ? `${supplier.supplierCode} - ` : ""}
                    {supplier.supplierName}
                  </option>
                ))}
              </select>
            </div>

            {/* WAREHOUSE */}
            <div className="hidden">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Warehouse
              </label>

              <select
                value={warehouse}
                disabled
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                "
              >
                <option value="MAIN">MAIN</option>

                <option value="001_NVTS_L">001_NVTS_L</option>

                <option value="002_NVTS_L">002_NVTS_L</option>

                <option value="003_NVTS_L">003_NVTS_L</option>

                <option value="005_NVTS_L">005_NVTS_L</option>

                <option value="GRB_004_COMBINED">GRB_004_COMBINED</option>

                <option value="POWERSTAR">POWERSTAR</option>
              </select>
            </div>

            {/* INVOICE */}
            <div className="hidden">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Supplier Invoice
              </label>

              <input
                type="text"
                value={supplierInvoice}
                onChange={(e) => setSupplierInvoice(e.target.value)}
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                "
              />
            </div>

            <div
              className="
              space-y-4
              rounded-3xl
              border
              border-gray-200
              bg-gray-50
              p-6
              order-5
              xl:col-start-3
            "
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-500">Lines</span>
                <span className="font-black text-gray-900">{lines.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-500">Total Quantity</span>
                <span className="font-black text-gray-900">
                  {lines.reduce((total, line) => total + line.qty, 0)}
                </span>
              </div>
              <div
                className="
                flex
                items-center
                justify-between
                border-t
                border-gray-200
                pt-4
              "
              >
                <span className="text-lg font-black text-gray-900">
                  GRV Total
                </span>
                <span className="text-3xl font-black text-blue-600">
                  R {documentTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* SAVE */}
            <button type="button" onClick={printGrvLabels} disabled={lines.length === 0} className="h-12 rounded-2xl border border-blue-600 bg-white px-6 font-black text-blue-700 disabled:opacity-40 xl:col-start-3">
              Print GRV Stock Labels
            </button>
            <button
              onClick={processGRV}
              disabled={saving}
              className="
                w-full
                h-16
                rounded-3xl
                bg-blue-600
                hover:bg-blue-700
                disabled:opacity-50
                text-white
                text-lg
                font-black
                order-6
                xl:col-start-3
              "
            >
              {saving ? "Processing..." : "Process GRV"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
