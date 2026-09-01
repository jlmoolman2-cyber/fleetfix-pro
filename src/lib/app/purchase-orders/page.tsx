"use client";

import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

interface Supplier {

  id: string;

  supplierName?: string;
}

interface InventoryItem {
  id: string;

  partNumber?: string;

  description?: string;

  sellPrice?: number;

  costPrice?: number;
}

interface POLine {

  inventoryId: string;

  code: string;

  description: string;

  qty: number;

  priceExcl: number;

  vat: number;

  totalExcl: number;

  totalIncl: number;
}

export default function PurchaseOrdersPage() {

  const [saving, setSaving] =
    useState(false);

  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  const [inventory, setInventory] =
    useState<InventoryItem[]>([]);

  const [referenceNumber, setReferenceNumber] =
    useState("");

  const [supplier, setSupplier] =
    useState("");

  const [deliveryAddress, setDeliveryAddress] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [employee, setEmployee] =
    useState("");

  const [purchaseDate, setPurchaseDate] =
    useState(
      new Date()
        .toISOString()
        .split("T")[0]
    );

  const [deliveryDate, setDeliveryDate] =
    useState(
      new Date()
        .toISOString()
        .split("T")[0]
    );

  const [lines, setLines] =
    useState<POLine[]>([]);

  const [selectedInventory, setSelectedInventory] =
    useState("");
  const [inventorySearch, setInventorySearch] =
    useState("");

  useEffect(() => {

    const unsubInventory =
      onSnapshot(

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

    const unsubSuppliers =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "suppliers"
        ),

        (snapshot) => {

          setSuppliers(

            snapshot.docs.map((doc) => ({
              id: doc.id,
              ...(doc.data() as any),
            }))
          );
        }
      );

    return () => {
      unsubInventory();
      unsubSuppliers();
    };

  }, []);

  function addLine() {

    const item =
      inventory.find(
        (x) =>
          x.id ===
          selectedInventory
      );

    if (!item) {

      alert(
        "Select inventory item"
      );

      return;
    }

    const price =
      Number(
        item.costPrice || 0
      );

    const vat =
      price * 0.15;

    setLines([
      ...lines,

      {
        inventoryId:
          item.id,

        code:
          item.partNumber || "",

        description:
          item.description || "",

        qty: 1,

        priceExcl:
          Number(
            price.toFixed(2)
          ),

        vat:
          Number(
            vat.toFixed(2)
          ),

        totalExcl:
          Number(
            price.toFixed(2)
          ),

        totalIncl:
          Number(
            (
              price + vat
            ).toFixed(2)
          ),
      },
    ]);

    setSelectedInventory("");
  }

  function updateLine(
    index: number,
    field: string,
    value: any
  ) {

    const updated =
      [...lines];

    updated[index] = {
      ...updated[index],

      [field]:
        value,
    };

    updated[index].totalExcl =

      Number(
        (
          updated[index]
            .qty *

          updated[index]
            .priceExcl
        ).toFixed(2)
      );

    updated[index].vat =

      Number(
        (
          updated[index]
            .totalExcl * 0.15
        ).toFixed(2)
      );

    updated[index].totalIncl =

      Number(
        (
          updated[index]
            .totalExcl +

          updated[index]
            .vat
        ).toFixed(2)
      );

    setLines(updated);
  }

  const subtotal =
    useMemo(() => {

      return lines.reduce(
        (sum, line) =>
          sum +
          line.totalExcl,
        0
      );

    }, [lines]);

  const vatTotal =
    useMemo(() => {

      return lines.reduce(
        (sum, line) =>
          sum +
          line.vat,
        0
      );

    }, [lines]);

  const grandTotal =
    subtotal + vatTotal;
  const filteredInventory =

    inventory.filter((item) => {

      const search =
        inventorySearch.toLowerCase();

      return (

        item.partNumber
          ?.toLowerCase()
          .includes(search)

        ||

        item.description
          ?.toLowerCase()
          .includes(search)
      );
    });

  async function createPO() {

    try {

      setSaving(true);

      await addDoc(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "purchase_orders"
        ),

        {
          supplier,

          referenceNumber,

          deliveryAddress,

          notes,

          employee,

          purchaseDate,

          deliveryDate,

          lines,

          subtotal,

          vatTotal,

          grandTotal,

          status:
            "pending",

          createdAt:
            serverTimestamp(),
        }
      );

      alert(
        "Purchase Order Created"
      );

      location.reload();

    } catch (error) {

      console.error(error);

      alert(
        "Failed to create PO"
      );

    } finally {

      setSaving(false);

    }
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="max-w-[1800px] mx-auto">

        {/* HEADER */}
        <div className="mb-6">

          <div className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold mb-2">
            Purchases
          </div>

          <h1 className="text-4xl font-black text-gray-900">
            Create Purchase Order
          </h1>

        </div>

        {/* MAIN */}
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">

            {/* LEFT */}
            <div className="xl:col-span-2 space-y-6">

              {/* SUPPLIER */}
              <div>

                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Supplier *
                </label>

                <select
                  value={supplier}
                  onChange={(e) =>
                    setSupplier(
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
                    Select supplier
                  </option>

                  {suppliers.map(
                    (supplier) => (

                      <option
                        key={
                          supplier.id
                        }
                        value={
                          supplier.supplierName
                        }
                      >
                        {
                          supplier.supplierName
                        }
                      </option>
                    )
                  )}

                </select>

              </div>

              {/* DELIVERY ADDRESS */}
              <div>

                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Delivery Address
                </label>

                <textarea
                  value={
                    deliveryAddress
                  }
                  onChange={(e) =>
                    setDeliveryAddress(
                      e.target.value
                    )
                  }
                  className="
                    w-full
                    h-32
                    rounded-2xl
                    border-2
                    border-gray-200
                    p-5
                  "
                />

              </div>

              {/* ADD LINE */}
              <div className="
                border
                border-gray-200
                rounded-3xl
                p-5
                bg-gray-50
              ">

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                  <div className="md:col-span-3">

                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Inventory Item
                    </label>
                    <input
                      type="text"
                      placeholder="Search part number or description..."
                      value={inventorySearch}
                      onChange={(e) =>
                        setInventorySearch(
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
    outline-none
    focus:border-blue-500
    mb-3
  "
                    />
                    <select
                      value={
                        selectedInventory
                      }
                      onChange={(e) =>
                        setSelectedInventory(
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
                        Select item
                      </option>

                      {filteredInventory.map(
                        (item) => (

                          <option
                            key={
                              item.id
                            }
                            value={
                              item.id
                            }
                          >
                            {item.partNumber}
                            {" - "}
                            {item.description}
                          </option>
                        )
                      )}

                    </select>

                  </div>

                  <div className="flex items-end">

                    <button
                      onClick={addLine}
                      className="
                        w-full
                        h-14
                        rounded-2xl
                        bg-blue-600
                        hover:bg-blue-700
                        text-white
                        font-black
                      "
                    >
                      Add Line
                    </button>

                  </div>

                </div>

              </div>

              {/* TABLE */}
              <div className="overflow-x-auto">

                <table className="w-full">

                  <thead>

                    <tr className="border-b border-gray-200 text-left text-sm text-gray-500">

                      <th className="py-4">
                        Code
                      </th>

                      <th>
                        Description
                      </th>

                      <th>
                        Qty
                      </th>

                      <th>
                        Price Excl
                      </th>

                      <th>
                        VAT
                      </th>

                      <th>
                        Total Incl
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {lines.map(
                      (line, index) => (

                        <tr
                          key={index}
                          className="border-b border-gray-100"
                        >

                          <td className="py-4 font-black text-blue-600">
                            {line.code}
                          </td>

                          <td>
                            {line.description}
                          </td>

                          <td>

                            <input
                              type="number"
                              value={
                                line.qty
                              }
                              onChange={(e) =>
                                updateLine(
                                  index,
                                  "qty",
                                  Number(
                                    e.target
                                      .value
                                  )
                                )
                              }
                              className="
                                appearance-none
                                w-24
                                h-12
                                rounded-xl
                                border
                                border-gray-200
                                px-4
                              "
                            />

                          </td>

                          <td>

                            <input
                              type="number"
                              value={
                                line.priceExcl
                              }
                              onChange={(e) =>
                                updateLine(
                                  index,
                                  "priceExcl",
                                  Number(
                                    e.target
                                      .value
                                  )
                                )
                              }
                              className="
                                appearance-none
                                w-32
                                h-12
                                rounded-xl
                                border
                                border-gray-200
                                px-4
                              "
                            />

                          </td>

                          <td>
                            R{" "}
                            {line.vat.toFixed(
                              2
                            )}
                          </td>

                          <td className="font-black">
                            R{" "}
                            {line.totalIncl.toFixed(
                              2
                            )}
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

              {/* NOTES */}
              <div>

                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Notes
                </label>

                <textarea
                  value={notes}
                  onChange={(e) =>
                    setNotes(
                      e.target.value
                    )
                  }
                  className="
                    w-full
                    h-32
                    rounded-2xl
                    border-2
                    border-gray-200
                    p-5
                  "
                />

              </div>

            </div>

            {/* RIGHT */}
            <div className="space-y-6">

              {/* REF */}
              <div>

                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Reference Number
                </label>

                <input
                  type="text"
                  value={
                    referenceNumber
                  }
                  onChange={(e) =>
                    setReferenceNumber(
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

              {/* DATES */}
              <div className="grid grid-cols-2 gap-4">

                <div>

                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Purchase Date
                  </label>

                  <input
                    type="date"
                    value={
                      purchaseDate
                    }
                    onChange={(e) =>
                      setPurchaseDate(
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

                <div>

                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Delivery Date
                  </label>

                  <input
                    type="date"
                    value={
                      deliveryDate
                    }
                    onChange={(e) =>
                      setDeliveryDate(
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

              </div>

              {/* EMPLOYEE */}
              <div>

                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Employee
                </label>

                <input
                  type="text"
                  value={employee}
                  onChange={(e) =>
                    setEmployee(
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

              {/* TOTALS */}
              <div className="
                bg-gray-50
                rounded-3xl
                border
                border-gray-200
                p-6
                space-y-4
              ">

                <div className="flex items-center justify-between">

                  <div className="text-gray-500 font-bold">
                    Subtotal Excl VAT
                  </div>

                  <div className="font-black">
                    R{" "}
                    {subtotal.toFixed(
                      2
                    )}
                  </div>

                </div>

                <div className="flex items-center justify-between">

                  <div className="text-gray-500 font-bold">
                    VAT
                  </div>

                  <div className="font-black">
                    R{" "}
                    {vatTotal.toFixed(
                      2
                    )}
                  </div>

                </div>

                <div className="border-t border-gray-200 pt-4 flex items-center justify-between">

                  <div className="text-xl font-black text-gray-900">
                    Total Incl VAT
                  </div>

                  <div className="text-3xl font-black text-blue-600">
                    R{" "}
                    {grandTotal.toFixed(
                      2
                    )}
                  </div>

                </div>

              </div>

              {/* SAVE */}
              <button
                onClick={createPO}
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
                  ? "Creating..."
                  : "Create Purchase Order"}
              </button>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}