"use client";

import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

import {
  useState,
} from "react";
import { useRouter } from "next/navigation";

export default function AddSupplierPage() {

  const router = useRouter();

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

      preferredCommunication: "Email",
      communicationEmail: true,
      sendPurchaseOrders: true,
      sendRemittances: true,
      sendOrderUpdates: true,
      communicationNotes: "",
    });

  async function saveSupplier() {

    try {

      setSaving(true);

      const settingsRef = doc(clientDb, "companies", COMPANY_ID, "settings", "supplierSettings");
      const supplierRef = doc(collection(clientDb, "companies", COMPANY_ID, "suppliers"));
      await runTransaction(clientDb, async (transaction) => {
        const snapshot = await transaction.get(settingsRef);
        const numbering = snapshot.data()?.supplierNumbering || {};
        const manualCode = form.supplierCode.trim();
        const prefix = String(numbering.prefix ?? "SUP-").trim();
        const nextNumber = Math.max(1, Number(numbering.nextNumber || 1));
        const padding = Math.min(10, Math.max(1, Number(numbering.padding || 5)));
        const supplierCode = manualCode || `${prefix}${String(nextNumber).padStart(padding, "0")}`;
        if (!manualCode) transaction.set(settingsRef, { supplierNumbering: { prefix, padding, nextNumber: nextNumber + 1 }, updatedAt: serverTimestamp() }, { merge: true });
        transaction.set(supplierRef, { ...form, supplierCode, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });

      router.replace("/suppliers");

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
                placeholder="Leave blank to assign automatically"
                onChange={(e) =>
                  setForm({
                    ...form,
                    supplierCode:
                      e.target.value,
                  })
                }
                className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5"
              />
              <p className="mt-2 text-xs text-gray-500">Optional. The next configured supplier code will be assigned when left blank.</p>

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

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold text-gray-700">Preferred Method<select value={form.preferredCommunication === "Do not contact" ? "Do not contact" : "Email"} onChange={(event) => setForm({ ...form, preferredCommunication: event.target.value })} className="mt-2 h-12 w-full rounded-xl border border-gray-300 bg-white px-3"><option>Email</option><option>Do not contact</option></select></label>
              <div className="space-y-2">
                {[
                  ["communicationEmail", "Allow email"],
                  ["sendPurchaseOrders", "Send purchase orders"],
                  ["sendRemittances", "Send remittance notifications"],
                  ["sendOrderUpdates", "Send order updates"],
                ].map(([field, label]) => <label key={field} className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={(form as any)[field] === true} onChange={(event) => setForm({ ...form, [field]: event.target.checked })} />{label}</label>)}
              </div>
              <label className="text-sm font-bold text-gray-700 md:col-span-2">Communication Notes<textarea value={form.communicationNotes} onChange={(event) => setForm({ ...form, communicationNotes: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-gray-300 bg-white p-3" /></label>
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
