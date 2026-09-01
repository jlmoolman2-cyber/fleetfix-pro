"use client";

import {
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    Plus,
    Search,
    Pencil,
    Trash2,
    X,
    GripVertical,
} from "lucide-react";

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";
import { formatDateTime24 } from "@/lib/dateTime";

import {
    clientDb,
} from "@/lib/firebaseClient";

import {
    COMPANY_ID,
} from "@/lib/company";

type TaskItem = {
    id: string;
    description: string;
    type: string;
    options?: string[];
    addToTask?: boolean;
};

type TaskTemplate = {
    id: string;
    name: string;
    module: string;
    active: boolean;
    createdAt: string;
    createdBy: string;
    modifiedAt: string;
    modifiedBy: string;
    items: TaskItem[];
};

const fieldTypes = [

    "Text",

    "Select",

    "Multiselect",

    "Yes or No",

];

export default function JobCardTaskPage() {

    const [
        templates,
        setTemplates,
    ] = useState<TaskTemplate[]>([]);

    const [
        search,
        setSearch,
    ] = useState("");

    const [
        showModal,
        setShowModal,
    ] = useState(false);

    const [
        editingTemplate,
        setEditingTemplate,
    ] =
        useState<TaskTemplate | null>(
            null
        );

    const [
        name,
        setName,
    ] = useState("");

    const [
        module,
        setModule,
    ] = useState("Job Card");

    const [
        items,
        setItems,
    ] = useState<TaskItem[]>([]);

    useEffect(() => {

        const unsub =
            onSnapshot(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobcardtasks"
                ),

                (snapshot) => {

                    setTemplates(

                        snapshot.docs.map(
                            (doc) => ({

                                id: doc.id,

                                ...(doc.data() as any),

                            }))
                    );

                }
            );

        return () => unsub();

    }, []);

    const filtered =
        useMemo(() => {

            return templates.filter(
                (template) =>

                    template.name
                        .toLowerCase()
                        .includes(
                            search.toLowerCase()
                        )
            );

        }, [templates, search]);

    function openCreate() {

        setEditingTemplate(null);

        setName("");

        setModule("Job Card");

        setItems([]);

        setShowModal(true);
    }

    function openEdit(
        template: TaskTemplate
    ) {

        setEditingTemplate(
            template
        );

        setName(template.name);

        setModule(
            template.module
        );

        setItems(template.items);

        setShowModal(true);
    }

    function addItem() {

        setItems([

            ...items,

            {
                id: Date.now().toString(),

                description: "",

                type: "Text",

                options: [],

                addToTask: true,
            },

        ]);
    }

    function updateItem(
        id: string,
        field: string,
        value: any
    ) {

        setItems(

            items.map((item) =>

                item.id === id
                    ? {
                        ...item,
                        [field]: value,
                    }
                    : item
            )
        );
    }

    function removeItem(
        id: string
    ) {

        setItems(

            items.filter(
                (x) => x.id !== id
            )
        );
    }

    function addOption(
        itemId: string
    ) {

        setItems(

            items.map((item) => {

                if (
                    item.id !== itemId
                ) {
                    return item;
                }

                return {

                    ...item,

                    options: [
                        ...(item.options ||
                            []),

                        "",
                    ],
                };

            })
        );
    }

    function updateOption(
        itemId: string,
        index: number,
        value: string
    ) {

        setItems(

            items.map((item) => {

                if (
                    item.id !== itemId
                ) {
                    return item;
                }

                const options = [
                    ...(item.options ||
                        []),
                ];

                options[index] = value;

                return {
                    ...item,
                    options,
                };

            })
        );
    }

    function removeOption(
        itemId: string,
        index: number
    ) {

        setItems(

            items.map((item) => {

                if (
                    item.id !== itemId
                ) {
                    return item;
                }

                return {

                    ...item,

                    options:
                        item.options?.filter(
                            (_, i) =>
                                i !== index
                        ) || [],
                };

            })
        );
    }

    async function saveTemplate() {

        if (!name.trim()) {
            return;
        }

        const payload = {

            name,

            module,

            active: true,

            items,

            modifiedAt:
                formatDateTime24(new Date()),

            modifiedBy:
                "admin",

        };

        try {

            if (editingTemplate) {

                await updateDoc(

                    doc(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "jobcardtasks",
                        editingTemplate.id
                    ),

                    payload
                );

            } else {

                await addDoc(

                    collection(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "jobcardtasks"
                    ),

                    {

                        ...payload,

                        createdAt:
                            serverTimestamp(),

                        createdBy:
                            "admin",
                    }
                );

            }

            setShowModal(false);

        } catch (error) {

            console.error(error);

            alert(
                "Failed to save template"
            );

        }

    }

    return (

        <div className="min-h-screen bg-[#f5f7fb] p-6">

            <div className="w-full">

                {/* HEADER */}
                <div className="mb-6 flex items-center justify-between">

                    <div>

                        <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-gray-400">
                            Admin
                        </p>

                        <h1 className="text-4xl font-black text-gray-900">
                            Task Templates
                        </h1>

                        <p className="mt-2 text-sm text-gray-500">
                            Configure reusable FleetFix task templates
                        </p>

                    </div>

                    <button
                        onClick={openCreate}
                        className="
              flex
              items-center
              gap-2
              rounded-2xl
              bg-blue-600
              px-6
              py-3
              text-sm
              font-black
              text-white
              shadow-lg
              hover:bg-blue-700
            "
                    >
                        <Plus size={18} />
                        Add Task
                    </button>

                </div>

                {/* SEARCH */}
                <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">

                    <div className="relative">

                        <Search
                            size={18}
                            className="absolute left-4 top-4 text-gray-400"
                        />

                        <input
                            value={search}
                            onChange={(e) =>
                                setSearch(
                                    e.target.value
                                )
                            }
                            placeholder="Search task templates..."
                            className="
                h-14
                w-full
                rounded-2xl
                border-2
                border-gray-200
                bg-gray-50
                pl-12
                pr-4
                outline-none
                focus:border-blue-500
              "
                        />

                    </div>

                </div>

                {/* TABLE */}
                <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">

                    <div className="overflow-x-auto">

                        <table className="w-full">

                            <thead>

                                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">

                                    <th className="px-6 py-4">
                                        Name
                                    </th>

                                    <th className="px-6 py-4">
                                        Module
                                    </th>

                                    <th className="px-6 py-4">
                                        Items
                                    </th>

                                    <th className="px-6 py-4">
                                        Modified
                                    </th>

                                    <th className="px-6 py-4">
                                        Actions
                                    </th>

                                </tr>

                            </thead>

                            <tbody>

                                {filtered.map(
                                    (template) => (

                                        <tr
                                            key={template.id}
                                            className="border-b border-gray-100 hover:bg-gray-50"
                                        >

                                            <td className="px-6 py-4 font-black text-gray-900">
                                                {template.name}
                                            </td>

                                            <td className="px-6 py-4">

                                                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
                                                    {template.module}
                                                </span>

                                            </td>

                                            <td className="px-6 py-4 text-sm font-bold text-gray-600">
                                                {template.items.length} Items
                                            </td>

                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {template.modifiedAt}
                                            </td>

                                            <td className="px-6 py-4">

                                                <div className="flex gap-2">

                                                    <button
                                                        onClick={() =>
                                                            openEdit(
                                                                template
                                                            )
                                                        }
                                                        className="rounded-xl border border-blue-300 bg-blue-50 p-2 text-blue-700 hover:bg-blue-100"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>

                                                    <button
                                                        onClick={async () => {

                                                            try {

                                                                await deleteDoc(

                                                                    doc(
                                                                        clientDb,
                                                                        "companies",
                                                                        COMPANY_ID,
                                                                        "jobcardtasks",
                                                                        template.id
                                                                    )
                                                                );

                                                            } catch (error) {

                                                                console.error(error);

                                                                alert(
                                                                    "Failed to delete template"
                                                                );

                                                            }

                                                        }}

                                                        className="rounded-xl border border-red-300 bg-red-50 p-2 text-red-700 hover:bg-red-100"
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
            {
                showModal && (

                    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 p-6">

                        <div className="max-h-[95vh] w-full max-w-7xl overflow-auto rounded-3xl bg-white shadow-2xl">

                            {/* HEADER */}
                            <div className="flex items-center justify-between border-b border-gray-200 p-6">

                                <div>

                                    <h2 className="text-3xl font-black text-gray-900">
                                        {editingTemplate
                                            ? "Edit Task Template"
                                            : "Create Task Template"}
                                    </h2>

                                    <p className="mt-2 text-sm text-gray-500">
                                        Configure task items and options
                                    </p>

                                </div>

                                <button
                                    onClick={() =>
                                        setShowModal(false)
                                    }
                                    className="rounded-xl border border-gray-200 p-2 hover:bg-gray-100"
                                >
                                    <X size={18} />
                                </button>

                            </div>

                            {/* BODY */}
                            <div className="p-6">

                                <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">

                                    <div>

                                        <label className="mb-2 block text-sm font-black text-gray-700">
                                            Name *
                                        </label>

                                        <input
                                            value={name}
                                            onChange={(e) =>
                                                setName(
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

                                    <div>

                                        <label className="mb-2 block text-sm font-black text-gray-700">
                                            Module *
                                        </label>

                                        <select
                                            value={module}
                                            onChange={(e) =>
                                                setModule(
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
                                        >

                                            <option>
                                                Job Card
                                            </option>

                                            <option>
                                                Query
                                            </option>

                                        </select>

                                    </div>

                                </div>

                                {/* ITEMS */}
                                <div className="rounded-3xl border border-gray-200">

                                    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 p-5">

                                        <div>

                                            <h3 className="text-lg font-black text-gray-900">
                                                Task Items
                                            </h3>

                                            <p className="text-sm text-gray-500">
                                                Configure task checklist inputs
                                            </p>

                                        </div>

                                        <button
                                            onClick={addItem}
                                            className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
                                        >
                                            <Plus size={16} />
                                            Add Item
                                        </button>

                                    </div>

                                    <div className="space-y-4 p-5">

                                        {items.map(
                                            (item) => (

                                                <div
                                                    key={item.id}
                                                    className="rounded-2xl border border-gray-200 bg-gray-50 p-5"
                                                >

                                                    <div className="mb-5 flex items-start justify-between gap-4">

                                                        <div className="flex items-center gap-3">

                                                            <GripVertical
                                                                size={18}
                                                                className="mt-4 text-gray-400"
                                                            />

                                                            <div className="w-[500px]">

                                                                <label className="mb-2 block text-sm font-bold text-gray-700">
                                                                    Description
                                                                </label>

                                                                <textarea
                                                                    value={
                                                                        item.description
                                                                    }
                                                                    onChange={(e) =>
                                                                        updateItem(
                                                                            item.id,
                                                                            "description",
                                                                            e.target
                                                                                .value
                                                                        )
                                                                    }
                                                                    className="
                                  min-h-[100px]
                                  w-full
                                  rounded-2xl
                                  border-2
                                  border-gray-200
                                  p-4
                                  outline-none
                                  focus:border-blue-500
                                "
                                                                />

                                                            </div>

                                                        </div>

                                                        <button
                                                            onClick={() =>
                                                                removeItem(
                                                                    item.id
                                                                )
                                                            }
                                                            className="rounded-xl border border-red-300 bg-red-50 p-2 text-red-700 hover:bg-red-100"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>

                                                    </div>

                                                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

                                                        <div>

                                                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                                                Type
                                                            </label>

                                                            <select
                                                                value={item.type}
                                                                onChange={(e) =>
                                                                    updateItem(
                                                                        item.id,
                                                                        "type",
                                                                        e.target
                                                                            .value
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
                                                            >

                                                                {fieldTypes.map(
                                                                    (type) => (

                                                                        <option
                                                                            key={type}
                                                                        >
                                                                            {type}
                                                                        </option>

                                                                    )
                                                                )}

                                                            </select>

                                                        </div>

                                                        <div className="flex items-end">

                                                            <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4">

                                                                <input
                                                                    type="checkbox"
                                                                    checked={
                                                                        item.addToTask
                                                                    }
                                                                    onChange={(e) =>
                                                                        updateItem(
                                                                            item.id,
                                                                            "addToTask",
                                                                            e.target
                                                                                .checked
                                                                        )
                                                                    }
                                                                />

                                                                <span className="text-sm font-bold text-gray-700">
                                                                    Add input to task
                                                                </span>

                                                            </label>

                                                        </div>

                                                    </div>

                                                    {(item.type ===
                                                        "Select" ||
                                                        item.type ===
                                                        "Multiselect") && (

                                                            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">

                                                                <div className="mb-4 flex items-center justify-between">

                                                                    <h4 className="font-black text-gray-900">
                                                                        List Options
                                                                    </h4>

                                                                    <button
                                                                        onClick={() =>
                                                                            addOption(
                                                                                item.id
                                                                            )
                                                                        }
                                                                        className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-100"
                                                                    >
                                                                        Add Option
                                                                    </button>

                                                                </div>

                                                                <div className="space-y-3">

                                                                    {item.options?.map(
                                                                        (
                                                                            option,
                                                                            index
                                                                        ) => (

                                                                            <div
                                                                                key={
                                                                                    index
                                                                                }
                                                                                className="flex items-center gap-3"
                                                                            >

                                                                                <input
                                                                                    value={
                                                                                        option
                                                                                    }
                                                                                    onChange={(
                                                                                        e
                                                                                    ) =>
                                                                                        updateOption(
                                                                                            item.id,
                                                                                            index,
                                                                                            e
                                                                                                .target
                                                                                                .value
                                                                                        )
                                                                                    }
                                                                                    className="
                                        h-12
                                        flex-1
                                        rounded-xl
                                        border-2
                                        border-gray-200
                                        px-4
                                        outline-none
                                        focus:border-blue-500
                                      "
                                                                                />

                                                                                <button
                                                                                    onClick={() =>
                                                                                        removeOption(
                                                                                            item.id,
                                                                                            index
                                                                                        )
                                                                                    }
                                                                                    className="rounded-xl border border-red-300 bg-red-50 p-2 text-red-700 hover:bg-red-100"
                                                                                >
                                                                                    <Trash2
                                                                                        size={
                                                                                            14
                                                                                        }
                                                                                    />
                                                                                </button>

                                                                            </div>

                                                                        )
                                                                    )}

                                                                </div>

                                                            </div>

                                                        )}

                                                </div>

                                            )
                                        )}

                                    </div>

                                </div>

                            </div>

                            {/* FOOTER */}
                            <div className="flex justify-end gap-4 border-t border-gray-200 p-6">

                                <button
                                    onClick={() =>
                                        setShowModal(false)
                                    }
                                    className="rounded-2xl border border-gray-300 px-6 py-3 font-black text-gray-700 hover:bg-gray-100"
                                >
                                    Cancel
                                </button>

                                <button
                                    onClick={
                                        saveTemplate
                                    }
                                    className="rounded-2xl bg-blue-600 px-6 py-3 font-black text-white hover:bg-blue-700"
                                >
                                    Save Template
                                </button>

                            </div>

                        </div>

                    </div>

                )
            }

        </div >
    );

}
