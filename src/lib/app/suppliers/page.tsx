"use client";

import Link from "next/link";

import {
  collection,
  onSnapshot,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";

import {
  useEffect,
  useState,
} from "react";

interface Supplier {

  id: string;

  supplierCode?: string;

  supplierName?: string;

  address?: string;

  contactName?: string;

  contactSurname?: string;

  cellNumber?: string;

  email?: string;
}

export default function SuppliersPage() {

  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  useEffect(() => {

    const unsub = onSnapshot(

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

    return () => unsub();

  }, []);

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="max-w-[1700px] mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">

          <div>

            <div className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold mb-2">
              Purchases
            </div>

            <h1 className="text-4xl font-black text-gray-900">
              Suppliers
            </h1>

          </div>

          <Link
            href="/suppliers/new"
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
            + Add Supplier
          </Link>

        </div>

        {/* TABLE */}
        <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">

          <div className="overflow-x-auto">

            <table className="w-full">

              <thead>

                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">

                  <th className="px-5 py-4">
                    Supplier Code
                  </th>

                  <th className="px-5 py-4">
                    Supplier Name
                  </th>

                  <th className="px-5 py-4">
                    Contact Person
                  </th>

                  <th className="px-5 py-4">
                    Cell Number
                  </th>

                  <th className="px-5 py-4">
                    Email Address
                  </th>

                </tr>

              </thead>

              <tbody>

                {suppliers.map(
                  (supplier) => (

                    <tr
                      key={supplier.id}
                      className="
                        border-b
                        border-gray-100
                        hover:bg-blue-50
                        transition
                        cursor-pointer
                      "
                    >

                      <td className="px-5 py-4 font-black text-blue-600">
                        {supplier.supplierCode}
                      </td>

                      <td className="px-5 py-4 font-bold">
                        {supplier.supplierName}
                      </td>

                      <td className="px-5 py-4">
                        {supplier.contactName}
                        {" "}
                        {supplier.contactSurname}
                      </td>

                      <td className="px-5 py-4">
                        {supplier.cellNumber}
                      </td>

                      <td className="px-5 py-4">
                        {supplier.email}
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
  );
}