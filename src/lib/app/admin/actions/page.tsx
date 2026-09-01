"use client";

import {
  useState,
} from "react";

import {
  Plus,
  Trash2,
  X,
  Pencil,
} from "lucide-react";

export default function ActionCommunicationPage() {

  const [ruleType, setRuleType] =
    useState(
      "Job Status Change"
    );

  return (

    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div
        className="
          mx-auto
          max-w-7xl
          rounded-3xl
          border
          border-gray-200
          bg-white
          shadow-sm
        "
      >

        {/* HEADER */}
        <div
          className="
            flex
            items-center
            justify-between
            border-b
            border-gray-100
            px-6
            py-5
          "
        >

          <div>

            <h1 className="text-2xl font-black text-gray-900">
              Communication Settings
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Configure automated job communication
            </p>

          </div>

          <button
            className="
              rounded-xl
              p-2
              text-gray-400
              hover:bg-gray-100
              hover:text-gray-700
            "
          >
            <X size={20} />
          </button>

        </div>

        {/* CONTENT */}
        <div className="grid gap-6 p-6 lg:grid-cols-2">

          {/* LEFT */}
          <div className="space-y-6">

            {/* Communication SETTINGS */}
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

              <h2 className="mb-6 text-lg font-bold text-blue-700">
                Communication Settings
              </h2>

              <div className="space-y-5">

                {/* NAME */}
                <div>

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Communication Name:
                  </label>

                  <input
                    defaultValue="Job Booked"
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

                {/* RULE */}
                <div>

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Communication Rule
                  </label>

                  <select
                    value={ruleType}
                    onChange={(e) =>
                      setRuleType(
                        e.target.value
                      )
                    }
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
                  >

                    <option>
                      Job Status Change
                    </option>

                    <option>
                      Job Reminder
                    </option>

                  </select>

                </div>

              </div>

            </div>

            {/* RULE SETTINGS */}
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

              <div className="mb-6">

                <h2 className="text-lg font-bold text-blue-700">
                  Rule Settings
                </h2>

                <p className="mt-1 text-sm italic text-gray-500">

                  {ruleType ===
                    "Job Reminder"

                    ? "Send reminder after selected time"

                    : "On job status change"}

                </p>

              </div>

              <div className="space-y-5">


                {/* JOB TYPE */}
                <div>

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Job Type
                  </label>

                  <select
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
                  >
                    <option>All Types</option>
                  </select>

                </div>

                {/* STATUS */}
                <div>

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Job Status
                  </label>

                  <div
                    className="
                      flex
                      items-center
                      gap-2
                      rounded-2xl
                      border
                      border-gray-300
                      px-3
                      py-3
                    "
                  >

                    <span
                      className="
                        flex
                        items-center
                        gap-2
                        rounded-xl
                        bg-red-100
                        px-3
                        py-1
                        text-sm
                        font-medium
                        text-red-700
                      "
                    >
                      📕 Job Booked

                      <X size={14} />
                    </span>

                  </div>
                  {/* REMINDER SETTINGS */}
                  {ruleType ===
                    "Job Reminder" && (

                      <div
                        className="
      rounded-2xl
      border
      border-gray-200
      bg-gray-50
      p-5
    "
                      >

                        <div className="mb-5">

                          <h3 className="text-sm font-bold text-gray-800">
                            Reminder Settings
                          </h3>

                          <p className="mt-1 text-xs text-gray-500">
                            Communication reminder after a selected status
                          </p>

                        </div>

                        <div className="grid gap-5 md:grid-cols-2">

                          {/* TIME */}
                          <div>

                            <label className="mb-2 block text-sm font-semibold text-gray-700">
                              Time
                            </label>

                            <input
                              type="number"
                              defaultValue="1"
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

                          {/* UNIT */}
                          <div>

                            <label className="mb-2 block text-sm font-semibold text-gray-700">
                              Unit
                            </label>

                            <select
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
                            >

                              <option>
                                Minutes
                              </option>

                              <option>
                                Hours
                              </option>

                              <option>
                                Days
                              </option>

                            </select>

                          </div>

                        </div>

                      </div>

                    )}
                </div>

              </div>

            </div>

          </div>

          {/* RIGHT */}
          <div className="space-y-6">

            {/* Communication */}
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

              <h2 className="mb-6 text-lg font-bold text-blue-700">
                Communication Messages
              </h2>

              <div className="space-y-5">

                {/* NOTIFICATION */}
                <div>

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Communication To:
                  </label>

                  <select
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
                  >
                    <option>
                      Assigned Employees
                    </option>

                    <option>
                      Customer Contacts
                    </option>

                    <option>
                      Customer Contacts For Job Card
                    </option>

                    <option>
                      Customer Primary Accounting
                    </option>

                    <option>
                      Customer Primary Contact
                    </option>

                    <option>
                      Employee
                    </option>

                    <option>
                      Employee All
                    </option>

                    <option>
                      Supplier Contacts
                    </option>

                    <option>
                      Supplier Contacts For Job Card
                    </option>

                    <option>
                      Supplier Primary Accounting
                    </option>

                    <option>
                      Supplier Primary Contact
                    </option>

                  </select>
                </div>

                {/* CHECKBOXES */}
                <div className="grid gap-4 md:grid-cols-2">

                  {[
                    "Send Email",
                    "Attach Job Card",
                    "Attach Customer Job Card",
                  ].map((item, index) => (

                    <label
                      key={item}
                      className="
                        flex
                        items-center
                        gap-3
                        rounded-2xl
                        border
                        border-gray-200
                        p-3
                        text-sm
                        font-medium
                        text-gray-700
                      "
                    >

                      <input
                        type="checkbox"
                        defaultChecked={index === 0}
                        className="h-4 w-4"
                      />

                      {item}

                    </label>

                  ))}

                </div>

                {/* TEMPLATE */}
                <div>

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Message Template
                  </label>

                  <div className="flex gap-3">

                    <input
                      defaultValue="Job Booked Tech"
                      className="
                        flex-1
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

                    <button
                      className="
                        flex
                        items-center
                        justify-center
                        rounded-2xl
                        border
                        border-gray-300
                        bg-white
                        px-4
                        hover:bg-gray-100
                      "
                    >
                      <Pencil size={18} />
                    </button>

                  </div>

                </div>

                {/* ADD Communication */}
                <button
                  className="
                    flex
                    items-center
                    gap-2
                    rounded-2xl
                    border
                    border-blue-600
                    px-5
                    py-3
                    text-sm
                    font-semibold
                    text-blue-600
                    hover:bg-blue-50
                  "
                >
                  <Plus size={16} />
                  Add Another Template
                </button>

              </div>

            </div>

          </div>

        </div>

        {/* FOOTER */}
        <div
          className="
            flex
            items-center
            justify-between
            border-t
            border-gray-100
            px-6
            py-5
          "
        >

          <button
            className="
              rounded-2xl
              bg-red-50
              p-3
              text-red-600
              hover:bg-red-100
            "
          >
            <Trash2 size={18} />
          </button>

          <div className="flex gap-3">

            <button
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

            <button
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
              Save
            </button>

          </div>

        </div>

      </div>

    </div >
  );
}