"use client";

import {
    useEffect,
    useState,
} from "react";

import {
    doc,
    getDoc,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";

import {
    Save,
} from "lucide-react";

import {
    clientDb,
} from "@/lib/firebaseClient";

import {
    COMPANY_ID,
} from "@/lib/company";

import {
    useParams,
} from "next/navigation";

export default function EditTemplatePage() {

    const params =
        useParams();

    const id =
        params.id as string;

    const [loading, setLoading] =
        useState(true);

    const [saving, setSaving] =
        useState(false);

    const [templateName, setTemplateName] =
        useState("");

    const [module, setModule] =
        useState("");

    const [subject, setSubject] =
        useState("");

    const [htmlBody, setHtmlBody] =
        useState("");

    const [smsText, setSmsText] =
        useState("");

    const replacementTags = [

        // CUSTOMER
        "{{customerName}}",
        "{{customerEmail}}",
        "{{customerPhone}}",

        // JOB
        "{{jobNumber}}",
        "{{jobStatus}}",
        "{{jobType}}",
        "{{jobDate}}",
        "{{jobTime}}",
        "{{jobDescription}}",

        // VEHICLE
        "{{vehicleReg}}",
        "{{fleetNo}}",
        "{{vehicleMake}}",
        "{{vehicleModel}}",
        "{{vehicleVin}}",
        "{{vehicleMileage}}",

        // DRIVER
        "{{driverName}}",
        "{{driverContact}}",
        "{{driverContactNumber}}",

        // TECHNICIAN
        "{{technicianName}}",
        "{{technicianPhone}}",
        "{{employeeName}}",

        // LOCATION
        "{{branchName}}",
        "{{branchPhone}}",
        "{{branchEmail}}",
        "{{breakdownLocation}}",
        "{{googleMapsLink}}",

        // QUOTE / INVOICE
        "{{quoteNumber}}",
        "{{quoteAmount}}",
        "{{invoiceNumber}}",
        "{{invoiceAmount}}",

        // ETA
        "{{eta}}",
        "{{arrivalTime}}",

        // COMPANY
        "{{companyName}}",
        "{{companyPhone}}",
        "{{companyEmail}}",

        // CUSTOM
        "{{notes}}",
    ];

    useEffect(() => {

        async function loadTemplate() {

            try {

                const snapshot =
                    await getDoc(
                        doc(
                            clientDb,
                            "companies",
                            COMPANY_ID,
                            "messageTemplates",
                            id
                        )
                    );

                if (!snapshot.exists()) {

                    alert("Template not found");

                    return;
                }

                const data =
                    snapshot.data();

                setTemplateName(data.name || "");

                setModule(data.module || "");

                setSubject(data.subject || "");

                setHtmlBody(data.htmlBody || "");

                setSmsText(data.smsText || "");

            } catch (error) {

                console.error(error);

            } finally {

                setLoading(false);
            }
        }

        loadTemplate();

    }, [id]);

    function insertTag(
        tag: string,
        target:
            "subject" |
            "email" |
            "sms"
    ) {

        if (target === "subject") {

            setSubject(
                (prev) =>
                    `${prev}${tag}`
            );
        }

        if (target === "email") {

            setHtmlBody(
                (prev) =>
                    `${prev}${tag}`
            );
        }

        if (target === "sms") {

            setSmsText(
                (prev) =>
                    `${prev}${tag}`
            );
        }
    }
    async function saveTemplate() {

        try {

            setSaving(true);

            await updateDoc(

                doc(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "messageTemplates",
                    id
                ),

                {
                    name: templateName,
                    module,
                    subject,
                    htmlBody,
                    smsText,
                    updatedAt: serverTimestamp(),
                }
            );

            alert("Template saved");

            function insertTag(
                tag: string,
                target:
                    "subject" |
                    "email" |
                    "sms"
            ) {

                if (target === "subject") {

                    setSubject(
                        (prev) =>
                            `${prev}${tag}`
                    );
                }

                if (target === "email") {

                    setHtmlBody(
                        (prev) =>
                            `${prev}${tag}`
                    );
                }

                if (target === "sms") {

                    setSmsText(
                        (prev) =>
                            `${prev}${tag}`
                    );
                }
            }

        } catch (error) {

            console.error(error);

            alert("Failed to save template");

        } finally {

            setSaving(false);
        }
    }

    if (loading) {

        return (
            <div className="p-10">
                Loading...
            </div>
        );
    }

    return (

        <div className="min-h-screen bg-[#f5f7fb] p-6">

            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">

                <div className="mb-8 flex items-start justify-between">

                    <div>

                        <h1 className="text-4xl font-black text-blue-700">
                            Edit Template
                        </h1>

                        <p className="mt-2 text-gray-500">
                            Module: {module}
                        </p>

                    </div>

                    <div className="flex gap-3">

                        <button
                            onClick={() =>
                                window.history.back()
                            }
                            className="rounded-xl border border-blue-600 px-8 py-3 font-bold text-blue-700"
                        >
                            Cancel
                        </button>

                        <button
                            onClick={saveTemplate}
                            disabled={saving}
                            className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3 font-bold text-white hover:bg-blue-700"
                        >
                            <Save size={16} />

                            {saving
                                ? "Saving..."
                                : "Save"}

                        </button>

                    </div>

                </div>

                <div className="space-y-6">

                    <div>

                        <label className="mb-2 block text-sm font-bold text-gray-700">
                            Template Name
                        </label>

                        <input
                            value={templateName}
                            onChange={(e) =>
                                setTemplateName(e.target.value)
                            }
                            className="h-14 w-full rounded-xl border border-gray-300 px-4 outline-none focus:border-blue-500"
                        />

                    </div>

                    <div>

                        <label className="mb-2 block text-sm font-bold text-gray-700">
                            Subject / Title
                        </label>

                        <input
                            value={subject}
                            onChange={(e) =>
                                setSubject(e.target.value)
                            }
                            className="h-14 w-full rounded-xl border border-gray-300 px-4 outline-none focus:border-blue-500"
                        />

                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">

                        {replacementTags.map((tag) => (

                            <button
                                key={tag}
                                type="button"
                                onClick={() =>
                                    insertTag(
                                        tag,
                                        "subject"
                                    )
                                }
                                className="
                rounded-xl
                bg-blue-100
                px-3
                py-2
                text-xs
                font-semibold
                text-blue-700
                hover:bg-blue-200
            "
                            >
                                {tag}
                            </button>

                        ))}

                    </div>

                    <div>

                        <label className="mb-2 block text-sm font-bold text-gray-700">
                            Email Body
                        </label>

                        <textarea
                            value={htmlBody}
                            onChange={(e) =>
                                setHtmlBody(e.target.value)
                            }
                            rows={12}
                            className="w-full rounded-xl border border-gray-300 p-4 outline-none focus:border-blue-500"
                        />

                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">

                        {replacementTags.map((tag) => (

                            <button
                                key={tag}
                                type="button"
                                onClick={() =>
                                    insertTag(
                                        tag,
                                        "email"
                                    )
                                }
                                className="
                rounded-xl
                bg-green-100
                px-3
                py-2
                text-xs
                font-semibold
                text-green-700
                hover:bg-green-200
            "
                            >
                                {tag}
                            </button>

                        ))}

                    </div>

                    <div>

                        <label className="mb-2 block text-sm font-bold text-gray-700">
                            SMS Text
                        </label>

                        <textarea
                            value={smsText}
                            onChange={(e) =>
                                setSmsText(e.target.value)
                            }
                            rows={5}
                            className="w-full rounded-xl border border-gray-300 p-4 outline-none focus:border-blue-500"
                        />

                        <p className="mt-2 text-xs text-gray-400">
                            Characters: {smsText.length}
                        </p>

                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">

                        {replacementTags.map((tag) => (

                            <button
                                key={tag}
                                type="button"
                                onClick={() =>
                                    insertTag(
                                        tag,
                                        "sms"
                                    )
                                }
                                className="
                rounded-xl
                bg-orange-100
                px-3
                py-2
                text-xs
                font-semibold
                text-orange-700
                hover:bg-orange-200
            "
                            >
                                {tag}
                            </button>

                        ))}

                    </div>

                </div>

            </div>

        </div>
    );
}
