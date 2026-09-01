"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";

type JobType = {


  id: string;

  name: string;

  active?: boolean;

  linkedJobCardTemplateId?: string;

  linkedJobCardTemplateName?: string;

  linkedFormTemplateIds?: string[];


  linkedTaskTemplateIds?: string[];

  onlyAllowLinkedForms?: boolean;

};

type TaskTemplate = {

  id: string;

  name?: string;

  templateName?: string;

  title?: string;

  taskName?: string;

  active?: boolean;
};

type JobCardTemplate = {

  id: string;

  name?: string;

  templateName?: string;

  title?: string;

  formName?: string;

  active?: boolean;
};

const defaultJobTypes = [

  "❄️AC REGAS",

  "🩼ACCIDENT DAMAGE - ACCESS & REPAIR",

  "🪫BATTERY CHARGE",

  "🔎CHECK & ASSESSMENT ONLY‼️",

  "💻DIAGNOSTICS - CALIBRATION ONLY‼️",

  "💻DIAGNOSTICS - READ FAULTS / TEST / CALIBRATION",

  "💻DIAGNOSTICS - READ FAULTS ONLY‼️",

  "🛠️OTHER",

  "🚚PARTS DELIVERY ONLY",

  "🔩PARTS SALES ONLY / COLLECTION",

  "📂PERMIT / ✉️DOCUMENT- COLLECTION",

  "🕵️PRE-TRIP INSPECTION - TRAILER(S) ONLY",

  "🕵️PRE-TRIP INSPECTION - TRUCK AND TRAILERS",

  "🕵️PRE-TRIP INSPECTION - TRUCK ONLY",

  "🕵️PRE-TRIP INSPECTION & TYRE SURVEY",

  "👲SHACMAN - MAINTENANCE & WARRANTY JOB",

  "🚋TRAILER - AIR SYSTEM / PNEUMATIC",

  "🚋TRAILER - AXLES",

  "🚋TRAILER - BRAKE SYSTEM",

  "🚋TRAILER - ELECTRICAL LIGHTS",

  "🚋TRAILER - HUB / BEARINGS",

  "🚋TRAILER - HUB / STUDS",

  "🚋TRAILER - HYDRAULICS",

  "🚋TRAILER - LANDING LEGS",

  "🚋TRAILER - MUDGUARD / MUDFLAP",

  "🚋TRAILER - PRODUCT LEAKING",

  "🚋TRAILER - RECOVERY",

  "🚋TRAILER - SUSPENSION",

  "🚋TRAILER - TAILBOARD / CHEVRON",

  "🚋TRAILER - TARPS",

  "🚋TRAILER / TANKER - DECK / BODY",

  "🚛TRUCK - 5TH WHEEL",

  "🚛TRUCK - 5TH WHEEL MOVE",

  "🚛TRUCK - AIR SYSTEM / PNEUMATIC",

  "🚛TRUCK - BELT DRIVE SYSTEM",

  "🚛TRUCK - BRAKE SYSTEM",

  "🚛TRUCK - BULLBAR",

  "🚛TRUCK - BUMPER FRONT",

  "🚛TRUCK - CAB DOORS",

  "🚛TRUCK - CAB INNER",

  "🚛TRUCK - CAB MIRROR",

  "🚛TRUCK - CAB SUSPENSION",

  "🚛TRUCK - CLUTCH SYSTEM",

  "🚛TRUCK - DIAGNOSTICS / CALIBRATION",

  "🚛TRUCK - DIFF",

  "🚛TRUCK - ELECTRICAL BATTERY",

  "🚛TRUCK - ELECTRICAL FAULTS",

  "🚛TRUCK - ELECTRICAL LIGHTS",

  "🚛TRUCK - ENGINE COOLING SYSTEM",

  "🚛TRUCK - ENGINE FUEL SYSTEM / FILTERS",

  "🚛TRUCK - ENGINE MECHANICAL",

  "🚛TRUCK - ENGINE OIL",

  "🚛TRUCK - EXHAUST SYSTEM",

  "🚛TRUCK - GEARBOX",

  "🚛TRUCK - HVAC",

  "🚛TRUCK - HYDRAULICS",

  "🚛TRUCK - IGNITION / KEY",

  "🚛TRUCK - SERVICE MAJOR",

  "🚛TRUCK - SERVICE MINOR",

  "🚛TRUCK - STEER AXLE",

  "🚛TRUCK - STEERING / POWER STEERING",

  "🚛TRUCK - SUSPENSION",

  "🚛TRUCK - WINDOWS",

  "🚛TRUCK - WINDSCREEN WIPERS",

  "🚛🚋TRUCK & TRAILER - ELECTRICAL LIGHTS",

  "🛞TYRE - FIT NEW",

  "🛞TYRE - FIT SPARE WHEEL",

  "🛞TYRE - PUNCTURE REPAIR",

  "🛞TYRE - STRIP AND FIT",

  "🛞TYRE - SWAP TYRES",

  "🛞TYRE SURVEY",

  "🗜️WELDING",
];

