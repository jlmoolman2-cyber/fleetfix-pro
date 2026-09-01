"use client";

import {
    Receipt,
    FileText,
    Hash,
    Clock3,
    CheckCircle2,
    AlertCircle,
    Settings2,
    ClipboardList,
    User2,
    Wallet,
    CreditCard,
} from "lucide-react";

export default function InvoiceSettingsPage() {

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
                        Admin / Invoice Settings
                    </div>

                    <h1
                        className="
                            text-5xl
                            font-black
                            text-gray-900
                        "
                    >
                        Invoice Settings
                    </h1>

                    <p className="mt-3 text-lg text-gray-500">

                        Configure invoice numbering,
                        payment periods, notes and
                        linked workshop integrations.

                    </p>

                </div>

                <button
                    className="
                        rounded-3xl
                        bg-blue-600
                        px-8
                        py-5
                        text-lg
                        font-black
                        text-white
                        shadow-lg
                        transition-all
                        hover:bg-blue-700
                    "
                >
                    Save Settings
                </button>

            </div>

            {/* LINKED MODULES */}
            <div className="mb-8 grid grid-cols-4 gap-5">

                {[
                    {
                        title:
                            "Customers",
                        icon:
                            User2,
                    },
                    {
                        title:
                            "Workshop Jobs",
                        icon:
                            ClipboardList,
                    },
                    {
                        title:
                            "Invoices",
                        icon:
                            Receipt,
                    },
                    {
                        title:
                            "Payments",
                        icon:
                            CreditCard,
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

                    {/* GENERAL SETTINGS */}
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
                                        General Invoice Settings
                                    </div>

                                    <div className="mt-1 text-gray-500">

                                        Configure invoice due
                                        periods, notes and
                                        payment rules.

                                    </div>

                                </div>

                            </div>

                        </div>

                        <div className="grid grid-cols-2 gap-6 p-8">

                            {/* DUE PERIOD */}
                            <div>

                                <label
                                    className="
                                        mb-2
                                        flex
                                        items-center
                                        gap-2
                                        text-sm
                                        font-black
                                        uppercase
                                        tracking-wide
                                        text-gray-500
                                    "
                                >

                                    <Clock3 size={16} />

                                    Invoice Due Period

                                </label>

                                <input
                                    type="number"
                                    defaultValue={0}
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

                            {/* PAYMENT TERMS */}
                            <div>

                                <label
                                    className="
                                        mb-2
                                        flex
                                        items-center
                                        gap-2
                                        text-sm
                                        font-black
                                        uppercase
                                        tracking-wide
                                        text-gray-500
                                    "
                                >

                                    <Wallet size={16} />

                                    Payment Terms

                                </label>

                                <select
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
                                >

                                    <option>
                                        Due On Receipt
                                    </option>

                                    <option>
                                        7 Days
                                    </option>

                                    <option>
                                        30 Days
                                    </option>

                                </select>

                            </div>

                            {/* NOTE */}
                            <div className="col-span-2">

                                <label
                                    className="
                                        mb-2
                                        flex
                                        items-center
                                        gap-2
                                        text-sm
                                        font-black
                                        uppercase
                                        tracking-wide
                                        text-gray-500
                                    "
                                >

                                    <FileText size={16} />

                                    Invoice Note

                                </label>

                                <textarea
                                    rows={5}
                                    placeholder="
Thank you for your business.
Payment terms apply as agreed.
                                    "
                                    className="
                                        w-full
                                        rounded-3xl
                                        border
                                        border-gray-300
                                        p-5
                                        text-base
                                    "
                                />

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
                                        Invoice Numbering
                                    </div>

                                    <div className="mt-1 text-gray-500">

                                        Configure invoice
                                        numbering sequence.

                                    </div>

                                </div>

                            </div>

                        </div>

                        <div className="grid grid-cols-2 gap-6 p-8">

                            {/* PREFIX */}
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
                                    Invoice Prefix
                                </label>

                                <input
                                    type="text"
                                    defaultValue="IN"
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

                            {/* SEQUENCE */}
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
                                    defaultValue={10407}
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

                            {/* LAST */}
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
                                    Last Invoice
                                </div>

                                <div
                                    className="
                                        mt-3
                                        text-4xl
                                        font-black
                                        text-blue-700
                                    "
                                >
                                    IN10407
                                </div>

                            </div>

                            {/* NEXT */}
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
                                    Next Invoice
                                </div>

                                <div
                                    className="
                                        mt-3
                                        text-4xl
                                        font-black
                                        text-green-700
                                    "
                                >
                                    IN10408
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

                                    Invoice systems connected.

                                </div>

                            </div>

                        </div>

                        <div className="space-y-4">

                            {[
                                "Customer Linking Active",
                                "Invoice Numbering Enabled",
                                "Payment Tracking Enabled",
                                "Workshop Integration Active",
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
                                • Invoices are linked to
                                customers and jobs.
                            </li>

                            <li>
                                • Invoice numbering applies
                                globally.
                            </li>

                            <li>
                                • Payment terms affect all
                                generated invoices.
                            </li>

                            <li>
                                • Workshop integrations update
                                in real-time.
                            </li>

                        </ul>

                    </div>

                </div>

            </div>

        </div>

    );
}