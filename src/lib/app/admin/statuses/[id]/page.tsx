"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

import {
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";

import {
  useParams,
} from "next/navigation";

const colors = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-400",
  "bg-green-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-gray-600",
  "bg-gray-500",
  "bg-gray-400",
];

const availableFields = [
  {
    id: "startKm",
    label: "🏪 Start KM Reading",
    type: "number",
  },

  {
    id: "travelledFor",
    label: "🛻 Traveled For? (Description)",
    type: "text",
  },

  {
    id: "photoRef",
    label: "📸 NVTS PHOTO PRO REF NO",
    type: "photo",
  },

  {
    id: "jobSummary",
    label: "Job Summary",
    type: "textarea",
  },

  {
    id: "endKm",
    label: "🏁 End KM Reading",
    type: "number",
  },

  {
    id: "supplier",
    label: "Supplier",
    type: "text",
  },

  {
    id: "referenceNumber",
    label: "Reference Number",
    type: "text",
  },

  {
    id: "previousJobNumber",
    label: "Previous Job Number",
    type: "text",
  },
];

export default function StatusEditPage() {

  const params =
    useParams();


  const [status, setStatus] =
    useState<any>(null);

  const [showFieldModal, setShowFieldModal] =
    useState(false);

  const [selectedFields, setSelectedFields] =
    useState<any[]>([
      {
        id: "startKm",
        required: true,
      },

      {
        id: "jobSummary",
        required: false,
      },
    ]);

  useEffect(() => {


    const unsub =
      onSnapshot(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "statuses",
          String(params.id)
        ),

        (snapshot) => {


          if (snapshot.exists()) {


            const data: any =
              snapshot.data();


            setStatus({

              id: snapshot.id,

              ...data,

            });


            setSelectedFields(
              data.fields || []
            );


            setSelectedColor(
              data.color || "bg-red-500"
            );


            setStatusOptions({

              startStatus:
                data.startStatus || false,

              closeJob:
                data.closeJob || false,

              startTimer:
                data.startTimer || false,

              endTimer:
                data.endTimer || false,

              active:
                data.active !== false,

            });


          }


        }


      );


    return () => unsub();


  }, [params.id]);

  const [
    linkedCommunicationCount,
    setLinkedCommunicationCount,
  ] = useState(0);

  const [selectedColor, setSelectedColor] =
    useState("bg-red-500");

  const isLockedStartStatus =

    status?.name

      ?.replace(/[^\w\s]/gi, "")

      .trim()

      .toLowerCase()

    === "job booked";

  const [statusOptions, setStatusOptions] =
    useState({
      startStatus: true,
      closeJob: false,
      startTimer: false,
      endTimer: false,
      active: true,
    });

  useEffect(() => {

    if (!isLockedStartStatus) {
      return;
    }

    setStatusOptions({

      startStatus: true,

      closeJob: false,

      startTimer: false,

      endTimer: false,

      active: true,
    });

  }, [isLockedStartStatus]);

  const toggleFieldSelection = (
    fieldId: string
  ) => {

    const exists =
      selectedFields.find(
        (f) => f.id === fieldId
      );


    if (exists) {

      setSelectedFields(
        (prev) =>
          prev.filter(
            (f) =>
              f.id !== fieldId
          )
      );

      return;

    }


    const field =
      availableFields.find(
        (f) =>
          f.id === fieldId
      );


    setSelectedFields(
      (prev) => [
        ...prev,
        {

          id:
            fieldId,

          label:
            field?.label || "",

          type:
            field?.type || "text",

          required:
            false,

        },
      ]
    );

  };

  const toggleRequired = (
    fieldId: string
  ) => {

    setSelectedFields((prev) =>
      prev.map((field) => {

        if (field.id !== fieldId) {
          return field;
        }

        return {
          ...field,
          required: !field.required,
        };
      })
    );
  };

  const removeField = (
    fieldId: string
  ) => {

    setSelectedFields((prev) =>
      prev.filter(
        (field) => field.id !== fieldId
      )
    );
  };

  useEffect(() => {

    const storedStatuses =
      localStorage.getItem(
        "communications"
      );

    if (!storedStatuses) {

      setLinkedCommunicationCount(0);

      return;
    }

    try {

      const parsed =
        JSON.parse(
          storedStatuses
        );

      const currentStatus =
        "Job Booked";

      const linked =
        parsed.filter(
          (item: any) =>

            item.triggerStatuses?.includes(
              currentStatus
            )
        );

      const totalMessages =
        linked.reduce(

          (
            total: number,
            item: any
          ) =>

            total +
            (
              item.messages
                ?.length || 0
            ),

          0
        );

      setLinkedCommunicationCount(
        totalMessages
      );

    } catch (error) {

      console.error(error);

    }

  }, []);

  async function saveStatus() {


    if (!status) {
      return;
    }


    await updateDoc(

      doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "statuses",
        status.id
      ),

      {

        name:
          status.name,

        color:
          selectedColor,

        fields:
          selectedFields.map((selected) => {

            const fullField =
              availableFields.find(
                (field) =>
                  field.id === selected.id
              );

            return {

              id:
                selected.id,

              label:
                fullField?.label || "",

              type:
                fullField?.type || "text",

              required:
                selected.required,

            };

          }),


        startStatus:
          statusOptions.startStatus,


        closeJob:
          statusOptions.closeJob,


        startTimer:
          statusOptions.startTimer,


        stopTimer:
          statusOptions.endTimer,


        active:
          statusOptions.active,


      }


    );


    alert(
      "Status saved"
    );


  }

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

              <div
                className={`
                  h-5
                  w-5
                  rounded
                  ${selectedColor}
                `}
              />

              <h1 className="text-3xl font-black text-gray-900">

                {status?.name}

              </h1>

            </div>

            <p className="text-sm text-gray-500">
              Configure workflow status behaviour and messages
            </p>

          </div>

          <div className="flex flex-wrap gap-3">

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
              Messages ({linkedCommunicationCount})
            </Link>

            <Link
              href="/admin/statuses"
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
            </Link>

            <button
              onClick={saveStatus}
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

        {/* MAIN GRID */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* LEFT */}
          <div className="space-y-6 lg:col-span-2">

            {/* BASIC */}
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

                    value={status?.name || ""}

                    onChange={(e) =>

                      setStatus({

                        ...status,

                        name: e.target.value,

                      })

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
                  />

                </div>

                {/* COLORS */}
                <div className="md:col-span-2">

                  <label className="mb-4 block text-sm font-semibold text-gray-700">
                    Status Colour
                  </label>

                  <div className="flex flex-wrap gap-3">

                    {colors.map((color) => (

                      <button
                        key={color}
                        onClick={() =>
                          setSelectedColor(color)
                        }
                        className={`
                          h-10
                          w-10
                          rounded-xl
                          shadow-sm
                          transition
                          hover:scale-105
                          ${color}

                          ${selectedColor === color
                            ? "ring-4 ring-offset-2 ring-blue-300"
                            : ""
                          }
                        `}
                      />

                    ))}

                  </div>

                </div>

              </div>

            </div>

            {/* SELECTED FIELDS */}
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

              <div className="mb-6 flex items-center justify-between">

                <div>

                  <h2 className="text-xl font-bold text-gray-900">
                    Selected Fields
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Configure which fields are required
                  </p>

                </div>

                <button
                  onClick={() =>
                    setShowFieldModal(true)
                  }
                  className="
                    rounded-2xl
                    bg-blue-600
                    px-4
                    py-2
                    text-sm
                    font-semibold
                    text-white
                    hover:bg-blue-700
                  "
                >
                  + Add Field
                </button>

              </div>

              {/* EMPTY */}
              {selectedFields.length === 0 && (

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
                    Add fields that technicians
                    must complete for this status
                  </p>

                </div>

              )}

              {/* FIELDS */}
              <div className="space-y-4">

                {selectedFields.map((selected) => {

                  const field =
                    availableFields.find(
                      (f) =>
                        f.id === selected.id
                    );

                  if (!field) {
                    return null;
                  }

                  return (

                    <div
                      key={field.id}
                      className="
                        flex
                        flex-col
                        gap-4
                        rounded-2xl
                        border
                        border-gray-200
                        p-4
                        md:flex-row
                        md:items-center
                        md:justify-between
                      "
                    >

                      <div className="flex items-center gap-3">

                        <button
                          onClick={() =>
                            removeField(field.id)
                          }
                          className="
                            rounded-xl
                            bg-red-50
                            p-2
                            text-red-600
                            hover:bg-red-100
                          "
                        >
                          🗑
                        </button>

                        <div>

                          <div className="font-medium text-gray-800">
                            {field.label}
                          </div>

                          <div className="text-xs text-gray-400">
                            {field.type}
                          </div>

                        </div>

                      </div>

                      <div className="flex overflow-hidden rounded-xl border border-blue-600">

                        <button
                          onClick={() =>
                            toggleRequired(field.id)
                          }
                          className={`
                            px-4
                            py-2
                            text-sm
                            font-medium

                            ${!selected.required
                              ? "bg-blue-600 text-white"
                              : "bg-white text-blue-600"
                            }
                          `}
                        >
                          Optional
                        </button>

                        <button
                          onClick={() =>
                            toggleRequired(field.id)
                          }
                          className={`
                            px-4
                            py-2
                            text-sm
                            font-semibold

                            ${selected.required
                              ? "bg-blue-600 text-white"
                              : "bg-white text-blue-600"
                            }
                          `}
                        >
                          Required
                        </button>

                      </div>

                    </div>

                  );

                })}

              </div>

            </div>

          </div>

          {/* RIGHT */}
          <div className="space-y-6">

            {/* OPTIONS */}
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
                    {isLockedStartStatus && (

                      <span
                        className="
      rounded-full
      bg-gray-100
      px-2
      py-1
      text-[10px]
      font-black
      uppercase
      text-gray-500
    "
                      >
                        LOCKED
                      </span>

                    )}

                    <button
                      onClick={() => {

                        if (
                          isLockedStartStatus &&
                          (
                            item.key === "startStatus" ||
                            item.key === "closeJob" ||
                            item.key === "startTimer" ||
                            item.key === "endTimer" ||
                            item.key === "active"
                          )
                        ) {

                          return;
                        }

                        setStatusOptions((prev) => ({

                          ...prev,

                          [item.key]:
                            !prev[
                            item.key as keyof typeof prev
                            ],

                        }));

                      }}
                      className={`
    relative
    h-6
    w-11
    rounded-full
    transition

    ${isLockedStartStatus
                          ? "bg-gray-300"
                          : statusOptions[
                            item.key as keyof typeof statusOptions
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

                          ${isLockedStartStatus
                            ? "right-1"
                            : statusOptions[
                              item.key as keyof typeof statusOptions
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

          </div>

        </div>

        {/* FIELD MODAL */}
        {showFieldModal && (

          <div
            className="
              fixed
              inset-0
              z-50
              flex
              items-center
              justify-center
              bg-black/50
              p-6
            "
          >

            <div
              className="
                w-full
                max-w-3xl
                rounded-3xl
                bg-white
                shadow-2xl
              "
            >

              {/* HEADER */}
              <div className="border-b border-gray-200 p-6">

                <h2 className="text-2xl font-black text-gray-900">
                  Add Fields To Status
                </h2>

              </div>

              {/* BODY */}
              <div className="max-h-[500px] overflow-y-auto p-6">

                <div className="space-y-3">

                  {availableFields.map((field) => {

                    const selected =
                      selectedFields.find(
                        (f) => f.id === field.id
                      );

                    return (

                      <button
                        key={field.id}
                        onClick={() =>
                          toggleFieldSelection(
                            field.id
                          )
                        }
                        className={`
                          flex
                          w-full
                          items-center
                          justify-between
                          rounded-2xl
                          border
                          p-4
                          text-left
                          transition

                          ${selected
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 bg-white hover:bg-gray-50"
                          }
                        `}
                      >

                        <div>

                          <div className="font-semibold text-gray-900">
                            {field.label}
                          </div>

                          <div className="mt-1 text-sm text-gray-500">
                            {field.type}
                          </div>

                        </div>

                        <div>

                          {selected ? (
                            <div className="text-xl text-blue-600">
                              ✓
                            </div>
                          ) : (
                            <div className="text-xl text-gray-300">
                              ○
                            </div>
                          )}

                        </div>

                      </button>

                    );

                  })}

                </div>

              </div>

              {/* FOOTER */}
              <div
                className="
                  flex
                  justify-end
                  gap-3
                  border-t
                  border-gray-200
                  p-6
                "
              >

                <button
                  onClick={() =>
                    setShowFieldModal(false)
                  }
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
                  onClick={() =>
                    setShowFieldModal(false)
                  }
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
                  Done
                </button>

              </div>

            </div>

          </div>

        )}

      </div>

    </div>
  );
}