"use client";

import Link from "next/link";

import {
  COMPANY_ID,
} from "@/lib/company";

import {
  collection,
  onSnapshot,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  useEffect,
  useState,
} from "react";

import PageHeader from "@/app/components/PageHeader";

interface Customer {

  id: string;

  customerType?: string;

  companyName?: string;

  customerCode?: string;

  primaryContactName?: string;

  primaryContactNumber?: string;

  primaryContactEmail?: string;

  email?: string;

  vatNumber?: string;
}

export default function CustomersPage() {

  const [customers, setCustomers] =
    useState<Customer[]>([]);

  const [search, setSearch] =
    useState("");

  useEffect(() => {

    const unsub = onSnapshot(

      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "customers"
      ),

      (snapshot) => {

        setCustomers(

          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as any),
          }))
        );
      }
    );

    return () => unsub();

  }, []);

  const filteredCustomers =

    customers.filter(
      (customer) => {

        const value =
          search.toLowerCase();

        return (

          customer.companyName
            ?.toLowerCase()
            .includes(value)

          ||

          customer.customerCode
            ?.toLowerCase()
            .includes(value)

          ||

          customer.primaryContactName
            ?.toLowerCase()
            .includes(value)

          ||

          customer.primaryContactNumber
            ?.toLowerCase()
            .includes(value)

          ||

          customer.primaryContactEmail
            ?.toLowerCase()
            .includes(value)
        );
      }
    );

  return (

    <div className="min-h-screen bg-[#f5f7fb]">

      <div className="p-6">

        <PageHeader />

        <div className="max-w-[1800px] mx-auto">

          {/* ACTION BAR */}
          <div
            className="
              flex
              items-center
              justify-between
              mb-6
            "
          >

            <div />

            <Link
              href="/customers/new"
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
              + Add Customer
            </Link>


          </div>

          {/* SEARCH */}
          <div
            className="
              bg-white
              border
              border-gray-200
              rounded-3xl
              p-5
              shadow-sm
              mb-6
            "
          >

            <input
              type="text"
              placeholder="
                Search customer,
                company,
                phone or email...
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
                outline-none
                focus:border-blue-500
              "
            />

          </div>

          {/* TABLE */}
          <div
            className="
              bg-white
              border
              border-gray-200
              rounded-3xl
              overflow-hidden
              shadow-sm
            "
          >

            <div className="overflow-x-auto">

              <table className="w-full">

                <thead>

                  <tr
                    className="
                      bg-gray-50
                      border-b
                      border-gray-200
                      text-left
                      text-xs
                      uppercase
                      tracking-wider
                      text-gray-500
                    "
                  >

                    <th className="px-5 py-4">
                      Type
                    </th>

                    <th className="px-5 py-4">
                      Customer Name
                    </th>

                    <th className="px-5 py-4">
                      Company
                    </th>

                    <th className="px-5 py-4">
                      Contact Person
                    </th>

                    <th className="px-5 py-4">
                      Contact Number
                    </th>

                    <th className="px-5 py-4">
                      Email
                    </th>

                    <th className="px-5 py-4">
                      VAT Number
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {filteredCustomers.map(
                    (customer) => (

                      <tr
                        key={customer.id}

                        onClick={() =>
                          window.location.href =
                          `/customers/${customer.id}`
                        }

                        className="
                          border-b
                          border-gray-100
                          hover:bg-blue-50
                          transition
                          cursor-pointer
                        "
                      >

                        {/* TYPE */}
                        <td className="px-5 py-4">

                          <span
                            className="
                              px-3
                              py-1
                              rounded-full
                              text-xs
                              font-bold
                              bg-blue-100
                              text-blue-700
                            "
                          >

                            {
                              customer.customerType
                                ?.toLowerCase() ===
                                "individual"

                                ? "INDIVIDUAL"

                                : "COMPANY"
                            }

                          </span>

                        </td>

                        {/* CUSTOMER */}
                        <td
                          className="
                            px-5
                            py-4
                            font-black
                            text-blue-600
                          "
                        >
                          {customer.companyName}
                        </td>

                        {/* COMPANY */}
                        <td
                          className="
                            px-5
                            py-4
                            font-bold
                          "
                        >
                          {customer.companyName}
                        </td>

                        {/* CONTACT */}
                        <td className="px-5 py-4">
                          {
                            customer.primaryContactName
                          }
                        </td>

                        {/* NUMBER */}
                        <td className="px-5 py-4">
                          {
                            customer.primaryContactNumber
                          }
                        </td>

                        {/* EMAIL */}
                        <td className="px-5 py-4">
                          {
                            customer.primaryContactEmail
                          }
                        </td>

                        {/* VAT */}
                        <td className="px-5 py-4">
                          {customer.vatNumber}
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