"use client";

import Link from "next/link";

import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { COMPANY_ID } from "@/lib/company";

import { clientDb } from "@/lib/firebaseClient";

import {
  useState,
} from "react";

export default function AddCustomerPage() {

  const [saving, setSaving] =
    useState(false);

  const [form, setForm] =
    useState({

      customerType:
        "Company",

      companyName: "",

      customerCode: "",

      primaryContactName: "",

      primaryContactNumber: "",

      primaryContactEmail: "",

      vatNumber: "",

      billingAddress: "",

      notes: "",
    });

  async function saveCustomer() {

    try {

      setSaving(true);

      await addDoc(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "customers"
        ),

        {
          ...form,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      alert(
        "Customer Added"
      );

      location.href =
        "/customers";

    } catch (error) {

      console.error(error);

      alert(
        "Failed to save customer"
      );

    } finally {

      setSaving(false);

    }
  }

  return (

    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="max-w-[1500px] mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">

          <div>

            <div className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold mb-2">
              CRM
            </div>

            <h1 className="text-4xl font-black text-gray-900">
              Add Customer
            </h1>

          </div>

          <Link
            href="/customers"
            className="
              bg-gray-200
              hover:bg-gray-300
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
            Back
          </Link>

        </div>

        {/* FORM */}
        <div
          className="
            bg-white
            border
            border-gray-200
            rounded-3xl
            p-8
            shadow-sm
          "
        >

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* CUSTOMER TYPE */}
            <div className="xl:col-span-2">

              <label className="block text-sm font-bold text-gray-700 mb-3">
                Customer Type
              </label>

              <div className="flex gap-3">

                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      customerType:
                        "Company",
                    })
                  }
                  className={`
                    h-14
                    px-8
                    rounded-2xl
                    font-bold
                    transition
                    ${form.customerType ===
                      "Company"

                      ? "bg-blue-600 text-white"

                      : "bg-gray-100 text-gray-700"
                    }
                  `}
                >
                  Company
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      customerType:
                        "Individual",
                    })
                  }
                  className={`
                    h-14
                    px-8
                    rounded-2xl
                    font-bold
                    transition
                    ${form.customerType ===
                      "Individual"

                      ? "bg-blue-600 text-white"

                      : "bg-gray-100 text-gray-700"
                    }
                  `}
                >
                  Individual
                </button>

              </div>

            </div>

            {/* COMPANY NAME */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Company Name
              </label>

              <input
                type="text"
                value={
                  form.companyName
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    companyName:
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

            {/* CUSTOMER CODE */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Customer Code
              </label>

              <input
                type="text"
                value={
                  form.customerCode
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    customerCode:
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

            {/* PRIMARY CONTACT NAME */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Primary Contact Name
              </label>

              <input
                type="text"
                value={
                  form.primaryContactName
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    primaryContactName:
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

            {/* PRIMARY CONTACT NUMBER */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Primary Contact Number
              </label>

              <input
                type="text"
                value={
                  form.primaryContactNumber
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    primaryContactNumber:
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

            {/* PRIMARY CONTACT EMAIL */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Primary Contact Email
              </label>

              <input
                type="email"
                value={
                  form.primaryContactEmail
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    primaryContactEmail:
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


            {/* VAT */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                VAT Number
              </label>

              <input
                type="text"
                value={
                  form.vatNumber
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    vatNumber:
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

            {/* BILLING ADDRESS */}
            <div className="xl:col-span-2">

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Billing Address
              </label>

              <textarea
                value={
                  form.billingAddress
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    billingAddress:
                      e.target.value,
                  })
                }
                className="
                  w-full
                  h-40
                  rounded-2xl
                  border-2
                  border-gray-200
                  p-5
                "
              />

            </div>

            {/* NOTES */}
            <div className="xl:col-span-2">

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Notes
              </label>

              <textarea
                value={form.notes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notes:
                      e.target.value,
                  })
                }
                className="
                  w-full
                  h-40
                  rounded-2xl
                  border-2
                  border-gray-200
                  p-5
                "
              />

            </div>

          </div>

          {/* SAVE */}
          <div className="flex justify-end mt-10">

            <button
              onClick={saveCustomer}
              disabled={saving}
              className="
                bg-blue-600
                hover:bg-blue-700
                disabled:opacity-50
                text-white
                px-10
                h-16
                rounded-2xl
                text-lg
                font-black
              "
            >
              {saving
                ? "Saving..."
                : "Save Customer"}
            </button>

          </div>

        </div>

      </div>

    </div >
  );
}