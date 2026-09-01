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
import { MESSAGE_TEMPLATE_MODULES, MESSAGE_TEMPLATE_TAGS } from "@/lib/messageTemplateModules";

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

    const [tagPickerTarget, setTagPickerTarget] =
        useState<"subject" | "email" | null>(null);

    const [tagSearch, setTagSearch] =
        useState("");

    // Keep the editor stable during Next.js hot-module updates when a newly
    // added named export can briefly be undefined in the browser cache.
    const replacementTags = Array.isArray(MESSAGE_TEMPLATE_TAGS)
        ? MESSAGE_TEMPLATE_TAGS
        : ["{{link}}", "{{customerName}}", "{{jobNumber}}", "{{notes}}"];

    const templateModules = Array.isArray(MESSAGE_TEMPLATE_MODULES)
        ? MESSAGE_TEMPLATE_MODULES
        : ["General", "JobCard", "Customer", "Query", "Quote", "Invoice", "Purchase Order"];

    const visibleReplacementTags = replacementTags.filter((tag) => {
        const search = tagSearch.trim().toLowerCase();
        return !search || tag.toLowerCase().includes(search) || replacementTagLabel(tag).toLowerCase().includes(search);
    });

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
            "email"
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
                    updatedAt: serverTimestamp(),
                }
            );

            alert("Template saved");

            function insertTag(
                tag: string,
                target:
                    "subject" |
                    "email"
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
                            Module
                        </label>

                        <select
                            value={module}
                            onChange={(event) => setModule(event.target.value)}
                            className="h-14 w-full rounded-xl border border-gray-300 bg-white px-4 outline-none focus:border-blue-500"
                        >
                            {!templateModules.includes(module as never) && module && (
                                <option value={module}>{module}</option>
                            )}
                            {templateModules.map((item) => (
                                <option key={item} value={item}>{item}</option>
                            ))}
                        </select>

                    </div>

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
                    <button type="button" onClick={() => { setTagPickerTarget("subject"); setTagSearch(""); }} className="mt-3 rounded-xl bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-200">+ Insert Link</button>

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

                    <button type="button" onClick={() => { setTagPickerTarget("email"); setTagSearch(""); }} className="mt-3 rounded-xl bg-green-100 px-4 py-2 text-sm font-bold text-green-700 hover:bg-green-200">+ Insert Link</button>

                </div>

            </div>

            {tagPickerTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                        <div className="border-b p-6">
                            <div className="flex items-center justify-between gap-4"><div><h2 className="text-2xl font-black text-gray-950">Select Template Link</h2><p className="mt-1 text-sm text-gray-500">Select a field to insert into the {tagPickerTarget === "subject" ? "subject" : "email body"}.</p></div><button type="button" onClick={() => setTagPickerTarget(null)} className="rounded-xl border px-4 py-2 font-bold">Close</button></div>
                            <input autoFocus value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} placeholder="Search links..." className="mt-4 h-12 w-full rounded-xl border border-gray-300 px-4" />
                        </div>
                        <div className="overflow-y-auto p-3">
                            {visibleReplacementTags.map((tag) => (
                                <button key={tag} type="button" onClick={() => { insertTag(tag, tagPickerTarget); setTagPickerTarget(null); }} className="grid w-full grid-cols-[1fr_auto] items-center gap-5 rounded-xl px-4 py-3 text-left hover:bg-blue-50">
                                    <span className="font-bold text-gray-900">{replacementTagLabel(tag)}</span>
                                    <code className="rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-bold text-blue-700">{tag}</code>
                                </button>
                            ))}
                            {visibleReplacementTags.length === 0 && <p className="p-8 text-center font-bold text-gray-400">No matching links.</p>}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

function replacementTagLabel(tag: string) {
    const value = tag.replace(/^\{\{|\}\}$/g, "");
    const words = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
    return words.replace(/\b\w/g, (character) => character.toUpperCase());
}
