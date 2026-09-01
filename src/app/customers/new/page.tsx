"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { COMPANY_ID } from "@/lib/company";

import { clientDb } from "@/lib/firebaseClient";
import { normalizedPhoneValues } from "@/lib/whatsapp/phoneIndex";

import {
  useEffect,
  useState,
} from "react";

export default function AddCustomerPage() {

  const router = useRouter();

  const [saving, setSaving] =
    useState(false);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  useEffect(() => {
    getDoc(doc(clientDb, "companies", COMPANY_ID, "settings", "customerFields"))
      .then((snapshot) => {
        if (!snapshot.exists()) return;
        setCustomFields((snapshot.data().fields || []).filter((field: any) => field.showOnCreate !== false && field.isCustom === true));
      })
      .catch(console.error);
  }, []);

  const [form, setForm] =
    useState({

      customerType:
        "Company",

      accountType:
        "COD",

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

    const missingCustomField = customFields.find((field) => field.required && String(customValues[field.id] ?? "").trim() === "");
    if (missingCustomField) {
      alert(`${missingCustomField.label} is required.`);
      return;
    }

    try {

      setSaving(true);

      const settingsRef = doc(clientDb, "companies", COMPANY_ID, "settings", "customerFields");
      const customerRef = doc(collection(clientDb, "companies", COMPANY_ID, "customers"));
      await runTransaction(clientDb, async (transaction) => {
        const snapshot = await transaction.get(settingsRef);
        const data = snapshot.exists() ? snapshot.data() : {};
        const fields = (data.fields || []).map((field: any) => {
          const enteredValue = String(customValues[field.id] ?? "").trim();
          if (field.isCustom !== true || field.type === "text" || !enteredValue) return field;
          const options = Array.isArray(field.options) ? field.options : [];
          return options.some((option: string) => option.toLowerCase() === enteredValue.toLowerCase())
            ? field
            : { ...field, options: [...options, enteredValue] };
        });
        const manualCode = form.customerCode.trim();
        const numbering = data.customerNumbering || {};
        const prefix = String(numbering.prefix ?? "CUS-").trim();
        const nextNumber = Math.max(1, Number(numbering.nextNumber || 1));
        const padding = Math.min(10, Math.max(1, Number(numbering.padding || 5)));
        const customerCode = manualCode || `${prefix}${String(nextNumber).padStart(padding, "0")}`;

        transaction.set(settingsRef, {
          fields: fields.length ? fields : data.fields || [],
          ...(manualCode ? {} : { customerNumbering: { prefix, padding, nextNumber: nextNumber + 1 } }),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        transaction.set(customerRef, {
          ...form,
          normalizedPhoneNumbers: normalizedPhoneValues([form.primaryContactNumber]),
          primaryContactNumberE164: normalizedPhoneValues([form.primaryContactNumber])[0] || "",
          customerCode,
          customFields: customValues,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      router.replace("/customers");

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

            {/* ACCOUNT TYPE */}
            <div className="xl:col-span-2">

              <label className="block text-sm font-bold text-gray-700 mb-3">
                Account Type
              </label>

              <div className="flex flex-wrap gap-3">

                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      accountType: "30 Day Account",
                    })
                  }
                  className={`h-14 rounded-2xl px-8 font-bold transition ${
                    form.accountType === "30 Day Account"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  30 Day Account
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      accountType: "COD",
                    })
                  }
                  className={`h-14 rounded-2xl px-8 font-bold transition ${
                    form.accountType === "COD"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  COD Customer
                </button>

              </div>

              <p className="mt-2 text-xs text-gray-500">
                Select whether this customer pays on delivery or has 30-day payment terms.
              </p>

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
                placeholder="Leave blank to assign automatically"
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

              <p className="mt-2 text-xs text-gray-500">Optional. The next configured customer code will be assigned when left blank.</p>

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

            {customFields.map((field) => <div key={field.id}>
              <label className="mb-2 block text-sm font-bold text-gray-700">{field.label}{field.required && <span className="text-red-500"> *</span>}</label>
              <input {...(field.type === "text" ? {} : { list: `customer-field-${field.id}` })} value={customValues[field.id] ?? ""} onChange={(event) => setCustomValues({ ...customValues, [field.id]: event.target.value })} placeholder={field.type === "text" ? `Enter ${field.label}` : `Select or enter ${field.label}`} className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5" />
              {field.type !== "text" && <><datalist id={`customer-field-${field.id}`}>{(field.options || []).map((option: string) => <option key={option} value={option} />)}</datalist><p className="mt-1 text-xs text-gray-500">Select an existing value or enter a new one. New values are added to this dropdown.</p></>}
            </div>)}

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
