"use client";

import {
    useEffect,
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
    clientDb,
} from "@/lib/firebaseClient";

import {
    COMPANY_ID,
} from "@/lib/company";

type Category = {
    id: string;
    name: string;
    active?: boolean;
};

export default function JobFormCategoriesPage() {

    const [categories, setCategories] =
        useState<Category[]>([]);

    const [showEditor, setShowEditor] =
        useState(false);

    const [editingId, setEditingId] =
        useState<string | null>(null);

    const [name, setName] =
        useState("");

    const [active, setActive] =
        useState(true);

    const [search, setSearch] =
        useState("");

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

                        snapshot.docs.map((doc) => ({

                            id: doc.id,

                            ...(doc.data() as any),
                        }))
                    );
                }
            );

        return () => unsub();

    }, []);

    function resetEditor() {

        setEditingId(null);

        setName("");

        setActive(true);

        setShowEditor(false);
    }

    async function saveCategory() {

        if (!name.trim()) {

            return;
        }

        try {

            if (editingId) {

                await updateDoc(

                    doc(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "jobFormCategories",
                        editingId
                    ),

                    {
                        name,
                        active,
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
                        "jobFormCategories"
                    ),

                    {
                        name,
                        active,

                        createdAt:
                            serverTimestamp(),

                        updatedAt:
                            serverTimestamp(),
                    }
                );
            }

            resetEditor();

        } catch (error) {

            console.error(error);

            alert(
                "Failed to save category"
            );
        }
    }

    async function deleteCategory(
        id: string
    ) {

        const confirmed =
            confirm(
                "Delete this category?"
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
                    "jobFormCategories",
                    id
                )
            );

        } catch (error) {

            console.error(error);

            alert(
                "Failed to delete category"
            );
        }
    }

    const filteredCategories =

        [...categories]

            .sort((a, b) =>
                a.name.localeCompare(b.name)
            )

            .filter((item) =>

                item.name
                    ?.toLowerCase()
                    .includes(
                        search.toLowerCase()
                    )
            );

    return (

        <div className="min-h-screen bg-[#f5f7fb] p-6">

            <div className="mx-auto max-w-6xl">

                {/* HEADER */}
                <div className="mb-6 flex items-center justify-between">

                    <div>

                        <div className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                            Admin
                        </div>

                        <h1 className="text-4xl font-black text-gray-900">
                            Job Form Categories
                        </h1>

                        <p className="mt-2 text-sm text-gray-500">
                            Manage form categories
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
                                            "jobFormTemplates"
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

                                window.location.href =
                                    `/admin/jobforms/${docRef.id}`;

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
                        + Add Category
                    </button>

                </div>

                {/* SEARCH */}
                <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">

                    <input
                        type="text"
                        placeholder="Search categories..."
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
                                        Category
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

                                {filteredCategories.map((item) => (

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
                                                className={`
                                                    rounded-full
                                                    px-3
                                                    py-1
                                                    text-xs
                                                    font-bold
                                                    ${item.active
                                                        ? "bg-green-100 text-green-700"
                                                        : "bg-gray-200 text-gray-700"
                                                    }
                                                `}
                                            >
                                                {item.active
                                                    ? "ACTIVE"
                                                    : "DISABLED"}
                                            </span>

                                        </td>

                                        <td className="px-6 py-4">

                                            <div className="flex gap-2">

                                                <button
                                                    onClick={() => {

                                                        setEditingId(
                                                            item.id
                                                        );

                                                        setName(
                                                            item.name
                                                        );

                                                        setActive(
                                                            item.active ??
                                                            true
                                                        );

                                                        setShowEditor(true);
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
                                                        deleteCategory(
                                                            item.id
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

            {/* SLIDE OVER */}
            {showEditor && (

                <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto bg-[#f5f7fb] shadow-2xl">

                    {/* HEADER */}
                    <div className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-5">

                        <div>

                            <h2 className="text-2xl font-black text-gray-900">

                                {editingId
                                    ? "Edit Category"
                                    : "New Category"}

                            </h2>

                            <p className="text-sm text-gray-500">
                                Configure category details
                            </p>

                        </div>

                        <button
                            onClick={resetEditor}
                            className="
                                rounded-xl
                                p-2
                                hover:bg-gray-100
                            "
                        >
                            ✕
                        </button>

                    </div>

                    {/* CONTENT */}
                    <div className="p-6 space-y-6">

                        <div>

                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Category Name
                            </label>

                            <input
                                type="text"
                                value={name}
                                onChange={(e) =>
                                    setName(
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

                        <div className="flex items-center gap-3">

                            <input
                                type="checkbox"
                                checked={active}
                                onChange={(e) =>
                                    setActive(
                                        e.target.checked
                                    )
                                }
                                className="h-5 w-5"
                            />

                            <span className="text-sm font-medium text-gray-700">
                                Active
                            </span>

                        </div>

                        <div className="flex justify-end gap-4 border-t border-gray-200 pt-6">

                            <button
                                onClick={resetEditor}
                                className="
                                    rounded-xl
                                    border
                                    border-gray-300
                                    px-5
                                    py-3
                                    text-sm
                                    font-semibold
                                    text-gray-700
                                    hover:bg-gray-100
                                "
                            >
                                Cancel
                            </button>

                            <button
                                onClick={saveCategory}
                                className="
                                    rounded-xl
                                    bg-blue-600
                                    px-5
                                    py-3
                                    text-sm
                                    font-semibold
                                    text-white
                                    hover:bg-blue-700
                                "
                            >
                                Save Category
                            </button>

                        </div>

                    </div>

                </div>

            )}

        </div>
    );
}