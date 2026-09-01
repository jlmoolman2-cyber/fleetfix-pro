"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
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
  "bg-yellow-500",
  "bg-green-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-gray-600",
  "bg-gray-500",
  "bg-gray-400",
];

const ALL_PHOTO_ALBUMS = "__all_photo_albums__";
const ALL_PHOTO_CATEGORIES = "__all_photo_categories__";

export default function NewStatusPage() {

  const [toggles, setToggles] = useState({
    startStatus: false,
    closeJob: false,
    jobCompleted: false,
    startTimer: false,
    endTimer: false,
    active: true,
    requireFormsComplete: false,
    requireTasksComplete: false,
    requirePartsServicesBooked: false,
    partsRequestWorkflow: false,
    requireUnusedPartsConfirmation: false,
    requirePhotoAlbumComplete: false,
    markMaterialsUsed: false,
    calculateEdt: true,
  });
  const router = useRouter();

  const [statusName, setStatusName] =
    useState("");

  const isJobBookedStatus = statusName
    .replace(/[^\w\s]/gi, "")
    .trim()
    .toLowerCase() === "job booked";

  const [selectedColor, setSelectedColor] =
    useState("bg-blue-500");

  const [saving, setSaving] =
    useState(false);
  const [availableFields, setAvailableFields] = useState<any[]>([]);
  const [selectedFields, setSelectedFields] = useState<any[]>([]);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [photoAlbums, setPhotoAlbums] = useState<any[]>([]);
  const [requiredPhotoAlbumId, setRequiredPhotoAlbumId] = useState("");
  const [requiredPhotoCategoryIds, setRequiredPhotoCategoryIds] = useState<string[]>([]);
  const colors = defaultColors;

  useEffect(() => {
    async function loadOptions() {
      const [reasonSnapshot, jobCardSettingsSnapshot] = await Promise.all([
        getDocs(collection(clientDb, "companies", COMPANY_ID, "reasonFields")),
        getDoc(doc(clientDb, "companies", COMPANY_ID, "jobcard_settings", "Job")),
      ]);
      const normalizedStatusName = statusName.replace(/[^a-z0-9]/gi, "").toLowerCase();
      const settings = jobCardSettingsSnapshot.exists() ? jobCardSettingsSnapshot.data() : {};
      const activatedStatusIds = Array.isArray(settings.statusFields) ? settings.statusFields : [];
      const catalog = Array.isArray(settings.fieldCatalog) ? settings.fieldCatalog : [];
      const catalogById = new Map(catalog.map((field: any) => [field.id, field]));
      const jobCardFields = activatedStatusIds.map((id: string) => {
        const definition: any = catalogById.get(id) || {};
        return {
          id,
          sourceType: "jobCard",
          label: definition.label || settings.editableLabels?.[id] || id.replace(/([A-Z])/g, " $1").replace(/^./, (value: string) => value.toUpperCase()),
          type: definition.type === "dropdown" ? "select" : definition.type || "text",
          options: Array.isArray(definition.options) ? definition.options : [],
          required: false,
        };
      });
      const reasonFields = reasonSnapshot.docs
        .map((reasonDoc) => ({ id: reasonDoc.id, ...(reasonDoc.data() as any) }))
        .filter((reason: any) => reason.active !== false && (
          (Array.isArray(reason.linkedStatusNames) && reason.linkedStatusNames.some((name: any) => String(name).replace(/[^a-z0-9]/gi, "").toLowerCase() === normalizedStatusName)) ||
          String(reason.linkedStatus || "").replace(/[^a-z0-9]/gi, "").toLowerCase() === normalizedStatusName
        ))
        .map((reason: any) => ({
          id: !/travel(?:ed|led)?\s*for/i.test(String(reason.name || "")) && (reason.readingType === "startKm" || reason.readingType === "endKm")
            ? reason.readingType
            : `reason:${reason.id}`,
          sourceId: reason.id,
          sourceType: "reason",
          label: reason.name || "Status Reason",
          type: !/travel(?:ed|led)?\s*for/i.test(String(reason.name || "")) && (reason.readingType === "startKm" || reason.readingType === "endKm")
            ? "number"
            : reason.fieldType === "dropdown" ? "select" : "text",
          options: Array.isArray(reason.dropdownOptions) ? reason.dropdownOptions : [],
          linkedJobType: reason.linkedJobType || "",
          required: reason.required === true,
        }));
      setAvailableFields(Array.from(new Map([...jobCardFields, ...reasonFields].map((field: any) => [field.id, field])).values()));
    }

    void loadOptions();
  }, [statusName]);

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "photoAlbumTemplates"),
    (snapshot) => setPhotoAlbums(
      snapshot.docs
        .map((albumDocument) => ({ id: albumDocument.id, ...albumDocument.data() }))
        .filter((album: any) => album.active !== false)
        .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
    )
  ), []);

  function toggleField(field: any) {
    setSelectedFields((current) =>
      current.some((selected) => selected.id === field.id)
        ? current.filter((selected) => selected.id !== field.id)
        : [...current, { ...field, required: field.required === true }]
    );
  }

  function toggleRequired(fieldId: string) {
    setSelectedFields((current) => current.map((field) =>
      field.id === fieldId ? { ...field, required: !field.required } : field
    ));
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

              <div className={`h-5 w-5 rounded ${selectedColor}`} />

              <h1 className="text-3xl font-black text-gray-900">
                Create Status
              </h1>

            </div>

            <p className="text-sm text-gray-500">
              Configure workflow status behaviour and messages
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

                if (
                  !isJobBookedStatus &&
                  toggles.requirePhotoAlbumComplete &&
                  (!requiredPhotoAlbumId || requiredPhotoCategoryIds.length === 0)
                ) {
                  alert("Select the required Photo Album and Photo Category before saving this status.");
                  return;
                }

                const allPhotoAlbumsSelected = requiredPhotoAlbumId === ALL_PHOTO_ALBUMS;
                const allPhotoCategoriesSelected = requiredPhotoCategoryIds.includes(ALL_PHOTO_CATEGORIES);
                const selectedPhotoAlbum = photoAlbums.find(
                  (album: any) => album.id === requiredPhotoAlbumId
                );
                const selectedPhotoCategories = (selectedPhotoAlbum?.categories || []).filter(
                  (category: any) => requiredPhotoCategoryIds.includes(category.id)
                );

                if (!isJobBookedStatus && toggles.requirePhotoAlbumComplete && (
                  (allPhotoAlbumsSelected && !allPhotoCategoriesSelected) ||
                  (!allPhotoAlbumsSelected && (
                    !selectedPhotoAlbum ||
                    (!allPhotoCategoriesSelected && selectedPhotoCategories.length !== requiredPhotoCategoryIds.length)
                  ))
                )) {
                  alert("One or more selected Photo Categories are no longer available. Select them again.");
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

                      jobCompleted:
                        toggles.jobCompleted,

                      startTimer:
                        toggles.startTimer,

                      endTimer:
                        toggles.endTimer,

                      stopTimer:
                        toggles.endTimer,

                      active:
                        toggles.active,

                      requireFormsComplete:
                        toggles.requireFormsComplete,

                      requireTasksComplete:
                        toggles.requireTasksComplete,

                      requirePartsServicesBooked:
                        toggles.requirePartsServicesBooked,
                      partsRequestWorkflow:
                        toggles.partsRequestWorkflow,
                      requireUnusedPartsConfirmation:
                        toggles.requireUnusedPartsConfirmation,

                      requirePhotoAlbumComplete:
                        isJobBookedStatus ? false : toggles.requirePhotoAlbumComplete,

                      requiredPhotoAlbumId:
                        isJobBookedStatus || !toggles.requirePhotoAlbumComplete ? "" : requiredPhotoAlbumId,

                      requiredPhotoAlbumName:
                        isJobBookedStatus || !toggles.requirePhotoAlbumComplete
                          ? ""
                          : allPhotoAlbumsSelected ? "All Required Photo Albums" : selectedPhotoAlbum?.name || "",

                      requiredPhotoCategoryIds:
                        isJobBookedStatus || !toggles.requirePhotoAlbumComplete ? [] : requiredPhotoCategoryIds,

                      requiredPhotoCategoryNames:
                        isJobBookedStatus || !toggles.requirePhotoAlbumComplete
                          ? []
                          : allPhotoCategoriesSelected
                            ? ["All Required Photo Categories"]
                            : selectedPhotoCategories.map((category: any) => category.name || ""),

                      requiredPhotoCategoryId:
                        isJobBookedStatus || !toggles.requirePhotoAlbumComplete ? "" : requiredPhotoCategoryIds[0] || "",

                      requiredPhotoCategoryName:
                        isJobBookedStatus || !toggles.requirePhotoAlbumComplete
                          ? ""
                          : allPhotoCategoriesSelected ? "All Required Photo Categories" : selectedPhotoCategories[0]?.name || "",

                      markMaterialsUsed:
                        toggles.markMaterialsUsed,

                      calculateEdt:
                        toggles.calculateEdt,

                      fields: selectedFields,


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
                : "Save"}
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
                  type="button"
                  onClick={() => setShowFieldModal(true)}
                  className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  + Add Field
                </button>

              </div>

              <div className="mb-4 space-y-3">
                {selectedFields.map((field) => (
                  <div key={field.id} className="flex flex-col gap-4 rounded-2xl border border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleField(field)}
                        className="rounded-xl bg-red-50 p-2 text-red-600 hover:bg-red-100"
                        aria-label={`Remove ${field.label}`}
                      >
                        🗑
                      </button>
                      <div>
                        <div className="font-medium text-gray-800">{field.label}</div>
                        <div className="text-xs text-gray-400">{field.type}</div>
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
                      <input type="checkbox" checked={field.required === true} onChange={() => toggleRequired(field.id)} className="h-5 w-5 rounded border-gray-300 text-blue-600 accent-blue-600" />
                      Required
                    </label>
                  </div>
                ))}
              </div>

              {/* EMPTY STATE */}
              <div
                className={`${selectedFields.length > 0 ? "hidden" : ""}
                  rounded-3xl
                  border-2
                  border-dashed
                  border-gray-300
                  p-12
                  text-center
                `}
              >

                <div className="mb-4 text-6xl">
                  ➕
                </div>

                <h3 className="text-2xl font-bold text-gray-900">
                  No Fields Added
                </h3>

                <p className="mt-3 text-gray-500">
                  Add fields that technicians must complete for this status
                </p>

              </div>

            </div>

            {/* REQUIREMENTS */}
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  Requirements Before Entering This Status
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Tick everything that must be completed before a job can change into this status.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { key: "requireFormsComplete", label: "Require Forms Completed Before Entering This Status" },
                  { key: "requireTasksComplete", label: "Require Job Tasks Completed Before Entering This Status" },
                  { key: "requirePhotoAlbumComplete", label: "Require Photo Album Completed Before Entering This Status" },
                  { key: "requirePartsServicesBooked", label: "Require Parts / Services Booked Before Entering This Status" },
                  { key: "partsRequestWorkflow", label: "Ask If Parts Are Required and Start a Parts Request" },
                  { key: "requireUnusedPartsConfirmation", label: "Require Unused Parts or No Unused Parts Confirmation" },
                ].map((item) => {
                  const locked = isJobBookedStatus && item.key === "requirePhotoAlbumComplete";
                  return (
                    <label
                      key={item.key}
                      className={`flex items-center gap-3 rounded-2xl border border-gray-200 p-4 ${locked ? "cursor-not-allowed bg-gray-50 text-gray-400" : "cursor-pointer text-gray-700"}`}
                    >
                      <input
                        type="checkbox"
                        checked={locked ? false : Boolean(toggles[item.key as keyof typeof toggles])}
                        disabled={locked}
                        onChange={(event) => setToggles((previous) => ({
                          ...previous,
                          [item.key]: event.target.checked,
                        }))}
                        className="h-5 w-5 rounded border-gray-300 text-blue-600 accent-blue-600"
                      />
                      <span className="flex-1 font-medium">{item.label}</span>
                      {locked && <span className="rounded-full bg-gray-200 px-2 py-1 text-[10px] font-black uppercase text-gray-500">Locked</span>}
                    </label>
                  );
                })}
              </div>

              {!isJobBookedStatus && toggles.requirePhotoAlbumComplete && (
                <div className="mt-5 grid gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 md:grid-cols-2">
                  <label className="text-sm font-bold text-gray-700">
                    Required Photo Album *
                    <select
                      value={requiredPhotoAlbumId}
                      onChange={(event) => {
                        setRequiredPhotoAlbumId(event.target.value);
                        setRequiredPhotoCategoryIds(
                          event.target.value === ALL_PHOTO_ALBUMS ? [ALL_PHOTO_CATEGORIES] : []
                        );
                      }}
                      className="mt-2 w-full rounded-xl border border-gray-300 bg-white p-3 font-medium"
                    >
                      <option value="">Select album</option>
                      <option value={ALL_PHOTO_ALBUMS}>All Required Photo Albums</option>
                      {photoAlbums.map((album: any) => (
                        <option key={album.id} value={album.id}>{album.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-bold text-gray-700">
                    Required Photo Categories *
                    <span className="mt-2 block max-h-48 space-y-2 overflow-y-auto rounded-xl border border-gray-300 bg-white p-3 font-medium">
                      {!requiredPhotoAlbumId && <span className="block text-gray-400">Select an album first</span>}
                      {requiredPhotoAlbumId && (
                        <span className="flex items-center gap-2 font-bold text-blue-700">
                          <input
                            type="checkbox"
                            checked={requiredPhotoCategoryIds.includes(ALL_PHOTO_CATEGORIES)}
                            onChange={(event) => setRequiredPhotoCategoryIds(
                              event.target.checked ? [ALL_PHOTO_CATEGORIES] : []
                            )}
                            className="h-4 w-4 accent-blue-600"
                          />
                          All Required Photo Categories
                        </span>
                      )}
                      {requiredPhotoAlbumId !== ALL_PHOTO_ALBUMS &&
                        !requiredPhotoCategoryIds.includes(ALL_PHOTO_CATEGORIES) &&
                        (photoAlbums.find((album: any) => album.id === requiredPhotoAlbumId)?.categories || [])
                        .map((category: any) => (
                          <span key={category.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={requiredPhotoCategoryIds.includes(category.id)}
                              onChange={(event) => setRequiredPhotoCategoryIds((current) =>
                                event.target.checked
                                  ? [...current, category.id]
                                  : current.filter((categoryId) => categoryId !== category.id)
                              )}
                              className="h-4 w-4 accent-blue-600"
                            />
                            {category.name}
                          </span>
                        ))}
                    </span>
                  </label>
                </div>
              )}
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
                    key: "jobCompleted",
                    label: "Job Completed",
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
                  {
                    key: "markMaterialsUsed",
                    label: "Automatically Mark Job Materials as Used",
                  },
                  {
                    key: "calculateEdt",
                    label: "Calculate EDT While Job Is In This Status",
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
                      disabled={isJobBookedStatus && item.key === "requirePhotoAlbumComplete"}
                      onClick={() => {
                        if (isJobBookedStatus && item.key === "requirePhotoAlbumComplete") return;
                        setToggles((prev) => ({
                          ...prev,
                          [item.key]:
                            !prev[item.key as keyof typeof prev],
                        }));
                      }}
                      className={`
                        relative
                        h-6
                        w-11
                        rounded-full
                        transition

                        ${(isJobBookedStatus && item.key === "requirePhotoAlbumComplete") ? false : toggles[
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

                          ${(isJobBookedStatus && item.key === "requirePhotoAlbumComplete") ? false : toggles[
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

          </div>

        </div>

      </div>

      {showFieldModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-6">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black">Activated Job Card Fields</h2>
                <p className="mt-1 text-sm text-gray-500">Fields enabled for Status in Admin › Job Card Manager</p>
              </div>
              <button type="button" onClick={() => setShowFieldModal(false)} className="rounded-lg border px-3 py-2 font-bold">Close</button>
            </div>

            {availableFields.length === 0 ? (
              <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                No status fields are activated. Tick Status fields in Admin › Job Card Manager first.
              </div>
            ) : (
              <div className="space-y-2">
                {availableFields.map((field) => {
                  const selected = selectedFields.some((item) => item.id === field.id);
                  return (
                    <button
                      key={field.id}
                      type="button"
                      onClick={() => toggleField(field)}
                      className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${selected ? "border-blue-600 bg-blue-50" : "border-gray-200"}`}
                    >
                      <span className="font-semibold">{field.label}</span>
                      <span className="font-black text-blue-700">{selected ? "Added" : "+ Add"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
