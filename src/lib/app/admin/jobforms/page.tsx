"use client";

import {
    useEffect,
    useState,
} from "react";

import Link from "next/link";
import {
    useRouter,
} from "next/navigation";

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
    clientDb,
} from "@/lib/firebaseClient";

import {
    COMPANY_ID,
} from "@/lib/company";


type JobFormTemplate = {

    id: string;

    name: string;

    category: string;

    active: boolean;

    fields?: Record<string, any>[];
    linkType:
    "Customer" |
    "Job Card";

    autoAttachToJob?: boolean;

    linkedJobTypes?: string[];
};

export default function JobFormsPage() {

    const [forms, setForms] =
        useState<JobFormTemplate[]>([]);

    const [search, setSearch] =
        useState("");


    const [categories, setCategories] =
        useState<any[]>([]);

    const router =
        useRouter();

    useEffect(() => {

        const unsub =
            onSnapshot(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobFormCategories"
                ),

                (snapshot) => {

                    setCategories(

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
                    "jobforms"
                ),

                (snapshot) => {

                    setForms(

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

    async function deleteForm(
        id: string
    ) {

        const confirmed =
            confirm(
                "Delete this form template?"
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
                    "jobforms",
                    id
                )
            );

        } catch (error) {

            console.error(error);

            alert(
                "Failed to delete form"
            );
        }
    }

    async function duplicateForm(
        form: JobFormTemplate
    ) {

        try {

            await addDoc(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobforms"
                ),

                {

                    name:
                        `${form.name} Copy`,

                    category:
                        form.category,

                    active:
                        form.active,

                    linkType:
                        form.linkType,

                    autoAttachToJob:
                        form.autoAttachToJob,

                    linkedJobTypes:
                        form.linkedJobTypes || [],

                    fields:
                        form.fields || [],

                    createdAt:
                        serverTimestamp(),

                    updatedAt:
                        serverTimestamp(),
                }
            );

        } catch (error) {

            console.error(error);

            alert(
                "Failed to duplicate form"
            );
        }
    }

    const filteredForms =

        [...forms]

            .sort((a, b) =>
                a.name.localeCompare(b.name)
            )

            .filter((form) =>

                form.name
                    ?.toLowerCase()
                    .includes(
                        search.toLowerCase()
                    )
            );

    return (

        <div className="min-h-screen bg-[#f5f7fb] p-6">

            <div className="mx-auto max-w-[1800px]">

                {/* HEADER */}
                <div className="mb-6 flex items-center justify-between">

                    <div>

                        <div className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                            Admin
                        </div>

                        <h1 className="text-4xl font-black text-gray-900">
                            Job Form Templates
                        </h1>

                        <p className="mt-2 text-sm text-gray-500">
                            Create and manage dynamic job forms
                        </p>

                    </div>

                    <button
                        onClick={async () => {

                            try {

                                const docRef =
                                    await addDoc(

                                        collection(
                                            clientDb,
                                            "companies",
                                            COMPANY_ID,
                                            "jobforms"
                                        ),

                                        {

                                            name:
                                                "New Form Template",

                                            category:
                                                categories[0]?.name || "",

                                            active: true,

                                            linkType:
                                                "Job Card",

                                            autoAttachToJob:
                                                true,

                                            linkedJobTypes: [],

                                            fields: [],

                                            createdAt:
                                                serverTimestamp(),

                                            updatedAt:
                                                serverTimestamp(),
                                        }
                                    );

                                router.push(
                                    `/admin/jobforms/${docRef.id}`
                                );

                            } catch (error) {

                                console.error(error);

                                alert(
                                    "Failed to create form"
                                );
                            }
                        }}
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
                        + New Form Builder
                    </button>

                </div>

                {/* SEARCH */}
                <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">

                    <input
                        type="text"
                        placeholder="Search Forms..."
                        value={search}
                        onChange={(e) =>
                            setSearch(
                                e.target.value
                            )
                        }
                        className="
              h-12
              w-full
              rounded-2xl
              border
              border-gray-300
              px-4
              text-sm
              outline-none
              focus:border-blue-500
            "
                    />

                </div>

                {/* TABLE */}
                <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">

                    <div className="overflow-x-auto">

                        <table className="w-full">

                            <thead>

                                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">

                                    <th className="px-6 py-4">
                                        Form Name
                                    </th>

                                    <th className="px-6 py-4">
                                        Category
                                    </th>

                                    <th className="px-6 py-4">
                                        Fields
                                    </th>

                                    <th className="px-6 py-4">
                                        Status
                                    </th>

                                    <th className="px-6 py-4">
                                        Actions
                                    </th>

                                </tr>

                            </thead>

                            <tbody>

                                {filteredForms.map((form) => (

                                    <tr
                                        key={form.id}
                                        className="
                      border-b
                      border-gray-100
                      hover:bg-gray-50
                    "
                                    >

                                        <td className="px-6 py-3 font-bold">

                                            <Link
                                                href={`/admin/jobforms/${form.id}`}
                                                className="hover:text-blue-600"
                                            >
                                                {form.name}
                                            </Link>

                                        </td>

                                        <td className="px-6 py-3 text-sm">
                                            {form.category}
                                        </td>

                                        <td className="px-6 py-3 text-sm">
                                            {form.fields?.length || 0}
                                        </td>

                                        <td className="px-6 py-3">

                                            <span
                                                className={`
                          rounded-full
                          px-3
                          py-1
                          text-xs
                          font-bold
                          ${form.active
                                                        ? "bg-green-100 text-green-700"
                                                        : "bg-gray-200 text-gray-700"
                                                    }
                        `}
                                            >
                                                {form.active
                                                    ? "ACTIVE"
                                                    : "DISABLED"}
                                            </span>

                                        </td>

                                        <td className="px-6 py-3">

                                            <div className="flex gap-2">

                                                <button
                                                    onClick={() => {

                                                        window.location.href =
                                                            `/admin/jobforms/${form.id}`;
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
                                                    onClick={() =>
                                                        duplicateForm(form)
                                                    }
                                                    className="
                            rounded-lg
                            border
                            border-gray-300
                            bg-gray-100
                            px-3
                            py-1.5
                            text-xs
                            font-bold
                            text-gray-700
                            hover:bg-gray-200
                          "
                                                >
                                                    Duplicate
                                                </button>

                                                <button
                                                    onClick={() =>
                                                        deleteForm(
                                                            form.id
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

                    </div>

                </div>

            </div>


        </div>

    )
}
