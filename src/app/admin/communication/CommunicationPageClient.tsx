"use client";

import {
    useEffect,
    useState,
} from "react";

import {
    Plus,
    Trash2,
    X,
    Pencil,
} from "lucide-react";

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    updateDoc,
    onSnapshot,
    serverTimestamp,
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
};

type JobStatus = {

    id: string;

    name: string;
};

export default function ActionCommunicationPage() {

    const [ruleType, setRuleType] =
        useState(
            "Job Status Change"
        );

    const [communicationName, setCommunicationName] =
        useState("");

    const [templates, setTemplates] =
        useState<any[]>([]);

    const [communications, setCommunications] =
        useState<any[]>([]);

    const [editingId, setEditingId] =
        useState<string | null>(null);

    const [showEditor, setShowEditor] =
        useState(false);

    useEffect(() => {

        const unsub =
            onSnapshot(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "communications"
                ),

                (snapshot) => {

                    setCommunications(

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

    const [messages, setMessages] =
        useState<{
            notificationType: string;

            templateIds: string[];

            sendEmail: boolean;

            attachJobCard: boolean;

            attachCustomerJobCard: boolean;
        }[]>([
            {
                notificationType:
                    "Assigned Employees",

                templateIds: [],

                sendEmail: true,

                attachJobCard: false,

                attachCustomerJobCard: false,
            },
        ]);

    const [saving, setSaving] =
        useState(false);

    const [jobTypes, setJobTypes] =
        useState<JobType[]>([]);

    const [statuses, setStatuses] =
        useState<JobStatus[]>([]);

    const [selectedStatuses, setSelectedStatuses] =
        useState<string[]>([]);

    const [allJobTypes, setAllJobTypes] =
        useState(true);

    const [selectedJobTypes, setSelectedJobTypes] =
        useState<string[]>([]);

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

                        snapshot.docs
                            .map((doc) => ({

                                id: doc.id,

                                ...(doc.data() as any),

                            }))
                            .sort((a, b) =>
                                a.name.localeCompare(
                                    b.name
                                )
                            )
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
                    "messageTemplates"
                ),

                (snapshot) => {

                    setTemplates(

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

        const unsub =
            onSnapshot(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "statuses"
                ),

                (snapshot) => {

                    setStatuses(

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

    async function deleteCommunication(
        id: string
    ) {

        const confirmed =
            confirm(
                "Delete communication?"
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
                    "communications",
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
    async function saveCommunication() {

        const invalid =
            messages.some(
                (m) =>
                    m.templateIds.length === 0
            );

        if (invalid) {

            alert(
                "All messages require templates"
            );

            return;
        }
        if (!communicationName.trim()) {

            alert(
                "Please enter communication name"
            );

            return;
        }
        if (
            selectedStatuses.length === 0
        ) {

            alert(
                "Please select at least 1 status"
            );

            return;
        }
        try {

            setSaving(true);

            if (editingId) {

                await updateDoc(

                    doc(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "communications",
                        editingId
                    ),

                    {

                        name:
                            communicationName,

                        ruleType,

                        allJobTypes,

                        selectedJobTypes,

                        messages,

                        triggerStatuses:
                            selectedStatuses,

                        triggerStatusIds:
                            statuses
                                .filter((status) =>
                                    selectedStatuses.includes(status.name)
                                )
                                .map((status) => status.id),

                        updatedAt:
                            serverTimestamp(),
                    }
                );

            } else {

                await addDoc(

                    collection(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "communications"
                    ),

                    {

                        name:
                            communicationName,

                        ruleType,

                        active: true,

                        allJobTypes,

                        selectedJobTypes,

                        triggerStatuses:
                            selectedStatuses,

                        triggerStatusIds:
                            statuses
                                .filter((status) =>
                                    selectedStatuses.includes(status.name)
                                )
                                .map((status) => status.id),

                        reminder: {

                            enabled:
                                ruleType ===
                                "Job Reminder",

                            value: 1,

                            unit: "Hours",
                        },

                        messages,

                        createdAt:
                            serverTimestamp(),

                        updatedAt:
                            serverTimestamp(),

                        createdBy:
                            "admin@fleetfix.co.za",
                    }
                );

            }

            alert(
                "Communication saved"
            );
            setShowEditor(false);

            setCommunicationName("");

            setEditingId(null);

            setSelectedJobTypes([]);

            setSelectedStatuses([]);

            setMessages([
                {
                    notificationType:
                        "Assigned Employees",

                    templateIds: [],

                    sendEmail: true,

                    attachJobCard: false,

                    attachCustomerJobCard: false,
                },
            ]);

        } catch (error) {

            console.error(error);

            alert(
                "Failed to save communication"
            );

        } finally {

            setSaving(false);
        }
    }
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
                        onClick={() =>
                            window.history.back()
                        }
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
                {/* COMMUNICATION LIST */}
                <div
                    className="
        mb-6
        overflow-hidden
        rounded-3xl
        border
        border-gray-200
        bg-white
        shadow-sm
    "
                >

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

                            <h2
                                className="
                    text-xl
                    font-black
                    text-gray-900
                "
                            >
                                Communication Automations
                            </h2>

                            <p className="mt-1 text-sm text-gray-500">
                                Manage automated workflows
                            </p>

                        </div>

                        <button
                            onClick={() => {
                                setShowEditor(true);

                                setEditingId(null);

                                setCommunicationName("");

                                setRuleType(
                                    "Job Status Change"
                                );

                                setAllJobTypes(true);

                                setSelectedJobTypes([]);

                                setSelectedStatuses([]);

                                setMessages([
                                    {
                                        notificationType:
                                            "Assigned Employees",

                                        templateIds: [],

                                        sendEmail: true,

                                        attachJobCard: false,

                                        attachCustomerJobCard: false,
                                    },
                                ]);
                            }}
                            className="
                rounded-2xl
                bg-blue-600
                px-5
                py-3
                text-sm
                font-bold
                text-white
                hover:bg-blue-700
            "
                        >
                            + Add Communication
                        </button>

                    </div>

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

                                    <th className="px-6 py-4">
                                        Name
                                    </th>

                                    <th className="px-6 py-4">
                                        Rule Type
                                    </th>

                                    <th className="px-6 py-4">
                                        Job Types
                                    </th>

                                    <th className="px-6 py-4">
                                        Statuses
                                    </th>

                                    <th className="px-6 py-4">
                                        Messages
                                    </th>

                                    <th className="px-6 py-4">
                                        Active
                                    </th>

                                    <th className="px-6 py-4">
                                        Actions
                                    </th>

                                </tr>

                            </thead>

                            <tbody>

                                {communications.length === 0 ? (

                                    <tr>

                                        <td
                                            colSpan={7}
                                            className="
                px-6
                py-16
                text-center
                text-sm
                text-gray-500
            "
                                        >
                                            No communication automations created
                                        </td>

                                    </tr>

                                ) : communications.map((item) => (

                                    <tr
                                        key={item.id}
                                        className="
                        border-b
                        border-gray-100
                        hover:bg-gray-50
                    "
                                    >

                                        <td className="px-6 py-4 font-bold">
                                            {item.name}
                                        </td>

                                        <td className="px-6 py-4">

                                            <span
                                                className="
                                rounded-full
                                bg-blue-100
                                px-3
                                py-1
                                text-xs
                                font-bold
                                text-blue-700
                            "
                                            >
                                                {item.ruleType}
                                            </span>

                                        </td>

                                        <td className="px-6 py-4 text-sm">

                                            {item.allJobTypes
                                                ? "All Job Types"
                                                : item.selectedJobTypes?.length || 0}

                                        </td>

                                        <td className="px-6 py-4 text-sm">

                                            {item.triggerStatuses?.join(", ") || "-"}

                                        </td>

                                        <td className="px-6 py-4 text-sm">

                                            {item.messages?.length || 0}
                                            {" "}Messages

                                        </td>

                                        <td className="px-6 py-4">

                                            <button
                                                type="button"
                                                onClick={async () => {

                                                    try {

                                                        await updateDoc(

                                                            doc(
                                                                clientDb,
                                                                "companies",
                                                                COMPANY_ID,
                                                                "communications",
                                                                item.id
                                                            ),

                                                            {
                                                                active:
                                                                    item.active === false
                                                                        ? true
                                                                        : false,
                                                            }
                                                        );

                                                    } catch (error) {

                                                        console.error(error);

                                                        alert(
                                                            "Failed to update status"
                                                        );

                                                    }

                                                }}
                                                className={`
            rounded-xl
            px-4
            py-2
            text-xs
            font-black
            ${item.active === false
                                                        ? "bg-gray-200 text-gray-700"
                                                        : "bg-green-600 text-white"
                                                    }
        `}
                                            >
                                                {item.active === false
                                                    ? "INACTIVE"
                                                    : "ACTIVE"}
                                            </button>

                                        </td>

                                        <td className="px-6 py-4">

                                            <div className="flex gap-2">

                                                <button
                                                    onClick={() => {

                                                        setShowEditor(true);

                                                        setEditingId(
                                                            item.id
                                                        );

                                                        setCommunicationName(
                                                            item.name
                                                        );

                                                        setRuleType(
                                                            item.ruleType
                                                        );

                                                        setAllJobTypes(
                                                            item.allJobTypes
                                                        );

                                                        setSelectedJobTypes(
                                                            item.selectedJobTypes || []
                                                        );

                                                        setMessages(
                                                            item.messages || []
                                                        );

                                                        setSelectedStatuses(
                                                            item.triggerStatuses || []
                                                        );
                                                    }}
                                                    className="
                                    rounded-xl
                                    border
                                    border-gray-300
                                    px-3
                                    py-2
                                    text-sm
                                    font-bold
                                    hover:bg-gray-100
                                "
                                                >
                                                    Edit
                                                </button>

                                                <button
                                                    onClick={() =>
                                                        deleteCommunication(
                                                            item.id
                                                        )
                                                    }
                                                    className="
                                    rounded-xl
                                    bg-red-100
                                    px-3
                                    py-2
                                    text-sm
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

                    </div>

                    {/* CONTENT */}
                    {showEditor && (

                        <div
                            className="
            fixed
            inset-y-0
            right-0
            z-50
            w-full
            max-w-6xl
            overflow-y-auto
            bg-[#f5f7fb]
            shadow-2xl
        "
                        >

                            {/* PANEL HEADER */}
                            <div
                                className="
                sticky
                top-0
                z-20
                flex
                items-center
                justify-between
                border-b
                border-gray-200
                bg-white
                px-6
                py-5
            "
                            >

                                <div>

                                    <h2
                                        className="
                        text-2xl
                        font-black
                        text-gray-900
                    "
                                    >
                                        {editingId
                                            ? "Edit Communication"
                                            : "New Communication"}
                                    </h2>

                                    <p className="text-sm text-gray-500">
                                        Configure workflow automation
                                    </p>

                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={saveCommunication}
                                        disabled={saving}
                                        className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {saving
                                            ? "Saving..."
                                            : editingId
                                                ? "Update"
                                                : "Save"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowEditor(false)
                                        }
                                        aria-label="Close communication editor"
                                        className="
                        rounded-xl
                        p-2
                        hover:bg-gray-100
                    "
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                            </div>

                            <div className="p-6">

                                <div className="grid gap-6 lg:grid-cols-2">

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
                                                        value={communicationName}
                                                        onChange={(e) =>
                                                            setCommunicationName(
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
                                                        <option>Job Status Change</option>

                                                        <option>Job Reminder</option>
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

                                                    {ruleType === "Job Reminder"
                                                        ? "Message is sent after a specified time (minutes / hours / days) from when the selected job status was changed."
                                                        : "Message is sent immediately when the selected job status is changed."
                                                    }

                                                </p>

                                            </div>

                                        </div>
                                        <div className="space-y-5">


                                            {/* JOB TYPES */}
                                            <div>

                                                <label className="mb-2 block text-sm font-semibold text-gray-700">
                                                    Job Types
                                                </label>

                                                {/* ALL JOB TYPES */}
                                                <label className="mb-3 flex items-center gap-3">

                                                    <input
                                                        type="checkbox"
                                                        checked={allJobTypes}
                                                        onChange={() =>
                                                            setAllJobTypes(
                                                                !allJobTypes
                                                            )
                                                        }
                                                    />

                                                    <span className="text-sm font-medium">
                                                        All Job Types
                                                    </span>

                                                </label>

                                                {/* MULTI SELECT */}
                                                {!allJobTypes && (

                                                    <div
                                                        className="
                max-h-64
                space-y-2
                overflow-y-auto
                rounded-2xl
                border
                border-gray-300
                p-4
            "
                                                    >

                                                        {jobTypes.map((type) => (

                                                            <label
                                                                key={type.id}
                                                                className="flex items-center gap-3"
                                                            >

                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedJobTypes.includes(
                                                                        type.name
                                                                    )}
                                                                    onChange={(e) => {

                                                                        if (e.target.checked) {

                                                                            setSelectedJobTypes([
                                                                                ...selectedJobTypes,
                                                                                type.name,
                                                                            ]);

                                                                        } else {

                                                                            setSelectedJobTypes(

                                                                                selectedJobTypes.filter(
                                                                                    (t) =>
                                                                                        t !== type.name
                                                                                )
                                                                            );
                                                                        }
                                                                    }}
                                                                />

                                                                <span className="text-sm">
                                                                    {type.name}
                                                                </span>

                                                            </label>

                                                        ))}

                                                    </div>

                                                )}

                                            </div>
                                            {/* STATUS */}
                                            <div>

                                                <label className="mb-2 block text-sm font-semibold text-gray-700">
                                                    Job Status
                                                </label>

                                                <div
                                                    className="
        rounded-2xl
        border
        border-gray-300
        p-3
    "
                                                >

                                                    <select
                                                        value=""
                                                        onChange={(e) => {

                                                            if (
                                                                e.target.value &&
                                                                !selectedStatuses.includes(
                                                                    e.target.value
                                                                )
                                                            ) {

                                                                setSelectedStatuses([
                                                                    ...selectedStatuses,
                                                                    e.target.value,
                                                                ]);
                                                            }
                                                        }}
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

                                                        <option value="">
                                                            Select Job Status
                                                        </option>

                                                        {statuses.map((status) => (

                                                            <option
                                                                key={status.id}
                                                                value={status.name}
                                                            >
                                                                {status.name}
                                                            </option>

                                                        ))}

                                                    </select>

                                                    <div className="mt-3 flex flex-wrap gap-2">

                                                        {selectedStatuses.map((status) => (

                                                            <div
                                                                key={status}
                                                                className="
                    flex
                    items-center
                    gap-2
                    rounded-xl
                    bg-red-100
                    px-3
                    py-2
                    text-sm
                    font-medium
                    text-red-700
                "
                                                            >

                                                                {status}

                                                                <button
                                                                    type="button"
                                                                    onClick={() => {

                                                                        setSelectedStatuses(

                                                                            selectedStatuses.filter(
                                                                                (s) =>
                                                                                    s !== status
                                                                            )
                                                                        );
                                                                    }}
                                                                    className="
                        rounded-full
                        p-1
                        hover:bg-red-200
                    "
                                                                >
                                                                    <X size={14} />
                                                                </button>

                                                            </div>

                                                        ))}

                                                    </div>

                                                </div>

                                            </div>

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
                                                            Trigger reminder after a selected status and time
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

                                                {messages.map((message, index) => (

                                                    <div
                                                        key={index}
                                                        className="
                rounded-3xl
                border
                border-gray-200
                p-5
                space-y-5
            "
                                                    >

                                                        <div className="flex items-center justify-between">

                                                            <h3 className="text-sm font-black text-gray-800">
                                                                Message #{index + 1}
                                                            </h3>

                                                            {messages.length > 1 && (

                                                                <button
                                                                    type="button"
                                                                    onClick={() => {

                                                                        setMessages(

                                                                            messages.filter(
                                                                                (_, i) =>
                                                                                    i !== index
                                                                            )
                                                                        );

                                                                    }}
                                                                    className="
                rounded-xl
                bg-red-50
                p-2
                text-red-600
                hover:bg-red-100
            "
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>

                                                            )}

                                                        </div>

                                                        {/* NOTIFICATION TYPE */}
                                                        <div>

                                                            <label className="mb-2 block text-sm font-semibold text-gray-700">
                                                                Notification Type
                                                            </label>

                                                            <select
                                                                value={message.notificationType}
                                                                onChange={(e) => {

                                                                    const updated =
                                                                        [...messages];

                                                                    updated[index]
                                                                        .notificationType =
                                                                        e.target.value;

                                                                    setMessages(updated);
                                                                }}
                                                                className="
                        w-full
                        rounded-2xl
                        border
                        border-gray-300
                        px-4
                        py-3
                    "
                                                            >

                                                                <option>
                                                                    Assigned Employees
                                                                </option>

                                                                <option>
                                                                    Customer Contacts
                                                                </option>

                                                                <option>
                                                                    Supplier Contacts
                                                                </option>

                                                            </select>

                                                        </div>

                                                        {/* TEMPLATE MULTI SELECT */}
                                                        <div>

                                                            <label className="mb-2 block text-sm font-semibold text-gray-700">
                                                                Message Templates
                                                            </label>

                                                            <select
                                                                value=""
                                                                onChange={(e) => {

                                                                    if (
                                                                        e.target.value &&
                                                                        !message.templateIds.includes(
                                                                            e.target.value
                                                                        )
                                                                    ) {

                                                                        const updated =
                                                                            [...messages];

                                                                        updated[index]
                                                                            .templateIds.push(
                                                                                e.target.value
                                                                            );

                                                                        setMessages(updated);
                                                                    }
                                                                }}
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

                                                                <option value="">
                                                                    Select Message Template
                                                                </option>

                                                                {templates.map((template) => (

                                                                    <option
                                                                        key={template.id}
                                                                        value={template.id}
                                                                    >
                                                                        {template.name}
                                                                    </option>

                                                                ))}

                                                            </select>
                                                        </div>

                                                        <div className="mt-3 flex flex-wrap gap-2">

                                                            {message.templateIds.map((template) => (

                                                                <div
                                                                    key={template}
                                                                    className="
                flex
                items-center
                gap-2
                rounded-xl
                bg-blue-100
                px-3
                py-2
                text-sm
                font-medium
                text-blue-700
            "
                                                                >

                                                                    {templates.find((item) => item.id === template)?.name || template}

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {

                                                                            const updated =
                                                                                [...messages];

                                                                            updated[index]
                                                                                .templateIds =
                                                                                updated[index]
                                                                                    .templateIds
                                                                                    .filter(
                                                                                        (t) =>
                                                                                            t !== template
                                                                                    );

                                                                            setMessages(updated);
                                                                        }}
                                                                        className="
        rounded-full
        p-1
        hover:bg-blue-200
    "
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>

                                                            ))}

                                                        </div>

                                                        {/* OPTIONS */}
                                                        <div className="grid gap-3 md:grid-cols-3">

                                                            {[
                                                                {
                                                                    key: "sendEmail",
                                                                    label: "Send Email",
                                                                },

                                                                {
                                                                    key: "attachJobCard",
                                                                    label: "Attach Job Card",
                                                                },

                                                                {
                                                                    key: "attachCustomerJobCard",
                                                                    label: "Attach Customer Job Card",
                                                                },
                                                            ].map((item) => (

                                                                <label
                                                                    key={item.key}
                                                                    className="
                            flex
                            items-center
                            gap-3
                            rounded-2xl
                            border
                            border-gray-200
                            p-3
                            text-sm
                        "
                                                                >

                                                                    <input
                                                                        type="checkbox"
                                                                        checked={
                                                                            message[
                                                                            item.key as keyof typeof message
                                                                            ] as boolean
                                                                        }
                                                                        onChange={(e) => {

                                                                            const updated =
                                                                                [...messages];

                                                                            updated[index] = {

                                                                                ...updated[index],

                                                                                [item.key]:
                                                                                    e.target.checked,
                                                                            };

                                                                            setMessages(updated);
                                                                        }}
                                                                    />

                                                                    {item.label}

                                                                </label>

                                                            ))}

                                                        </div>

                                                    </div>

                                                ))}

                                                {/* ADD MESSAGE */}
                                                <button
                                                    onClick={() => {

                                                        setMessages([
                                                            ...messages,

                                                            {
                                                                notificationType:
                                                                    "Assigned Employees",

                                                                templateIds: [],

                                                                sendEmail: true,

                                                                attachJobCard: false,

                                                                attachCustomerJobCard: false,
                                                            },
                                                        ]);
                                                    }}
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
                                                    Add Message
                                                </button>

                                            </div>

                                        </div>
                                        {/* FOOTER */}
                                        <div
                                            className="
        flex
        items-center
        justify-start
        gap-3
        border-t
        border-gray-100
        px-6
        py-5
    "
                                        >

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowEditor(false)
                                                }
                                                className="rounded-2xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                                            >
                                                Cancel
                                            </button>

                                            <button
                                                type="button"
                                                onClick={saveCommunication}
                                                disabled={saving}
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
                                                {saving
                                                    ? "Saving..."
                                                    : editingId
                                                        ? "Update"
                                                        : "Save"}
                                            </button>

                                        </div>

                                    </div>

                                </div>

                            </div>

                        </div>

                    )
                    }
                </div>

            </div>

        </div>

    )

}
