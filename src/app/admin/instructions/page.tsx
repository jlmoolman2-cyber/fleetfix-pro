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

type InstructionField = {
    id: string;

    fieldName: string;

    dropdownOptions: string[];

    fieldType?: "text" | "dropdown";

    required: boolean;

    active: boolean;

    statusId?: string;

    createdAt?: any;
};

export default function InstructionsPage() {

    const router =
        useRouter();

    const [
        instructionFields,
        setInstructionFields,
    ] = useState<
        InstructionField[]
    >([]);

    const [search, setSearch] =
        useState("");

    const [showModal, setShowModal] =
        useState(false);

    const [editingId, setEditingId] =
        useState<string | null>(null);

    const [
        fieldName,
        setFieldName,
    ] = useState("");

    const [
        dropdownValue,
        setDropdownValue,
    ] = useState("");

    const [
        dropdownList,
        setDropdownList,
    ] = useState<string[]>([]);

    const [required, setRequired] =
        useState(true);

    const [fieldType, setFieldType] = useState<"text" | "dropdown">("dropdown");

    const [statuses, setStatuses] = useState<any[]>([]);
    const [statusId, setStatusId] = useState("");

    useEffect(() => {

        const unsub =
            onSnapshot(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "instructionFields"
                ),

                (snapshot) => {

                    setInstructionFields(

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

    useEffect(() => onSnapshot(
        collection(clientDb, "companies", COMPANY_ID, "statuses"),
        (snapshot) => setStatuses(snapshot.docs
            .map((statusDoc) => ({ id: statusDoc.id, ...statusDoc.data() } as any))
            .filter((status) => status.active !== false)
            .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0)))
    ), []);

    async function saveField() {

        if (!statusId) {
            alert("Select the status for this note");
            return;
        }

        if (
            !fieldName.trim()
        ) {

            alert(
                "Field name required"
            );

            return;
        }

        if (fieldType === "dropdown" && dropdownList.length === 0) {

            alert(
                "Add at least 1 dropdown option"
            );

            return;
        }

        try {

            const payload = {

                fieldName:
                    fieldName.trim(),

                dropdownOptions:
                    fieldType === "dropdown" ? dropdownList : [],

                fieldType,

                required,

                statusId,

                active: true,

                updatedAt:
                    serverTimestamp(),
            };

            if (editingId) {

                await updateDoc(

                    doc(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "instructionFields",
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
                        "instructionFields"
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
                "Failed to save"
            );
        }
    }

    async function removeField(
        id: string
    ) {

        const confirmed =
            confirm(
                "Delete this instruction?"
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
                    "instructionFields",
                    id
                )
            );

        } catch (error) {

            console.error(error);

            alert(
                "Delete failed"
            );
        }
    }

    function resetForm() {

        setEditingId(null);

        setFieldName("");

        setDropdownValue("");

        setDropdownList([]);

        setRequired(true);

        setFieldType("dropdown");

        setStatusId("");

        setShowModal(false);
    }

    const filtered =
        useMemo(() => {

            return instructionFields.filter(
                (item) =>

                    item.fieldName
                        ?.toLowerCase()
                        .includes(
                            search.toLowerCase()
                        )
            );

        }, [
            instructionFields,
            search,
        ]);

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
                            Admin / Status Notes
                        </div>

                        <h1
                            className="
                text-5xl
                font-black
                text-gray-900
              "
                        >
                            Status Notes
                        </h1>

                        <p className="mt-3 text-gray-500">

                            Create selectable notes and link them to a job status.

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

                        Add Status Note

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
                        placeholder="Search status notes..."
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
                                        Field Name
                                    </th>

                                    <th className="px-6 py-4">
                                        Field Type
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
                                                {item.fieldName}
                                            </td>

                                            <td className="px-6 py-4">
                                                {(item.fieldType || "dropdown") === "dropdown"
                                                    ? `Dropdown (${item.dropdownOptions?.length || 0})`
                                                    : "Text Field"}
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
                                                                item.fieldName
                                                            );

                                                            setDropdownList(
                                                                item.dropdownOptions || []
                                                            );

                                                            setFieldType(item.fieldType || "dropdown");

                                                            setRequired(
                                                                item.required
                                                            );

                                                            setStatusId(item.statusId || "");

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

                        <div className="mb-8">

                            <h2
                                className="
                  text-3xl
                  font-black
                  text-gray-900
                "
                            >

                                {editingId
                                    ? "Edit Status Note"
                                    : "Create Status Note"}

                            </h2>

                        </div>

                        <div className="mb-6">
                            <label className="mb-2 block text-sm font-bold text-gray-700">Linked Status *</label>
                            <select value={statusId} onChange={(event) => setStatusId(event.target.value)} className="h-14 w-full rounded-2xl border-2 border-gray-200 px-5 outline-none focus:border-blue-500">
                                <option value="">Select status</option>
                                {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                            </select>
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
                                placeholder="Parts Ordered"
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

                        <div className="mb-6">
                            <label className="mb-2 block text-sm font-bold text-gray-700">Field Type *</label>
                            <select
                                value={fieldType}
                                onChange={(event) => setFieldType(event.target.value as "text" | "dropdown")}
                                className="h-14 w-full rounded-2xl border-2 border-gray-200 px-5 outline-none focus:border-blue-500"
                            >
                                <option value="dropdown">Dropdown</option>
                                <option value="text">Text Field</option>
                            </select>
                        </div>

                        {/* ADD OPTION */}
                        {fieldType === "dropdown" && <div className="mb-6">

                            <div className="mb-3 flex items-center justify-between">

                                <label className="block text-sm font-bold text-gray-700">
                                    Dropdown Options
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
                                    {dropdownList.length}/30
                                </div>

                            </div>

                            <div className="flex gap-3">

                                <input
                                    value={dropdownValue}
                                    onChange={(e) =>
                                        setDropdownValue(
                                            e.target.value
                                        )
                                    }
                                    placeholder="Collect from Midas Musina"
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
                                            !dropdownValue.trim()
                                        ) {

                                            return;
                                        }

                                        if (
                                            dropdownList.length >= 30
                                        ) {

                                            alert(
                                                "Maximum 30 options allowed"
                                            );

                                            return;
                                        }

                                        const exists =
                                            dropdownList.some(
                                                (x) =>
                                                    x.toLowerCase() ===
                                                    dropdownValue
                                                        .trim()
                                                        .toLowerCase()
                                            );

                                        if (exists) {

                                            alert(
                                                "Option already exists"
                                            );

                                            return;
                                        }

                                        setDropdownList([
                                            ...dropdownList,
                                            dropdownValue.trim(),
                                        ]);

                                        setDropdownValue("");

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

                        </div>}

                        {/* OPTIONS LIST */}
                        {fieldType === "dropdown" && <div className="mb-8 space-y-3">

                            {dropdownList.map(
                                (option, index) => (

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

                                        <div className="font-bold text-gray-800">
                                            {option}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => {

                                                setDropdownList(
                                                    dropdownList.filter(
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

                        </div>}

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
                pt-6
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
