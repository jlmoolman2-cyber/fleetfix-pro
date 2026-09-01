"use client";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";

import {
  useEffect,
  useState,
} from "react";

interface InventoryItem {

  id: string;

  partNumber?: string;

  description?: string;

  warehouseStock?: {
    [key: string]: number;
  };
}

export default function GRVPage() {

  const [inventory, setInventory] =
    useState<InventoryItem[]>([]);

  const [selectedItem, setSelectedItem] =
    useState("");

  const [qty, setQty] =
    useState(1);

  const [warehouse, setWarehouse] =
    useState("MAIN");

  const [supplierInvoice, setSupplierInvoice] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {

    const unsub = onSnapshot(

      collection(
        clientDb,
        "companies",
        "comp_001",
        "inventory"
      ),

      (snapshot) => {

        setInventory(

          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as any),
          }))
        );
      }
    );

    return () => unsub();

  }, []);

  async function processGRV() {

    try {

      setSaving(true);

      const item =
        inventory.find(
          (x) => x.id === selectedItem
        );

      if (!item) {

        alert("Select inventory");

        return;
      }

      const beforeQty =

        item.warehouseStock?.[
          warehouse
        ] || 0;

      const afterQty =
        beforeQty + qty;

      const updatedWarehouseStock = {

        ...item.warehouseStock,

        [warehouse]:
          afterQty,
      };

      const warehouseTotal =
        updatedWarehouseStock[
          "MAIN"
        ] || 0;

      const vanTotal =

        (updatedWarehouseStock[
          "001_NVTS_L"
        ] || 0)

        +

        (updatedWarehouseStock[
          "002_NVTS_L"
        ] || 0)

        +

        (updatedWarehouseStock[
          "003_NVTS_L"
        ] || 0)

        +

        (updatedWarehouseStock[
          "005_NVTS_L"
        ] || 0)

        +

        (updatedWarehouseStock[
          "GRB_004_COMBINED"
        ] || 0)

        +

        (updatedWarehouseStock[
          "POWERSTAR"
        ] || 0);

      const grandTotal =
        warehouseTotal + vanTotal;

      /* UPDATE INVENTORY */
      await updateDoc(

        doc(
          clientDb,
          "companies",
          "comp_001",
          "inventory",
          item.id
        ),

        {
          warehouseStock:
            updatedWarehouseStock,

          warehouseTotal,

          vanTotal,

          grandTotal,

          updatedAt:
            serverTimestamp(),
        }
      );

      /* CREATE TRANSACTION */
      await addDoc(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_transactions"
        ),

        {
          inventoryId:
            item.id,

          partNumber:
            item.partNumber,

          description:
            item.description,

          type: "grv",

          warehouse,

          qty,

          beforeQty,

          afterQty,

          reference:
            supplierInvoice,

          notes:
            "GRV Received",

          userEmail:
            "admin@nvttruckservices.co.za",

          createdAt:
            serverTimestamp(),
        }
      );

      alert("GRV processed");

      setSelectedItem("");

      setQty(1);

      setSupplierInvoice("");

    } catch (error) {

      console.error(error);

      alert("Failed");

    } finally {

      setSaving(false);

    }
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="max-w-[900px] mx-auto">

        <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">

          <h1 className="text-4xl font-black text-gray-900 mb-8">
            Goods Received Voucher
          </h1>

          <div className="space-y-6">

            {/* INVENTORY */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Inventory Item
              </label>

              <select
                value={selectedItem}
                onChange={(e) =>
                  setSelectedItem(
                    e.target.value
                  )
                }
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                "
              >

                <option value="">
                  Select Item
                </option>

                {inventory.map((item) => (

                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.partNumber}
                    {" - "}
                    {item.description}
                  </option>

                ))}

              </select>

            </div>

            {/* QTY */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Quantity
              </label>

              <input
                type="number"
                value={qty}
                onChange={(e) =>
                  setQty(
                    Number(
                      e.target.value
                    )
                  )
                }
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

            {/* WAREHOUSE */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Warehouse
              </label>

              <select
                value={warehouse}
                onChange={(e) =>
                  setWarehouse(
                    e.target.value
                  )
                }
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                "
              >

                <option value="MAIN">
                  MAIN
                </option>

                <option value="001_NVTS_L">
                  001_NVTS_L
                </option>

                <option value="002_NVTS_L">
                  002_NVTS_L
                </option>

                <option value="003_NVTS_L">
                  003_NVTS_L
                </option>

                <option value="005_NVTS_L">
                  005_NVTS_L
                </option>

                <option value="GRB_004_COMBINED">
                  GRB_004_COMBINED
                </option>

                <option value="POWERSTAR">
                  POWERSTAR
                </option>

              </select>

            </div>

            {/* INVOICE */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Supplier Invoice
              </label>

              <input
                type="text"
                value={
                  supplierInvoice
                }
                onChange={(e) =>
                  setSupplierInvoice(
                    e.target.value
                  )
                }
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

            {/* SAVE */}
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
              "
            >
              {saving
                ? "Processing..."
                : "Process GRV"}
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}