"use client";

import {
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";

import {
    ArrowLeft,
    Pencil,
    Plus,
    Save,
    Trash2,
} from "lucide-react";

import { useRouter } from "next/navigation";

import {
    clientDb,
} from "@/lib/firebaseClient";

import {
    COMPANY_ID,
} from "@/lib/company";

const BUILT_IN_REOPENED_STATUS_ID = "__built_in_reopened__";

type ReasonField = {
    id: string;

    name: string;

    linkedStatus: string;
    linkedStatusIds?: string[];
    linkedStatusNames?: string[];

    linkedJobType: string;

    fieldType: "text" | "dropdown";

    dropdownOptions?: string[];

    required: boolean;

    readingType?: "none" | "startKm" | "endKm";

    active: boolean;

    createdAt?: any;
};

export default function ReasonPage() {

    const router =
        useRouter();

    const [
        reasonFields,
        setReasonFields,
    ] = useState<ReasonField[]>([]);

    const [search, setSearch] =
        useState("");

    const [showModal, setShowModal] =
        useState(false);

    const [editingId, setEditingId] =
        useState<string | null>(null);

    const [fieldName, setFieldName] =
        useState("");

    const [linkedStatusIds, setLinkedStatusIds] = useState<string[]>([]);

    const [
        linkedJobType,
        setLinkedJobType,
    ] = useState("");

    const [
        fieldType,
        setFieldType,
    ] = useState<
        "text" | "dropdown"
    >("text");

    const [
        dropdownOptions,
        setDropdownOptions,
    ] = useState("");

    const [
        dropdownReason,
        setDropdownReason,
    ] = useState("");

    const [
        dropdownReasonList,
        setDropdownReasonList,
    ] = useState<string[]>([]);

    const [required, setRequired] =
        useState(false);
    const [readingType, setReadingType] = useState<"none" | "startKm" | "endKm">("none");

    const [statuses, setStatuses] = useState<any[]>([]);
    const [jobTypes, setJobTypes] = useState<any[]>([]);

    useEffect(() => {

        const unsub =
            onSnapshot(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "reasonFields"
                ),

                (snapshot) => {

                    setReasonFields(

                        snapshot.docs.map(
                            (doc) => ({

                                id: doc.id,

                                ...(doc.data() as any),
                            })
                        )
                    );
                }
            );

        return () => unsub();

    }, []);

    useEffect(() => {
        const unsubscribeStatuses = onSnapshot(
            collection(clientDb, "companies", COMPANY_ID, "statuses"),
            (snapshot) => setStatuses(snapshot.docs
                .map((statusDoc) => ({ id: statusDoc.id, ...statusDoc.data() }))
                .filter((status: any) => status.active !== false)
                .sort((a: any, b: any) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)))
        );
        const unsubscribeJobTypes = onSnapshot(
            collection(clientDb, "companies", COMPANY_ID, "jobTypes"),
            (snapshot) => setJobTypes(snapshot.docs
                .map((jobTypeDoc) => ({ id: jobTypeDoc.id, ...jobTypeDoc.data() }))
                .filter((jobType: any) => jobType.active !== false)
                .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || ""))))
        );
        return () => {
            unsubscribeStatuses();
            unsubscribeJobTypes();
        };
    }, []);

    async function saveField() {

        if (
            !fieldName ||
            linkedStatusIds.length === 0
        ) {

            alert(
                "Please complete required fields"
            );

            return;

        }

        let resolvedLinkedStatusIds = [...linkedStatusIds];
        if (resolvedLinkedStatusIds.includes(BUILT_IN_REOPENED_STATUS_ID)) {
            const statusCollection = collection(clientDb, "companies", COMPANY_ID, "statuses");
            const statusSnapshot = await getDocs(statusCollection);
            const existingReopened = statusSnapshot.docs.find((statusDoc) =>
                String(statusDoc.data().name || "").replace(/[^a-z0-9]/gi, "").toLowerCase() === "reopened"
            );
            let reopenedStatusId: string;
            if (existingReopened) {
                reopenedStatusId = existingReopened.id;
                if (existingReopened.data().active === false) {
                    await updateDoc(existingReopened.ref, { active: true, updatedAt: serverTimestamp() });
                }
            } else {
                const reopenedStatusRef = await addDoc(statusCollection, {
                    name: "Re-opened",
                    color: "bg-blue-500",
                    active: true,
                    startStatus: false,
                    closeJob: false,
                    jobCompleted: false,
                    startTimer: false,
                    endTimer: false,
                    fields: [],
                    sortOrder: Date.now(),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                reopenedStatusId = reopenedStatusRef.id;
            }
            resolvedLinkedStatusIds = resolvedLinkedStatusIds.map((statusId) =>
                statusId === BUILT_IN_REOPENED_STATUS_ID ? reopenedStatusId : statusId
            );
        }

        const linkedStatusNames = resolvedLinkedStatusIds.map((statusId) =>
            statuses.find((status: any) => status.id === statusId)?.name ||
            (linkedStatusIds.includes(BUILT_IN_REOPENED_STATUS_ID) ? "Re-opened" : statusId)
        );
        const payload = {

            name: fieldName,

            linkedStatus: linkedStatusNames[0] || "",
            linkedStatusIds: resolvedLinkedStatusIds,
            linkedStatusNames,

            linkedJobType,

            fieldType,

            dropdownOptions:
                fieldType === "dropdown"
                    ? dropdownReasonList
                    : [],

            required,

            readingType: /travel(?:ed|led)?\s*for/i.test(fieldName) ? "none" : readingType,

            active: true,

            updatedAt:
                serverTimestamp(),
        };

        try {

            if (editingId) {

                await updateDoc(

                    doc(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "reasonFields",
                        editingId
                    ),

                    payload
                );

            } else {

                await addDoc(

                    collection(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "reasonFields"
                    ),

                    {
                        ...payload,

                        createdAt:
                            serverTimestamp(),
                    }
                );
            }

            resetForm();

        } catch (error) {

            console.error(error);

            alert(
                "Failed to save field"
            );
        }
    }

    async function removeField(
        id: string
    ) {

        const confirmed =
            confirm(
                "Delete this field?"
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
                    "reasonFields",
                    id
                )
            );

        } catch (error) {

            console.error(error);

            alert(
                "Failed to delete"
            );
        }
    }

    function resetForm() {

        setEditingId(null);

        setFieldName("");

        setLinkedStatusIds([]);

        setLinkedJobType("");

        setFieldType("text");

        setDropdownOptions("");

        setDropdownReason("");

        setDropdownReasonList([]);

        setRequired(false);

        setReadingType("none");

        setShowModal(false);
    }

    const filtered =
        useMemo(() => {

            return reasonFields.filter(
                (item) =>

                    item.name
                        ?.toLowerCase()
                        .includes(
                            search.toLowerCase()
                        )
            );

        }, [reasonFields, search]);

    return (

        <div className="min-h-screen bg-[#f4f7fb] p-6">

            <div className="w-full">

                {/* HEADER */}
                <div className="mb-8 flex items-center justify-between">

                    <div>

                        <button
                            onClick={() =>
                                router.back()
                            }
                            className="
                mb-4
                flex
                items-center
                gap-2
                rounded-xl
                border
                border-gray-300
                bg-white
                px-4
                py-2
                text-sm
                font-bold
                text-gray-700
                hover:bg-gray-100
              "
                        >

                            <ArrowLeft size={16} />

                            Back

                        </button>

                        <div
                            className="
                mb-2
                text-xs
                font-black
                uppercase
                tracking-[0.3em]
                text-gray-400
              "
                        >
                            Admin / Reasons
                        </div>

                        <h1
                            className="
                text-5xl
                font-black
                text-gray-900
              "
                        >
                            Status Reason Fields
                        </h1>

                        <p className="mt-3 text-gray-500">

                            Create required fields
                            linked to statuses
                            and job types.

                        </p>

                    </div>

                    <button
                        onClick={() =>
                            setShowModal(true)
                        }
                        className="
              flex
              items-center
              gap-2
              rounded-2xl
              bg-blue-600
              px-6
              py-4
              font-black
              text-white
              hover:bg-blue-700
            "
                    >

                        <Plus size={18} />

                        Add Field

                    </button>

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
                        placeholder="Search fields..."
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

                {/* TABLE */}
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
                    bg-gray-50
                    text-left
                    text-xs
                    uppercase
                    tracking-wider
                    text-gray-500
                  "
                                >

                                    <th className="px-6 py-4">
                                        Field
                                    </th>

                                    <th className="px-6 py-4">
                                        Status
                                    </th>

                                    <th className="px-6 py-4">
                                        Job Type
                                    </th>

                                    <th className="px-6 py-4">
                                        Type
                                    </th>

                                    <th className="px-6 py-4">
                                        Required
                                    </th>

                                    <th className="px-6 py-4">
                                        Actions
                                    </th>

                                </tr>

                            </thead>

                            <tbody>

                                {filtered.map(
                                    (item) => (

                                        <tr
                                            key={item.id}
                                            className="
                        border-t
                        border-gray-100
                        hover:bg-gray-50
                      "
                                        >

                                            <td className="px-6 py-4 font-bold">
                                                {item.name}
                                            </td>

                                            <td className="px-6 py-4">
                                                {(item.linkedStatusNames?.length
                                                    ? item.linkedStatusNames
                                                    : [item.linkedStatus]).filter(Boolean).join(", ")}
                                            </td>

                                            <td className="px-6 py-4">
                                                {item.linkedJobType || "-"}
                                            </td>

                                            <td className="px-6 py-4">
                                                {item.fieldType}
                                            </td>

                                            <td className="px-6 py-4">

                                                {item.required
                                                    ? "Required"
                                                    : "Optional"}

                                            </td>

                                            <td className="px-6 py-4">

                                                <div className="flex gap-2">

                                                    <button
                                                        onClick={() => {

                                                            setEditingId(
                                                                item.id
                                                            );

                                                            setFieldName(
                                                                item.name
                                                            );

                                                            setLinkedStatusIds(
                                                                item.linkedStatusIds?.length
                                                                    ? item.linkedStatusIds
                                                                    : statuses.filter((status: any) => status.name === item.linkedStatus || status.id === item.linkedStatus).map((status: any) => status.id)
                                                            );

                                                            setLinkedJobType(
                                                                item.linkedJobType
                                                            );

                                                            setFieldType(
                                                                item.fieldType
                                                            );

                                                            setDropdownReasonList(
                                                                item.dropdownOptions || []
                                                            );

                                                            setRequired(
                                                                item.required
                                                            );

                                                            setReadingType(item.readingType || "none");

                                                            setShowModal(true);

                                                        }}
                                                        className="
                              rounded-xl
                              bg-blue-50
                              p-3
                              text-blue-600
                            "
                                                    >

                                                        <Pencil size={16} />

                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            removeField(
                                                                item.id
                                                            )
                                                        }
                                                        className="
                              rounded-xl
                              bg-red-50
                              p-3
                              text-red-600
                            "
                                                    >

                                                        <Trash2 size={16} />

                                                    </button>

                                                </div>

                                            </td>

                                        </tr>

                                    )
                                )}

                            </tbody>

                        </table>

                    </div>

                </div>

            </div>

            {/* MODAL */}
            {showModal && (

                <div
                    className="
            fixed
            inset-0
            z-[99999]
            flex
            items-start
            justify-center
            overflow-y-auto
            bg-black/40
            p-3
            sm:p-6
          "
                >

                    <div
                        className="
              w-full
              max-w-2xl
              max-h-[calc(100vh-1.5rem)]
              overflow-y-auto
              rounded-3xl
              bg-white
              p-5
              sm:max-h-[calc(100vh-3rem)]
              sm:p-8
              shadow-2xl
            "
                    >

                        <div className="mb-8">

                            <h2
                                className="
                  text-3xl
                  font-black
                  text-gray-900
                "
                            >

                                {editingId
                                    ? "Edit Reason Field"
                                    : "Create Reason Field"}

                            </h2>

                        </div>

                        {/* FIELD NAME */}
                        <div className="mb-6">

                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Field Name
                            </label>

                            <input
                                value={fieldName}
                                onChange={(e) =>
                                    setFieldName(
                                        e.target.value
                                    )
                                }
                                placeholder="Reason for On Hold?"
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

                        {/* STATUS */}
                        <div className="mb-6">

                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Linked Statuses
                            </label>

                            <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl border-2 border-gray-200 p-3">
                                {[
                                    ...statuses,
                                    ...(statuses.some((status: any) => String(status.name || "").replace(/[^a-z0-9]/gi, "").toLowerCase() === "reopened")
                                        ? []
                                        : [{ id: BUILT_IN_REOPENED_STATUS_ID, name: "Re-opened" }]),
                                ].map((status) => <label key={status.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-blue-50">
                                    <input
                                        type="checkbox"
                                        checked={linkedStatusIds.includes(status.id)}
                                        onChange={(event) => setLinkedStatusIds((current) => event.target.checked
                                            ? Array.from(new Set([...current, status.id]))
                                            : current.filter((statusId) => statusId !== status.id))}
                                        className="size-4"
                                    />
                                    <span className="font-semibold">{status.name}</span>
                                </label>)}
                            </div>
                            <p className="mt-2 text-xs text-gray-500">Select one or more statuses.</p>

                        </div>

                        {/* JOB TYPE */}
                        <div className="mb-6">

                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Linked Job Type
                            </label>

                            <select
                                value={linkedJobType}
                                onChange={(e) =>
                                    setLinkedJobType(
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
                "
                            >

                                <option value="">
                                    All Job Types
                                </option>

                                {jobTypes.map(
                                    (job) => (

                                        <option
                                            key={job.id}
                                            value={job.name}
                                        >
                                            {job.name}
                                        </option>

                                    )
                                )}

                            </select>

                        </div>

                        {/* FIELD TYPE */}
                        <div className="mb-6">
                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Preset Reading
                            </label>
                            <select
                                value={readingType}
                                onChange={(event) => {
                                    const value = event.target.value as "none" | "startKm" | "endKm";
                                    setReadingType(value);
                                    if (value !== "none") setFieldType("text");
                                }}
                                className="h-14 w-full rounded-2xl border-2 border-gray-200 px-5"
                            >
                                <option value="none">Normal reason field</option>
                                <option value="startKm">Start KM Reading</option>
                                <option value="endKm">End KM Reading</option>
                            </select>
                            <p className="mt-1 text-xs text-gray-500">
                                KM presets are captured as numeric readings and used by status completion and travel calculations.
                            </p>
                        </div>

                        {/* FIELD TYPE */}
                        <div className="mb-6">

                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Field Type
                            </label>

                            <select
                                value={fieldType}
                                disabled={readingType !== "none"}
                                onChange={(e) =>
                                    setFieldType(
                                        e.target.value as any
                                    )
                                }
                                className="
                  h-14
                  w-full
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                "
                            >

                                <option value="text">
                                    Text Input
                                </option>

                                <option value="dropdown">
                                    Dropdown
                                </option>

                            </select>

                        </div>

                        {/* DROPDOWN OPTIONS */}
                        {fieldType === "dropdown" && (

                            <div className="mb-6">

                                <div className="mb-3 flex items-center justify-between">

                                    <label className="block text-sm font-bold text-gray-700">
                                        Dropdown Reasons
                                    </label>

                                    <div
                                        className="
          rounded-full
          bg-blue-50
          px-3
          py-1
          text-xs
          font-black
          text-blue-700
        "
                                    >
                                        {dropdownReasonList.length}/30
                                    </div>

                                </div>

                                <div className="flex gap-3">

                                    <input
                                        value={dropdownReason}
                                        onChange={(e) =>
                                            setDropdownReason(
                                                e.target.value
                                            )
                                        }
                                        placeholder="Add reason..."
                                        className="
          h-14
          flex-1
          rounded-2xl
          border-2
          border-gray-200
          px-5
          outline-none
          focus:border-blue-500
        "
                                    />

                                    <button
                                        type="button"
                                        onClick={() => {

                                            if (
                                                !dropdownReason.trim()
                                            ) {

                                                return;
                                            }

                                            if (
                                                dropdownReasonList.length >= 30
                                            ) {

                                                alert(
                                                    "Maximum 30 reasons allowed"
                                                );

                                                return;
                                            }

                                            const exists =
                                                dropdownReasonList.some(
                                                    (x) =>
                                                        x.toLowerCase() ===
                                                        dropdownReason
                                                            .trim()
                                                            .toLowerCase()
                                                );

                                            if (exists) {

                                                alert(
                                                    "Reason already exists"
                                                );

                                                return;
                                            }

                                            setDropdownReasonList([
                                                ...dropdownReasonList,
                                                dropdownReason.trim(),
                                            ]);

                                            setDropdownReason("");

                                        }}
                                        className="
          rounded-2xl
          bg-blue-600
          px-6
          py-3
          font-black
          text-white
          hover:bg-blue-700
        "
                                    >
                                        Add
                                    </button>

                                </div>

                                {/* REASONS LIST */}
                                <div className="mt-5 space-y-3">

                                    {dropdownReasonList.map(
                                        (reason, index) => (

                                            <div
                                                key={index}
                                                className="
                    flex
                    items-center
                    justify-between
                    rounded-2xl
                    border
                    border-gray-200
                    bg-gray-50
                    px-5
                    py-4
                "
                                            >

                                                <div
                                                    className="
                        text-sm
                        font-bold
                        text-gray-800
                    "
                                                >
                                                    {reason}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => {

                                                        setDropdownReasonList(
                                                            dropdownReasonList.filter(
                                                                (_, i) =>
                                                                    i !== index
                                                            )
                                                        );

                                                    }}
                                                    className="
                        rounded-xl
                        bg-red-50
                        px-3
                        py-2
                        text-xs
                        font-black
                        text-red-600
                        hover:bg-red-100
                    "
                                                >
                                                    Delete
                                                </button>

                                            </div>

                                        )
                                    )}

                                </div>

                            </div>

                        )}

                        {/* REQUIRED */}
                        <div className="mb-8 flex items-center gap-3">

                            <input
                                type="checkbox"
                                checked={required}
                                onChange={(e) =>
                                    setRequired(
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

                            <span className="text-sm font-semibold text-gray-700">
                                Field is Required
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
        sticky
        bottom-0
        bg-white
        pb-1
        pt-6
        z-10
    "
                        >

                            <button
                                onClick={resetForm}
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
                                onClick={saveField}
                                className="
            flex
            items-center
            gap-2
            rounded-xl
            bg-blue-600
            px-6
            py-3
            font-bold
            text-white
            hover:bg-blue-700
        "
                            >

                                <Save size={18} />

                                Save

                            </button>

                        </div>

                    </div>

                </div>

            )}

        </div>

    );

}
