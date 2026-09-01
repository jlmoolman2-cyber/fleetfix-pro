"use client";

import {
    useState,
} from "react";

import {
    useParams,
    useRouter,
} from "next/navigation";

import {

    getTemplates,

    saveTemplates,

} from "@/lib/mock/messageTemplateStore";

const replacementTags = [

    {
        category: "Customer",

        tags: [

            "CustName",

            "CustCode",

            "CustVatNo",

            "CustEmail",

            "CustMobile",
        ],
    },

    {
        category: "JobCard",

        tags: [

            "JobNo",

            "JobRefNo",

            "JobStatus",

            "JobType",
        ],
    },

    {
        category: "Vehicle",

        tags: [

            "VehicleRegNo",

            "VehicleFleetNo",

            "VehicleMake",

            "VehicleModel",
        ],
    },

    {
        category: "Employee",

        tags: [

            "EmpName",

            "EmpMobile",

            "EmpEmail",
        ],
    },
];

export default function EditMessagePage() {

    const params =
        useParams();

    const router =
        useRouter();

    const templateId =
        params.id as string;

    const templates =
        getTemplates();

    const existing =
        templates.find(
            (t: any) =>
                t.id === templateId
        );

    const [name, setName] =
        useState(
            existing?.name || ""
        );

    const [subject, setSubject] =
        useState(
            existing?.subject || ""
        );

    const [message, setMessage] =
        useState(
            existing?.body ||

            `Hi {{CustName}}

Your vehicle {{VehicleRegNo}}
has been booked under job
{{JobNo}}.

Thank you for choosing FleetFix Pro.
`
        );

    function addTag(
        tag: string
    ) {

        setMessage(
            (prev: string) =>
                prev + `{{${tag}}}`
        );
    }

    function saveTemplate() {

        const updated =
            templates.map(
                (template: any) =>

                    template.id ===
                        templateId

                        ? {

                            ...template,

                            name,

                            subject,

                            body: message,
                        }

                        : template
            );

        saveTemplates(
            updated
        );

        router.push(
            "/admin/messages"
        );
    }

    return (

        <div className="min-h-screen bg-[#f5f7fb] p-6">

            <div className="mx-auto max-w-[1900px]">

                {/* HEADER */}
                <div className="mb-8 flex items-center justify-between">

                    <div>

                        <div className="text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                            Messages
                        </div>

                        <h1 className="mt-2 text-4xl font-black text-gray-900">
                            Edit Message Template
                        </h1>

                    </div>

                    <button
                        type="button"
                        onClick={saveTemplate}
                        className="
              rounded-2xl
              bg-blue-600
              px-6
              py-4
              text-sm
              font-bold
              text-white
              hover:bg-blue-700
            "
                    >
                        Save Template
                    </button>

                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">

                    {/* EDITOR */}
                    <div
                        className="
              rounded-3xl
              border
              border-gray-200
              bg-white
              p-6
              shadow-sm
            "
                    >

                        <div className="mb-6">

                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Template Name
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
                  border
                  border-gray-300
                  px-5
                  outline-none
                  focus:border-blue-500
                "
                            />

                        </div>

                        <div className="mb-6">

                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Subject / Title
                            </label>

                            <input
                                value={subject}
                                onChange={(e) =>
                                    setSubject(
                                        e.target.value
                                    )
                                }
                                className="
                  h-14
                  w-full
                  rounded-2xl
                  border
                  border-gray-300
                  px-5
                  outline-none
                  focus:border-blue-500
                "
                            />

                        </div>

                        <textarea
                            value={message}
                            onChange={(e) =>
                                setMessage(
                                    e.target.value
                                )
                            }
                            className="
                min-h-[700px]
                w-full
                rounded-3xl
                border
                border-gray-300
                p-6
                font-medium
                outline-none
                focus:border-blue-500
              "
                        />

                    </div>

                    {/* TAGS */}
                    <div
                        className="
              rounded-3xl
              border
              border-gray-200
              bg-white
              p-6
              shadow-sm
            "
                    >

                        <h2 className="mb-6 text-xl font-black text-gray-900">
                            FleetFix-Pro Replacement Tags
                        </h2>

                        <div className="space-y-6">

                            {replacementTags.map(
                                (group) => (

                                    <div
                                        key={group.category}
                                    >

                                        <div className="mb-3 text-xs font-black uppercase tracking-wide text-gray-400">
                                            {group.category}
                                        </div>

                                        <div className="space-y-2">

                                            {group.tags
                                                .sort()
                                                .map((tag) => (

                                                    <button
                                                        key={tag}
                                                        type="button"
                                                        onClick={() =>
                                                            addTag(tag)
                                                        }
                                                        className="
                              flex
                              w-full
                              items-center
                              justify-between
                              rounded-2xl
                              border
                              border-gray-200
                              px-4
                              py-3
                              text-left
                              text-sm
                              hover:border-blue-500
                              hover:bg-blue-50
                            "
                                                    >

                                                        <span className="font-semibold text-gray-700">
                                                            {`{{${tag}}}`}
                                                        </span>

                                                        <span className="text-xs text-gray-400">
                                                            Insert
                                                        </span>

                                                    </button>

                                                ))}

                                        </div>

                                    </div>

                                )
                            )}

                        </div>

                    </div>

                </div>

            </div>

        </div>
    );
}
