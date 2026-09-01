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
  "Customer Acount Type",
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

        setFields(
          data.fields || defaultFields
        );

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

        required: false,

        showOnCreate: true,
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