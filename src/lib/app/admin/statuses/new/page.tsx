"use client";

import Link from "next/link";
import {
  useState,
} from "react";

import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";

import {
  useRouter,
} from "next/navigation";

const defaultColors = [

  "bg-red-500",

  "bg-orange-500",

  "bg-amber-500",

  "bg-yellow-500",

  "bg-lime-500",

  "bg-green-500",

  "bg-emerald-500",

  "bg-teal-500",

  "bg-cyan-500",

  "bg-sky-500",

  "bg-blue-500",

  "bg-indigo-500",

  "bg-violet-500",

  "bg-purple-500",

  "bg-fuchsia-500",

  "bg-pink-500",

  "bg-rose-500",

  "bg-gray-600",

  "bg-gray-500",

  "bg-gray-400",
];

export default function NewStatusPage() {

  const [toggles, setToggles] = useState({
    startStatus: false,
    closeJob: false,
    startTimer: false,
    endTimer: false,
    active: true,
  });
  const router = useRouter();

  const [statusName, setStatusName] =
    useState("");

  const [selectedColor, setSelectedColor] =
    useState("bg-blue-500");

  const [saving, setSaving] =
    useState(false);
  const [customColors, setCustomColors] =
    useState<string[]>([]);

  const [showColorInput, setShowColorInput] =
    useState(false);

  const [newColor, setNewColor] =
    useState("");

  const colors = [
    ...defaultColors,
    ...customColors,
  ];
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
            lg:flex-row
            lg:items-center
            lg:justify-between
          "
        >

          <div>

            <div className="mb-2 flex items-center gap-3">

              <div className="h-5 w-5 rounded bg-blue-500" />

              <h1 className="text-3xl font-black text-gray-900">
                Create Status
              </h1>

            </div>

            <p className="text-sm text-gray-500">
              Add a new workflow status and configure behaviour
            </p>

          </div>

          <div className="flex flex-wrap gap-3">

            {/* MESSAGES */}
            <Link
              href="/admin/communication"
              className="
                rounded-2xl
                bg-indigo-600
                px-5
                py-3
                text-sm
                font-semibold
                text-white
                hover:bg-indigo-700
              "
            >
              Messages
            </Link>

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

            {/* SAVE */}
            <button
              type="button"
              disabled={saving}
              onClick={async () => {

                if (!statusName) {

                  alert(
                    "Please enter a status name"
                  );

                  return;
                }

                try {

                  setSaving(true);

                  await addDoc(

                    collection(
                      clientDb,
                      "companies",
                      COMPANY_ID,
                      "statuses"
                    ),

                    {
                      name: statusName,

                      color:
                        selectedColor,

                      startStatus:
                        toggles.startStatus,

                      closeJob:
                        toggles.closeJob,

                      startTimer:
                        toggles.startTimer,

                      endTimer:
                        toggles.endTimer,

                      active:
                        toggles.active,

                      createdAt:
                        serverTimestamp(),

                      sortOrder:
                        Date.now(),
                    }
                  );

                  alert(
                    "Status Saved Successfully"
                  );

                  router.push(
                    "/admin/statuses"
                  );

                } catch (error) {

                  console.error(error);

                  alert(
                    "Failed to save status"
                  );

                } finally {

                  setSaving(false);

                }

              }}
              className="
    rounded-2xl
    bg-blue-600
    px-5
    py-3
    text-sm
    font-semibold
    text-white
    hover:bg-blue-700
    disabled:opacity-50
  "
            >
              {saving
                ? "Saving..."
                : "Save Status"}
            </button>

          </div>

        </div>

        {/* MAIN GRID */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* LEFT COLUMN */}
          <div className="space-y-6 lg:col-span-2">

            {/* BASIC SETTINGS */}
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

              <h2 className="mb-6 text-xl font-bold text-gray-900">
                Basic Settings
              </h2>

              <div className="grid gap-6 md:grid-cols-2">

                {/* STATUS NAME */}
                <div className="md:col-span-2">

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Status Name
                  </label>

                  <input
                    value={statusName}
                    onChange={(e) =>
                      setStatusName(
                        e.target.value
                      )
                    }
                    placeholder="Enter status name"
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

                {/* STATUS COLOR */}
                <div className="md:col-span-2">

                  <label className="mb-4 block text-sm font-semibold text-gray-700">
                    Status Colour
                  </label>

                  <div className="flex flex-wrap gap-3">

                    {colors.map((color, index) => (

                      <button
                        key={index}
                        onClick={() =>
                          setSelectedColor(color)
                        }
                        type="button"
                        className={`
  h-10
  w-10
  rounded-xl
  shadow-sm
  transition
  hover:scale-105

  ${color}

  ${selectedColor === color
                            ? "ring-4 ring-blue-200"
                            : ""
                          }
`}
                      />

                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        setShowColorInput(
                          !showColorInput
                        )
                      }
                      className="
    flex
    h-10
    w-10
    items-center
    justify-center
    rounded-xl
    border
    border-dashed
    border-gray-300
    bg-white
    text-lg
    font-bold
    text-gray-600
    hover:border-blue-500
    hover:text-blue-600
    hover:bg-blue-50
  "
                    >
                      +
                    </button>
                  </div>
                  {showColorInput && (

                    <div className="mt-4 flex gap-3">

                      <input
                        type="text"
                        placeholder="bg-blue-500"
                        value={newColor}
                        onChange={(e) =>
                          setNewColor(
                            e.target.value
                          )
                        }
                        className="
        h-12
        flex-1
        rounded-2xl
        border
        border-gray-300
        px-4
        outline-none
        focus:border-blue-500
      "
                      />

                      <button
                        type="button"
                        onClick={() => {

                          if (!newColor) {

                            return;
                          }

                          setCustomColors([
                            ...customColors,
                            newColor,
                          ]);

                          setSelectedColor(
                            newColor
                          );

                          setNewColor("");

                          setShowColorInput(false);
                        }}
                        className="
        rounded-2xl
        bg-blue-600
        px-5
        text-sm
        font-bold
        text-white
        hover:bg-blue-700
      "
                      >
                        Add
                      </button>

                    </div>

                  )}
                </div>

              </div>

            </div>

            {/* FIELDS */}
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

                <h2 className="text-xl font-bold text-gray-900">
                  Fields
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Add custom fields, linked system fields or operational inputs
                </p>

              </div>

              {/* EMPTY STATE */}
              <div
                className="
                  rounded-2xl
                  border
                  border-dashed
                  border-gray-300
                  bg-gray-50
                  p-10
                  text-center
                "
              >

                <div className="mb-3 text-5xl">
                  ➕
                </div>

                <h3 className="mb-2 text-lg font-bold text-gray-800">
                  No Fields Added
                </h3>

                <p className="mb-6 text-sm text-gray-500">
                  Add custom fields, linked system fields or operational inputs
                </p>

                <button
                  type="button"
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
                  + Add Field
                </button>

              </div>

            </div>

          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">

            {/* STATUS OPTIONS */}
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

              <h2 className="mb-6 text-xl font-bold text-gray-900">
                Status Options
              </h2>

              <div className="space-y-5">

                {[
                  {
                    key: "startStatus",
                    label: "Start Status",
                  },
                  {
                    key: "closeJob",
                    label: "Close Job",
                  },
                  {
                    key: "startTimer",
                    label: "Start Timer",
                  },
                  {
                    key: "endTimer",
                    label: "End Timer",
                  },
                  {
                    key: "active",
                    label: "Active",
                  },
                ].map((item) => (

                  <div
                    key={item.key}
                    className="
                      flex
                      items-center
                      justify-between
                      rounded-2xl
                      border
                      border-gray-100
                      p-4
                    "
                  >

                    <span className="font-medium text-gray-700">
                      {item.label}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setToggles((prev) => ({
                          ...prev,
                          [item.key]:
                            !prev[item.key as keyof typeof prev],
                        }))
                      }
                      className={`
                        relative
                        h-6
                        w-11
                        rounded-full
                        transition

                        ${toggles[
                          item.key as keyof typeof toggles
                        ]
                          ? "bg-blue-600"
                          : "bg-gray-300"
                        }
                      `}
                    >

                      <div
                        className={`
                          absolute
                          top-1
                          h-4
                          w-4
                          rounded-full
                          bg-white
                          transition

                          ${toggles[
                            item.key as keyof typeof toggles
                          ]
                            ? "right-1"
                            : "left-1"
                          }
                        `}
                      />

                    </button>

                  </div>

                ))}

              </div>

            </div>

            {/* INFO CARD */}
            <div
              className="
                rounded-3xl
                border
                border-blue-100
                bg-blue-50
                p-6
              "
            >

              <h3 className="mb-3 text-lg font-bold text-blue-900">
                Workflow Information
              </h3>

              <div className="space-y-3 text-sm text-blue-800">

                <div className="flex justify-between">
                  <span>Workflow</span>
                  <span className="font-bold">Default</span>
                </div>

                <div className="flex justify-between">
                  <span>Status Type</span>
                  <span className="font-bold">Operational</span>
                </div>

                <div className="flex justify-between">
                  <span>Messages</span>
                  <span className="font-bold">0</span>
                </div>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}