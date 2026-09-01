"use client";

import { useState } from "react";

const availableFields = [
  {
    name: "Accessories",
    system: "Accessories",
  },
  {
    name: "Assessment Fee",
    system: "Assessment Fee",
  },
  {
    name: "Custom Date 2",
    system: "Custom Date 2",
  },
  {
    name: "Customer Assets",
    system: "Add Customer Assets",
  },
  {
    name: "Fault Cause List",
    system: "Select Fault Causes",
  },
  {
    name: "Fault Code List",
    system: "Select Fault Codes",
  },
  {
    name: "Fault Reason List",
    system: "Select Fault Reasons",
  },
  {
    name: "Invoice Amount",
    system: "Invoice Amount",
  },
  {
    name: "Invoice Number",
    system: "Invoice Number",
  },
  {
    name: "Job Card Custom Filter 2",
    system: "Custom Yes/No 2",
  },
  {
    name: "Job Card Custom Number 1",
    system: "Custom Number 1",
  },
  {
    name: "Materials",
    system: "Add Materials",
  },
  {
    name: "Purchase Order",
    system: "Purchase Order Number",
  },
  {
    name: "Quote Amount",
    system: "Quote Amount",
  },
  {
    name: "Quote Number",
    system: "Quote Number",
  },
  {
    name: "Supplier",
    system: "Supplier",
  },
  {
    name: "Travelled For?",
    system: "Custom Field 1",
  },
  {
    name: "Start KM Reading",
    system: "Custom Field 2",
  },
  {
    name: "NVTS PHOTO PRO REF NO",
    system: "Custom Field 3",
  },
  {
    name: "End KM Reading",
    system: "Custom Field 4",
  },
];

export default function FieldsPage() {

  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const toggleField = (field: string) => {

    setSelectedFields((prev) =>

      prev.includes(field)

        ? prev.filter((f) => f !== field)

        : [...prev, field]
    );
  };

  const filteredFields = availableFields.filter((field) =>
    field.name.toLowerCase().includes(search.toLowerCase())
  );

  return (

    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="mx-auto max-w-4xl">

        {/* CARD */}
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

          {/* HEADER */}
          <div className="mb-6">

            <h1 className="text-3xl font-black text-gray-900">
              Add Fields to Status
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Add linked system fields or create company specific fields
            </p>

          </div>

          {/* SEARCH */}
          <div className="mb-6">

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search options"
              className="
                w-full
                rounded-2xl
                border
                border-gray-300
                px-4
                py-3
                text-sm
                outline-none
                focus:border-blue-500
              "
            />

          </div>

          {/* FIELD LIST */}
          <div
            className="
              max-h-[500px]
              overflow-y-auto
              rounded-2xl
              border
              border-gray-200
            "
          >

            <div className="divide-y divide-gray-100">

              {filteredFields.map((field) => (

                <button
                  key={field.name}
                  type="button"
                  onClick={() => toggleField(field.name)}
                  className="
                    flex
                    w-full
                    items-start
                    gap-4
                    p-4
                    text-left
                    transition
                    hover:bg-gray-50
                  "
                >

                  {/* CHECKBOX */}
                  <div
                    className={`
                      mt-1
                      flex
                      h-5
                      w-5
                      items-center
                      justify-center
                      rounded
                      border

                      ${
                        selectedFields.includes(field.name)

                          ? "border-blue-600 bg-blue-600 text-white"

                          : "border-gray-300 bg-white"
                      }
                    `}
                  >

                    {selectedFields.includes(field.name) && "✓"}

                  </div>

                  {/* FIELD INFO */}
                  <div>

                    <div className="font-medium text-gray-900">
                      {field.name}
                    </div>

                    <div className="mt-1 text-sm italic text-gray-400">
                      {field.system}
                    </div>

                  </div>

                </button>

              ))}

            </div>

          </div>

          {/* FOOTER */}
          <div className="mt-8 flex items-center justify-between">

            {/* CANCEL */}
            <button
              type="button"
              onClick={() => window.history.back()}
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
              Cancel
            </button>

            <div className="flex gap-3">

              {/* CREATE CUSTOM */}
              <button
                type="button"
                className="
                  rounded-2xl
                  border
                  border-blue-300
                  bg-blue-50
                  px-5
                  py-3
                  text-sm
                  font-semibold
                  text-blue-700
                  hover:bg-blue-100
                "
              >
                + Create Custom Field
              </button>

              {/* ADD */}
              <button
                type="button"
                onClick={() => {
                  alert(
                    `${selectedFields.length} field(s) added successfully`
                  );
                }}
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
                Add Fields
              </button>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}