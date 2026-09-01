"use client";

import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";

import {
  useState,
} from "react";

export default function AddSupplierPage() {

  const [saving, setSaving] =
    useState(false);

  const [form, setForm] =
    useState({

      supplierCode: "",

      supplierName: "",

      address: "",

      contactName: "",

      contactSurname: "",

      cellNumber: "",

      email: "",
    });

  async function saveSupplier() {

    try {

      setSaving(true);

      await addDoc(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "suppliers"
        ),

        {
          ...form,

          createdAt:
            serverTimestamp(),
        }
      );

      alert(
        "Supplier Added"
      );

      location.href =
        "/suppliers";

    } catch (error) {

      console.error(error);

      alert(
        "Failed"
      );

    } finally {

      setSaving(false);

    }
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="max-w-[1200px] mx-auto">

        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">

          <h1 className="text-4xl font-black text-gray-900 mb-8">
            Add Supplier
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Supplier Code
              </label>

              <input
                type="text"
                value={form.supplierCode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    supplierCode:
                      e.target.value,
                  })
                }
                className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5"
              />

            </div>

            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Supplier Name
              </label>

              <input
                type="text"
                value={form.supplierName}
                onChange={(e) =>
                  setForm({
                    ...form,
                    supplierName:
                      e.target.value,
                  })
                }
                className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5"
              />

            </div>

            <div className="lg:col-span-2">

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Supplier Address
              </label>

              <textarea
                value={form.address}
                onChange={(e) =>
                  setForm({
                    ...form,
                    address:
                      e.target.value,
                  })
                }
                className="w-full h-32 rounded-2xl border-2 border-gray-200 p-5"
              />

            </div>

            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Contact Name
              </label>

              <input
                type="text"
                value={form.contactName}
                onChange={(e) =>
                  setForm({
                    ...form,
                    contactName:
                      e.target.value,
                  })
                }
                className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5"
              />

            </div>

            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Contact Surname
              </label>

              <input
                type="text"
                value={form.contactSurname}
                onChange={(e) =>
                  setForm({
                    ...form,
                    contactSurname:
                      e.target.value,
                  })
                }
                className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5"
              />

            </div>

            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Cell Number
              </label>

              <input
                type="text"
                value={form.cellNumber}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cellNumber:
                      e.target.value,
                  })
                }
                className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5"
              />

            </div>

            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Email Address
              </label>

              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({
                    ...form,
                    email:
                      e.target.value,
                  })
                }
                className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5"
              />

            </div>

          </div>

          {/* COMMUNICATIONS */}
          <div className="
            mt-10
            bg-gray-50
            border
            border-gray-200
            rounded-3xl
            p-6
          ">

            <div className="text-xl font-black text-gray-900 mb-4">
              Communications
            </div>

            <div className="text-sm text-gray-500">
              All supplier emails and communication history will display here.
            </div>

          </div>

          {/* SAVE */}
          <div className="flex justify-end mt-10">

            <button
              onClick={saveSupplier}
              disabled={saving}
              className="
                bg-blue-600
                hover:bg-blue-700
                disabled:opacity-50
                text-white
                px-8
                h-14
                rounded-2xl
                text-sm
                font-black
              "
            >
              {saving
                ? "Saving..."
                : "Save Supplier"}
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}