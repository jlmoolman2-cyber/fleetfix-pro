"use client";

import {
    Settings2,
    Hash,
    RefreshCcw,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

const defaultPreferences = {
    jobPrefix: "NJ",
    currentJobSequence: "00001",
    recurringPrefix: "RJB",
    currentRecurringSequence: 10000,
};

export default function JobCardPreferencesPage() {

    const [preferences, setPreferences] = useState(defaultPreferences);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => onSnapshot(
        doc(clientDb, "companies", COMPANY_ID, "jobcard_preferences", "Job"),
        (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data() as any;
                setPreferences({
                    ...defaultPreferences,
                    ...data,
                    currentJobSequence: String(data.currentJobSequence ?? defaultPreferences.currentJobSequence),
                });
            }
            setLoading(false);
        }
    ), []);

    async function savePreferences() {
        if (!preferences.jobPrefix.trim() || !preferences.recurringPrefix.trim()) {
            alert("Both numbering prefixes are required.");
            return;
        }
        if (!/^\d+$/.test(preferences.currentJobSequence) || preferences.currentRecurringSequence < 0) {
            alert("Sequence numbers cannot be negative.");
            return;
        }
        try {
            setSaving(true);
            await setDoc(doc(clientDb, "companies", COMPANY_ID, "jobcard_preferences", "Job"), {
                ...preferences,
                jobPrefix: preferences.jobPrefix.trim().toUpperCase(),
                recurringPrefix: preferences.recurringPrefix.trim().toUpperCase(),
                autoMarkMaterialsUsed: deleteField(),
                customerJobFields: deleteField(),
                updatedAt: serverTimestamp(),
            }, { merge: true });
            alert("Job Card Preferences saved.");
        } catch (error) {
            console.error(error);
            alert("Unable to save Job Card Preferences.");
        } finally {
            setSaving(false);
        }
    }

    const sequenceWidth = preferences.currentJobSequence.length;
    const nextJobSequence = String(Number(preferences.currentJobSequence) + 1).padStart(sequenceWidth, "0");
    const currentJobNumber = `${preferences.jobPrefix}${preferences.currentJobSequence}`;
    const nextJobNumber = `${preferences.jobPrefix}${nextJobSequence}`;
    const nextRecurringNumber = `${preferences.recurringPrefix}${preferences.currentRecurringSequence + 1}`;

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

                <div className="flex items-center gap-3">
                <button onClick={savePreferences} disabled={saving || loading} className="rounded-2xl bg-blue-600 px-6 py-4 font-black text-white shadow-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving…" : "Save Preferences"}</button>
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

                </div></div>

            </div>

            {/* SETTINGS GRID */}
            <div className="grid grid-cols-12 gap-6">

                {/* LEFT */}
                <div className="col-span-8 space-y-6">

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
                                        value={preferences.jobPrefix}
                                        onChange={(event) => setPreferences({ ...preferences, jobPrefix: event.target.value })}
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
                                            {currentJobNumber}
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
                                            {nextJobNumber}
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
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={preferences.currentJobSequence}
                                        onChange={(event) => {
                                            const digits = event.target.value.replace(/\D/g, "");
                                            setPreferences({ ...preferences, currentJobSequence: digits });
                                        }}
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
                                        value={preferences.recurringPrefix}
                                        onChange={(event) => setPreferences({ ...preferences, recurringPrefix: event.target.value })}
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
                                            {nextRecurringNumber}
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
                                        value={preferences.currentRecurringSequence}
                                        onChange={(event) => setPreferences({ ...preferences, currentRecurringSequence: Number(event.target.value) || 0 })}
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
