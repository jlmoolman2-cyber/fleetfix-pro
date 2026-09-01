"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

import {
    Search,
    Plus,
    Tags,
    CircleDot,
    ClipboardList,
    User2,
    Wrench,
    CheckCircle2,
    AlertCircle,
    Settings2,
    Link2,
    Eye,
    Pencil,
} from "lucide-react";

export default function QuerySettingsPage() {

    type CustomQueryField = { id: string; label: string; type: "text" | "number" | "date" | "textarea"; required: boolean };
    const [customFields, setCustomFields] = useState<CustomQueryField[]>([]);
    const [savingCustomFields, setSavingCustomFields] = useState(false);

    useEffect(() => {
        getDoc(doc(clientDb, "companies", COMPANY_ID, "query_settings", "general")).then((snapshot) => {
            const fields = snapshot.data()?.customFields;
            if (Array.isArray(fields)) setCustomFields(fields.slice(0, 4));
        });
    }, []);

    async function saveCustomFields() {
        if (customFields.some((field) => !field.label.trim())) return alert("Enter a name for every custom query field.");
        setSavingCustomFields(true);
        try {
            await setDoc(doc(clientDb, "companies", COMPANY_ID, "query_settings", "general"), { customFields: customFields.map((field) => ({ ...field, label: field.label.trim() })), updatedAt: serverTimestamp() }, { merge: true });
            alert("Custom query fields saved.");
        } finally { setSavingCustomFields(false); }
    }

    const queryTypes = [
        "Breakdown",
        "Warranty",
        "Inspection",
        "Tyres",
        "Diagnostics",
    ];

    const queryStatuses = [
        "Open",
        "Pending",
        "Awaiting Customer",
        "In Progress",
        "Closed",
    ];

    return (

        <div className="min-h-screen bg-[#f4f7fb] p-8">

            {/* HEADER */}
            <div className="mb-8 flex items-center justify-between">

                <div>

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
                        Admin / Query Settings
                    </div>

                    <h1
                        className="
                            text-5xl
                            font-black
                            text-gray-900
                        "
                    >
                        Query Settings
                    </h1>

                    <p className="mt-3 text-lg text-gray-500">

                        Configure query numbering,
                        statuses, types and linked
                        customer/job integrations.

                    </p>

                </div>

                <div
                    className="!hidden
                        flex
                        items-center
                        gap-3
                        rounded-3xl
                        bg-blue-600
                        px-6
                        py-4
                        text-white
                        shadow-lg
                    "
                >

                    <Settings2 size={24} />

                    <div>

                        <div
                            className="
                                text-xs
                                font-black
                                uppercase
                                tracking-wide
                                text-blue-100
                            "
                        >
                            Linked Modules
                        </div>

                        <div className="text-lg font-black">

                            Customers • Jobs • Queries

                        </div>

                    </div>

                </div>

            </div>

            {/* LINKED MODULES */}
            <div className="!hidden">

                {[
                    {
                        title:
                            "Customers",
                        icon:
                            User2,
                    },
                    {
                        title:
                            "Jobs",
                        icon:
                            ClipboardList,
                    },
                    {
                        title:
                            "Workshop Queries",
                        icon:
                            Search,
                    },
                    {
                        title:
                            "Query Status Flow",
                        icon:
                            Wrench,
                    },
                ].map((item) => (

                    <div
                        key={item.title}
                        className="
                            rounded-3xl
                            border
                            border-gray-200
                            bg-white
                            p-6
                            shadow-sm
                            transition-all
                            hover:-translate-y-1
                            hover:shadow-lg
                        "
                    >

                        <div className="flex items-center gap-4">

                            <div
                                className="
                                    flex
                                    h-14
                                    w-14
                                    items-center
                                    justify-center
                                    rounded-2xl
                                    bg-blue-100
                                    text-blue-700
                                "
                            >

                                <item.icon size={28} />

                            </div>

                            <div>

                                <div
                                    className="
                                        text-lg
                                        font-black
                                        text-gray-900
                                    "
                                >
                                    {item.title}
                                </div>

                                <div className="text-sm text-gray-500">

                                    Linked system module

                                </div>

                            </div>

                        </div>

                    </div>

                ))}

            </div>

            {/* MAIN GRID */}
            <div className="grid grid-cols-12 gap-6">

                {/* LEFT */}
                <div className="col-span-8 space-y-6">

                    {/* FIELD SETTINGS */}
                    <div
                        className="
                            overflow-hidden
                            rounded-[32px]
                            border
                            border-gray-200
                            bg-white
                            shadow-sm
                        "
                    >

                        <div
                            className="
                                border-b
                                border-gray-200
                                px-8
                                py-6
                            "
                        >

                            <div className="flex items-center gap-4">

                                <div
                                    className="
                                        flex
                                        h-14
                                        w-14
                                        items-center
                                        justify-center
                                        rounded-2xl
                                        bg-blue-100
                                        text-blue-700
                                    "
                                >

                                    <Settings2 size={28} />

                                </div>

                                <div>

                                    <div
                                        className="
                                            text-2xl
                                            font-black
                                            text-gray-900
                                        "
                                    >
                                        Query Field Settings
                                    </div>

                                    <div className="mt-1 text-gray-500">

                                        Configure linked
                                        query fields and
                                        customer/job relations.

                                    </div>

                                </div>

                            </div>

                        </div>

                        <div className="p-8">

                            <div
                                className="
                                    overflow-hidden
                                    rounded-3xl
                                    border
                                    border-gray-200
                                "
                            >

                                <table className="w-full">

                                    <thead
                                        className="
                                            bg-gray-50
                                        "
                                    >

                                        <tr>

                                            <th
                                                className="
                                                    px-6
                                                    py-4
                                                    text-left
                                                    text-xs
                                                    font-black
                                                    uppercase
                                                    tracking-wide
                                                    text-gray-500
                                                "
                                            >
                                                Field Name
                                            </th>

                                            <th
                                                className="
                                                    px-6
                                                    py-4
                                                    text-left
                                                    text-xs
                                                    font-black
                                                    uppercase
                                                    tracking-wide
                                                    text-gray-500
                                                "
                                            >
                                                System Name
                                            </th>

                                            <th
                                                className="
                                                    px-6
                                                    py-4
                                                    text-left
                                                    text-xs
                                                    font-black
                                                    uppercase
                                                    tracking-wide
                                                    text-gray-500
                                                "
                                            >
                                                Required
                                            </th>

                                            <th
                                                className="
                                                    px-6
                                                    py-4
                                                    text-left
                                                    text-xs
                                                    font-black
                                                    uppercase
                                                    tracking-wide
                                                    text-gray-500
                                                "
                                            >
                                                Linked
                                            </th>

                                        </tr>

                                    </thead>

                                    <tbody>

                                        {[
                                            {
                                                name:
                                                    "Query Number",
                                                system:
                                                    "queryNo",
                                            },
                                            {
                                                name:
                                                    "Customer",
                                                system:
                                                    "customerId",
                                            },
                                            {
                                                name:
                                                    "Job Card",
                                                system:
                                                    "jobId",
                                            },
                                        ].map((field) => (

                                            <tr
                                                key={field.name}
                                                className="
                                                    border-t
                                                    border-gray-200
                                                "
                                            >

                                                <td className="px-6 py-5 font-bold text-gray-800">

                                                    {field.name}

                                                </td>

                                                <td className="px-6 py-5">

                                                    <span
                                                        className="
                                                            rounded-xl
                                                            bg-gray-100
                                                            px-3
                                                            py-2
                                                            text-sm
                                                            font-bold
                                                            text-gray-600
                                                        "
                                                    >

                                                        {field.system}

                                                    </span>

                                                </td>

                                                <td className="px-6 py-5">

                                                    <CheckCircle2
                                                        className="
                                                            text-green-600
                                                        "
                                                        size={20}
                                                    />

                                                </td>

                                                <td className="px-6 py-5">

                                                    <Link2
                                                        className="
                                                            text-blue-600
                                                        "
                                                        size={20}
                                                    />

                                                </td>

                                            </tr>

                                        ))}

                                    </tbody>

                                </table>

                            </div>

                            <div className="mt-6 rounded-3xl border border-gray-200 bg-gray-50 p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-black text-gray-900">Custom Query Fields</h3><p className="mt-1 text-sm text-gray-500">Add up to four additional fields and make them required if needed.</p></div>{customFields.length < 4 && <button type="button" onClick={() => setCustomFields((current) => [...current, { id: `custom_${Date.now()}`, label: "", type: "text", required: false }])} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white">+ Add Custom Field</button>}</div>
                                <div className="mt-4 space-y-3">{customFields.map((field, index) => <div key={field.id} className="grid items-center gap-3 rounded-2xl border bg-white p-4 md:grid-cols-[1fr_180px_auto_auto]"><input value={field.label} onChange={(event) => setCustomFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} placeholder={`Custom field ${index + 1} name`} className="h-11 rounded-xl border px-3 font-bold" /><select value={field.type} onChange={(event) => setCustomFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as CustomQueryField["type"] } : item))} className="h-11 rounded-xl border bg-white px-3"><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="textarea">Multiple Lines</option></select><label className="flex items-center gap-2 whitespace-nowrap text-sm font-bold"><input type="checkbox" checked={field.required} onChange={(event) => setCustomFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item))} />Required</label><button type="button" onClick={() => setCustomFields((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">Remove</button></div>)}</div>
                                {customFields.length === 0 && <p className="mt-4 rounded-2xl border border-dashed p-5 text-center text-sm font-bold text-gray-400">No custom query fields configured.</p>}
                                <div className="mt-4 flex justify-end"><button data-admin-save-target="true" type="button" disabled={savingCustomFields} onClick={() => void saveCustomFields()} className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">{savingCustomFields ? "Saving..." : "Save Custom Fields"}</button></div>
                            </div>

                        </div>

                    </div>

                    {/* TYPES & STATUS */}
                    <div className="grid grid-cols-2 gap-6">

                        {/* QUERY TYPES */}
                        <div
                            className="
                                overflow-hidden
                                rounded-[32px]
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
                                    border-gray-200
                                    px-8
                                    py-6
                                "
                            >

                                <div className="flex items-center gap-4">

                                    <div
                                        className="
                                            flex
                                            h-14
                                            w-14
                                            items-center
                                            justify-center
                                            rounded-2xl
                                            bg-blue-100
                                            text-blue-700
                                        "
                                    >

                                        <Tags size={28} />

                                    </div>

                                    <div>

                                        <div
                                            className="
                                                text-2xl
                                                font-black
                                                text-gray-900
                                            "
                                        >
                                            Query Types
                                        </div>

                                        <div className="text-gray-500">

                                            Add and manage
                                            query categories.

                                        </div>

                                    </div>

                                </div>

                                <button
                                    className="
                                        flex
                                        items-center
                                        gap-2
                                        rounded-2xl
                                        bg-blue-600
                                        px-5
                                        py-3
                                        text-sm
                                        font-black
                                        text-white
                                    "
                                >

                                    <Plus size={18} />

                                    Add Type

                                </button>

                            </div>

                            <div className="space-y-4 p-8">

                                {queryTypes.map((type) => (

                                    <div
                                        key={type}
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
                                                text-lg
                                                font-black
                                                text-gray-800
                                            "
                                        >
                                            {type}
                                        </div>

                                        <div className="flex gap-3">

                                            <button
                                                className="
                                                    rounded-xl
                                                    bg-blue-100
                                                    p-3
                                                    text-blue-700
                                                "
                                            >

                                                <Eye size={18} />

                                            </button>

                                            <button
                                                className="
                                                    rounded-xl
                                                    bg-orange-100
                                                    p-3
                                                    text-orange-700
                                                "
                                            >

                                                <Pencil size={18} />

                                            </button>

                                        </div>

                                    </div>

                                ))}

                            </div>

                        </div>

                        {/* QUERY STATUS */}
                        <div
                            className="
                                overflow-hidden
                                rounded-[32px]
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
                                    border-gray-200
                                    px-8
                                    py-6
                                "
                            >

                                <div className="flex items-center gap-4">

                                    <div
                                        className="
                                            flex
                                            h-14
                                            w-14
                                            items-center
                                            justify-center
                                            rounded-2xl
                                            bg-green-100
                                            text-green-700
                                        "
                                    >

                                        <CircleDot size={28} />

                                    </div>

                                    <div>

                                        <div
                                            className="
                                                text-2xl
                                                font-black
                                                text-gray-900
                                            "
                                        >
                                            Query Statuses
                                        </div>

                                        <div className="text-gray-500">

                                            Configure workflow
                                            statuses.

                                        </div>

                                    </div>

                                </div>

                                <button
                                    className="
                                        flex
                                        items-center
                                        gap-2
                                        rounded-2xl
                                        bg-green-600
                                        px-5
                                        py-3
                                        text-sm
                                        font-black
                                        text-white
                                    "
                                >

                                    <Plus size={18} />

                                    Add Status

                                </button>

                            </div>

                            <div className="space-y-4 p-8">

                                {queryStatuses.map((status) => (

                                    <div
                                        key={status}
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
                                                text-lg
                                                font-black
                                                text-gray-800
                                            "
                                        >
                                            {status}
                                        </div>

                                        <div className="flex gap-3">

                                            <button
                                                className="
                                                    rounded-xl
                                                    bg-blue-100
                                                    p-3
                                                    text-blue-700
                                                "
                                            >

                                                <Eye size={18} />

                                            </button>

                                            <button
                                                className="
                                                    rounded-xl
                                                    bg-orange-100
                                                    p-3
                                                    text-orange-700
                                                "
                                            >

                                                <Pencil size={18} />

                                            </button>

                                        </div>

                                    </div>

                                ))}

                            </div>

                        </div>

                    </div>

                    {/* NUMBERING */}
                    <div
                        className="
                            overflow-hidden
                            rounded-[32px]
                            border
                            border-gray-200
                            bg-white
                            shadow-sm
                        "
                    >

                        <div
                            className="
                                border-b
                                border-gray-200
                                px-8
                                py-6
                            "
                        >

                            <div className="flex items-center gap-4">

                                <div
                                    className="
                                        flex
                                        h-14
                                        w-14
                                        items-center
                                        justify-center
                                        rounded-2xl
                                        bg-purple-100
                                        text-purple-700
                                    "
                                >

                                    <ClipboardList size={28} />

                                </div>

                                <div>

                                    <div
                                        className="
                                            text-2xl
                                            font-black
                                            text-gray-900
                                        "
                                    >
                                        Query Numbering
                                    </div>

                                    <div className="mt-1 text-gray-500">

                                        Configure query
                                        numbering sequence.

                                    </div>

                                </div>

                            </div>

                        </div>

                        <div className="grid grid-cols-2 gap-6 p-8">

                            <div>

                                <label
                                    className="
                                        mb-2
                                        block
                                        text-sm
                                        font-black
                                        uppercase
                                        tracking-wide
                                        text-gray-500
                                    "
                                >
                                    Prefix
                                </label>

                                <input
                                    type="text"
                                    defaultValue="QU"
                                    className="
                                        h-14
                                        w-full
                                        rounded-2xl
                                        border
                                        border-gray-300
                                        px-5
                                        text-lg
                                        font-bold
                                    "
                                />

                            </div>

                            <div>

                                <label
                                    className="
                                        mb-2
                                        block
                                        text-sm
                                        font-black
                                        uppercase
                                        tracking-wide
                                        text-gray-500
                                    "
                                >
                                    Current Sequence
                                </label>

                                <input
                                    type="number"
                                    defaultValue={10047}
                                    className="
                                        h-14
                                        w-full
                                        rounded-2xl
                                        border
                                        border-gray-300
                                        px-5
                                        text-lg
                                        font-bold
                                    "
                                />

                            </div>

                            <div
                                className="
                                    rounded-3xl
                                    bg-blue-50
                                    p-6
                                "
                            >

                                <div
                                    className="
                                        text-xs
                                        font-black
                                        uppercase
                                        tracking-wide
                                        text-blue-500
                                    "
                                >
                                    Last Query
                                </div>

                                <div
                                    className="
                                        mt-3
                                        text-4xl
                                        font-black
                                        text-blue-700
                                    "
                                >
                                    QU10047
                                </div>

                            </div>

                            <div
                                className="
                                    rounded-3xl
                                    bg-green-50
                                    p-6
                                "
                            >

                                <div
                                    className="
                                        text-xs
                                        font-black
                                        uppercase
                                        tracking-wide
                                        text-green-500
                                    "
                                >
                                    Next Query
                                </div>

                                <div
                                    className="
                                        mt-3
                                        text-4xl
                                        font-black
                                        text-green-700
                                    "
                                >
                                    QU10048
                                </div>

                            </div>

                        </div>

                    </div>

                </div>

                {/* RIGHT */}
                <div className="col-span-4 space-y-6">

                    {/* SYSTEM STATUS */}
                    <div
                        className="!hidden
                            rounded-[32px]
                            border
                            border-gray-200
                            bg-white
                            p-8
                            shadow-sm
                        "
                    >

                        <div className="mb-6 flex items-center gap-4">

                            <div
                                className="
                                    flex
                                    h-14
                                    w-14
                                    items-center
                                    justify-center
                                    rounded-2xl
                                    bg-green-100
                                    text-green-700
                                "
                            >

                                <CheckCircle2 size={28} />

                            </div>

                            <div>

                                <div
                                    className="
                                        text-2xl
                                        font-black
                                        text-gray-900
                                    "
                                >
                                    System Status
                                </div>

                                <div className="text-gray-500">

                                    Query modules connected.

                                </div>

                            </div>

                        </div>

                        <div className="space-y-4">

                            {[
                                "Customer Linking Active",
                                "Job Linking Active",
                                "Status Workflow Enabled",
                                "Auto Numbering Enabled",
                            ].map((item) => (

                                <div
                                    key={item}
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

                                    <div className="font-bold text-gray-700">

                                        {item}

                                    </div>

                                    <CheckCircle2
                                        size={20}
                                        className="text-green-600"
                                    />

                                </div>

                            ))}

                        </div>

                    </div>

                    {/* IMPORTANT */}
                    <div
                        className="
                            rounded-[32px]
                            border
                            border-blue-200
                            bg-blue-50
                            p-8
                            shadow-sm
                        "
                    >

                        <div className="mb-5 flex items-center gap-4">

                            <AlertCircle
                                size={28}
                                className="text-blue-600"
                            />

                            <div
                                className="
                                    text-2xl
                                    font-black
                                    text-blue-900
                                "
                            >
                                Important
                            </div>

                        </div>

                        <ul
                            className="
                                space-y-4
                                text-sm
                                font-medium
                                text-blue-900
                            "
                        >

                            <li>
                                • Queries are linked to
                                customers and job cards.
                            </li>

                            <li>
                                • Statuses drive workshop
                                workflow automation.
                            </li>

                            <li>
                                • Query types affect
                                reporting and dashboards.
                            </li>

                            <li>
                                • Numbering updates apply
                                globally.
                            </li>

                        </ul>

                    </div>

                </div>

            </div>

        </div>

    );
}
