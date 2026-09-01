"use client";

import Link from "next/link";

import {
  collection,
  onSnapshot,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import PageHeader from "@/app/components/PageHeader";

interface PurchaseOrder {

  id: string;

  supplier?: string;

  referenceNumber?: string;

  employee?: string;

  status?: string;

  grandTotal: number;

  createdAt?: any;

  updatedBy?: string;

  itemRef?: string;

  totalQty: number;
}

export default function PurchaseOrderListPage() {

  const [purchaseOrders, setPurchaseOrders] =
    useState<PurchaseOrder[]>([]);

  const [search, setSearch] =
    useState("");

  const [activeTab, setActiveTab] =
    useState("all");

  useEffect(() => {

    const unsub = onSnapshot(

      collection(
        clientDb,
        "companies",
        "comp_001",
        "purchase_orders"
      ),

      (snapshot) => {

        setPurchaseOrders(

          snapshot.docs.map((doc) => {

            const data =
              doc.data();

            return {

              id: doc.id,

              ...data,

              grandTotal:
                Number(
                  data.grandTotal || 0
                ),

              totalQty:

                data.lines?.reduce(
                  (
                    sum: number,
                    line: any
                  ) =>

                    sum +
                    Number(
                      line.qty || 0
                    ),

                  0
                ) || 0,

              itemRef:
                data.lines?.[0]
                  ?.code || "",
            };
          })
        );
      }
    );

    return () => unsub();

  }, []);

  const filteredPOs =
    useMemo(() => {

      return purchaseOrders.filter(
        (po) => {

          const matchesSearch =

            po.supplier
              ?.toLowerCase()
              .includes(
                search.toLowerCase()
              )

            ||

            po.referenceNumber
              ?.toLowerCase()
              .includes(
                search.toLowerCase()
              )

            ||

            po.employee
              ?.toLowerCase()
              .includes(
                search.toLowerCase()
              );

          if (
            activeTab === "all"
          ) {
            return matchesSearch;
          }

          return (
            matchesSearch &&
            po.status === activeTab
          );
        }
      );

    }, [
      purchaseOrders,
      search,
      activeTab,
    ]);

  const approvedCount =

    purchaseOrders.filter(
      (x) =>
        x.status ===
        "approved"
    ).length;

  const pendingCount =

    purchaseOrders.filter(
      (x) =>
        x.status ===
        "pending"
    ).length;

  const billedCount =

    purchaseOrders.filter(
      (x) =>
        x.status ===
        "billed"
    ).length;

  return (

    <div className="min-h-screen bg-[#f5f7fb]">

      <div className="p-6">

        <PageHeader />

        <div className="max-w-[1900px] mx-auto">

          {/* MESSAGES */}
          <div className="
            flex
            items-center
            justify-between
            mb-6
          ">

            <div />

            <div className="
              flex
              items-center
              gap-3
            ">

              <Link
                href="/suppliers"
                className="
                  bg-gray-200
                  hover:bg-gray-300
                  text-gray-900
                  px-6
                  h-14
                  rounded-2xl
                  inline-flex
                  items-center
                  justify-center
                  font-black
                  text-sm
                "
              >
                Suppliers
              </Link>

              <Link
                href="/purchase-orders"
                className="
                  bg-blue-600
                  hover:bg-blue-700
                  text-white
                  px-6
                  h-14
                  rounded-2xl
                  inline-flex
                  items-center
                  justify-center
                  font-black
                  text-sm
                "
              >
                + Add Purchase Order
              </Link>

            </div>

          </div>

          {/* CARD */}
          <div className="
            bg-white
            border
            border-gray-200
            rounded-3xl
            shadow-sm
            overflow-hidden
          ">

            {/* TABS */}
            <div className="
              grid
              grid-cols-4
              border-b
              border-gray-200
            ">

              <button
                onClick={() =>
                  setActiveTab(
                    "all"
                  )
                }
                className={`
                  h-16
                  font-black
                  text-sm
                  border-b-2

                  ${activeTab ===
                    "all"

                    ? "border-blue-600 text-blue-600 bg-blue-50"

                    : "border-transparent text-gray-500"
                  }
                `}
              >
                All (
                {
                  purchaseOrders.length
                }
                )
              </button>

              <button
                onClick={() =>
                  setActiveTab(
                    "pending"
                  )
                }
                className={`
                  h-16
                  font-black
                  text-sm
                  border-b-2

                  ${activeTab ===
                    "pending"

                    ? "border-orange-600 text-orange-600 bg-orange-50"

                    : "border-transparent text-gray-500"
                  }
                `}
              >
                Pending (
                {
                  pendingCount
                }
                )
              </button>

              <button
                onClick={() =>
                  setActiveTab(
                    "approved"
                  )
                }
                className={`
                  h-16
                  font-black
                  text-sm
                  border-b-2

                  ${activeTab ===
                    "approved"

                    ? "border-green-600 text-green-600 bg-green-50"

                    : "border-transparent text-gray-500"
                  }
                `}
              >
                Approved (
                {
                  approvedCount
                }
                )
              </button>

              <button
                onClick={() =>
                  setActiveTab(
                    "billed"
                  )
                }
                className={`
                  h-16
                  font-black
                  text-sm
                  border-b-2

                  ${activeTab ===
                    "billed"

                    ? "border-purple-600 text-purple-600 bg-purple-50"

                    : "border-transparent text-gray-500"
                  }
                `}
              >
                Received (
                {
                  billedCount
                }
                )
              </button>

            </div>

            {/* SEARCH */}
            <div className="
              p-5
              border-b
              border-gray-200
            ">

              <input
                type="text"
                placeholder="Search supplier, employee or reference..."
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
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            {/* TABLE */}
            <div className="overflow-x-auto">

              <table className="w-full">

                <thead>

                  <tr className="
                    border-b
                    border-gray-200
                    text-left
                    text-xs
                    uppercase
                    tracking-wider
                    text-gray-500
                    bg-gray-50
                  ">

                    <th className="px-5 py-4">
                      PO Number
                    </th>

                    <th className="px-5 py-4">
                      Supplier
                    </th>

                    <th className="px-5 py-4">
                      Employee
                    </th>

                    <th className="px-5 py-4">
                      Reference
                    </th>

                    <th className="px-5 py-4">
                      Status
                    </th>

                    <th className="px-5 py-4">
                      Item Ref
                    </th>

                    <th className="px-5 py-4">
                      Total Qty
                    </th>

                    <th className="px-5 py-4">
                      Total Incl
                    </th>

                    <th className="px-5 py-4">
                      Created Date
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {filteredPOs.map(
                    (po, index) => (

                      <tr
                        key={po.id}

                        onClick={() => {

                          window.location.href =

                            `/purchase-orders/${po.id}`;
                        }}

                        className="
                          border-b
                          border-gray-100
                          hover:bg-blue-50
                          transition
                          cursor-pointer
                        "
                      >

                        <td className="
                          px-5
                          py-4
                          font-black
                          text-blue-600
                        ">

                          PO
                          {String(
                            index + 1
                          ).padStart(
                            6,
                            "0"
                          )}

                        </td>

                        <td className="
                          px-5
                          py-4
                          font-bold
                          text-gray-800
                        ">
                          {po.supplier}
                        </td>

                        <td className="px-5 py-4">
                          {po.employee}
                        </td>

                        <td className="px-5 py-4">
                          {
                            po.referenceNumber
                          }
                        </td>

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

                              ${po.status ===
                                "approved"

                                ? "bg-green-100 text-green-700"

                                : po.status ===
                                  "billed"

                                  ? "bg-purple-100 text-purple-700"

                                  : "bg-orange-100 text-orange-700"
                              }
                            `}
                          >
                            {po.status}
                          </div>

                        </td>

                        <td className="px-5 py-4">
                          {po.itemRef}
                        </td>

                        <td className="
                          px-5
                          py-4
                          font-bold
                        ">
                          {po.totalQty}
                        </td>

                        <td className="
                          px-5
                          py-4
                          font-black
                          text-gray-900
                        ">
                          R{" "}
                          {po.grandTotal.toFixed(
                            2
                          )}
                        </td>

                        <td className="
                          px-5
                          py-4
                          text-gray-500
                        ">

                          {po.createdAt
                            ?.toDate?.()
                            ?.toLocaleString?.() ||
                            "-"}

                        </td>

                      </tr>
                    )
                  )}

                </tbody>

              </table>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
