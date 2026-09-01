"use client";

import Link from "next/link";

import { COMPANY_ID } from "@/lib/company";

import { collection, onSnapshot } from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";

import { useEffect, useState } from "react";

import PageHeader from "@/app/components/PageHeader";
import ConfigurableModuleTable, { ModuleColumn } from "@/components/shared/ConfigurableModuleTable";
import ModuleSearchField from "@/components/ModuleSearchField";

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
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "customers"),

      (snapshot) => {
        setCustomers(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as any),
          })),
        );
      },
    );

    return () => unsub();
  }, []);

  const filteredCustomers = customers.filter((customer) => {
    const value = search.toLowerCase();

    return (
      customer.companyName?.toLowerCase().includes(value) ||
      customer.customerCode?.toLowerCase().includes(value) ||
      customer.primaryContactName?.toLowerCase().includes(value) ||
      customer.primaryContactNumber?.toLowerCase().includes(value) ||
      customer.primaryContactEmail?.toLowerCase().includes(value)
    );
  });
  const customerColumns: ModuleColumn<Customer>[] = [
    { id: "type", label: "Type", render: (customer) => <span className="rounded-full bg-blue-100 px-3 py-1 font-bold text-blue-700">{customer.customerType?.toLowerCase() === "individual" ? "INDIVIDUAL" : "COMPANY"}</span> },
    { id: "name", label: "Customer Name", render: (customer) => <span className="font-black text-blue-600">{customer.companyName}</span> },
    { id: "company", label: "Company", render: (customer) => <span className="font-bold">{customer.companyName}</span> },
    { id: "contact", label: "Contact Person", render: (customer) => customer.primaryContactName },
    { id: "number", label: "Contact Number", render: (customer) => customer.primaryContactNumber },
    { id: "email", label: "Email", render: (customer) => customer.primaryContactEmail },
    { id: "vat", label: "VAT Number", render: (customer) => customer.vatNumber },
  ];

  return (
    <div className="module-list-page bg-[#f5f7fb]">
      <div className="module-list-content relative p-6">
        <PageHeader />

        <div className="module-list-content w-full">
          {/* TABLE */}
          <ConfigurableModuleTable rows={filteredCustomers} columns={customerColumns} storageKey="fleetfix_customer_columns_v1" onRowClick={(customer) => { window.location.href = `/customers/${customer.id}`; }} headerActions={<><ModuleSearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, company, phone or email..." className="w-full md:w-[420px]" /><Link href="/customers/new" className="inline-flex h-11 flex-col items-center justify-center rounded-2xl bg-blue-600 px-6 text-center text-sm font-black leading-tight text-white hover:bg-blue-700"><span>+ Add</span><span>Customer</span></Link></>} />
          <div
            className="
              hidden
              bg-white
              border
              border-gray-200
              rounded-3xl
              overflow-hidden
              shadow-sm
            "
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs [&_th]:!px-4 [&_th]:!py-2 [&_td]:!px-4 [&_td]:!py-2">
                <thead>
                  <tr
                    className="
                      bg-gray-50
                      border-b
                      border-gray-200
                      text-left
                      text-[10px]
                      uppercase
                      tracking-wider
                      text-gray-500
                    "
                  >
                    <th className="px-5 py-4">Type</th>

                    <th className="px-5 py-4">Customer Name</th>

                    <th className="px-5 py-4">Company</th>

                    <th className="px-5 py-4">Contact Person</th>

                    <th className="px-5 py-4">Contact Number</th>

                    <th className="px-5 py-4">Email</th>

                    <th className="px-5 py-4">VAT Number</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() =>
                        (window.location.href = `/customers/${customer.id}`)
                      }
                      className="
                          border-b
                          border-gray-100
                          hover:bg-blue-50
                          transition
                          cursor-pointer
                          text-xs
                          font-semibold
                          text-slate-700
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
                          {customer.customerType?.toLowerCase() === "individual"
                            ? "INDIVIDUAL"
                            : "COMPANY"}
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
                        {customer.primaryContactName}
                      </td>

                      {/* NUMBER */}
                      <td className="px-5 py-4">
                        {customer.primaryContactNumber}
                      </td>

                      {/* EMAIL */}
                      <td className="px-5 py-4">
                        {customer.primaryContactEmail}
                      </td>

                      {/* VAT */}
                      <td className="px-5 py-4">{customer.vatNumber}</td>
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