export default function JobTypePage() {

  const [jobTypes, setJobTypes] =
    useState<JobType[]>([]);

  const [search, setSearch] =
    useState("");

  const [newType, setNewType] =
    useState("");

  const [
    linkedJobCardTemplateId,
    setLinkedJobCardTemplateId,
  ] = useState("");

  const [
    linkedTaskTemplateIds,
    setLinkedTaskTemplateIds,
  ] = useState<string[]>([]);


  const [
    jobCardTemplates,
    setJobCardTemplates,
  ] = useState<JobCardTemplate[]>([]);

  const [
    taskTemplates,
    setTaskTemplates,
  ] = useState<TaskTemplate[]>([]);

  const [
    onlyAllowLinkedForms,
    setOnlyAllowLinkedForms,
  ] = useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [editingName, setEditingName] =
    useState("");

  const [
    showCreateModal,
    setShowCreateModal,
  ] = useState(false);

  useEffect(() => {

    const unsub =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobTypes"
        ),

        (snapshot) => {

          setJobTypes(

            snapshot.docs.map(
              (doc) => ({

                id: doc.id,

                ...(doc.data() as any),

              }))
          );

        }
      );

    return () => unsub();

  }, []);

  useEffect(() => {

    const unsub =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobforms"
        ),

        (snapshot) => {

          setJobCardTemplates(

            snapshot.docs.map(
              (doc) => ({

                id: doc.id,

                ...(doc.data() as any),

              }))
          );

        }
      );

    return () => unsub();

  }, []);

  useEffect(() => {

    const unsub =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobcardtasks"
        ),

        (snapshot) => {

          setTaskTemplates(

            snapshot.docs.map(
              (doc) => ({

                id: doc.id,

                ...(doc.data() as any),

              }))
          );

        }
      );

    return () => unsub();

  }, []);

  useEffect(() => {

    if (jobTypes.length > 0) {
      return;
    }

    async function seedDefaults() {

      try {

        const snapshot =
          await getDocs(

            collection(
              clientDb,
              "companies",
              COMPANY_ID,
              "jobTypes"
            )
          );

        if (!snapshot.empty) {
          return;
        }

        const batch =
          writeBatch(clientDb);

        defaultJobTypes.forEach(
          (name) => {

            const ref =
              doc(

                collection(
                  clientDb,
                  "companies",
                  COMPANY_ID,
                  "jobTypes"
                )
              );

            batch.set(ref, {

              name,

              active: true,

              linkedJobCardTemplateId: "",

              linkedJobCardTemplateName: "",

              linkedTaskTemplateIds: [],

              onlyAllowLinkedForms: false,

              createdAt:
                serverTimestamp(),
            });

          }
        );

        await batch.commit();

      } catch (error) {

        console.error(error);

      }

    }

    seedDefaults();

  }, []);

  async function addJobType() {

    if (!newType.trim()) {

      return;
    }

    try {

      await addDoc(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobTypes"
        ),

        {

          name:
            newType,

          active: true,

          linkedJobCardTemplateId,

          linkedJobCardTemplateName:

            jobCardTemplates.find(
              (x) =>
                x.id ===
                linkedJobCardTemplateId
            )?.name || "",

          linkedTaskTemplateIds:
            linkedTaskTemplateIds,


          onlyAllowLinkedForms,

          createdAt:
            serverTimestamp(),
        }
      );

      setNewType("");

      setLinkedJobCardTemplateId("");

      setLinkedTaskTemplateIds([]);


      setOnlyAllowLinkedForms(false);

    } catch (error) {

      console.error(error);

      alert(
        "Failed to add Job Type"
      );
    }
  }

  async function updateJobType() {

    if (
      !editingId ||
      !editingName.trim()
    ) {
      return;
    }

    try {

      await updateDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobTypes",
          editingId
        ),

        {
          name:
            editingName.trim(),
        }
      );

      setEditingId(null);

      setEditingName("");

    } catch (error) {

      console.error(error);

      alert(
        "Failed to update Job Type"
      );
    }
  }

  async function removeJobType(
    id: string
  ) {

    const confirmed =
      confirm(
        "Delete this Job Type?"
      );

    if (!confirmed) {

      return;
    }

    try {

      await deleteDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobTypes",
          id
        )
      );

    } catch (error) {

      console.error(error);

      alert(
        "Failed to delete Job Type"
      );
    }
  }

  const filteredTypes =

    [...jobTypes]

      .sort((a, b) =>
        a.name.localeCompare(b.name)
      )

      .filter(
        (type) =>

          type.name
            ?.toLowerCase()
            .includes(
              search.toLowerCase()
            )
      );

  return (

    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="w-full">

        {/* HEADER */}
        <div
          className="
            mb-6
            flex
            items-center
            justify-between
          "
        >

          <div>

            <div
              className="
      mb-2
      text-xs
      font-black
      uppercase
      tracking-[0.25em]
      text-gray-400
    "
            >
              Admin
            </div>

            <h1
              className="
      text-4xl
      font-black
      text-gray-900
    "
            >
              Job Types
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Configure searchable
              operational job types
            </p>

          </div>

          <button
            type="button"
            onClick={() =>
              setShowCreateModal(true)
            }
            className="
    rounded-2xl
    bg-blue-600
    px-6
    py-3
    text-sm
    font-black
    text-white
    hover:bg-blue-700
  "
          >
            + Add Job Type
          </button>


        </div>

      </div>

      {/* SEARCH */}
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

        <input
          type="text"
          placeholder="Search Job Types..."
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
          className="
      h-14
      w-full
      rounded-2xl
      border-2
      border-gray-200
      px-5
      outline-none
      focus:border-blue-500
    "
        />

      </div>

      {/* LIST */}
      <div
        className="
            overflow-hidden
            rounded-3xl
            border
            border-gray-200
            bg-white
            shadow-sm
          "
      >

        <div className="overflow-x-auto">

          <table className="w-full">

            <thead>

              <tr
                className="
                    border-b
                    border-gray-200
                    bg-gray-50
                    text-left
                    text-xs
                    uppercase
                    tracking-wider
                    text-gray-500
                  "
              >

                <th className="px-6 py-3">
                  Job Type
                </th>

                <th className="px-6 py-3">
                  Linked Job Task Templates
                </th>

                <th className="px-6 py-3">
                  Status
                </th>

                <th className="px-6 py-3">
                  Actions
                </th>

              </tr>

            </thead>

            <tbody>

              {filteredTypes.map((type) => (

                <tr
                  key={type.id}
                  className="
        border-b
        border-gray-100
        hover:bg-gray-50
        h-12
      "
                >

                  <td
                    className="
          px-6
          py-2
          font-bold
        "
                  >
                    {type.name}
                  </td>

                  <td
                    className="
    px-6
    py-3
    text-sm
    font-bold
    text-indigo-700
  "
                  >
                    {type.linkedTaskTemplateIds?.length
                      ? type.linkedTaskTemplateIds
                        .map((templateId) => {
                          const template =
                            taskTemplates.find(
                              (item) =>
                                item.id === String(templateId)
                            );

                          return (
                            template?.name ||
                            template?.templateName ||
                            template?.title ||
                            "Missing Template"
                          );
                        })
                        .join(", ")
                      : "No Job Task Template"}
                  </td>

                  <td className="px-6 py-3">

                    <span
                      className="
            rounded-full
            bg-green-100
            px-3
            py-1
            text-xs
            font-bold
            text-green-700
          "
                    >
                      ACTIVE
                    </span>

                  </td>

                  <td className="px-6 py-3">

                    <div className="flex gap-2">

                      <button
                        type="button"
                        onClick={() => {

                          setEditingId(
                            type.id
                          );

                          setEditingName(
                            type.name
                          );
                          setLinkedJobCardTemplateId(
                            type.linkedJobCardTemplateId || ""
                          );

                          setLinkedTaskTemplateIds(
                            type.linkedTaskTemplateIds || []
                          );


                          setOnlyAllowLinkedForms(
                            type.onlyAllowLinkedForms || false
                          );
                        }}
                        className="
              rounded-lg
              border
              border-blue-300
              bg-blue-50
              px-3
              py-1.5
              text-xs
              font-bold
              text-blue-700
              hover:bg-blue-100
            "
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          removeJobType(
                            type.id
                          )
                        }
                        className="
              rounded-lg
              bg-red-100
              px-3
              py-1.5
              text-xs
              font-bold
              text-red-700
              hover:bg-red-200
            "
                      >
                        Delete
                      </button>

                    </div>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

          {/* CREATE MODAL */}
          {showCreateModal && (

            <div
              className="
      fixed
      inset-0
      z-[99999]
      flex
      items-center
      justify-center
      bg-black/40
      p-6
    "
            >

              <div
                className="
        w-full
        max-w-2xl
        rounded-3xl
        bg-white
        p-8
        shadow-2xl
      "
              >
                {/* TITLE */}
                <div className="mb-6">

                  <h2
                    className="
            text-2xl
            font-black
            text-gray-900
          "
                  >
                    Create Job Type
                  </h2>

                </div>

                {/* NAME */}
                <div className="mb-6">

                  <label
                    className="
            mb-2
            block
            text-sm
            font-bold
            text-gray-700
          "
                  >
                    Name *
                  </label>

                  <input
                    type="text"
                    value={newType}
                    onChange={(e) =>
                      setNewType(
                        e.target.value
                      )
                    }
                    className="
            h-14
            w-full
            rounded-2xl
            border-2
            border-gray-200
            px-5
            outline-none
            focus:border-blue-500
          "
                  />

                </div>

                {/* Legacy form linking moved to the Form Builder. */}
                {false && <div className="mb-6">

                  <label
                    className="
      mb-2
      block
      text-sm
      font-bold
      text-gray-700
    "
                  >
                    Linked Job Form Template *
                  </label>

                  <select
                    value={linkedJobCardTemplateId}
                    onChange={(e) =>
                      setLinkedJobCardTemplateId(
                        e.target.value
                      )
                    }
                    className="
      h-14
      w-full
      rounded-2xl
      border-2
      border-gray-200
      px-5
      outline-none
      focus:border-blue-500
    "
                  >

                    <option value="">
                      Select Job Form Template
                    </option>

                    {jobCardTemplates
                      .filter(
                        (x) => x.active !== false
                      )
                      .map(
                        (template) => (

                          <option
                            key={template.id}
                            value={template.id}
                          >

                            {
                              template.name ||
                              template.templateName ||
                              template.title ||
                              template.formName ||
                              "Unnamed Template"
                            }

                          </option>

                        )
                      )}

                  </select>

                </div>}

                {/* CREATE LINKED TASK TEMPLATE */}
                <div className="mb-6">

                  <label
                    className="
      mb-2
      block
      text-sm
      font-bold
      text-gray-700
    "
                  >
                    Linked Job Task Templates
                  </label>

                  <select
                    multiple
                    value={linkedTaskTemplateIds}
                    onChange={(e) =>
                      setLinkedTaskTemplateIds(
                        Array.from(
                          e.target.selectedOptions,
                          (option) => option.value
                        )
                      )
                    }
                    className="
      min-h-36
      w-full
      rounded-2xl
      border-2
      border-gray-200
      px-5
      outline-none
      focus:border-blue-500
    "
                  >

                    {taskTemplates
                      .filter(
                        (x) => x.active !== false
                      )
                      .map(
                        (template) => (

                          <option
                            key={template.id}
                            value={template.id}
                          >

                            {
                              template.name ||
                              template.templateName ||
                              template.title ||
                              template.taskName ||
                              "Unnamed Template"
                            }

                          </option>

                        )
                      )}

                  </select>

                  <p className="mt-2 text-xs text-gray-500">
                    Hold Ctrl (Windows) or Command (Mac) to select multiple task templates.
                  </p>

                </div>

                {/* CHECKBOX */}
                <div className="mb-8 flex items-center gap-3">

                  <input
                    type="checkbox"
                    checked={onlyAllowLinkedForms}
                    onChange={(e) =>
                      setOnlyAllowLinkedForms(
                        e.target.checked
                      )
                    }
                    className="
    h-5
    w-5
    rounded
    border-gray-300
  "
                  />

                  <span
                    className="
            text-sm
            text-gray-700
          "
                  >
                    Only Allow Linked Forms
                  </span>

                </div>

                {/* FOOTER */}
                <div
                  className="
          flex
          justify-end
          gap-4
          border-t
          border-gray-200
          pt-6
        "
                >

                  <button
                    onClick={() =>
                      setShowCreateModal(false)
                    }
                    className="
            rounded-xl
            border
            border-gray-300
            px-6
            py-3
            font-bold
            text-gray-700
            hover:bg-gray-100
          "
                  >
                    Cancel
                  </button>

                  <button
                    onClick={async () => {

                      await addJobType();

                      setShowCreateModal(false);
                    }}
                    className="
            rounded-xl
            bg-blue-600
            px-6
            py-3
            font-bold
            text-white
            hover:bg-blue-700
          "
                  >
                    Create
                  </button>

                </div>

              </div>

            </div>

          )}

          {/* EDIT MODAL */}
          {editingId && (

            <div
              className="
      fixed
      inset-0
      z-[99999]
      flex
      items-center
      justify-center
      bg-black/40
      p-6
    "
            >

              <div
                className="
        w-full
        max-w-2xl
        rounded-3xl
        bg-white
        p-8
        shadow-2xl
      "
              >

                {/* TITLE */}
                <div className="mb-6">

                  <h2
                    className="
            text-2xl
            font-black
            text-gray-900
          "
                  >
                    Edit Job Type
                  </h2>

                </div>

                {/* NAME */}
                <div className="mb-6">

                  <label
                    className="
            mb-2
            block
            text-sm
            font-bold
            text-gray-700
          "
                  >
                    Name *
                  </label>

                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) =>
                      setEditingName(
                        e.target.value
                      )
                    }
                    className="
            h-14
            w-full
            rounded-2xl
            border-2
            border-gray-200
            px-5
            outline-none
            focus:border-blue-500
          "
                  />

                </div>

                {/* Legacy form linking moved to the Form Builder. */}
                {false && <div className="mb-6">

                  <label
                    className="
            mb-2
            block
            text-sm
            font-bold
            text-gray-700
          "
                  >
                    Linked Job Form Template *
                  </label>

                  <select
                    value={linkedJobCardTemplateId}
                    onChange={(e) =>
                      setLinkedJobCardTemplateId(
                        e.target.value
                      )
                    }
                    className="
            h-14
            w-full
            rounded-2xl
            border-2
            border-gray-200
            px-5
            outline-none
            focus:border-blue-500
          "
                  >

                    <option value="">
                      Select Job Form Template
                    </option>

                    {jobCardTemplates
                      .filter(
                        (x) => x.active !== false
                      )
                      .map(
                        (template) => (

                          <option
                            key={template.id}
                            value={template.id}
                          >
                            {
                              template.name ||
                              template.templateName ||
                              template.title ||
                              template.formName ||
                              "Unnamed Template"
                            }
                          </option>

                        )
                      )}

                  </select>

                </div>}

                {/* EDIT LINKED TASK TEMPLATE */}
                <div className="mb-6">

                  <label
                    className="
      mb-2
      block
      text-sm
      font-bold
      text-gray-700
    "
                  >
                    Linked Job Task Templates
                  </label>

                  <select
                    multiple
                    value={linkedTaskTemplateIds}
                    onChange={(e) =>
                      setLinkedTaskTemplateIds(
                        Array.from(
                          e.target.selectedOptions,
                          (option) => option.value
                        )
                      )
                    }
                    className="
      min-h-36
      w-full
      rounded-2xl
      border-2
      border-gray-200
      px-5
      outline-none
      focus:border-blue-500
    "
                  >

                    {taskTemplates
                      .filter(
                        (x) => x.active !== false
                      )
                      .map(
                        (template) => (

                          <option
                            key={template.id}
                            value={template.id}
                          >

                            {
                              template.name ||
                              template.templateName ||
                              template.title ||
                              template.taskName ||
                              "Unnamed Template"
                            }

                          </option>

                        )
                      )}

                  </select>

                  <p className="mt-2 text-xs text-gray-500">
                    Hold Ctrl (Windows) or Command (Mac) to select multiple task templates.
                  </p>

                </div>

                {/* CHECKBOX */}
                <div className="mb-8 flex items-center gap-3">

                  <input
                    type="checkbox"
                    checked={onlyAllowLinkedForms}
                    onChange={(e) =>
                      setOnlyAllowLinkedForms(
                        e.target.checked
                      )
                    }
                    className="
            h-5
            w-5
            rounded
            border-gray-300
          "
                  />

                  <span
                    className="
            text-sm
            text-gray-700
          "
                  >
                    Only Allow Linked Forms
                  </span>

                </div>

                {/* FOOTER */}
                <div
                  className="
          flex
          justify-end
          gap-4
          border-t
          border-gray-200
          pt-6
        "
                >

                  <button
                    onClick={() => {

                      setEditingId(null);

                      setEditingName("");
                    }}
                    className="
            rounded-xl
            border
            border-gray-300
            px-6
            py-3
            font-bold
            text-gray-700
            hover:bg-gray-100
          "
                  >
                    Cancel
                  </button>

                  <button
                    onClick={async () => {

                      await updateDoc(

                        doc(
                          clientDb,
                          "companies",
                          COMPANY_ID,
                          "jobTypes",
                          editingId
                        ),

                        {
                          name: editingName.trim(),
                          active: true,

                          linkedJobCardTemplateId,


                          linkedJobCardTemplateName:

                            jobCardTemplates.find(
                              (x) =>
                                x.id ===
                                linkedJobCardTemplateId
                            )?.name || "",

                          linkedTaskTemplateIds:
                            linkedTaskTemplateIds,


                          onlyAllowLinkedForms,
                        }
                      );

                      setEditingId(null);

                      setEditingName("");

                    }}
                    className="
                    rounded-xl
                    bg-blue-600
                    px-6
                    py-3
                    font-bold
                    text-white
                    hover:bg-blue-700
                    "
                  >
                    Save Changes
                  </button>

                </div>

              </div>

            </div>

          )}

        </div>

      </div>

    </div >

  );

}
