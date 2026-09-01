"use client";

import Link from "next/link";
import Image from "next/image";

import {
  useEffect,
  useState,
} from "react";

import {
  collection,
  onSnapshot,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import PageHeader from "@/app/components/PageHeader";

interface InventoryItem {

  id: string;

  imageUrl?: string;

  qrCodeUrl?: string;

  partNumber?: string;

  description?: string;

  category?: string;

  brand?: string;

  warehouseTotal?: number;

  vanTotal?: number;

  grandTotal?: number;

  sellPrice?: number;

  isActive?: boolean;
}

export default function InventoryPage() {

  const [inventory, setInventory] =
    useState<InventoryItem[]>([]);

  const [search, setSearch] =
    useState("");

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
            };
          });

        setInventory(items);
      }
    );

    return () => unsub();

  }, []);

  const filteredInventory =

    inventory.filter((item) => {

      const searchText =
        search.toLowerCase();

      return (

        item.partNumber
          ?.toLowerCase()
          .includes(searchText)

        ||

        item.description
          ?.toLowerCase()
          .includes(searchText)

        ||

        item.brand
          ?.toLowerCase()
          .includes(searchText)
      );
    });

  return (

    <div className="min-h-screen bg-[#f5f7fb]">

      <div className="p-6">

        <PageHeader />

        <div className="max-w-[1800px] mx-auto">

          {/* ACTION BAR */}
          <div className="
            flex
            flex-wrap
            items-center
            justify-between
            gap-4
            mb-6
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
                  items-center
                  justify-center
                  bg-blue-600
                  hover:bg-blue-700
                  text-white
                  px-5
                  h-12
                  rounded-2xl
                  text-sm
                  font-bold
                  transition
                "
              >
                + Add Inventory
              </Link>

              <Link
                href="/grv"
                className="
                  inline-flex
                  items-center
                  justify-center
                  bg-green-600
                  hover:bg-green-700
                  text-white
                  px-5
                  h-12
                  rounded-2xl
                  text-sm
                  font-bold
                  transition
                "
              >
                GRV
              </Link>

              <Link
                href="/purchase-orders"
                className="
                  inline-flex
                  items-center
                  justify-center
                  bg-purple-600
                  hover:bg-purple-700
                  text-white
                  px-5
                  h-12
                  rounded-2xl
                  text-sm
                  font-bold
                  transition
                "
              >
                Purchase Orders
              </Link>

              <Link
                href="/stock-adjustments"
                className="
                  inline-flex
                  items-center
                  justify-center
                  bg-orange-600
                  hover:bg-orange-700
                  text-white
                  px-5
                  h-12
                  rounded-2xl
                  text-sm
                  font-bold
                  transition
                "
              >
                Stock Adjustment
              </Link>

              <Link
                href="/stock-take"
                className="
                  inline-flex
                  items-center
                  justify-center
                  bg-red-600
                  hover:bg-red-700
                  text-white
                  px-5
                  h-12
                  rounded-2xl
                  text-sm
                  font-bold
                  transition
                "
              >
                Stock Take
              </Link>

            </div>

          </div>

          {/* SEARCH */}
          <div className="
            bg-white
            border
            border-gray-200
            rounded-3xl
            p-5
            shadow-sm
            mb-6
          ">

            <input
              type="text"
              placeholder="
                Search part number,
                description or brand...
              "
              value={search}
              onChange={(e) =>
                setSearch(
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
                text-lg
                outline-none
                focus:border-blue-500
              "
            />

          </div>

          {/* TABLE */}
          <div className="
            bg-white
            border
            border-gray-200
            rounded-3xl
            overflow-hidden
            shadow-sm
          ">

            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead>

                  <tr className="
                    bg-gray-50
                    border-b
                    border-gray-200
                    text-left
                    uppercase
                    tracking-wider
                    text-[11px]
                    text-gray-500
                  ">

                    <th className="px-5 py-4 font-black">
                      Image
                    </th>

                    <th className="px-5 py-4 font-black">
                      QR
                    </th>

                    <th className="px-5 py-4 font-black">
                      Part Number
                    </th>

                    <th className="px-5 py-4 font-black">
                      Description
                    </th>

                    <th className="px-5 py-4 font-black">
                      Category
                    </th>

                    <th className="px-5 py-4 font-black">
                      Brand
                    </th>

                    <th className="px-5 py-4 font-black">
                      Warehouse
                    </th>

                    <th className="px-5 py-4 font-black">
                      Vans
                    </th>

                    <th className="px-5 py-4 font-black">
                      Total
                    </th>

                    <th className="px-5 py-4 font-black">
                      Sell Price
                    </th>

                    <th className="px-5 py-4 font-black">
                      Status
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {filteredInventory.map((item) => (

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
                      "
                    >

                      {/* IMAGE */}
                      <td className="px-5 py-4">

                        <div className="
                          h-16
                          w-16
                          rounded-2xl
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

                      {/* QR */}
                      <td className="px-5 py-4">

                        <div className="
                          h-16
                          w-16
                          rounded-2xl
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

                      {/* PART NUMBER */}
                      <td className="
                        px-5
                        py-4
                        font-black
                        text-blue-600
                        text-base
                      ">
                        {item.partNumber}
                      </td>

                      {/* DESCRIPTION */}
                      <td className="
                        px-5
                        py-4
                        font-semibold
                        text-gray-800
                      ">
                        {item.description}
                      </td>

                      {/* CATEGORY */}
                      <td className="px-5 py-4">
                        {item.category}
                      </td>

                      {/* BRAND */}
                      <td className="px-5 py-4">
                        {item.brand}
                      </td>

                      {/* WAREHOUSE */}
                      <td className="
                        px-5
                        py-4
                        font-bold
                      ">
                        {Number(
                          item.warehouseTotal || 0
                        ).toFixed(2)}
                      </td>

                      {/* VANS */}
                      <td className="
                        px-5
                        py-4
                        font-bold
                      ">
                        {Number(
                          item.vanTotal || 0
                        ).toFixed(2)}
                      </td>

                      {/* TOTAL */}
                      <td className="
                        px-5
                        py-4
                        font-black
                        text-green-600
                        text-lg
                      ">
                        {Number(
                          item.grandTotal || 0
                        ).toFixed(2)}
                      </td>

                      {/* SELL PRICE */}
                      <td className="
                        px-5
                        py-4
                        font-bold
                      ">
                        R{" "}
                        {Number(
                          item.sellPrice || 0
                        ).toFixed(2)}
                      </td>

                      {/* STATUS */}
                      <td className="px-5 py-4">

                        <div
                          className={`
                            inline-flex
                            items-center
                            px-3
                            py-1
                            rounded-full
                            text-xs
                            font-black

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