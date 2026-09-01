"use client";

import {
    Settings2,
    Hash,
    FileText,
    ClipboardList,
    Wrench,
    RefreshCcw,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";

export default function JobCardPreferencesPage() {

    return (

        <div className="min-h-screen bg-[#f4f7fb] p-8">

            {/* PAGE HEADER */}
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
                        Admin / Preferences
                    </div>

                    <h1
                        className="
                            text-5xl
                            font-black
                            text-gray-900
                        "
                    >
                        Job Card Preferences
                    </h1>

                    <p className="mt-3 text-lg text-gray-500">

                        Configure numbering, templates,
                        forms and workshop behavior.

                    </p>

                </div>

                <div
                    className="
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

                            Templates • Forms • Jobs

                        </div>

                    </div>

                </div>

            </div>

            {/* LINKED MODULES */}
            <div className="mb-8 grid grid-cols-4 gap-5">

                {[
                    {
                        title:
                            "Job Cards",
                        icon:
                            ClipboardList,
                    },
                    {
                        title:
                            "Job Templates",
                        icon:
                            FileText,
                    },
                    {
                        title:
                            "Workshop Forms",
                        icon:
                            Wrench,
                    },
                    {
                        title:
                            "Recurring Jobs",
                        icon:
                            RefreshCcw,
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

                                    Linked to preferences

                                </div>

                            </div>

                        </div>

                    </div>

                ))}

            </div>

            {/* SETTINGS GRID */}
            <div className="grid grid-cols-12 gap-6">

                {/* LEFT */}
                <div className="col-span-8 space-y-6">

                    {/* GENERAL */}
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
                                        General Preferences
                                    </div>

                                    <div className="mt-1 text-gray-500">

                                        Configure workshop
                                        job card behavior.

                                    </div>

                                </div>

                            </div>

                        </div>

                        <div className="space-y-6 p-8">

                            <label
                                className="
                                    flex
                                    items-center
                                    gap-4
                                    rounded-2xl
                                    border
                                    border-gray-200
                                    bg-gray-50
                                    p-5
                                "
                            >

                                <input
                                    type="checkbox"
                                    defaultChecked
                                    className="h-6 w-6"
                                />

                                <div>

                                    <div
                                        className="
                                            text-lg
                                            font-black
                                            text-gray-900
                                        "
                                    >
                                        Automatically mark
                                        materials as used
                                    </div>

                                    <div className="text-sm text-gray-500">

                                        When technicians close
                                        a job card manually.

                                    </div>

                                </div>

                            </label>

                        </div>

                    </div>

                    {/* NUMBERING */}
                    <div className="grid grid-cols-2 gap-6">

                        {/* JOB CARD */}
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

                                        <Hash size={28} />

                                    </div>

                                    <div>

                                        <div
                                            className="
                                                text-2xl
                                                font-black
                                                text-gray-900
                                            "
                                        >
                                            Job Card Sequence
                                        </div>

                                        <div className="mt-1 text-gray-500">

                                            Configure numbering
                                            settings.

                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="space-y-6 p-8">

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
                                        defaultValue="NJ"
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

                                <div className="grid grid-cols-2 gap-4">

                                    <div
                                        className="
                                            rounded-2xl
                                            bg-blue-50
                                            p-5
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
                                            Last Job
                                        </div>

                                        <div
                                            className="
                                                mt-2
                                                text-3xl
                                                font-black
                                                text-blue-700
                                            "
                                        >
                                            NJ2516141
                                        </div>

                                    </div>

                                    <div
                                        className="
                                            rounded-2xl
                                            bg-green-50
                                            p-5
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
                                            Next Job
                                        </div>

                                        <div
                                            className="
                                                mt-2
                                                text-3xl
                                                font-black
                                                text-green-700
                                            "
                                        >
                                            NJ2516142
                                        </div>

                                    </div>

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
                                        defaultValue={16141}
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

                            </div>

                        </div>

                        {/* RECURRING */}
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

                                        <RefreshCcw size={28} />

                                    </div>

                                    <div>

                                        <div
                                            className="
                                                text-2xl
                                                font-black
                                                text-gray-900
                                            "
                                        >
                                            Recurring Jobs
                                        </div>

                                        <div className="mt-1 text-gray-500">

                                            Configure recurring
                                            job numbering.

                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="space-y-6 p-8">

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
                                        defaultValue="RJB"
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

                                <div className="grid grid-cols-2 gap-4">

                                    <div
                                        className="
                                            rounded-2xl
                                            bg-orange-50
                                            p-5
                                        "
                                    >

                                        <div
                                            className="
                                                text-xs
                                                font-black
                                                uppercase
                                                tracking-wide
                                                text-orange-500
                                            "
                                        >
                                            Last Record
                                        </div>

                                        <div
                                            className="
                                                mt-2
                                                text-3xl
                                                font-black
                                                text-orange-700
                                            "
                                        >
                                            None Yet
                                        </div>

                                    </div>

                                    <div
                                        className="
                                            rounded-2xl
                                            bg-blue-50
                                            p-5
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
                                            Next Record
                                        </div>

                                        <div
                                            className="
                                                mt-2
                                                text-3xl
                                                font-black
                                                text-blue-700
                                            "
                                        >
                                            RJB10001
                                        </div>

                                    </div>

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
                                        defaultValue={10000}
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

                            </div>

                        </div>

                    </div>

                </div>

                {/* RIGHT */}
                <div className="col-span-4 space-y-6">

                    {/* STATUS */}
                    <div
                        className="
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

                                    Preferences connected.

                                </div>

                            </div>

                        </div>

                        <div className="space-y-4">

                            {[
                                "Job Cards Linked",
                                "Templates Linked",
                                "Forms Linked",
                                "Recurring Jobs Active",
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

                    {/* WARNING */}
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
                                • Prefix changes affect
                                job cards and templates.
                            </li>

                            <li>
                                • Sequence updates apply
                                across all workshop forms.
                            </li>

                            <li>
                                • Templates inherit these
                                preferences automatically.
                            </li>

                            <li>
                                • Linked forms update in
                                real-time.
                            </li>

                        </ul>

                    </div>

                </div>

            </div>

        </div>

    );
}