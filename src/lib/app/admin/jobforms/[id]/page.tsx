"use client";

import React, {
    use,
    useEffect,
    useState,
} from "react";

import { Rnd } from "react-rnd";

import { v4 as uuidv4 } from "uuid";

import {
    Type,
    AlignLeft,
    Signature,
    Image as ImageIcon,
    FileText,
    Link2,
    Eye,
    Save,
    Trash2,
    LayoutPanelTop,
} from "lucide-react";

import {
    addDoc,
    collection,
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";

import {
    useRouter,
} from "next/navigation";

import {
    clientDb,
} from "@/lib/firebaseClient";

import {
    COMPANY_ID,
} from "@/lib/company";

const linkedFields = [

    "Company Name",
    "Company Logo",
    "Company Phone",
    "Company Email",
    "Company Address",

    "Job Number",
    "Job Status",
    "Job Date",
    "Job Type",

    "Customer Name",
    "Customer Contact",
    "Customer Email",

    "Vehicle Reg",
    "Vehicle Make",
    "Vehicle Model",
    "Vehicle VIN",
    "Fleet Number",
    "Odometer",

    "Technician Name",
    "Completed By",

    "Current Date",
    "Current Time",

    "Trailer Reg",
    "Trailer Fleet Number",

    "Invoice Number",
    "Quotation Number",
];

type FieldType =
    | "checkbox"
    | "text"
    | "textarea"
    | "number"
    | "yesno"
    | "date"
    | "datetime"
    | "select"
    | "multiselect"
    | "table"
    | "image"
    | "signature"
    | "info-text"
    | "info-image"
    | "section"
    | "terms"
    | "title"
    | "linked-job-field";

interface FormField {

    id: string;

    type: FieldType;

    label: string;

    x: number;
    y: number;

    width: number;
    height: number;

    linkedType?: string;

    signatureType?: string;

    linkedTermsId?: string;

    fontSize?: number;

    backgroundColor?: string;

    parentSectionId?: string;

    options?: string[];
}

export default function JobFormBuilderPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {

    const resolvedParams =
        use(params);

    const formId =
        resolvedParams.id;

    const router =
        useRouter();

    const systemLinks = [

        /* COMPANY */
        "{{companyName}}",
        "{{companyLogo}}",
        "{{companyPhone}}",
        "{{companyEmail}}",
        "{{companyAddress}}",
        "{{companyVatNumber}}",

        /* JOB */
        "{{jobNumber}}",
        "{{jobStatus}}",
        "{{jobDate}}",
        "{{jobType}}",
        "{{jobDescription}}",
        "{{jobPriority}}",

        /* CUSTOMER */
        "{{customerName}}",
        "{{customerContact}}",
        "{{customerEmail}}",
        "{{customerAddress}}",

        /* VEHICLE */
        "{{vehicleReg}}",
        "{{vehicleMake}}",
        "{{vehicleModel}}",
        "{{vehicleVin}}",
        "{{fleetNumber}}",
        "{{odometer}}",

        /* USER */
        "{{technicianName}}",
        "{{completedBy}}",
        "{{createdBy}}",

        /* SIGNATURE */
        "{{driverSignature}}",
        "{{customerSignature}}",

        /* DATE TIME */
        "{{currentDate}}",
        "{{currentTime}}",
        "{{currentDateTime}}",

        /* FUTURE */
        "{{invoiceNumber}}",
        "{{quotationNumber}}",
        "{{purchaseOrder}}",
        "{{trailerReg}}",
        "{{trailerFleet}}",
    ];

    const [fields, setFields] =
        useState<FormField[]>([]);

    const [selectedField, setSelectedField] =
        useState<FormField | null>(null);

    const [loading, setLoading] =
        useState(true);


    useEffect(() => {

        loadForm();

    }, []);

    async function loadForm() {

        try {

            const ref =
                doc(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobforms",
                    formId
                );

            const snap =
                await getDoc(ref);

            if (
                snap.exists()
            ) {

                setFields(
                    snap.data()
                        .fields || []
                );

            } else {

                setFields([]);

            }

        } catch (err) {

            console.error(err);
        }

        setLoading(false);
    }

    async function saveForm() {

        try {

            const ref =
                doc(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobforms",
                    formId
                );

            await setDoc(
                ref,
                {

                    id: formId,

                    name:
                        fields.find(
                            (f) =>
                                f.type ===
                                "title"
                        )?.label ||
                        "New Form Template",

                    category:
                        "Job Card",

                    active: true,

                    linkType:
                        "Job Card",

                    autoAttachToJob:
                        true,

                    linkedJobTypes:
                        [],

                    fields,

                    updatedAt:
                        serverTimestamp(),

                    createdAt:
                        serverTimestamp(),
                },
                {
                    merge: true,
                }
            );

            alert(
                "Form Saved"
            );

        } catch (err) {

            console.error(err);

            alert(
                "Failed To Save"
            );
        }
    }

    function updateField(
        id: string,
        updates: Partial<FormField>
    ) {

        setFields(
            (prev) =>
                prev.map(
                    (field) =>
                        field.id === id
                            ? {
                                ...field,
                                ...updates,
                            }
                            : field
                )
        );
    }

    function getParentSection(
        x: number,
        y: number,
        currentId?: string
    ) {

        const sections =
            fields.filter(
                (f) =>
                    f.type === "section" &&
                    f.id !== currentId
            );

        for (const section of sections) {

            const insideX =
                x >= section.x &&
                x <=
                section.x +
                section.width;

            const insideY =
                y >= section.y &&
                y <=
                section.y +
                section.height;

            if (
                insideX &&
                insideY
            ) {

                return section.id;
            }
        }

        return undefined;
    }

    function deleteField(
        id: string
    ) {

        setFields(
            (prev) =>
                prev.filter(
                    (f) =>
                        f.id !== id
                )
        );

        setSelectedField(null);
    }

    function addField(
        type: FieldType
    ) {

        const field: FormField = {

            id: uuidv4(),

            type,

            label:
                type.toUpperCase(),

            x: 40,

            y: 100,

            width:
                type === "section"
                    ? 740
                    : type === "textarea"
                        ? 350
                        : type === "table"
                            ? 500
                            : type === "info-image"
                                ? 220
                                : 220,

            height:
                type === "section"
                    ? 140
                    : type === "textarea"
                        ? 100
                        : type === "table"
                            ? 180
                            : type === "signature"
                                ? 100
                                : type === "info-text"
                                    ? 80
                                    : type === "info-image"
                                        ? 120
                                        : 28,

            fontSize: 11,

            backgroundColor:
                "#ffffff",

            linkedType:
                type ===
                    "linked-job-field"
                    ? "Job Number"
                    : undefined,

            options:
                type === "select" ||
                    type === "multiselect"
                    ? ["Option 1"]
                    : undefined,
        };

        setFields(
            (prev) => [
                ...prev,
                field,
            ]
        );
    }

    async function createTyreTemplate() {

        try {

            const templateFields: FormField[] = [

                /* TITLE */
                {
                    id: uuidv4(),
                    type: "title",
                    label: "TYRE - JOBCARD - JOB00001",
                    x: 470,
                    y: 10,
                    width: 300,
                    height: 40,
                    fontSize: 24,
                },

                /* LOGO */
                {
                    id: uuidv4(),
                    type: "image",
                    label: "Company Logo",
                    x: 10,
                    y: 10,
                    width: 120,
                    height: 90,
                },

                /* CUSTOMER DETAILS */
                {
                    id: uuidv4(),
                    type: "textarea",
                    label: "Customer Details",
                    x: 10,
                    y: 105,
                    width: 360,
                    height: 70,
                },

                /* STATUS */
                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Status",
                    linkedType: "Job Status",
                    x: 10,
                    y: 180,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Date",
                    linkedType: "Job Date",
                    x: 10,
                    y: 208,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Employee",
                    linkedType: "Completed By User",
                    x: 10,
                    y: 236,
                    width: 370,
                    height: 28,
                },

                /* TRUCK DETAILS */
                {
                    id: uuidv4(),
                    type: "section",
                    label: "TRUCK DETAILS",
                    x: 10,
                    y: 300,
                    width: 740,
                    height: 110,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Vehicle Make",
                    x: 10,
                    y: 340,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Vehicle Model",
                    x: 380,
                    y: 340,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Reg No",
                    linkedType: "Vehicle Reg",
                    x: 10,
                    y: 368,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Fleet No",
                    linkedType: "Fleet Number",
                    x: 380,
                    y: 368,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "VIN / Chassis No",
                    linkedType: "VIN",
                    x: 10,
                    y: 396,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Odometer",
                    linkedType: "Odometer",
                    x: 380,
                    y: 396,
                    width: 370,
                    height: 28,
                },

                /* TRAILER A */
                {
                    id: uuidv4(),
                    type: "section",
                    label: "A - TRAILER DETAILS",
                    x: 10,
                    y: 450,
                    width: 740,
                    height: 90,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "Trailer Make",
                    x: 10,
                    y: 490,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "Reg No",
                    x: 380,
                    y: 490,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "Fleet No",
                    x: 10,
                    y: 518,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "VIN / Chassis No",
                    x: 380,
                    y: 518,
                    width: 370,
                    height: 28,
                },

                /* TRAILER B */
                {
                    id: uuidv4(),
                    type: "section",
                    label: "B - TRAILER DETAILS",
                    x: 10,
                    y: 580,
                    width: 740,
                    height: 90,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "Trailer Make",
                    x: 10,
                    y: 620,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "Reg No",
                    x: 380,
                    y: 620,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "Fleet No",
                    x: 10,
                    y: 648,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "VIN / Chassis No",
                    x: 380,
                    y: 648,
                    width: 370,
                    height: 28,
                },

                /* WHEEL POSITION */
                {
                    id: uuidv4(),
                    type: "section",
                    label: "WHEEL POSITION / SIDE",
                    x: 10,
                    y: 710,
                    width: 740,
                    height: 90,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "Repair / Fitment done on",
                    x: 10,
                    y: 750,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "Wheel Position",
                    x: 380,
                    y: 750,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "Side",
                    x: 10,
                    y: 778,
                    width: 740,
                    height: 28,
                },

                /* REMOVE REPAIR */
                {
                    id: uuidv4(),
                    type: "section",
                    label: "REMOVE / REPAIR",
                    x: 10,
                    y: 840,
                    width: 740,
                    height: 110,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "Serial No",
                    x: 10,
                    y: 880,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "text",
                    label: "Tyre Make",
                    x: 380,
                    y: 880,
                    width: 370,
                    height: 28,
                },
            ];

            const docRef = await addDoc(
                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobforms"
                ),
                {
                    name: "Tyre Jobcard Template",
                    category: "Tyre",
                    active: true,
                    linkType: "Job Card",
                    autoAttachToJob: true,
                    linkedJobTypes: [],
                    templateType: "tyre-jobcard",
                    fields: templateFields,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }
            );

            router.push(
                `/admin/jobforms/${docRef.id}`
            );

        } catch (error) {

            console.error(error);

            alert(
                "Failed to create tyre template"
            );
        }
    }

    async function createBreakdownTemplate() {

        try {

            const templateFields: FormField[] = [

                {
                    id: uuidv4(),
                    type: "title",
                    label: "JOB CARD - JOB00001",
                    x: 500,
                    y: 10,
                    width: 280,
                    height: 40,
                    fontSize: 24,
                },

                {
                    id: uuidv4(),
                    type: "image",
                    label: "Company Logo",
                    x: 10,
                    y: 10,
                    width: 120,
                    height: 90,
                },

                {
                    id: uuidv4(),
                    type: "textarea",
                    label: "Customer Details",
                    x: 10,
                    y: 105,
                    width: 360,
                    height: 70,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Status",
                    x: 10,
                    y: 180,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Date",
                    x: 10,
                    y: 208,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Employee",
                    x: 10,
                    y: 236,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "section",
                    label: "TRUCK DETAILS",
                    x: 10,
                    y: 300,
                    width: 740,
                    height: 120,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Vehicle Make",
                    x: 10,
                    y: 340,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Vehicle Model",
                    x: 380,
                    y: 340,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Vehicle Type",
                    x: 10,
                    y: 368,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Reg No",
                    x: 380,
                    y: 368,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Fleet No",
                    x: 10,
                    y: 396,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "VIN / Chassis No",
                    x: 380,
                    y: 396,
                    width: 370,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "linked-job-field",
                    label: "Odometer",
                    x: 10,
                    y: 424,
                    width: 740,
                    height: 28,
                },

                {
                    id: uuidv4(),
                    type: "section",
                    label: "JOB INFORMATION & DESCRIPTIONS",
                    x: 10,
                    y: 620,
                    width: 740,
                    height: 260,
                },

                {
                    id: uuidv4(),
                    type: "textarea",
                    label: "Defect / Malfunction Assessment Findings",
                    x: 10,
                    y: 710,
                    width: 740,
                    height: 80,
                },

                {
                    id: uuidv4(),
                    type: "textarea",
                    label: "Repairs & Corrections",
                    x: 10,
                    y: 810,
                    width: 740,
                    height: 80,
                },
            ];

            const docRef = await addDoc(
                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobforms"
                ),
                {
                    name: "Breakdown Jobcard Template",
                    category: "Breakdown",
                    active: true,
                    linkType: "Job Card",
                    autoAttachToJob: true,
                    linkedJobTypes: [],
                    templateType: "breakdown-jobcard",
                    fields: templateFields,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }
            );

            router.push(
                `/admin/jobforms/${docRef.id}`
            );

        } catch (error) {

            console.error(error);

            alert(
                "Failed to create breakdown template"
            );
        }
    }

    function renderField(
        field: FormField
    ) {

        switch (
        field.type
        ) {

            case "section":

                return (

                    <div
                        style={{

                            width: "100%",

                            height: "100%",

                            border: "1px solid black",

                            pointerEvents: "auto",

                            display: "flex",

                            flexDirection: "column",

                            background:
                                fields.some(
                                    (f) =>
                                        f.parentSectionId ===
                                        field.id
                                )
                                    ? "#eff6ff"
                                    : "#ffffff",
                        }}
                    >

                        <div
                            style={{
                                height: 32,
                                background:
                                    "#f1f5f9",
                                borderBottom:
                                    "1px solid black",
                                display:
                                    "flex",
                                alignItems:
                                    "center",
                                paddingLeft: 8,
                                fontWeight: 700,
                                fontSize: 18,
                            }}
                        >

                            {
                                field.label
                            }

                        </div>

                    </div>
                );

            case "textarea":

                return (

                    <div
                        style={{
                            width:
                                "100%",
                            height:
                                "100%",
                            border:
                                "1px solid black",
                            display:
                                "flex",
                            flexDirection:
                                "column",
                        }}
                    >

                        <div
                            style={{
                                padding:
                                    "3px 6px",
                                borderBottom:
                                    "1px solid black",
                                background:
                                    "#f5f5f5",
                                fontWeight:
                                    "bold",
                            }}
                        >

                            {
                                field.label
                            }

                        </div>

                    </div>
                );

            case "signature":

                return (

                    <div
                        style={{
                            width:
                                "100%",
                            height:
                                "100%",
                            border:
                                "1px solid black",
                            display:
                                "flex",
                            flexDirection:
                                "column",
                        }}
                    >

                        <div
                            style={{
                                padding:
                                    "3px 6px",
                                borderBottom:
                                    "1px solid black",
                                background:
                                    "#f5f5f5",
                                fontWeight:
                                    "bold",
                            }}
                        >

                            {
                                field.signatureType
                            }

                        </div>

                        <div
                            style={{
                                marginTop:
                                    "auto",
                                borderTop:
                                    "1px solid black",
                                padding:
                                    "2px 4px",
                                fontSize: 10,
                            }}
                        >

                            Terms:
                            {" "}
                            {
                                field.linkedTermsId
                            }

                        </div>

                    </div>
                );

            case "image":

                return (

                    <div
                        style={{
                            width:
                                "100%",
                            height:
                                "100%",
                            border:
                                "1px solid black",
                            display:
                                "flex",
                            alignItems:
                                "center",
                            justifyContent:
                                "center",
                            background:
                                "#f8fafc",
                        }}
                    >

                        LOGO

                    </div>
                );

            case "title":

                return (

                    <div
                        style={{
                            width:
                                "100%",
                            height:
                                "100%",
                            display:
                                "flex",
                            alignItems:
                                "center",
                            fontSize:
                                field.fontSize ||
                                24,
                            fontWeight:
                                "bold",
                        }}
                    >

                        {
                            field.label
                        }

                    </div>
                );

            case "checkbox":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border: "1px solid black",
                            display: "flex",
                            alignItems: "center",
                            paddingLeft: 6,
                            gap: 8,
                            fontSize: 11,
                            fontFamily: "Arial",
                        }}
                    >

                        <div
                            style={{
                                width: 14,
                                height: 14,
                                border: "1px solid black",
                            }}
                        />

                        {field.label}

                    </div>
                );

            case "yesno":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border: "1px solid black",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 8px",
                            gap: 20,
                            fontSize: 11,
                        }}
                    >

                        <div>☐ Yes</div>

                        <div>☐ No</div>

                    </div>
                );

            case "info-text":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border: "1px dashed #999",
                            padding: 8,
                            fontSize: 11,
                            background: "#fafafa",
                        }}
                    >

                        Informational Text

                    </div>
                );

            case "info-image":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border: "1px dashed #999",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#fafafa",
                        }}
                    >

                        Image Placeholder

                    </div>
                );

            case "select":

            case "multiselect":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border: "1px solid black",
                            display: "flex",
                            fontSize: 11,
                        }}
                    >

                        <div
                            style={{
                                width: 110,
                                borderRight: "1px solid black",
                                background: "#f5f5f5",
                                padding: "2px 4px",
                                fontWeight: "bold",
                            }}
                        >

                            {field.label}:

                        </div>

                        <div
                            style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "0 6px",
                            }}
                        >

                            Select Option

                            ▼

                        </div>

                    </div>
                );

            case "linked-job-field":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border: "1px solid #2563eb",
                            display: "flex",
                            fontSize: 11,
                            background: "#eff6ff",
                            fontFamily: "Arial",
                        }}
                    >

                        <div
                            style={{
                                width: 120,
                                borderRight:
                                    "1px solid #2563eb",
                                background: "#dbeafe",
                                padding: "2px 6px",
                                fontWeight: "bold",
                                display: "flex",
                                alignItems: "center",
                            }}
                        >

                            {field.label}

                        </div>

                        <div
                            style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                paddingLeft: 8,
                                color: "#1d4ed8",
                                fontWeight: 600,
                            }}
                        >

                            {field.linkedType}

                        </div>

                    </div>
                );

            case "select":

            case "multiselect":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border: "1px solid black",
                            display: "flex",
                            fontSize: 11,
                        }}
                    >

                        <div
                            style={{
                                width: 110,
                                borderRight:
                                    "1px solid black",
                                background: "#f5f5f5",
                                padding: "2px 4px",
                                fontWeight: "bold",
                            }}
                        >

                            {field.label}

                        </div>

                        <div
                            style={{
                                flex: 1,
                                padding: "2px 6px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent:
                                    "space-between",
                            }}
                        >

                            <span>

                                {field.options?.join(
                                    ", "
                                )}

                            </span>

                            ▼

                        </div>

                    </div>
                );

            case "table":

                return (

                    <table
                        style={{
                            width: "100%",
                            height: "100%",
                            borderCollapse:
                                "collapse",
                            fontSize: 11,
                            background: "#fff",
                        }}
                    >

                        <tbody>

                            {Array.from({
                                length: 5,
                            }).map((_, row) => (

                                <tr key={row}>

                                    {Array.from({
                                        length: 4,
                                    }).map((_, col) => (

                                        <td
                                            key={col}
                                            style={{
                                                border:
                                                    "1px solid black",
                                                padding: 4,
                                            }}
                                        >

                                            {row === 0
                                                ? `Header ${col + 1}`
                                                : ""}

                                        </td>
                                    ))}

                                </tr>
                            ))}

                        </tbody>

                    </table>
                );

            default:

                return (

                    <div
                        style={{
                            width:
                                "100%",
                            height:
                                "100%",
                            border:
                                "1px solid black",
                            display:
                                "flex",
                            fontSize: 11,
                        }}
                    >

                        <div
                            style={{
                                width: 110,
                                borderRight:
                                    "1px solid black",
                                background:
                                    "#f5f5f5",
                                padding:
                                    "2px 4px",
                                fontWeight:
                                    "bold",
                            }}
                        >

                            {
                                field.label
                            }

                            :

                        </div>

                        <div
                            style={{
                                flex: 1,
                            }}
                        />

                    </div>
                );
        }
    }

    if (
        loading
    ) {

        return (
            <div className="p-10">
                Loading...
            </div>
        );
    }

    return (

        <div className="flex h-screen overflow-hidden bg-[#dfe3e8]">

            {/* LEFT */}
            <div
                className="
        border-r
        bg-white
        flex
        flex-col
        h-screen
    "
                style={{
                    width: 320,
                    minWidth: 320,
                }}
            >
                {/* STICKY TOP */}
                <div
                    className="
        border-b
        bg-white
        sticky
        top-0
        z-50
        flex
        flex-col
    "
                    style={{
                        padding: 16,
                        minHeight: 190,
                        flexShrink: 0,
                    }}
                >

                    <h2 className="font-bold text-lg mb-4">
                        Form Builder
                    </h2>

                    <button
                        type="button"
                        onClick={() => {

                            localStorage.setItem(
                                "jobform-preview",
                                JSON.stringify(fields)
                            );

                            window.open(
                                "/admin/jobforms/preview",
                                "_blank"
                            );
                        }}
                        style={{
                            width: "100%",
                            background: "white",
                            color: "#111827",
                            padding: "14px",
                            borderRadius: 8,
                            border: "1px solid #d1d5db",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >

                        <Eye size={18} />

                        PDF Preview

                    </button>

                    <button
                        type="button"
                        onClick={saveForm}
                        className="
        w-full
        bg-blue-600
        text-white
        py-3
        rounded-lg
        flex
        items-center
        justify-center
        gap-2
        hover:bg-blue-700
        mt-3
    "
                    >

                        <Save size={18} />

                        Save Form

                    </button>


                </div>

                {/* SCROLL CONTENT */}
                <div className="flex-1 overflow-y-auto p-4">

                    <div className="border rounded p-3 mb-5">

                        <div className="font-bold mb-2">
                            Preset Templates
                        </div>

                        <button
                            onClick={
                                createTyreTemplate
                            }
                            className="w-full border p-2 rounded mb-2 text-left hover:bg-gray-50"
                        >
                            Tyre Jobcard Template
                        </button>

                        <button
                            onClick={
                                createBreakdownTemplate
                            }
                            className="w-full border p-2 rounded text-left hover:bg-gray-50"
                        >
                            Breakdown Jobcard Template
                        </button>

                    </div>

                    <div className="border rounded overflow-hidden bg-white">

                        <SidebarButton
                            label="Checkbox"
                            onClick={() =>
                                addField("checkbox")
                            }
                        />

                        <SidebarButton
                            label="Text"
                            onClick={() =>
                                addField("text")
                            }
                        />

                        <SidebarButton
                            label="Text Box"
                            onClick={() =>
                                addField("textarea")
                            }
                        />

                        <SidebarButton
                            label="Number"
                            onClick={() =>
                                addField("number")
                            }
                        />

                        <SidebarButton
                            label="Yes or No"
                            onClick={() =>
                                addField("yesno")
                            }
                        />

                        <SidebarButton
                            label="Date"
                            onClick={() =>
                                addField("date")
                            }
                        />

                        <SidebarButton
                            label="Date and Time"
                            onClick={() =>
                                addField("datetime")
                            }
                        />

                        <SidebarButton
                            label="Select"
                            onClick={() =>
                                addField("select")
                            }
                        />

                        <SidebarButton
                            label="Multiselect"
                            onClick={() =>
                                addField("multiselect")
                            }
                        />

                        <SidebarButton
                            label="Table"
                            onClick={() =>
                                addField("table")
                            }
                        />

                        <SidebarButton
                            label="Image"
                            onClick={() =>
                                addField("image")
                            }
                        />

                        <SidebarButton
                            label="Signature"
                            onClick={() =>
                                addField("signature")
                            }
                        />

                        <SidebarButton
                            label="Informational Text"
                            onClick={() =>
                                addField("info-text")
                            }
                        />

                        <SidebarButton
                            label="Informational Image"
                            onClick={() =>
                                addField("info-image")
                            }
                        />

                        <SidebarButton
                            label="Section"
                            onClick={() =>
                                addField("section")
                            }
                        />

                    </div>

                </div>

            </div>

            {/* CENTER */}
            <div className="flex-1 overflow-auto p-6 flex justify-center">

                <div
                    className="relative bg-white shadow-2xl"
                    onMouseDown={() =>
                        setSelectedField(null)
                    }
                    style={{

                        width: 794,

                        minHeight: 1123,

                        position: "relative",

                        background: "#ffffff",

                        overflow: "hidden",

                        /* GRID */
                        backgroundImage: `
        linear-gradient(to right, #e5e7eb 1px, transparent 1px),
        linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
    `,

                        backgroundSize: "20px 20px",
                    }}
                >
                    {/* RESTRICTED PRINT BORDER */}
                    <div
                        style={{

                            position: "absolute",

                            top: "1.5cm",

                            left: "1.5cm",

                            right: "1.5cm",

                            bottom: "1.5cm",

                            border:
                                "1px dashed rgba(255,0,0,0.35)",

                            pointerEvents: "none",

                            zIndex: 1,
                        }}
                    />
                    {fields.map(
                        (
                            field
                        ) => (

                            <Rnd
                                key={field.id}

                                size={{
                                    width: field.width,
                                    height: field.height,
                                }}

                                position={{
                                    x: field.x,
                                    y: field.y,
                                }}

                                bounds="parent"
                                dragGrid={[1, 1]}

                                resizeGrid={[1, 1]}

                                onDragStop={(e, d) => {

                                    const deltaX =
                                        d.x - field.x;

                                    const deltaY =
                                        d.y - field.y;

                                    const parentSectionId =
                                        getParentSection(
                                            d.x,
                                            d.y,
                                            field.id
                                        );

                                    updateField(
                                        field.id,
                                        {

                                            x: Math.max(
                                                57,
                                                Math.min(
                                                    d.x,
                                                    794 -
                                                    field.width -
                                                    57
                                                )
                                            ),

                                            y: Math.max(
                                                57,
                                                Math.min(
                                                    d.y,
                                                    1123 -
                                                    field.height -
                                                    57
                                                )
                                            ),

                                            parentSectionId,
                                        }
                                    );

                                    /* MOVE CHILD FIELDS */
                                    if (
                                        field.type ===
                                        "section"
                                    ) {

                                        setFields(
                                            (prev) =>
                                                prev.map(
                                                    (f) => {

                                                        if (
                                                            f.parentSectionId ===
                                                            field.id
                                                        ) {

                                                            return {

                                                                ...f,

                                                                x:
                                                                    f.x +
                                                                    deltaX,

                                                                y:
                                                                    f.y +
                                                                    deltaY,
                                                            };
                                                        }

                                                        return f;
                                                    }
                                                )
                                        );
                                    }

                                    if (
                                        selectedField?.id ===
                                        field.id
                                    ) {

                                        setSelectedField({

                                            ...field,

                                            x: Math.max(
                                                57,
                                                Math.min(
                                                    d.x,
                                                    794 -
                                                    field.width -
                                                    57
                                                )
                                            ),

                                            y: Math.max(
                                                57,
                                                Math.min(
                                                    d.y,
                                                    1123 -
                                                    field.height -
                                                    57
                                                )
                                            ),

                                            parentSectionId,
                                        });
                                    }
                                }}

                                onResizeStop={(
                                    e,
                                    dir,
                                    ref,
                                    delta,
                                    position
                                ) => {

                                    const width =
                                        parseInt(
                                            ref.style.width
                                        );

                                    const height =
                                        parseInt(
                                            ref.style.height
                                        );

                                    updateField(
                                        field.id,
                                        {

                                            width,

                                            height,

                                            x: position.x,

                                            y: position.y,
                                        }
                                    );

                                    if (
                                        selectedField?.id ===
                                        field.id
                                    ) {

                                        setSelectedField({

                                            ...field,

                                            width,

                                            height,

                                            x: position.x,

                                            y: position.y,
                                        });
                                    }
                                }}

                                style={{

                                    zIndex:
                                        selectedField?.id ===
                                            field.id
                                            ? 999
                                            : field.type ===
                                                "section"
                                                ? 1
                                                : 10,

                                    outline:
                                        selectedField?.id ===
                                            field.id
                                            ? "2px solid #2563eb"
                                            : "1px dashed transparent",

                                    boxShadow:
                                        selectedField?.id ===
                                            field.id
                                            ? "0 0 0 2px rgba(37,99,235,0.15)"
                                            : "none",
                                }}
                            >

                                <div
                                    onMouseDown={(e) => {

                                        e.stopPropagation();

                                        setSelectedField(field);
                                    }}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        position: "relative",
                                        cursor: "pointer",
                                    }}
                                >

                                    <div
                                        style={{
                                            position: "absolute",
                                            top: -18,
                                            left: 0,
                                            fontSize: 10,
                                            background: "#2563eb",
                                            color: "white",
                                            padding: "1px 6px",
                                            borderRadius: 4,
                                        }}
                                    >

                                        {field.label}

                                    </div>

                                    {renderField(field)}

                                </div>

                            </Rnd>
                        )
                    )}

                </div>

            </div>

            {/* RIGHT */}
            <div className="w-96 border-l bg-white overflow-y-auto p-4">

                <h2 className="font-bold text-lg mb-4">
                    Properties
                </h2>

                <div className="text-xs text-gray-400 mb-2">

                    Selected:
                    {" "}
                    {selectedField?.id || "NONE"}

                </div>

                {!selectedField && (

                    <div className="text-sm text-gray-500">
                        Select A Field
                    </div>

                )}

                {selectedField && (

                    <div className="space-y-4">

                        <div>

                            <label className="text-xs font-bold">
                                LABEL
                            </label>

                            <input
                                className="w-full border p-2"
                                value={
                                    selectedField.label || ""
                                }
                                onChange={(e) => {

                                    const value =
                                        e.target.value;

                                    updateField(
                                        selectedField.id,
                                        {
                                            label: value,
                                        }
                                    );

                                    setSelectedField({
                                        ...selectedField,
                                        label: value,
                                    });
                                }}
                            />

                            {
                                selectedField.type ===
                                "linked-job-field" && (

                                    <div>

                                        <label className="text-xs font-bold">
                                            SYSTEM FIELD LINK
                                        </label>

                                        <select
                                            className="w-full border p-2"
                                            value={
                                                selectedField.linkedType ||
                                                "Job Number"
                                            }
                                            onChange={(e) => {

                                                const value =
                                                    e.target.value;

                                                updateField(
                                                    selectedField.id,
                                                    {
                                                        linkedType:
                                                            value,
                                                    }
                                                );

                                                setSelectedField({
                                                    ...selectedField,
                                                    linkedType:
                                                        value,
                                                });
                                            }}
                                        >

                                            {linkedFields.map(
                                                (link) => (

                                                    <option
                                                        key={link}
                                                        value={link}
                                                    >

                                                        {link}

                                                    </option>
                                                )
                                            )}

                                        </select>

                                    </div>

                                )

                            }

                            {
                                (
                                    selectedField.type ===
                                    "select" ||

                                    selectedField.type ===
                                    "multiselect"
                                ) && (

                                    <div>

                                        <label className="text-xs font-bold">
                                            OPTIONS
                                        </label>

                                        <div className="space-y-2">

                                            {selectedField.options?.map(
                                                (
                                                    option,
                                                    index
                                                ) => (

                                                    <input
                                                        key={index}
                                                        className="w-full border p-2"
                                                        value={option}
                                                        onChange={(e) => {

                                                            const newOptions =
                                                                [
                                                                    ...(selectedField.options || []),
                                                                ];

                                                            newOptions[
                                                                index
                                                            ] =
                                                                e.target.value;

                                                            updateField(
                                                                selectedField.id,
                                                                {
                                                                    options:
                                                                        newOptions,
                                                                }
                                                            );

                                                            setSelectedField({
                                                                ...selectedField,
                                                                options:
                                                                    newOptions,
                                                            });
                                                        }}
                                                    />
                                                )
                                            )}

                                            <button
                                                onClick={() => {

                                                    const newOptions =
                                                        [
                                                            ...(selectedField.options || []),

                                                            `Option ${(selectedField.options?.length || 0) + 1}`,
                                                        ];

                                                    updateField(
                                                        selectedField.id,
                                                        {
                                                            options:
                                                                newOptions,
                                                        }
                                                    );

                                                    setSelectedField({
                                                        ...selectedField,
                                                        options:
                                                            newOptions,
                                                    });
                                                }}
                                                className="
                        w-full
                        border
                        py-2
                        rounded
                        bg-gray-100
                    "
                                            >

                                                + Add Option

                                            </button>

                                        </div>

                                    </div>
                                )
                            }
                            <div className="grid grid-cols-2 gap-2">

                                <div>

                                    <label className="text-xs font-bold">
                                        X POSITION
                                    </label>

                                    <input
                                        type="number"
                                        className="w-full border p-2"
                                        value={selectedField.x}
                                        onChange={(e) => {

                                            const value =
                                                Number(e.target.value);

                                            updateField(
                                                selectedField.id,
                                                {
                                                    x: value,
                                                }
                                            );

                                            setSelectedField({
                                                ...selectedField,
                                                x: value,
                                            });
                                        }}
                                    />

                                </div>

                                <div>

                                    <label className="text-xs font-bold">
                                        Y POSITION
                                    </label>

                                    <input
                                        type="number"
                                        className="w-full border p-2"
                                        value={selectedField.y}
                                        onChange={(e) => {

                                            const value =
                                                Number(e.target.value);

                                            updateField(
                                                selectedField.id,
                                                {
                                                    y: value,
                                                }
                                            );

                                            setSelectedField({
                                                ...selectedField,
                                                y: value,
                                            });
                                        }}
                                    />

                                </div>

                                <div>

                                    <label className="text-xs font-bold">
                                        WIDTH
                                    </label>

                                    <input
                                        type="number"
                                        className="w-full border p-2"
                                        value={selectedField.width}
                                        onChange={(e) => {

                                            const value =
                                                Number(e.target.value);

                                            updateField(
                                                selectedField.id,
                                                {
                                                    width: value,
                                                }
                                            );

                                            setSelectedField({
                                                ...selectedField,
                                                width: value,
                                            });
                                        }}
                                    />

                                </div>

                                <div>

                                    <label className="text-xs font-bold">
                                        HEIGHT
                                    </label>

                                    <input
                                        type="number"
                                        className="w-full border p-2"
                                        value={selectedField.height}
                                        onChange={(e) => {

                                            const value =
                                                Number(e.target.value);

                                            updateField(
                                                selectedField.id,
                                                {
                                                    height: value,
                                                }
                                            );

                                            setSelectedField({
                                                ...selectedField,
                                                height: value,
                                            });
                                        }}
                                    />

                                </div>

                            </div>

                        </div>

                        <button
                            onClick={() =>
                                deleteField(
                                    selectedField.id
                                )
                            }
                            className="w-full bg-red-600 text-white py-2 rounded flex items-center justify-center gap-2"
                        >

                            <Trash2 size={16} />

                            Delete Field

                        </button>

                    </div>

                )
                }

            </div >

        </div >
    );
}

function ToolButton({
    icon,
    label,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}) {

    return (

        <button
            onClick={onClick}
            className="w-full border p-2 rounded flex items-center gap-2 hover:bg-gray-100"
        >

            {icon}

            {label}

        </button>
    );
}
function SidebarButton({
    label,
    onClick,
}: {
    label: string;
    onClick: () => void;
}) {

    return (

        <button
            onClick={onClick}
            className="
                w-full
                text-left
                px-4
                py-2
                text-sm
                border-b
                hover:bg-gray-100
                bg-[#f7f7f7]
            "
        >

            {label}

        </button>
    );
}
