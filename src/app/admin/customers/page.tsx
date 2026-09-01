"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";

const defaultFields = [

  {
    id: "customerCode",
    label: "Customer Code",
    required: true,
    showOnCreate: true,
  },

  {
    id: "customerName",
    label: "Customer Name",
    required: true,
    showOnCreate: true,
  },

  {
    id: "customerAccountType",
    label: "Customer Account Type",
    required: false,
    showOnCreate: true,
    isCustom: true,
    type: "text",
  },

  {
    id: "contactName",
    label: "Contact Name",
    required: false,
    showOnCreate: true,
  },

  {
    id: "mobile",
    label: "Mobile Number",
    required: false,
    showOnCreate: true,
  },

  {
    id: "email",
    label: "Email Address",
    required: false,
    showOnCreate: true,
  },

];

const jobCardFields = [

  "Customer Account Status",
  "Custom Text Field 1",
  "Custom Text Field 2",
  "Customer Order Number",
  "Assessment Notes",
  "Customer Category",
  "Billing Contact",
  "Branch Code",
  "Reference Number",

];

export default function CustomersPage() {

  const [fields, setFields] =
    useState<any[]>(defaultFields);

  const [newFieldName, setNewFieldName] =
    useState("");
  const [customerCodePrefix, setCustomerCodePrefix] = useState("CUS-");
  const [customerCodeNextNumber, setCustomerCodeNextNumber] = useState(1);
  const [customerCodePadding, setCustomerCodePadding] = useState(5);

  useEffect(() => {

    loadSettings();

  }, []);

  async function loadSettings() {

    try {

      const ref =
        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "settings",
          "customerFields"
        );

      const snap =
        await getDoc(ref);

      if (snap.exists()) {

        const data =
          snap.data();

        const defaultIds = new Set(defaultFields.map((field) => field.id));
        const storedFields = data.fields || defaultFields;
        const storedIds = new Set(storedFields.map((field: any) => field.id));
        const mergedFields = [...storedFields, ...defaultFields.filter((field) => !storedIds.has(field.id))];
        setFields(mergedFields.map((field: any) => {
          const isCustom = field.isCustom === true || (!defaultIds.has(field.id) && !jobCardFields.includes(field.label));
          return isCustom
            ? { ...field, isCustom: true, type: field.type || "dropdown", required: field.type === "text" ? field.required === true : true, options: Array.isArray(field.options) ? field.options : [] }
            : field;
        }));
        setCustomerCodePrefix(String(data.customerNumbering?.prefix ?? "CUS-"));
        setCustomerCodeNextNumber(Math.max(1, Number(data.customerNumbering?.nextNumber || 1)));
        setCustomerCodePadding(Math.min(10, Math.max(1, Number(data.customerNumbering?.padding || 5))));

      } else {

        setFields(defaultFields);
      }

    } catch (err) {

      console.error(err);
    }
  }

  const toggleRequired = (
    id: string
  ) => {

    setFields((prev) =>
      prev.map((field) => {

        if (field.id !== id) {
          return field;
        }

        return {
          ...field,
          required: !field.required,
        };

      })
    );
  };

  const toggleShowOnCreate = (
    id: string
  ) => {

    setFields((prev) =>
      prev.map((field) => {

        if (field.id !== id) {
          return field;
        }

        return {
          ...field,
          showOnCreate:
            !field.showOnCreate,
        };

      })
    );
  };

  const updateLabel = (
    id: string,
    value: string
  ) => {

    setFields((prev) =>
      prev.map((field) => {

        if (field.id !== id) {
          return field;
        }

        return {
          ...field,
          label: value,
        };

      })
    );
  };

  const removeField = (
    id: string
  ) => {

    setFields((prev) =>
      prev.filter(
        (field) => field.id !== id
      )
    );
  };

  const addCustomField = () => {

    if (!newFieldName.trim()) {
      return;
    }

    const exists =
      fields.find(
        (field) =>
          field.label === newFieldName
      );

    if (exists) {
      return;
    }

    setFields((prev) => [

      ...prev,

      {
        id:
          newFieldName
            .toLowerCase()
            .replace(/\s/g, "_"),

        label: newFieldName,

        required: true,

        showOnCreate: true,
        type: "dropdown",
        options: [],
        isCustom: true,
      },

    ]);

    setNewFieldName("");
  };

  const addLinkedField = (
    fieldName: string
  ) => {

    const exists =
      fields.find(
        (field) =>
          field.label === fieldName
      );

    if (exists) {
      return;
    }

    setFields((prev) => [

      ...prev,

      {
        id:
          fieldName
            .toLowerCase()
            .replace(/\s/g, "_"),

        label: fieldName,

        required: false,

        showOnCreate: true,
      },

    ]);
  };

  const saveSettings = async () => {

    try {

      await setDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "settings",
          "customerFields"
        ),

        {
          fields,
          customerNumbering: {
            prefix: customerCodePrefix.trim(),
            nextNumber: Math.max(1, customerCodeNextNumber),
            padding: Math.min(10, Math.max(1, customerCodePadding)),
          },

          updatedAt:
            serverTimestamp(),
        },

        {
          merge: true,
        }
      );

      alert(
        "Customer settings saved successfully"
      );

    } catch (err) {

      console.error(err);

      alert(
        "Failed to save settings"
      );
    }
  };

  return (

    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="mx-auto max-w-7xl">

        {/* HEADER */}
        <div
          className="
            mb-6
            flex
            flex-col
            gap-4
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
            md:flex-row
            md:items-center
            md:justify-between
          "
        >

          <div>

            <h1 className="text-3xl font-black text-gray-900">
              Customer Setup
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Configure customer field settings and custom fields
            </p>

          </div>

          <div className="flex gap-3">

            <Link
              href="/admin"
              className="
                rounded-2xl
                border
                border-gray-300
                bg-white
                px-5
                py-3
                text-sm
                font-semibold
                text-gray-700
                hover:bg-gray-100
              "
            >
              ← Back
            </Link>

            <button
              onClick={saveSettings}
              className="
                rounded-2xl
                bg-blue-600
                px-5
                py-3
                text-sm
                font-semibold
                text-white
                hover:bg-blue-700
              "
            >
              Save
            </button>

          </div>

        </div>

        {/* FIELD SETTINGS */}
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Automatic Customer Numbering</h2>
            <p className="mt-2 text-sm text-gray-500">Used only when Customer Code is left blank during customer creation.</p>
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <label className="block"><span className="mb-2 block text-sm font-bold text-gray-700">Customer Code Prefix</span><input value={customerCodePrefix} onChange={(event) => setCustomerCodePrefix(event.target.value)} placeholder="CUS-" className="h-12 w-full rounded-xl border border-gray-300 px-4 outline-none focus:border-blue-500" /></label>
            <label className="block"><span className="mb-2 block text-sm font-bold text-gray-700">Next Customer Number</span><input type="number" min="1" value={customerCodeNextNumber} onChange={(event) => setCustomerCodeNextNumber(Math.max(1, Number(event.target.value || 1)))} className="h-12 w-full rounded-xl border border-gray-300 px-4 outline-none focus:border-blue-500" /></label>
            <label className="block"><span className="mb-2 block text-sm font-bold text-gray-700">Number Digits</span><input type="number" min="1" max="10" value={customerCodePadding} onChange={(event) => setCustomerCodePadding(Math.min(10, Math.max(1, Number(event.target.value || 1))))} className="h-12 w-full rounded-xl border border-gray-300 px-4 outline-none focus:border-blue-500" /></label>
          </div>
          <div className="mt-5 rounded-2xl bg-blue-50 px-5 py-4 text-sm text-blue-800"><span className="font-bold">Next automatic code:</span> <span className="ml-2 font-black">{customerCodePrefix.trim()}{String(customerCodeNextNumber).padStart(customerCodePadding, "0")}</span></div>
        </div>

        {/* FIELD SETTINGS */}
        <div
          className="
    mb-6
    rounded-3xl
    border
    border-gray-200
    bg-white
    p-6
    shadow-sm
  "
        >

          <div className="mb-6 flex items-center justify-between">

            <div>

              <h2 className="text-2xl font-black text-gray-900">
                Customer Fields
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                Select fields required for customer setup
              </p>

            </div>

          </div>

          {/* EMPTY */}
          {fields.length === 0 && (

            <div
              className="
        rounded-3xl
        border-2
        border-dashed
        border-gray-300
        p-12
        text-center
      "
            >

              <div className="mb-4 text-6xl">
                ➕
              </div>

              <h3 className="text-2xl font-bold text-gray-900">
                No Fields Added
              </h3>

              <p className="mt-3 text-gray-500">
                Add customer fields from the available field list below
              </p>

            </div>

          )}

          {/* FIELD LIST */}
          <div className="space-y-4">

            {fields.map((field) => (

              <div
                key={field.id}
                className="
          flex
          items-center
          justify-between
          rounded-2xl
          border
          border-gray-200
          bg-gray-50
          p-5
        "
              >

                <div>

                  <div className="font-semibold text-gray-900">
                    {field.label}
                  </div>

                  {field.isCustom === true && <div className="mt-1 text-xs font-bold text-blue-600">{field.type === "text" ? "Custom text field" : "Required dynamic dropdown"}</div>}

                </div>

                <button
                  onClick={() =>
                    removeField(field.id)
                  }
                  className="
            rounded-xl
            bg-red-50
            px-4
            py-2
            text-sm
            font-semibold
            text-red-600
            hover:bg-red-100
          "
                >
                  Remove
                </button>

              </div>

            ))}

          </div>

        </div>
        {/* ADD CUSTOM FIELD */}
        <div
          className="
            mb-6
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
          "
        >

          <h2 className="mb-5 text-2xl font-black text-gray-900">
            Add Custom Field
          </h2>

          <div className="flex flex-col gap-4 md:flex-row">

            <input
              value={newFieldName}
              onChange={(e) =>
                setNewFieldName(
                  e.target.value
                )
              }
              placeholder="Enter custom field name"
              className="
                flex-1
                rounded-2xl
                border
                border-gray-300
                px-4
                py-3
                text-sm
              "
            />

            <button
              onClick={addCustomField}
              className="
                rounded-2xl
                bg-blue-600
                px-6
                py-3
                text-sm
                font-semibold
                text-white
                hover:bg-blue-700
              "
            >
              + Add Field
            </button>

          </div>

        </div>

        {/* LINK JOB CARD FIELDS */}
        <div
          className="
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
          "
        >

          <h2 className="mb-5 text-2xl font-black text-gray-900">
            Link Fields From Job Card Fields
          </h2>

          <div className="flex flex-wrap gap-3">

            {jobCardFields.map((field) => (

              <button
                key={field}
                onClick={() =>
                  addLinkedField(field)
                }
                className="
                  rounded-2xl
                  border
                  border-gray-300
                  bg-white
                  px-4
                  py-3
                  text-sm
                  font-semibold
                  text-gray-700
                  hover:bg-blue-50
                  hover:border-blue-300
                "
              >
                + {field}
              </button>

            ))}

          </div>

        </div>

      </div>

    </div>
  );
}
