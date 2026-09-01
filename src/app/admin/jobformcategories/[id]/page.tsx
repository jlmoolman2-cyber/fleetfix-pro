"use client";

import {
    useEffect,
    useState,
} from "react";

import {
    doc,
    getDoc,
    updateDoc,
} from "firebase/firestore";

import {
    clientDb,
} from "@/lib/firebaseClient";

import {
    COMPANY_ID,
} from "@/lib/company";

import { v4 as uuid } from "uuid";

type FormField = {

    id: string;

    label: string;

    type:
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "time"
    | "dropdown"
    | "checkbox"
    | "signature"
    | "photo"
    | "section";

    required?: boolean;

    placeholder?: string;

    options?: string[];

    width?: "full" | "half";

    section?: string;

    order?: number;
};

export default function FormBuilderPage({
    params,
}: any) {

    const [fields, setFields] =
        useState<FormField[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [selectedFieldId, setSelectedFieldId] =
        useState<string | null>(null);

    const toolboxItems = [

        {
            type: "text",
            label: "Text Input",
            icon: "📝",
            description: "Single line text",
        },

        {
            type: "textarea",
            label: "Textarea",
            icon: "📄",
            description: "Long notes",
        },

        {
            type: "number",
            label: "Number",
            icon: "🔢",
            description: "Numeric input",
        },

        {
            type: "date",
            label: "Date",
            icon: "📅",
            description: "Date picker",
        },

        {
            type: "time",
            label: "Time",
            icon: "⏰",
            description: "Time picker",
        },

        {
            type: "dropdown",
            label: "Dropdown",
            icon: "⬇️",
            description: "Selection list",
        },

        {
            type: "checkbox",
            label: "Checkbox",
            icon: "☑️",
            description: "Yes / No",
        },

        {
            type: "signature",
            label: "Signature",
            icon: "✍️",
            description: "Driver signature",
        },

        {
            type: "photo",
            label: "Photo",
            icon: "📷",
            description: "Image upload",
        },
    ];

    const sections = [

        {
            name: "TRUCK DETAILS",
        },

        {
            name: "A - TRAILER DETAILS",
        },

        {
            name: "B - TRAILER DETAILS",
        },

        {
            name: "WHEEL POSITION / SIDE",
        },

        {
            name: "REMOVE / REPAIR",
        },

        {
            name: "NEW / FIT TYRE",
        },

        {
            name: "SIGNATURE & TERMS",
        },
    ];

    useEffect(() => {

        loadForm();

    }, []);

    async function loadForm() {

        try {

            const ref = doc(
                clientDb,
                "companies",
                COMPANY_ID,
                "jobFormTemplates",
                params.id
            );

            const snap =
                await getDoc(ref);

            if (snap.exists()) {

                const data =
                    snap.data();

                setFields(
                    data.fields || []
                );
            }

        } catch (error) {

            console.error(error);
        }

        setLoading(false);
    }

    async function saveFields(
        updatedFields: FormField[]
    ) {

        setFields(updatedFields);

        try {

            await updateDoc(

                doc(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobFormTemplates",
                    params.id
                ),

                {
                    fields:
                        updatedFields,
                }
            );

        } catch (error) {

            console.error(error);
        }
    }

    function addField(
        type: FormField["type"]
    ) {

        const newField: FormField = {

            id: uuid(),

            label: "New Field",

            type,

            required: false,

            placeholder: "",

            options:
                type === "dropdown"
                    ? ["Option 1"]
                    : [],

            width: "half",

            section:
                sections[0].name,

            order:
                fields.length + 1,
        };

        const updated = [
            ...fields,
            newField,
        ];

        saveFields(updated);

        setSelectedFieldId(
            newField.id
        );
    }

    function updateField(
        id: string,
        updates: Partial<FormField>
    ) {

        const updated =
            fields.map((field) =>

                field.id === id
                    ? {
                        ...field,
                        ...updates,
                    }
                    : field
            );

        saveFields(updated);
    }

    function deleteField(
        id: string
    ) {

        const updated =
            fields.filter(
                (field) =>
                    field.id !== id
            );

        saveFields(updated);

        if (
            selectedFieldId === id
        ) {

            setSelectedFieldId(
                null
            );
        }
    }

    function moveField(
        index: number,
        direction:
            | "up"
            | "down"
    ) {

        const updated =
            [...fields];

        const target =
            direction === "up"
                ? index - 1
                : index + 1;

        if (
            target < 0 ||
            target >= fields.length
        ) {

            return;
        }

        [
            updated[index],
            updated[target],
        ] = [
                updated[target],
                updated[index],
            ];

        saveFields(updated);
    }

    const selectedField =
        fields.find(
            (field) =>
                field.id ===
                selectedFieldId
        );

    if (loading) {

        return (

            <div className="p-10">

                Loading...

            </div>
        );
    }

    return (

        <div className="min-h-screen bg-[#eef2f7]">

            <div className="grid grid-cols-12 gap-6 p-6">

                {/* LEFT TOOLBOX */}
                <div
                    className="
                        col-span-2
                        rounded-3xl
                        border
                        border-gray-200
                        bg-white
                        p-5
                        shadow-sm
                        h-fit
                        sticky
                        top-6
                    "
                >

                    <h2 className="mb-5 text-lg font-black">

                        Form Elements

                    </h2>

                    <div className="space-y-3">

                        {toolboxItems.map((item) => (

                            <button
                                key={item.type}
                                onClick={() =>
                                    addField(
                                        item.type as any
                                    )
                                }
                                className="
                                    flex
                                    w-full
                                    items-center
                                    gap-3
                                    rounded-2xl
                                    border
                                    border-gray-200
                                    bg-gray-50
                                    px-4
                                    py-3
                                    text-left
                                    hover:border-blue-300
                                    hover:bg-blue-50
                                "
                            >

                                <span className="text-xl">

                                    {item.icon}

                                </span>

                                <div>

                                    <div className="text-sm font-bold">

                                        {item.label}

                                    </div>

                                    <div className="text-xs text-gray-500">

                                        {item.description}

                                    </div>

                                </div>

                            </button>

                        ))}

                    </div>

                </div>

                {/* CENTER BUILDER */}
                <div className="col-span-7">

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

                        <div className="mb-10">

                            <div
                                className="
                                    mb-2
                                    text-xs
                                    font-black
                                    uppercase
                                    tracking-[0.25em]
                                    text-gray-400
                                "
                            >

                                Live Preview

                            </div>

                            <h1 className="text-3xl font-black">

                                Job Form Builder

                            </h1>

                        </div>

                        <div className="space-y-8">

                            {sections.map((section) => (

                                <div
                                    key={section.name}
                                >

                                    <div
                                        className="
                                            mb-4
                                            border-b
                                            border-gray-300
                                            pb-2
                                            text-2xl
                                            font-black
                                            uppercase
                                        "
                                    >

                                        {section.name}

                                    </div>

                                    <div className="grid grid-cols-2 gap-4">

                                        {fields

                                            .filter(
                                                (field) =>
                                                    field.section ===
                                                    section.name
                                            )

                                            .map(
                                                (
                                                    field,
                                                    index
                                                ) => (

                                                    <div
                                                        key={
                                                            field.id
                                                        }
                                                        onClick={() =>
                                                            setSelectedFieldId(
                                                                field.id
                                                            )
                                                        }
                                                        className={`
                                                            relative
                                                            rounded-2xl
                                                            border-2
                                                            p-4
                                                            cursor-pointer
                                                            transition-all
                                                            ${selectedFieldId ===
                                                                field.id
                                                                ? "border-blue-500 bg-blue-50"
                                                                : "border-gray-200 bg-gray-50 hover:border-blue-300"
                                                            }
                                                            ${field.width ===
                                                                "full"
                                                                ? "col-span-2"
                                                                : ""
                                                            }
                                                        `}
                                                    >

                                                        <div className="mb-3 flex items-center justify-between">

                                                            <div
                                                                className="
                                                                    rounded-full
                                                                    bg-gray-200
                                                                    px-3
                                                                    py-1
                                                                    text-xs
                                                                    font-black
                                                                    uppercase
                                                                "
                                                            >

                                                                {field.type}

                                                            </div>

                                                            <div className="flex gap-2">

                                                                <button
                                                                    onClick={(e) => {

                                                                        e.stopPropagation();

                                                                        moveField(
                                                                            index,
                                                                            "up"
                                                                        );
                                                                    }}
                                                                    className="
                                                                        rounded-lg
                                                                        bg-gray-200
                                                                        px-2
                                                                        py-1
                                                                        text-xs
                                                                    "
                                                                >
                                                                    ↑
                                                                </button>

                                                                <button
                                                                    onClick={(e) => {

                                                                        e.stopPropagation();

                                                                        moveField(
                                                                            index,
                                                                            "down"
                                                                        );
                                                                    }}
                                                                    className="
                                                                        rounded-lg
                                                                        bg-gray-200
                                                                        px-2
                                                                        py-1
                                                                        text-xs
                                                                    "
                                                                >
                                                                    ↓
                                                                </button>

                                                                <button
                                                                    onClick={(e) => {

                                                                        e.stopPropagation();

                                                                        deleteField(
                                                                            field.id
                                                                        );
                                                                    }}
                                                                    className="
                                                                        rounded-lg
                                                                        bg-red-100
                                                                        px-2
                                                                        py-1
                                                                        text-xs
                                                                        text-red-700
                                                                    "
                                                                >
                                                                    Delete
                                                                </button>

                                                            </div>

                                                        </div>

                                                        <div className="font-bold">

                                                            {field.label}

                                                        </div>

                                                        <div
                                                            className="
                                                                mt-3
                                                                rounded-xl
                                                                border
                                                                border-gray-300
                                                                bg-white
                                                                p-3
                                                                text-sm
                                                                text-gray-400
                                                            "
                                                        >

                                                            {field.placeholder ||
                                                                "Input field"}

                                                        </div>

                                                    </div>

                                                )
                                            )}

                                    </div>

                                </div>

                            ))}

                        </div>

                    </div>

                </div>

                {/* RIGHT SETTINGS */}
                <div
                    className="
                        col-span-3
                        rounded-3xl
                        border
                        border-gray-200
                        bg-white
                        p-5
                        shadow-sm
                        h-fit
                        sticky
                        top-6
                    "
                >

                    <h2 className="mb-5 text-lg font-black">

                        Field Settings

                    </h2>

                    {selectedField ? (

                        <div className="space-y-5">

                            <div>

                                <label
                                    className="
                                        mb-2
                                        block
                                        text-xs
                                        font-black
                                        uppercase
                                        tracking-wide
                                        text-gray-500
                                    "
                                >

                                    Label

                                </label>

                                <input
                                    type="text"
                                    value={
                                        selectedField.label
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            selectedField.id,
                                            {
                                                label:
                                                    e.target
                                                        .value,
                                            }
                                        )
                                    }
                                    className="
                                        h-12
                                        w-full
                                        rounded-2xl
                                        border
                                        border-gray-300
                                        px-4
                                    "
                                />

                            </div>

                            <div>

                                <label
                                    className="
                                        mb-2
                                        block
                                        text-xs
                                        font-black
                                        uppercase
                                        tracking-wide
                                        text-gray-500
                                    "
                                >

                                    Placeholder

                                </label>

                                <input
                                    type="text"
                                    value={
                                        selectedField.placeholder
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            selectedField.id,
                                            {
                                                placeholder:
                                                    e.target
                                                        .value,
                                            }
                                        )
                                    }
                                    className="
                                        h-12
                                        w-full
                                        rounded-2xl
                                        border
                                        border-gray-300
                                        px-4
                                    "
                                />

                            </div>

                            <div>

                                <label
                                    className="
                                        mb-2
                                        block
                                        text-xs
                                        font-black
                                        uppercase
                                        tracking-wide
                                        text-gray-500
                                    "
                                >

                                    Section

                                </label>

                                <select
                                    value={
                                        selectedField.section
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            selectedField.id,
                                            {
                                                section:
                                                    e.target
                                                        .value,
                                            }
                                        )
                                    }
                                    className="
                                        h-12
                                        w-full
                                        rounded-2xl
                                        border
                                        border-gray-300
                                        px-4
                                    "
                                >

                                    {sections.map(
                                        (
                                            section
                                        ) => (

                                            <option
                                                key={
                                                    section.name
                                                }
                                                value={
                                                    section.name
                                                }
                                            >

                                                {section.name}

                                            </option>

                                        )
                                    )}

                                </select>

                            </div>

                            <div>

                                <label
                                    className="
                                        mb-2
                                        block
                                        text-xs
                                        font-black
                                        uppercase
                                        tracking-wide
                                        text-gray-500
                                    "
                                >

                                    Width

                                </label>

                                <select
                                    value={
                                        selectedField.width
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            selectedField.id,
                                            {
                                                width:
                                                    e.target
                                                        .value as any,
                                            }
                                        )
                                    }
                                    className="
                                        h-12
                                        w-full
                                        rounded-2xl
                                        border
                                        border-gray-300
                                        px-4
                                    "
                                >

                                    <option value="half">

                                        Half Width

                                    </option>

                                    <option value="full">

                                        Full Width

                                    </option>

                                </select>

                            </div>

                            {selectedField.type ===
                                "dropdown" && (

                                    <div>

                                        <label
                                            className="
                                            mb-2
                                            block
                                            text-xs
                                            font-black
                                            uppercase
                                            tracking-wide
                                            text-gray-500
                                        "
                                        >

                                            Dropdown Options

                                        </label>

                                        <textarea
                                            value={
                                                selectedField.options?.join(
                                                    "\n"
                                                ) || ""
                                            }
                                            onChange={(e) =>
                                                updateField(
                                                    selectedField.id,
                                                    {
                                                        options:
                                                            e.target.value.split(
                                                                "\n"
                                                            ),
                                                    }
                                                )
                                            }
                                            className="
                                            min-h-[120px]
                                            w-full
                                            rounded-2xl
                                            border
                                            border-gray-300
                                            p-4
                                        "
                                        />

                                    </div>

                                )}

                            <div className="flex items-center gap-3">

                                <input
                                    type="checkbox"
                                    checked={
                                        selectedField.required
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            selectedField.id,
                                            {
                                                required:
                                                    e.target
                                                        .checked,
                                            }
                                        )
                                    }
                                />

                                <span className="text-sm font-medium">

                                    Required Field

                                </span>

                            </div>

                        </div>

                    ) : (

                        <div
                            className="
                                rounded-2xl
                                border
                                border-dashed
                                border-gray-300
                                p-8
                                text-center
                                text-sm
                                text-gray-500
                            "
                        >

                            Select a field to edit

                        </div>

                    )}

                </div>

            </div>

        </div>
    );
}