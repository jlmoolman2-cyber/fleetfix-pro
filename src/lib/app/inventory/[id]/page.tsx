"use client";

import Image from "next/image";
import Link from "next/link";

import { getAuth }
  from "firebase/auth";

import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  addDoc,
  updateDoc,
  serverTimestamp,
}
  from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";

import {
  useEffect,
  useState,
} from "react";

interface InventoryItem {

  id: string;

  imageUrl?: string;

  qrCodeUrl?: string;

  partNumber?: string;

  description?: string;

  category?: string;

  brand?: string;

  unit?: string;

  barcode?: string;

  rrStandardTime?: string;

  costPrice?: number;

  sellPrice?: number;

  quantityTracking?: boolean;

  warehouseStock?: {
    [key: string]: number;
  };

  warehouseTotal?: number;

  vanTotal?: number;

  grandTotal?: number;

  isActive?: boolean;
}

export default function InventoryDetailsPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [item, setItem] =
    useState<InventoryItem | null>(
      null
    );

  const auth = getAuth();

  const currentUser =
    auth.currentUser;

  const [stockLocations, setStockLocations] =
    useState<any[]>([]);

  const [movements, setMovements] =
    useState<any[]>([]);

  useEffect(() => {

    async function load() {

      const resolvedParams =
        await params;

      const docRef = doc(
        clientDb,
        "companies",
        "comp_001",
        "inventory",
        resolvedParams.id
      );

      const snapshot =
        await getDoc(docRef);

      if (snapshot.exists()) {

        setItem({
          id: snapshot.id,
          ...(snapshot.data() as any),
        });
        loadMovements(
          snapshot.id
        );
      }

      setLoading(false);
    }

    load();

    loadStockLocations();


  }, [params]);

  async function loadMovements(
    inventoryId: string
  ) {


    const snap =
      await getDocs(

        query(

          collection(
            clientDb,
            "companies",
            "comp_001",
            "inventory",
            inventoryId,
            "movements"
          ),

          orderBy(
            "createdAt",
            "desc"
          )

        )

      );


    setMovements(

      snap.docs.map(d => ({

        id: d.id,

        ...d.data()

      }))

    );


  }

  async function loadStockLocations() {

    const locations: any[] = [];


    // LOAD WAREHOUSES

    const warehouseSnap =
      await getDocs(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_settings",
          "setup",
          "warehouses"
        )

      );


    warehouseSnap.docs.forEach(d => {

      locations.push({

        id: d.id,

        name: d.data().name,

        type: "warehouse"

      });

    });



    // LOAD RAV

    const ravSnap =
      await getDocs(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_settings",
          "setup",
          "rav"
        )

      );


    ravSnap.docs.forEach(d => {

      locations.push({

        id: d.id,

        name: d.data().name,

        type: "rav"

      });

    });


    setStockLocations(
      locations
    );


  }

  async function saveChanges() {

    if (!item) return;

    try {

      setSaving(true);

      let warehouseTotal = 0;

      let vanTotal = 0;


      stockLocations.forEach(
        (location: any) => {


          const qty =
            Number(
              item.warehouseStock?.[location.id]
              ||
              0
            );


          if (location.type === "warehouse") {

            warehouseTotal += qty;

          }


          if (location.type === "rav") {

            vanTotal += qty;

          }


        }

      );


     
      stockLocations.forEach(
        (location: any) => {


          const qty =
            Number(
              item.warehouseStock?.[location.id]
              ||
              0
            );


          if (
            location.type?.toLowerCase()
            ===
            "warehouse"
          ) {

            warehouseTotal += qty;

          }


          if (
            location.type?.toLowerCase()
            ===
            "rav"
          ) {

            vanTotal += qty;

          }


        });


      const grandTotal =
        warehouseTotal +
        vanTotal;

      const oldSnap =
        await getDoc(

          doc(
            clientDb,
            "companies",
            "comp_001",
            "inventory",
            item.id
          )

        );


      const oldData: any =
        oldSnap.data();


      for (
        const location of stockLocations
      ) {

        const beforeQty =
          Number(
            oldData?.warehouseStock?.[location.id]
            ||
            0
          );


        const afterQty =
          Number(
            item.warehouseStock?.[location.id]
            ||
            0
          );


        if (beforeQty !== afterQty) {


          await recordStockMovement({

            type:
              afterQty > beforeQty
                ?
                "IN"
                :
                "OUT",


            qty:
              Math.abs(
                afterQty - beforeQty
              ),


            beforeQty,

            afterQty,


            locationId:
              location.id,


            locationName:
              location.name,


            referenceType:
              "MANUAL",


            referenceNumber:
              "Stock Adjustment"


          });


        }


      }

      await updateDoc(

        doc(
          clientDb,
          "companies",
          "comp_001",
          "inventory",
          item.id
        ),

        {
          ...item,

          warehouseTotal,

          vanTotal,

          grandTotal,

          updatedAt:
            serverTimestamp(),
        }
      );

      alert(
        "Inventory updated"
      );

    } catch (error) {

      console.error(error);

      alert(
        "Failed to save"
      );

    } finally {

      setSaving(false);

    }
  }


  async function recordStockMovement({

    type,
    qty,
    beforeQty,
    afterQty,
    locationId,
    locationName,
    referenceType,
    referenceNumber,

  }: any) {


    if (!item) return;


    await addDoc(

      collection(
        clientDb,
        "companies",
        "comp_001",
        "inventory",
        item.id,
        "movements"
      ),

      {

        type,

        qty,

        beforeQty,

        afterQty,

        locationId,

        locationName,


        referenceType,

        referenceNumber,


        createdByName:

          currentUser?.displayName
          ||
          currentUser?.email
          ||
          "Unknown User",


        createdById:

          currentUser?.uid
          ||
          "",


        createdAt:
          serverTimestamp()

      }

    );


    await loadMovements(
      item.id
    );


  }

  if (loading) {

    return (
      <div className="p-10">
        Loading...
      </div>
    );
  }

  const liveWarehouseTotal = stockLocations

    .filter(
      (location: any) =>
        location.type?.toLowerCase() === "warehouse"
    )

    .reduce(

      (total: number, location: any) => {

        const qty =
          Number(
            item?.warehouseStock?.[location.id]
            ||
            0
          );


        return total + qty;

      }

      , 0);



  const liveVanTotal = stockLocations

    .filter(
      (location: any) =>
        location.type?.toLowerCase() === "rav"
    )

    .reduce(

      (total: number, location: any) => {


        const qty =
          Number(
            item?.warehouseStock?.[location.id]
            ||
            0
          );


        return total + qty;


      }

      , 0);



  const liveGrandTotal =
    Number(liveWarehouseTotal)
    +
    Number(liveVanTotal);

  if (!item) {

    return (
      <div className="p-10">
        Item not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="max-w-[1700px] mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">

          <div className="flex items-center gap-5">

            <div className="h-28 w-28 rounded-3xl overflow-hidden border border-gray-200 bg-white">

              <Image
                src={
                  item.imageUrl ||
                  "https://placehold.co/300x300/png"
                }
                alt="Inventory"
                width={300}
                height={300}
                className="h-full w-full object-cover"
              />

            </div>

            <div>

              <div className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold mb-2">
                Inventory Item
              </div>

              <h1 className="text-4xl font-black text-gray-900">
                {item.partNumber}
              </h1>

              <div className="text-lg text-gray-500 mt-1">
                {item.description}
              </div>

            </div>

          </div>

          <div className="flex items-center gap-3">

            <div
              className={`
                px-5
                h-12
                rounded-2xl
                flex
                items-center
                text-sm
                font-black

                ${item.isActive
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
                }
              `}
            >
              {item.isActive
                ? "ACTIVE"
                : "INACTIVE"}
            </div>

            <Link
              href="/inventory"
              className="
                bg-gray-200
                hover:bg-gray-300
                px-5
                h-12
                rounded-2xl
                inline-flex
                items-center
                text-sm
                font-bold
              "
            >
              Back
            </Link>

          </div>

        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* LEFT */}
          <div className="xl:col-span-2 space-y-6">

            {/* DETAILS */}
            <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">

              <h2 className="text-2xl font-black text-gray-900 mb-6">
                Item Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div>

                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Part Number
                  </label>

                  <input
                    type="text"
                    value={
                      item.partNumber || ""
                    }
                    onChange={(e) =>
                      setItem({
                        ...item,
                        partNumber:
                          e.target.value,
                      })
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
                    Description
                  </label>

                  <input
                    type="text"
                    value={
                      item.description || ""
                    }
                    onChange={(e) =>
                      setItem({
                        ...item,
                        description:
                          e.target.value,
                      })
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
                    Brand
                  </label>

                  <input
                    type="text"
                    value={
                      item.brand || ""
                    }
                    onChange={(e) =>
                      setItem({
                        ...item,
                        brand:
                          e.target.value,
                      })
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
                    Category
                  </label>

                  <input
                    type="text"
                    value={
                      item.category || ""
                    }
                    onChange={(e) =>
                      setItem({
                        ...item,
                        category:
                          e.target.value,
                      })
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
                    Cost Price
                  </label>

                  <input
                    type="number"
                    value={
                      item.costPrice || 0
                    }
                    onChange={(e) =>
                      setItem({
                        ...item,
                        costPrice:
                          Number(
                            e.target.value
                          ),
                      })
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
                    Sell Price
                  </label>

                  <input
                    type="number"
                    value={
                      item.sellPrice || 0
                    }
                    onChange={(e) =>
                      setItem({
                        ...item,
                        sellPrice:
                          Number(
                            e.target.value
                          ),
                      })
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

            </div>

            {/* STOCK */}
            <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">

              <h2 className="text-2xl font-black text-gray-900 mb-6">
                Stock Location
              </h2>

              <div className="space-y-5">

                {stockLocations.map(
                  (location: any) => (


                    <div
                      key={location.id}
                      className="
                        flex
                        items-center
                        justify-between
                        border-b
                        border-gray-100
                        pb-4
                      "
                    >

                      <div className="font-bold text-gray-700">
                        {location.type === "rav"
                          ? "🚚 "
                          : "🏪 "
                        }

                        {location.name}
                      </div>

                      <input
                        type="number"
                        value={
                          item.warehouseStock?.[location.id]
                          ||
                          0
                        }
                        onChange={(e) =>
                          setItem({
                            ...item,

                            warehouseStock:
                            {
                              ...item.warehouseStock,

                              [location.id]:
                                Number(
                                  e.target.value
                                )
                            },
                          })
                        }
                        className="
                          w-32
                          h-12
                          rounded-2xl
                          border-2
                          border-gray-200
                          px-4
                          text-right
                          font-bold
                        "
                      />

                    </div>
                  )
                )}

              </div>

            </div>

          </div>

          {/* MOVEMENT HISTORY */}

          <div className="
bg-white
border
rounded-3xl
p-8
shadow-sm
">


            <h2 className="
text-2xl
font-black
mb-6
">

              📜 Movement History

            </h2>


            <table className="w-full text-sm">

              <thead>

                <tr>

                  <th>Date</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Location</th>
                  <th>Reference</th>
                  <th>User</th>

                </tr>

              </thead>


              <tbody>


                {movements.map(
                  (m: any) => (


                    <tr
                      key={m.id}
                      className="border-b"
                    >


                      <td>

                        {
                          m.createdAt
                            ?.toDate()
                            ?.toLocaleString()
                        }

                      </td>


                      <td>

                        {m.type}

                      </td>


                      <td>

                        {m.qty}

                      </td>


                      <td>

                        {m.locationName}

                      </td>


                      <td>

                        {m.referenceType}

                        {" "}

                        {m.referenceNumber}

                      </td>


                      <td>

                        {m.createdByName}

                      </td>


                    </tr>


                  )

                )}


              </tbody>


            </table>


          </div>

          {/* RIGHT */}
          <div className="space-y-6">

            {/* QR */}
            <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">

              <h2 className="text-2xl font-black text-gray-900 mb-6">
                QR Code
              </h2>

              <div className="flex justify-center">

                <div className="h-64 w-64 rounded-3xl overflow-hidden border border-gray-200 bg-white p-4">

                  <Image
                    src={
                      item.qrCodeUrl ||
                      "https://placehold.co/300x300/png"
                    }
                    alt="QR"
                    width={300}
                    height={300}
                    className="h-full w-full object-contain"
                  />

                </div>

              </div>

            </div>

            {/* TOTALS */}
            <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm space-y-5">

              <div className="flex items-center justify-between">

                <div className="text-gray-500 font-bold">
                  Warehouse Total
                </div>

                <div className="text-3xl font-black text-blue-600">
                  {liveWarehouseTotal}
                </div>

              </div>

              <div className="flex items-center justify-between">

                <div className="text-gray-500 font-bold">
                  Van Total
                </div>

                <div className="text-3xl font-black text-orange-600">
                  {liveVanTotal}
                </div>

              </div>

              <div className="border-t border-gray-200 pt-5 flex items-center justify-between">

                <div className="text-gray-900 font-black text-xl">
                  Grand Total
                </div>

                <div className="text-5xl font-black text-green-600">
                  {liveGrandTotal}
                </div>

              </div>

            </div>

            {/* SAVE */}
            <button
              onClick={saveChanges}
              disabled={saving}
              className="
                w-full
                bg-blue-600
                hover:bg-blue-700
                disabled:opacity-50
                text-white
                h-16
                rounded-3xl
                text-lg
                font-black
                transition
              "
            >
              {saving
                ? "Saving..."
                : "Save Changes"}
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}