"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
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

const ALL_PHOTO_ALBUMS = "__all_photo_albums__";
const ALL_PHOTO_CATEGORIES = "__all_photo_categories__";

const legacyFallbackFields = [
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

  const [availableFields, setAvailableFields] = useState<any[]>([]);
  const [photoAlbums, setPhotoAlbums] = useState<any[]>([]);
  const [workflowStatuses, setWorkflowStatuses] = useState<any[]>([]);
  const [nextStatusId, setNextStatusId] = useState("");
  const [requiredPhotoAlbumId, setRequiredPhotoAlbumId] = useState("");
  const [requiredPhotoCategoryIds, setRequiredPhotoCategoryIds] = useState<string[]>([]);

  const [selectedFields, setSelectedFields] =
    useState<any[]>([]);

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

            setRequiredPhotoAlbumId(data.requiredPhotoAlbumId || "");
            setNextStatusId(data.nextStatusId || "");
            setRequiredPhotoCategoryIds(
              Array.isArray(data.requiredPhotoCategoryIds)
                ? data.requiredPhotoCategoryIds
                : data.requiredPhotoCategoryId
                  ? [data.requiredPhotoCategoryId]
                  : []
            );



            setSelectedColor(
              data.color || "bg-red-500"
            );


            setStatusOptions({

              startStatus:
                data.startStatus || false,

              closeJob:
                data.closeJob || false,

              jobCompleted:
                data.jobCompleted === true,

              startTimer:
                data.startTimer || false,

              endTimer:
                data.endTimer === true || data.stopTimer === true,

              active:
                data.active !== false,

              requireFormsComplete:
                data.requireFormsComplete === true,

              requireTasksComplete:
                data.requireTasksComplete === true,

              requirePartsServicesBooked:
                data.requirePartsServicesBooked === true,
              partsRequestWorkflow:
                data.partsRequestWorkflow === true,
              requireUnusedPartsConfirmation:
                data.requireUnusedPartsConfirmation === true,

              requirePhotoAlbumComplete:
                data.name?.replace(/[^\w\s]/gi, "").trim().toLowerCase() === "job booked"
                  ? false
                  : data.requirePhotoAlbumComplete === true,

              markMaterialsUsed:
                data.markMaterialsUsed === true,

              clearNoPartsUsed:
                data.clearNoPartsUsed === true,

              calculateEdt:
                typeof data.calculateEdt === "boolean"
                  ? data.calculateEdt
                  : !/on\s*hold|hold/.test(String(data.name || "").toLowerCase()),

              autoAdvance:
                data.autoAdvance === true,

            });


          }


        }


      );


    return () => unsub();


  }, [params.id]);

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "photoAlbumTemplates"),
    (snapshot) => setPhotoAlbums(
      snapshot.docs
        .map((albumDocument) => ({ id: albumDocument.id, ...albumDocument.data() }))
        .filter((album: any) => album.active !== false)
        .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
    )
  ), []);

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "statuses"),
    (snapshot) => setWorkflowStatuses(snapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() } as any))
      .filter((entry: any) => entry.active !== false)
      .sort((left: any, right: any) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0)))
  ), []);

  useEffect(() => {
    if (!status?.id) return;

    async function loadStatusReasonAndNoteFields() {
      const [reasonSnapshot, instructionSnapshot, jobCardSettingsSnapshot] = await Promise.all([
        getDocs(collection(clientDb, "companies", COMPANY_ID, "reasonFields")),
        getDocs(collection(clientDb, "companies", COMPANY_ID, "instructionFields")),
        getDoc(doc(clientDb, "companies", COMPANY_ID, "jobcard_settings", "Job")),
      ]);
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
      const normalizedStatusName = String(status.name || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
      const reasons = reasonSnapshot.docs
        .map((reasonDoc) => ({ id: reasonDoc.id, ...(reasonDoc.data() as any) }))
        .filter((reason: any) => {
          const linked = String(reason.linkedStatus || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
          const linkedIds = Array.isArray(reason.linkedStatusIds) ? reason.linkedStatusIds.map(String) : [];
          const linkedNames = Array.isArray(reason.linkedStatusNames)
            ? reason.linkedStatusNames.map((name: any) => String(name).replace(/[^a-z0-9]/gi, "").toLowerCase())
            : [];
          return reason.active !== false && (linkedIds.includes(status.id) || linkedNames.includes(normalizedStatusName) || reason.linkedStatus === status.id || linked === normalizedStatusName);
        })
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
      const notes = instructionSnapshot.docs
        .map((noteDoc) => ({ id: noteDoc.id, ...(noteDoc.data() as any) }))
        .filter((note: any) => note.active !== false && note.statusId === status.id)
        .map((note: any) => ({
          id: `instruction:${note.id}`,
          sourceId: note.id,
          sourceType: "instruction",
          label: note.fieldName || "Status Note",
          type: note.fieldType === "text" ? "text" : "select",
          options: Array.isArray(note.dropdownOptions) ? note.dropdownOptions : [],
          required: note.required === true,
        }));
      const nextAvailableFields = Array.from(new Map([...jobCardFields, ...reasons, ...notes].map((field: any) => [field.id, field])).values());
      setAvailableFields(nextAvailableFields);
      setSelectedFields((current) => current.map((selected) => {
        const migratedReason = reasons.find((reason: any) =>
          reason.sourceId && reason.sourceId === selected.sourceId && reason.id !== selected.id
        );
        return migratedReason ? { ...migratedReason, required: selected.required === true || migratedReason.required === true } : selected;
      }));
    }

    void loadStatusReasonAndNoteFields();
  }, [status?.id, status?.name]);

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
      jobCompleted: false,
      startTimer: false,
      endTimer: false,
      active: true,
      requireFormsComplete: false,
      requireTasksComplete: false,
      requirePartsServicesBooked: false,
      partsRequestWorkflow: false,
      requireUnusedPartsConfirmation: false,
      requirePhotoAlbumComplete: true,
      markMaterialsUsed: false,
      clearNoPartsUsed: false,
      calculateEdt: true,
      autoAdvance: false,
    });

  useEffect(() => {

    if (!isLockedStartStatus) {
      return;
    }

    setStatusOptions({

      startStatus: true,

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
      clearNoPartsUsed: false,
      calculateEdt: true,
      autoAdvance: false,
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

          options: field?.options || [],

          sourceId: field?.sourceId || "",

          sourceType: field?.sourceType || "",

          linkedJobType: field?.linkedJobType || "",

          required: field?.required === true,

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

    if (statusOptions.autoAdvance && !nextStatusId) {
      alert("Select the next status for automatic progression before saving.");
      return;
    }

    if (
      !isLockedStartStatus &&
      statusOptions.requirePhotoAlbumComplete &&
      (!requiredPhotoAlbumId || requiredPhotoCategoryIds.length === 0)
    ) {
      alert("Select the required Photo Album and Photo Category before saving this status.");
      return;
    }

    const allPhotoAlbumsSelected = requiredPhotoAlbumId === ALL_PHOTO_ALBUMS;
    const allPhotoCategoriesSelected = requiredPhotoCategoryIds.includes(ALL_PHOTO_CATEGORIES);
    const selectedPhotoAlbum = photoAlbums.find((album: any) => album.id === requiredPhotoAlbumId);
    const selectedPhotoCategories = (selectedPhotoAlbum?.categories || []).filter(
      (category: any) => requiredPhotoCategoryIds.includes(category.id)
    );

    if (!isLockedStartStatus && statusOptions.requirePhotoAlbumComplete && (
      (allPhotoAlbumsSelected && !allPhotoCategoriesSelected) ||
      (!allPhotoAlbumsSelected && (
        !selectedPhotoAlbum ||
        (!allPhotoCategoriesSelected && selectedPhotoCategories.length !== requiredPhotoCategoryIds.length)
      ))
    )) {
      alert("One or more selected Photo Categories are no longer available. Select them again.");
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
          selectedFields
            .filter(
              (selected, index, fields) =>
                availableFields.some((field) => field.id === selected.id) &&
                index === fields.findIndex((field) => field.id === selected.id)
            )
            .map((selected) => {

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

              options:
                fullField?.options || [],

              sourceId:
                fullField?.sourceId || "",

              sourceType:
                fullField?.sourceType || "",

              linkedJobType:
                fullField?.linkedJobType || "",

              required:
                selected.required,

            };

            }),



        startStatus:
          statusOptions.startStatus,


        closeJob:
          statusOptions.closeJob,

        jobCompleted:
          statusOptions.jobCompleted,


        startTimer:
          statusOptions.startTimer,


        stopTimer:
          statusOptions.endTimer,

        endTimer:
          statusOptions.endTimer,


        active:
          statusOptions.active,

        requireFormsComplete:
          statusOptions.requireFormsComplete,

        requireTasksComplete:
          statusOptions.requireTasksComplete,

        requirePartsServicesBooked:
          statusOptions.requirePartsServicesBooked,
        partsRequestWorkflow:
          statusOptions.partsRequestWorkflow,
        requireUnusedPartsConfirmation:
          statusOptions.requireUnusedPartsConfirmation,

        requirePhotoAlbumComplete:
          isLockedStartStatus ? false : statusOptions.requirePhotoAlbumComplete,

        requiredPhotoAlbumId:
          isLockedStartStatus || !statusOptions.requirePhotoAlbumComplete ? "" : requiredPhotoAlbumId,

        requiredPhotoAlbumName:
          isLockedStartStatus || !statusOptions.requirePhotoAlbumComplete
            ? ""
            : allPhotoAlbumsSelected ? "All Required Photo Albums" : selectedPhotoAlbum?.name || "",

        requiredPhotoCategoryIds:
          isLockedStartStatus || !statusOptions.requirePhotoAlbumComplete ? [] : requiredPhotoCategoryIds,

        requiredPhotoCategoryNames:
          isLockedStartStatus || !statusOptions.requirePhotoAlbumComplete
            ? []
            : allPhotoCategoriesSelected
              ? ["All Required Photo Categories"]
              : selectedPhotoCategories.map((category: any) => category.name || ""),

        requiredPhotoCategoryId:
          isLockedStartStatus || !statusOptions.requirePhotoAlbumComplete ? "" : requiredPhotoCategoryIds[0] || "",

        requiredPhotoCategoryName:
          isLockedStartStatus || !statusOptions.requirePhotoAlbumComplete
            ? ""
            : allPhotoCategoriesSelected ? "All Required Photo Categories" : selectedPhotoCategories[0]?.name || "",

        markMaterialsUsed:
          statusOptions.markMaterialsUsed,

        clearNoPartsUsed:
          statusOptions.clearNoPartsUsed,

        calculateEdt:
          statusOptions.calculateEdt,

        autoAdvance:
          statusOptions.autoAdvance,

        nextStatusId:
          statusOptions.autoAdvance ? nextStatusId : "",

        nextStatusName:
          statusOptions.autoAdvance ? workflowStatuses.find((entry: any) => entry.id === nextStatusId)?.name || "" : "",


      }


    );

    window.dispatchEvent(new Event("fleetfix:changes-saved"));


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

                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
                        <input
                          type="checkbox"
                          checked={selected.required === true}
                          onChange={() => toggleRequired(field.id)}
                          className="h-5 w-5 rounded border-gray-300 text-blue-600 accent-blue-600"
                        />
                        Required
                      </label>

                    </div>

                  );

                })}

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
                  {
                    key: "requireFormsComplete",
                    label: "Require Forms Completed Before Entering This Status",
                  },
                  {
                    key: "requireTasksComplete",
                    label: "Require Job Tasks Completed Before Entering This Status",
                  },
                  {
                    key: "requirePhotoAlbumComplete",
                    label: "Require Photo Album Completed Before Entering This Status",
                  },
                  {
                    key: "requirePartsServicesBooked",
                    label: "Require Parts / Services Booked Before Entering This Status",
                  },
                  {
                    key: "partsRequestWorkflow",
                    label: "Ask If Parts Are Required and Start a Parts Request",
                  },
                  {
                    key: "requireUnusedPartsConfirmation",
                    label: "Require Unused Parts or No Unused Parts Confirmation",
                  },
                ].map((item) => {
                  const locked = isLockedStartStatus && item.key === "requirePhotoAlbumComplete";
                  return (
                    <label
                      key={item.key}
                      className={`flex items-center gap-3 rounded-2xl border border-gray-200 p-4 ${locked ? "cursor-not-allowed bg-gray-50 text-gray-400" : "cursor-pointer text-gray-700"}`}
                    >
                      <input
                        type="checkbox"
                        checked={locked ? false : Boolean(statusOptions[item.key as keyof typeof statusOptions])}
                        disabled={locked}
                        onChange={(event) => setStatusOptions((previous) => ({
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

              {!isLockedStartStatus && statusOptions.requirePhotoAlbumComplete && (
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
                    key: "clearNoPartsUsed",
                    label: "Clear No Parts Used When This Status Is Selected",
                  },
                  {
                    key: "calculateEdt",
                    label: "Calculate EDT While Job Is In This Status",
                  },
                  {
                    key: "autoAdvance",
                    label: "Automatically Move to Next Status When Complete",
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
                            item.key === "active" ||
                            item.key === "requirePhotoAlbumComplete"
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
                            ? item.key === "requirePhotoAlbumComplete" ? "left-1" : "right-1"
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

                {statusOptions.autoAdvance && (
                  <label className="block rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-gray-700">
                    Next Status *
                    <select
                      value={nextStatusId}
                      onChange={(event) => setNextStatusId(event.target.value)}
                      className="mt-2 h-12 w-full rounded-xl border border-gray-300 bg-white px-3 font-semibold text-gray-900"
                    >
                      <option value="">Select next status</option>
                      {workflowStatuses
                        .filter((entry: any) => entry.id !== status?.id)
                        .map((entry: any) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                    </select>
                    <span className="mt-2 block text-xs font-medium text-gray-500">The job will move to this status after all selected fields and requirements are complete.</span>
                  </label>
                )}

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
