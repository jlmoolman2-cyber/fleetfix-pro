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
    getDocs,
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
import {
    buildJobFormLayoutFields,
    getJobFormCanvasHeight,
    getJobFormPageCount,
    JOB_FORM_PAGE_HEIGHT,
    JOB_FORM_PAGE_STRIDE,
    moveJobFormFieldsPastFooters,
} from "@/lib/jobFormLayout";

const companyLinkedFields = [

    "Company Name",
    "Company Logo",
    "Company Phone",
    "Company Email",
    "Company Address",
];

const jobLinkedFields = [

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

    linkedTermsText?: string;

    fontSize?: number;

    inputFontSize?: number;

    showLabel?: boolean;

    showBorder?: boolean;

    required?: boolean;

    autoAdjustHeight?: boolean;

    pageFooter?: "job-card" | "powered";

    bold?: boolean;

    labelWidth?: number;
    labelHeight?: number;

    backgroundColor?: string;

    parentSectionId?: string;

    options?: string[];

    autoFillTargetFieldIds?: string[];

    autoFillRules?: Array<{
        sourceValue: string;
        targetFieldIds: string[];
    }>;

    fleetAssetRole?: "truck" | "trailer-a" | "trailer-b";

    fleetProperty?:
        | "vehicleMake"
        | "vehicleModel"
        | "vehicleType"
        | "regNo"
        | "fleetNo"
        | "vinNumber"
        | "odometer";
}

function canReceiveAutoFill(field: FormField) {
    if (field.pageFooter) return false;

    if (field.type === "linked-job-field") {
        return Boolean(field.options?.length) ||
            (field.y >= 218 && !String(field.linkedType || "").startsWith("Company "));
    }

    return [
        "text",
        "textarea",
        "number",
        "yesno",
        "date",
        "datetime",
        "select",
    ].includes(field.type);
}

interface TermsTemplate {
    id: string;
    name: string;
    linkedFormId: string;
    signatureType: "Employee" | "Customer";
    termsText: string;
    active?: boolean;
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

    const [formName, setFormName] =
        useState("New Form Template");

    const [loadError, setLoadError] =
        useState("");

    const [isNewForm, setIsNewForm] =
        useState(false);

    const [templateType, setTemplateType] =
        useState<string>("");

    const [allowMultipleUse, setAllowMultipleUse] =
        useState(false);

    const [jobTypes, setJobTypes] = useState<any[]>([]);
    const [linkedJobTypeIds, setLinkedJobTypeIds] = useState<string[]>([]);
    const [jobTypeSelectionMode, setJobTypeSelectionMode] =
        useState<"single" | "multiple">("single");
    const [statuses, setStatuses] = useState<any[]>([]);
    const [autoAddStatusIds, setAutoAddStatusIds] = useState<string[]>([]);
    const [vehicleCategories, setVehicleCategories] = useState<any[]>([]);

    const [termsTemplates, setTermsTemplates] =
        useState<TermsTemplate[]>([]);

    const paginatedFields = moveJobFormFieldsPastFooters(fields);
    const pageCount = getJobFormPageCount(paginatedFields);
    const layoutFields = buildJobFormLayoutFields(paginatedFields, pageCount);
    const canvasHeight = getJobFormCanvasHeight(pageCount);

    function resolvedFieldOptions(field: FormField): string[] {
        const categoryPrefix = "Vehicle Category:";
        const linkedType = String(field.linkedType || "");
        if (linkedType.startsWith(categoryPrefix)) {
            const categoryId = linkedType.slice(categoryPrefix.length);
            const category = vehicleCategories.find((item) => item.id === categoryId);
            if (category) {
                const uniqueOptions = new Map<string, string>();
                if (Array.isArray(category.values)) {
                    for (const value of category.values) {
                        const option = String(value).trim();
                        if (option && !uniqueOptions.has(option.toLowerCase())) {
                            uniqueOptions.set(option.toLowerCase(), option);
                        }
                    }
                }
                return Array.from(uniqueOptions.values());
            }
        }
        const uniqueOptions = new Map<string, string>();
        for (const value of field.options || []) {
            const option = String(value).trim();
            if (option && !uniqueOptions.has(option.toLowerCase())) {
                uniqueOptions.set(option.toLowerCase(), option);
            }
        }
        return Array.from(uniqueOptions.values());
    }

    function autoFillTargetLabel(field: FormField) {
        const roleLabels: Record<NonNullable<FormField["fleetAssetRole"]>, string> = {
            truck: "Truck",
            "trailer-a": "Trailer A",
            "trailer-b": "Trailer B",
        };
        return field.fleetAssetRole
            ? `${roleLabels[field.fleetAssetRole]} — ${field.label}`
            : field.label;
    }


    useEffect(() => {

        loadForm();
        loadTermsTemplates();
        loadJobTypes();
        loadStatuses();
        loadVehicleCategories();

    }, []);

    async function loadJobTypes() {
        const snapshot = await getDocs(
            collection(clientDb, "companies", COMPANY_ID, "jobTypes")
        );
        setJobTypes(
            snapshot.docs
                .map((jobTypeDoc) => ({ id: jobTypeDoc.id, ...jobTypeDoc.data() }))
                .filter((jobType: any) => jobType.active !== false)
                .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
        );
    }

    async function loadStatuses() {
        const snapshot = await getDocs(
            collection(clientDb, "companies", COMPANY_ID, "statuses")
        );
        setStatuses(
            snapshot.docs
                .map((statusDoc) => ({ id: statusDoc.id, ...statusDoc.data() }))
                .filter((status: any) => status.active !== false)
                .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
        );
    }

    async function loadVehicleCategories() {
        const snapshot = await getDocs(
            collection(clientDb, "companies", COMPANY_ID, "vehicleFieldCategories")
        );
        setVehicleCategories(
            snapshot.docs
                .map((categoryDoc) => ({ id: categoryDoc.id, ...categoryDoc.data() }))
                .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
        );
    }

    async function loadTermsTemplates() {
        try {
            const snapshot = await getDocs(
                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "termsTemplates"
                )
            );

            setTermsTemplates(
                snapshot.docs
                    .map((termsDoc) => ({
                        id: termsDoc.id,
                        ...termsDoc.data(),
                    } as TermsTemplate))
                    .filter((template) =>
                        template.active !== false &&
                        template.linkedFormId === formId
                    )
            );
        } catch (error) {
            console.error("Failed to load signature terms templates", error);
        }
    }

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

                const data = snap.data();

                setFormName(
                    data.name || "New Form Template"
                );

                setTemplateType(
                    data.templateType || ""
                );

                setAllowMultipleUse(
                    data.allowMultipleUse === true
                );

                setLinkedJobTypeIds(data.linkedJobTypeIds || []);
                setJobTypeSelectionMode(
                    data.jobTypeSelectionMode ||
                    ((data.linkedJobTypeIds || []).length > 1 ? "multiple" : "single")
                );
                setAutoAddStatusIds(data.autoAddStatusIds || []);

                setFields(
                    data.fields ||
                    data.formFields ||
                    data.layout?.fields ||
                    []
                );

            } else {

                setIsNewForm(true);
                setFields([]);

            }

        } catch (err) {

            console.error(err);
            setLoadError(
                "The saved form could not be loaded. Please return to the forms list and try again."
            );
        }

        setLoading(false);
    }

    async function saveForm() {

        if (linkedJobTypeIds.length === 0) {
            alert("Select at least one Job Type for this form.");
            return;
        }

        try {

            // Firestore rejects undefined values nested inside field objects.
            // New editor fields intentionally have optional properties, so
            // serialise them before saving to retain every defined edit.
            const cleanFields = JSON.parse(
                JSON.stringify(
                    fields.map((field) => ({
                        ...field,
                        ...(String(field.linkedType || "").startsWith("Vehicle Category:")
                            ? { options: resolvedFieldOptions(field) }
                            : {}),
                    }))
                )
            ) as FormField[];

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
                        formName.trim() ||
                        "New Form Template",

                    category:
                        templateType === "basic-tyre-jobform"
                            ? "Tyre"
                            : "Job Card",

                    active: true,

                    linkType:
                        "Job Card",

                    autoAttachToJob:
                        true,

                    allowMultipleUse,

                    linkedJobTypeIds,

                    jobTypeSelectionMode,

                    autoAddStatusIds,

                    linkedJobTypes:
                        [],

                    ...(templateType
                        ? { templateType }
                        : {}),

                    fields: cleanFields,

                    updatedAt:
                        serverTimestamp(),

                    ...(isNewForm
                        ? { createdAt: serverTimestamp() }
                        : {}),
                },
                {
                    merge: true,
                }
            );

            alert(
                "Form Saved"
            );

            setIsNewForm(false);

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
        type: FieldType,
        overrides: Partial<FormField> = {}
    ) {

        const field: FormField = {

            id: uuidv4(),

            type,

            label:
                type === "signature"
                    ? "Driver Name & Signature"
                    : type.toUpperCase(),

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
                                ? 300
                                : type === "info-text"
                                    ? 80
                                    : type === "info-image"
                                        ? 120
                                        : 28,

            fontSize: 11,

            showLabel: true,

            showBorder: true,

            required: false,

            bold: type === "title",

            labelWidth: 110,
            labelHeight: 28,

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

            ...overrides,
        };

        setFields(
            (prev) => [
                ...prev,
                field,
            ]
        );
    }

    function applyBasicJobCardTemplate() {

        if (
            fields.length > 0 &&
            !window.confirm(
                "Replace the current layout with the editable two-page Basic Job Form?"
            )
        ) {
            return;
        }

        const makeField = (
            type: FieldType,
            label: string,
            x: number,
            y: number,
            width: number,
            height: number,
            extra: Partial<FormField> = {}
        ): FormField => ({
            id: uuidv4(),
            type,
            label,
            x,
            y,
            width,
            height,
            fontSize: 11,

            showLabel: true,

            bold: type === "title",
            backgroundColor: "#ffffff",
            ...extra,
        });

        const linked = (
            label: string,
            linkedType: string,
            x: number,
            y: number,
            width: number,
            overrides: Partial<FormField> = {}
        ) => makeField(
            "linked-job-field",
            label,
            x,
            y,
            width,
            32,
            { linkedType, ...overrides }
        );

        const input = (
            label: string,
            x: number,
            y: number,
            width: number,
            overrides: Partial<FormField> = {}
        ) => makeField("text", label, x, y, width, 32, overrides);

        const section = (
            label: string,
            y: number,
            height: number
        ) => makeField("section", label, 57, y, 680, height);

        const pageTwo = 1155;

        const template: FormField[] = [
            makeField("image", "Company Logo", 57, 57, 120, 78),
            linked("Company Name", "Company Name", 188, 57, 340),
            linked("Phone", "Company Phone", 188, 94, 165),
            linked("Email", "Company Email", 363, 94, 165),
            linked("Address", "Company Address", 188, 131, 340),
            linked("Status", "Job Status", 544, 57, 193),
            linked("Date", "Job Date", 544, 94, 193),
            linked("Employee", "Technician Name", 544, 131, 193),
            makeField("title", "JOB CARD - {{jobNumber}}", 57, 174, 680, 34, {
                fontSize: 22,
            }),

            section("TRUCK DETAILS", 218, 150),
            linked("Vehicle Make", "Vehicle Make", 67, 258, 215, { fleetAssetRole: "truck", fleetProperty: "vehicleMake" }),
            linked("Vehicle Model", "Vehicle Model", 292, 258, 215, { fleetAssetRole: "truck", fleetProperty: "vehicleModel" }),
            input("Vehicle Type", 517, 258, 210, { fleetAssetRole: "truck", fleetProperty: "vehicleType" }),
            linked("Reg no.", "Vehicle Reg", 67, 300, 215, { fleetAssetRole: "truck", fleetProperty: "regNo" }),
            linked("Fleet No.", "Fleet Number", 292, 300, 215, { fleetAssetRole: "truck", fleetProperty: "fleetNo" }),
            linked("VIN / Chassis No.", "Vehicle VIN", 517, 300, 210, { fleetAssetRole: "truck", fleetProperty: "vinNumber" }),
            input("Odometer", 67, 337, 215),

            section("A - TRAILER DETAILS", 382, 112),
            input("Trailer Make", 67, 422, 215, { fleetAssetRole: "trailer-a", fleetProperty: "vehicleMake" }),
            input("Trailer Type", 292, 422, 215, { fleetAssetRole: "trailer-a", fleetProperty: "vehicleType" }),
            linked("Reg No.", "Trailer Reg", 517, 422, 210, { fleetAssetRole: "trailer-a", fleetProperty: "regNo" }),
            linked("Fleet No.", "Trailer Fleet Number", 67, 459, 215, { fleetAssetRole: "trailer-a", fleetProperty: "fleetNo" }),
            input("VIN / Chassis No.", 292, 459, 435, { fleetAssetRole: "trailer-a", fleetProperty: "vinNumber" }),

            section("B - TRAILER DETAILS", 508, 112),
            input("Trailer Make", 67, 548, 215, { fleetAssetRole: "trailer-b", fleetProperty: "vehicleMake" }),
            input("Trailer Type", 292, 548, 215, { fleetAssetRole: "trailer-b", fleetProperty: "vehicleType" }),
            linked("Reg No.", "Trailer Reg", 517, 548, 210, { fleetAssetRole: "trailer-b", fleetProperty: "regNo" }),
            linked("Fleet No.", "Trailer Fleet Number", 67, 585, 215, { fleetAssetRole: "trailer-b", fleetProperty: "fleetNo" }),
            input("VIN / Chassis No.", 292, 585, 435, { fleetAssetRole: "trailer-b", fleetProperty: "vinNumber" }),

            section("JOB INFORMATION & DESCRIPTIONS", 634, 404),
            input("Work & Repairs done on", 67, 674, 660),
            makeField(
                "table",
                "Wheel / Axle position",
                67,
                716,
                660,
                118,
                {
                    options: [
                        "Wheel Position",
                        "Side",
                        "Defect / Malfunction Assessment Findings",
                    ],
                }
            ),
            makeField(
                "textarea",
                "Repairs & Corrections — Detailed Description on the work carried out",
                67,
                844,
                660,
                112
            ),
            makeField(
                "textarea",
                "Additional Notes",
                67,
                966,
                460,
                62
            ),
            input("Trip sheet No.", 537, 966, 190),

            makeField("title", "JOB CARD - {{jobNumber}}", 57, 1054, 300, 24, {
                fontSize: 12,
            }),
            makeField("info-text", "Powered by FleetFix Pro · Version 52 · Page 1 of 2", 437, 1054, 300, 24),

            makeField("title", "ACKNOWLEDGEMENT OF COMPLETION AND ACCEPTANCE", 57, pageTwo + 57, 680, 34, {
                fontSize: 17,
            }),
            makeField(
                "info-text",
                "By signing below, the Customer & Driver (on behalf of the customer) confirms that:\n\n• All work described in the accompanying documentation has been completed to their satisfaction.\n• The Customer accepts the work performed and agrees to the stated terms of acceptance.",
                57,
                pageTwo + 105,
                680,
                150
            ),
            makeField("title", "Important Maintenance Notice – Suspension, Wheels, and/or Tyres", 57, pageTwo + 275, 680, 34, {
                fontSize: 15,
            }),
            makeField(
                "info-text",
                "The Customer acknowledges and agrees that it is their responsibility to:\n\n• Check and re-torque all suspension mounting bolts, nuts, U-bolts, and wheel nuts after the first 150 kilometres of operation.\n• Thereafter, check and re-torque these fasteners every 1,000 kilometres or at least once per month, in accordance with the manufacturer’s specified torque settings.\n\nFailure to perform these checks as recommended may result in component damage, personal injury, or voiding of applicable warranties.",
                57,
                pageTwo + 319,
                680,
                250
            ),
            makeField("signature", "Driver Full Name & Signature", 57, pageTwo + 596, 330, 150, {
                signatureType: "Driver Full Name & Signature",
            }),
            makeField("signature", "Customer Acceptance Signature", 407, pageTwo + 596, 330, 150, {
                signatureType: "Customer Acceptance Signature",
            }),
            makeField("textarea", "Customer / Driver Comments", 57, pageTwo + 770, 680, 190),
            makeField("title", "JOB CARD - {{jobNumber}}", 57, pageTwo + 1000, 300, 24, {
                fontSize: 12,
            }),
            makeField("info-text", "Powered by FleetFix Pro · Version 52 · Page 2 of 2", 437, pageTwo + 1000, 300, 24),
        ];

        setFields(template);
        setFormName("Basic Job Form");
        setTemplateType("basic-jobform");
        setSelectedField(null);
    }

    async function createTyreTemplate() {

        try {

            const templateFields: FormField[] = [

                /* TITLE */
                {
                    id: uuidv4(),
                    type: "title",
                    label: "TYRE - JOBCARD - {{jobNumber}}",
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
                    label: "JOB CARD - {{jobNumber}}",
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
                    name: "Basic Tyre Job Form",
                    category: "Tyre",
                    active: true,
                    linkType: "Job Card",
                    autoAttachToJob: true,
                    linkedJobTypes: [],
                    templateType: "basic-tyre-jobform",
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
                "Failed to create basic tyre job form"
            );
        }
    }

    function renderField(
        field: FormField
    ) {

        const showLabel = field.showLabel !== false;
        const showBorder = field.showBorder !== false;
        const fieldBorder = showBorder ? "1px solid black" : "none";
        const labelDivider = showBorder && showLabel ? "1px solid black" : "none";
        const fontSize = field.fontSize ?? 11;
        const inputFontSize = field.inputFontSize ?? fontSize;
        const fontWeight = field.bold ? 700 : 400;

        switch (
        field.type
        ) {

            case "section":

                return (

                    <div
                        style={{

                            width: "100%",

                            height: "100%",

                            border: fieldBorder,

                            pointerEvents: "auto",

                            display: "flex",

                            flexDirection: "column",

                            background: "#ffffff",
                        }}
                    >

                        <div
                            style={{
                                display: showLabel ? "flex" : "none",
                                height: 32,
                                background:
                                    "#ffffff",
                                borderBottom:
                                    "1px solid black",
                                alignItems:
                                    "center",
                                paddingLeft: 8,
                                fontWeight,
                                fontSize,
                            }}
                        >

                            {
                                showLabel ? field.label : ""
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
                                display: showLabel ? "block" : "none",
                                padding:
                                    "3px 6px",
                                height:
                                    field.labelHeight ??
                                    28,
                                flexShrink: 0,
                                borderBottom:
                                    "1px solid black",
                                background:
                                    "#ffffff",
                                fontWeight,
                                fontSize,
                            }}
                        >

                            {
                                showLabel ? field.label : ""
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
                        }}
                    >
                        <div style={{ width: "50%", display: "flex", flexDirection: "column", borderRight: "1px solid black" }}>
                            <div style={{ display: showLabel ? "flex" : "none", height: field.labelHeight ?? 28, alignItems: "center", padding: "3px 6px", borderBottom: "1px solid black", fontWeight, fontSize }}>
                                {showLabel ? field.label : ""}
                            </div>
                            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 10 }}>
                                Signature field
                            </div>
                            <div style={{ height: 32, borderTop: "1px solid black", padding: "7px 6px", fontSize: 10 }}>
                                Driver name &amp; surname
                            </div>
                        </div>
                        <div style={{ width: "50%", display: "flex", flexDirection: "column" }}>
                            <div style={{ height: field.labelHeight ?? 28, display: "flex", alignItems: "center", padding: "3px 6px", borderBottom: "1px solid black", fontWeight, fontSize }}>
                                Terms
                            </div>
                            <div style={{ flex: 1, padding: "6px", fontSize: 9, whiteSpace: "pre-wrap", overflow: "hidden" }}>
                                {field.linkedTermsText || "Select a signature terms template"}
                            </div>
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
                                "#ffffff",
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
                            fontSize,
                            fontWeight,
                        }}
                    >

                        {
                            (showLabel ? field.label : "").replace(
                                /\{\{jobNumber\}\}/gi,
                                "[Allocated Job Number]"
                            )
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
                            fontSize,
                            fontWeight,
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

                        {showLabel ? field.label : ""}

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
                            fontSize,
                            fontWeight,
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
                            border: "1px dashed #000000",
                            padding: 8,
                            fontSize,
                            fontWeight,
                            background: "#ffffff",
                        }}
                    >

                        {showLabel ? field.label : ""}

                    </div>
                );

            case "info-image":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border: "1px dashed #000000",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#ffffff",
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
                            fontSize,
                        }}
                    >

                        <div
                            style={{
                                width:
                                    showLabel
                                        ? field.labelWidth ?? 110
                                        : 0,
                                flexShrink: 0,
                                minWidth: 0,
                                overflow: "hidden",
                                borderRight: labelDivider,
                                background: "#ffffff",
                                padding: showLabel ? "2px 4px" : 0,
                                fontWeight,
                            }}
                        >

                            {showLabel ? `${field.label}:` : ""}

                        </div>

                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "0 6px",
                            }}
                        >

                            <span style={{ minWidth: 0, overflow: "hidden" }}>
                                Select Option
                            </span>

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
                            border: fieldBorder,
                            display: "flex",
                            fontSize,
                            background: "#ffffff",
                            fontFamily: "Arial",
                        }}
                    >

                        <div
                            style={{
                                width:
                                    showLabel
                                        ? field.labelWidth ?? 120
                                        : 0,
                                flexShrink: 0,
                                borderRight: labelDivider,
                                background: "#ffffff",
                                padding: showLabel ? "2px 6px" : 0,
                                fontWeight,
                                display: "flex",
                                alignItems: "center",
                            }}
                        >

                        {showLabel ? field.label : ""}

                        </div>

                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                                display: "flex",
                                alignItems: field.linkedType === "Company Address"
                                    ? "flex-start"
                                    : "center",
                                paddingLeft: 8,
                                paddingTop: field.linkedType === "Company Address" ? 3 : 0,
                                paddingRight: 4,
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.2,
                                overflow: "hidden",
                                color: "#000000",
                                fontWeight: 600,
                                fontSize: inputFontSize,
                            }}
                        >

                            {String(field.linkedType || "").startsWith("Vehicle Category:") || resolvedFieldOptions(field).length ? (
                                <>
                                    <span style={{ flex: 1 }}>Select {field.label}</span>
                                    <span>▼</span>
                                </>
                            ) : field.linkedType}

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
                                width:
                                    showLabel
                                        ? field.labelWidth ?? 110
                                        : 0,
                                flexShrink: 0,
                                borderRight: showLabel
                                    ? "1px solid black"
                                    : "none",
                                background: "#ffffff",
                                padding: showLabel ? "2px 4px" : 0,
                                fontWeight: "bold",
                            }}
                        >

                            {showLabel ? field.label : ""}

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
                            fontSize,
                            fontWeight,
                            background: "#fff",
                        }}
                    >

                        <tbody>

                            {Array.from({
                                length: 5,
                            }).map((_, row) => (

                                <tr key={row}>

                                    {(field.options?.length
                                        ? field.options
                                        : ["Header 1", "Header 2", "Header 3", "Header 4"]
                                    ).map((heading, col) => (

                                        <td
                                            key={col}
                                            style={{
                                                border:
                                                    "1px solid black",
                                                padding: 4,
                                            }}
                                        >

                                            {row === 0
                                                ? heading
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
                            fontSize,
                        }}
                    >

                        <div
                            style={{
                                width:
                                    showLabel
                                        ? field.labelWidth ?? 110
                                        : 0,
                                flexShrink: 0,
                                borderRight: showLabel
                                    ? "1px solid black"
                                    : "none",
                                background:
                                    "#ffffff",
                                padding: showLabel ? "2px 4px" : 0,
                                fontWeight,
                            }}
                        >

                            {
                                showLabel ? field.label : ""
                            }

                            {showLabel ? ":" : ""}

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

    if (loadError) {
        return (
            <div className="min-h-screen bg-slate-100 p-10">
                <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
                    <h1 className="text-xl font-bold text-red-700">
                        Unable to open form
                    </h1>
                    <p className="mt-3 text-sm text-slate-600">
                        {loadError}
                    </p>
                    <button
                        type="button"
                        onClick={() => router.push("/admin/jobforms")}
                        className="mt-6 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"
                    >
                        Back to Job Forms
                    </button>
                </div>
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
                        minHeight: 590,
                        flexShrink: 0,
                    }}
                >

                    <h2 className="font-bold text-lg mb-4">
                        Form Builder
                    </h2>

                    <label className="mb-1 text-xs font-bold text-gray-600">
                        FORM NAME
                    </label>

                    <input
                        value={formName}
                        onChange={(event) =>
                            setFormName(event.target.value)
                        }
                        className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Enter the form name"
                    />

                    <label className="mb-3 flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-700">
                        <input
                            type="checkbox"
                            checked={allowMultipleUse}
                            onChange={(event) => setAllowMultipleUse(event.target.checked)}
                        />
                        ALLOW MULTIPLE USES PER JOB
                    </label>

                    <label className="mb-1 text-xs font-bold text-gray-600">
                        JOB TYPE SELECTION
                    </label>
                    <div className="mb-2 grid grid-cols-2 overflow-hidden rounded-lg border border-blue-600">
                        {(["single", "multiple"] as const).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => {
                                    setJobTypeSelectionMode(mode);
                                    if (mode === "single") {
                                        setLinkedJobTypeIds((current) => current.slice(0, 1));
                                    }
                                }}
                                className={`px-2 py-2 text-xs font-bold ${jobTypeSelectionMode === mode ? "bg-blue-600 text-white" : "bg-white text-blue-700"}`}
                            >
                                {mode === "single" ? "Single Type" : "Multiple Types"}
                            </button>
                        ))}
                    </div>

                    {jobTypeSelectionMode === "single" ? (
                        <select
                            value={linkedJobTypeIds[0] || ""}
                            onChange={(event) => setLinkedJobTypeIds(event.target.value ? [event.target.value] : [])}
                            className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs"
                        >
                            <option value="">Select one Job Type</option>
                            {jobTypes.map((jobType) => (
                                <option key={jobType.id} value={jobType.id}>{jobType.name}</option>
                            ))}
                        </select>
                    ) : (
                        <div className="mb-3 max-h-28 space-y-1 overflow-y-auto rounded-lg border border-gray-300 p-2">
                            {jobTypes.map((jobType) => (
                                <label key={jobType.id} className="flex cursor-pointer items-start gap-2 rounded p-1 text-xs hover:bg-blue-50">
                                    <input
                                        type="checkbox"
                                        checked={linkedJobTypeIds.includes(jobType.id)}
                                        onChange={(event) => setLinkedJobTypeIds((current) =>
                                            event.target.checked
                                                ? [...current, jobType.id]
                                                : current.filter((id) => id !== jobType.id)
                                        )}
                                    />
                                    <span>{jobType.name}</span>
                                </label>
                            ))}
                        </div>
                    )}

                    <label className="mb-1 text-xs font-bold text-gray-600">
                        ADD FORM WHEN STATUS IS SELECTED
                    </label>
                    <select
                        multiple
                        value={autoAddStatusIds}
                        onChange={(event) => setAutoAddStatusIds(
                            Array.from(event.target.selectedOptions, (option) => option.value)
                        )}
                        className="mb-3 min-h-28 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs"
                    >
                        {statuses.map((status) => (
                            <option key={status.id} value={status.id}>
                                {status.name}
                            </option>
                        ))}
                    </select>

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
                                createBreakdownTemplate
                            }
                            className="w-full border border-blue-600 bg-blue-50 text-blue-700 p-2 rounded mb-2 text-left hover:bg-blue-100"
                        >
                            Basic Tyre Job Form
                        </button>

                        <button
                            onClick={
                                applyBasicJobCardTemplate
                            }
                            className="w-full border border-blue-600 bg-blue-50 text-blue-700 p-2 rounded text-left hover:bg-blue-100"
                        >
                            Basic Job Form
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

                        <SidebarButton
                            label="Linked Company Field"
                            onClick={() =>
                                addField("linked-job-field", {
                                    label: "Company Name",
                                    linkedType: "Company Name",
                                })
                            }
                        />

                        <SidebarButton
                            label="Linked Job Field"
                            onClick={() =>
                                addField("linked-job-field", {
                                    label: "Job Number",
                                    linkedType: "Job Number",
                                })
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

                        height: canvasHeight,

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
                    {Array.from({ length: pageCount - 1 }).map((_, page) => (
                        <div
                            key={`page-gap-${page}`}
                            style={{
                                position: "absolute",
                                top: page * JOB_FORM_PAGE_STRIDE + JOB_FORM_PAGE_HEIGHT,
                                left: 0,
                                width: "100%",
                                height: 32,
                                background: "#dfe3e8",
                                borderTop: "1px solid #94a3b8",
                                borderBottom: "1px solid #94a3b8",
                                zIndex: 50,
                                pointerEvents: "none",
                            }}
                        />
                    ))}
                    {/* RESTRICTED PRINT BORDER */}
                    {Array.from({ length: pageCount }).map((_, page) => (
                        <div
                            key={`print-border-${page}`}
                            style={{
                                position: "absolute",
                                top: page * JOB_FORM_PAGE_STRIDE + 57,
                                left: 57,
                                width: 680,
                                height: JOB_FORM_PAGE_HEIGHT - 114,
                                border: "1px dashed rgba(255,0,0,0.35)",
                                pointerEvents: "none",
                                zIndex: 1,
                            }}
                        />
                    ))}
                    {layoutFields.map(
                        (
                            field
                        ) => (

                            <Rnd
                                key={field.id}

                                disableDragging={field.id.includes("--generated-page-")}

                                enableResizing={!field.id.includes("--generated-page-")}

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
                                                    canvasHeight -
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
                                            ? "2px solid #000000"
                                            : "1px dashed transparent",

                                    boxShadow:
                                        selectedField?.id ===
                                            field.id
                                            ? "0 0 0 2px rgba(0,0,0,0.12)"
                                            : "none",
                                }}
                            >

                                <div
                                    className={field.showBorder === false ? "[&>*]:!border-transparent [&_*]:!border-transparent" : undefined}
                                    onMouseDown={(e) => {

                                        e.stopPropagation();

                                        if (field.id.includes("--generated-page-")) {
                                            const sourceId = field.id.split("--generated-page-")[0];
                                            const sourceField = fields.find((item) => item.id === sourceId);
                                            if (sourceField) {
                                                const pageFooter = String(field.label || "")
                                                    .toLowerCase()
                                                    .includes("powered by fleetfix")
                                                    ? "powered"
                                                    : "job-card";
                                                updateField(sourceField.id, { pageFooter });
                                                setSelectedField({ ...sourceField, pageFooter });
                                            }
                                        } else {
                                            setSelectedField(field);
                                        }
                                    }}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        position: "relative",
                                        cursor: "pointer",
                                    }}
                                >

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

                            <div className="mt-3 grid grid-cols-2 gap-2">

                                <label className="flex items-center gap-2 rounded border p-2 text-xs font-bold">
                                    <input
                                        type="checkbox"
                                        checked={selectedField.showLabel !== false}
                                        onChange={(event) => {
                                            const showLabel = event.target.checked;
                                            updateField(selectedField.id, { showLabel });
                                            setSelectedField({
                                                ...selectedField,
                                                showLabel,
                                            });
                                        }}
                                    />
                                    SHOW NAME
                                </label>

                                <label className="flex items-center gap-2 rounded border p-2 text-xs font-bold">
                                    <input
                                        type="checkbox"
                                        checked={selectedField.showBorder !== false}
                                        onChange={(event) => {
                                            const showBorder = event.target.checked;
                                            updateField(selectedField.id, { showBorder });
                                            setSelectedField({ ...selectedField, showBorder });
                                        }}
                                    />
                                    SHOW BORDER
                                </label>

                                <div>
                                    <label className="text-xs font-bold">
                                        TEXT SIZE
                                    </label>
                                    <input
                                        type="number"
                                        min={6}
                                        max={72}
                                        className="w-full border p-2"
                                        value={selectedField.fontSize ?? 11}
                                        onChange={(event) => {
                                            const fontSize = Math.min(
                                                72,
                                                Math.max(6, Number(event.target.value))
                                            );
                                            updateField(selectedField.id, { fontSize });
                                            setSelectedField({
                                                ...selectedField,
                                                fontSize,
                                            });
                                        }}
                                    />
                                </div>

                                <label className="flex items-center gap-2 rounded border p-2 text-xs font-bold">
                                    <input
                                        type="checkbox"
                                        checked={selectedField.bold === true}
                                        onChange={(event) => {
                                            const bold = event.target.checked;
                                            updateField(selectedField.id, { bold });
                                            setSelectedField({
                                                ...selectedField,
                                                bold,
                                            });
                                        }}
                                    />
                                    BOLD
                                </label>

                            </div>

                            {![
                                "section",
                                "title",
                                "info-text",
                                "info-image",
                                "image",
                            ].includes(selectedField.type) && (
                                <div className="mt-3 space-y-3">
                                    <label className="flex items-center gap-2 rounded border p-2 text-xs font-bold">
                                        <input
                                            type="checkbox"
                                            checked={selectedField.required === true}
                                            onChange={(event) => {
                                                const required = event.target.checked;
                                                updateField(selectedField.id, { required });
                                                setSelectedField({
                                                    ...selectedField,
                                                    required,
                                                });
                                            }}
                                        />
                                        REQUIRED — USER MUST COMPLETE
                                    </label>

                                    <label className="text-xs font-bold">
                                        FILLABLE TEXT SIZE
                                    </label>
                                    <input
                                        type="number"
                                        min={6}
                                        max={72}
                                        className="w-full border p-2"
                                        value={selectedField.inputFontSize ?? selectedField.fontSize ?? 11}
                                        onChange={(event) => {
                                            const inputFontSize = Math.min(
                                                72,
                                                Math.max(6, Number(event.target.value))
                                            );
                                            updateField(selectedField.id, { inputFontSize });
                                            setSelectedField({
                                                ...selectedField,
                                                inputFontSize,
                                            });
                                        }}
                                    />
                                </div>
                            )}

                            {![
                                "section",
                                "title",
                                "info-text",
                                "info-image",
                                "image",
                                "signature",
                                "table",
                            ].includes(selectedField.type) && (
                                <div className="mt-3">
                                    <label className="text-xs font-bold">
                                        FIELD INPUT TYPE
                                    </label>

                                    <select
                                        className="w-full border p-2"
                                        value={selectedField.type}
                                        onChange={(event) => {
                                            const type =
                                                event.target.value as FieldType;

                                            const updates: Partial<FormField> = {
                                                type,
                                                ...((
                                                    type === "select" ||
                                                    type === "multiselect"
                                                ) &&
                                                !selectedField.options?.length
                                                    ? {
                                                        options: [
                                                            "Option 1",
                                                        ],
                                                    }
                                                    : {}),
                                            };

                                            updateField(
                                                selectedField.id,
                                                updates
                                            );

                                            setSelectedField({
                                                ...selectedField,
                                                ...updates,
                                            });
                                        }}
                                    >
                                        {selectedField.type ===
                                            "linked-job-field" && (
                                            <option value="linked-job-field">
                                                Linked Job Field
                                            </option>
                                        )}
                                        <option value="text">
                                            Text
                                        </option>
                                        <option value="number">
                                            Number
                                        </option>
                                        <option value="textarea">
                                            Text Area
                                        </option>
                                        <option value="select">
                                            Select
                                        </option>
                                        <option value="multiselect">
                                            Multiple Select
                                        </option>
                                        <option value="checkbox">
                                            Checkbox
                                        </option>
                                        <option value="yesno">
                                            Yes or No
                                        </option>
                                        <option value="date">
                                            Date
                                        </option>
                                        <option value="datetime">
                                            Date and Time
                                        </option>
                                    </select>
                                </div>
                            )}

                            {![
                                "section",
                                "title",
                                "info-text",
                                "info-image",
                                "image",
                                "signature",
                                "table",
                                "textarea",
                            ].includes(selectedField.type) && (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs font-bold">
                                            FIELD NAME WIDTH
                                        </label>
                                        <input
                                            type="number"
                                            min={40}
                                            className="w-full border p-2"
                                            value={
                                                selectedField.labelWidth ??
                                                110
                                            }
                                            onChange={(event) => {
                                                const labelWidth =
                                                    Math.max(
                                                        40,
                                                        Number(
                                                            event.target.value
                                                        )
                                                    );
                                                const currentLabelWidth =
                                                    selectedField.labelWidth ??
                                                    110;
                                                const fillableWidth =
                                                    Math.max(
                                                        40,
                                                        selectedField.width -
                                                        currentLabelWidth
                                                    );
                                                const width =
                                                    labelWidth +
                                                    fillableWidth;

                                                updateField(
                                                    selectedField.id,
                                                    {
                                                        labelWidth,
                                                        width,
                                                    }
                                                );
                                                setSelectedField({
                                                    ...selectedField,
                                                    labelWidth,
                                                    width,
                                                });
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold">
                                            FILLABLE AREA WIDTH
                                        </label>
                                        <input
                                            type="number"
                                            min={40}
                                            className="w-full border p-2"
                                            value={Math.max(
                                                40,
                                                selectedField.width -
                                                (selectedField.labelWidth ??
                                                    110)
                                            )}
                                            onChange={(event) => {
                                                const fillableWidth =
                                                    Math.max(
                                                        40,
                                                        Number(
                                                            event.target.value
                                                        )
                                                    );
                                                const width =
                                                    (selectedField.labelWidth ??
                                                        110) +
                                                    fillableWidth;

                                                updateField(
                                                    selectedField.id,
                                                    { width }
                                                );
                                                setSelectedField({
                                                    ...selectedField,
                                                    width,
                                                });
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {[
                                "textarea",
                                "signature",
                            ].includes(selectedField.type) && (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs font-bold">
                                            FIELD NAME HEIGHT
                                        </label>
                                        <input
                                            type="number"
                                            min={20}
                                            className="w-full border p-2"
                                            value={
                                                selectedField.labelHeight ??
                                                28
                                            }
                                            onChange={(event) => {
                                                const oldLabelHeight =
                                                    selectedField.labelHeight ??
                                                    28;
                                                const fillableHeight =
                                                    Math.max(
                                                        40,
                                                        selectedField.height -
                                                        oldLabelHeight
                                                    );
                                                const labelHeight =
                                                    Math.max(
                                                        20,
                                                        Number(
                                                            event.target.value
                                                        )
                                                    );
                                                const height =
                                                    labelHeight +
                                                    fillableHeight;

                                                updateField(
                                                    selectedField.id,
                                                    {
                                                        labelHeight,
                                                        height,
                                                    }
                                                );
                                                setSelectedField({
                                                    ...selectedField,
                                                    labelHeight,
                                                    height,
                                                });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold">
                                            FILLABLE AREA HEIGHT
                                        </label>
                                        <input
                                            type="number"
                                            min={40}
                                            className="w-full border p-2"
                                            value={Math.max(
                                                40,
                                                selectedField.height -
                                                (selectedField.labelHeight ??
                                                    28)
                                            )}
                                            onChange={(event) => {
                                                const fillableHeight =
                                                    Math.max(
                                                        40,
                                                        Number(
                                                            event.target.value
                                                        )
                                                    );
                                                const height =
                                                    (selectedField.labelHeight ??
                                                        28) +
                                                    fillableHeight;

                                                updateField(
                                                    selectedField.id,
                                                    { height }
                                                );
                                                setSelectedField({
                                                    ...selectedField,
                                                    height,
                                                });
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {selectedField.type === "textarea" && (
                                <label className="mt-3 flex items-center gap-2 rounded border p-2 text-xs font-bold">
                                    <input
                                        type="checkbox"
                                        checked={selectedField.autoAdjustHeight === true}
                                        onChange={(event) => {
                                            const autoAdjustHeight = event.target.checked;
                                            updateField(selectedField.id, { autoAdjustHeight });
                                            setSelectedField({
                                                ...selectedField,
                                                autoAdjustHeight,
                                            });
                                        }}
                                    />
                                    AUTO ADJUST HEIGHT TO FIT TEXT
                                </label>
                            )}

                            {selectedField.type === "signature" && (
                                <div className="mt-3 space-y-2">
                                    <label className="text-xs font-bold">
                                        SIGNATURE &amp; TERMS TEMPLATE
                                    </label>

                                    {termsTemplates.length === 0 ? (
                                        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                                            No active terms templates are linked to this form. Add one under Admin / Terms first.
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {termsTemplates.map((template) => {
                                                const selected = selectedField.linkedTermsId === template.id;
                                                return (
                                                    <label
                                                        key={template.id}
                                                        className={`block cursor-pointer rounded border p-3 text-xs ${selected ? "border-blue-600 bg-blue-50" : "border-gray-300"}`}
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <input
                                                                type="radio"
                                                                name={`signature-template-${selectedField.id}`}
                                                                checked={selected}
                                                                onChange={() => {
                                                                    const updates = {
                                                                        linkedTermsId: template.id,
                                                                        linkedTermsText: template.termsText,
                                                                        signatureType: template.signatureType,
                                                                    };
                                                                    updateField(selectedField.id, updates);
                                                                    setSelectedField({
                                                                        ...selectedField,
                                                                        ...updates,
                                                                    });
                                                                }}
                                                            />
                                                            <div className="min-w-0">
                                                                <div className="font-bold">
                                                                    {template.name} ({template.signatureType})
                                                                </div>
                                                                <div className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-[9px] font-normal leading-tight text-gray-600">
                                                                    {template.termsText}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

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

                                                const vehicleCategory = vehicleCategories.find(
                                                    (category) => `Vehicle Category:${category.id}` === value
                                                );

                                                const updates = {
                                                    linkedType: value,
                                                    ...(vehicleCategory
                                                        ? {
                                                            label: vehicleCategory.name,
                                                            options: vehicleCategory.values || [],
                                                        }
                                                        : {}),
                                                };

                                                updateField(
                                                    selectedField.id,
                                                    updates
                                                );

                                                setSelectedField({
                                                    ...selectedField,
                                                    ...updates,
                                                });
                                            }}
                                        >

                                            <optgroup label="Company Fields">
                                                {companyLinkedFields.map((link) => (
                                                    <option key={link} value={link}>
                                                        {link}
                                                    </option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="Job Fields">
                                                {jobLinkedFields.map((link) => (
                                                    <option key={link} value={link}>
                                                        {link}
                                                    </option>
                                                ))}
                                            </optgroup>
                                            <optgroup label="Vehicle Makes, Models & Types">
                                                {vehicleCategories.map((category) => (
                                                    <option
                                                        key={category.id}
                                                        value={`Vehicle Category:${category.id}`}
                                                    >
                                                        {category.name} ({category.values?.length || 0} options)
                                                    </option>
                                                ))}
                                            </optgroup>

                                        </select>

                                    </div>

                                )

                            }

                            {
                                (
                                    selectedField.type ===
                                    "select" ||

                                    selectedField.type ===
                                    "multiselect" ||

                                    selectedField.type ===
                                    "table"
                                ) && (

                                    <div>

                                        <label className="text-xs font-bold">
                                            {selectedField.type === "table"
                                                ? "TABLE COLUMN HEADINGS"
                                                : "OPTIONS"}
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

                                                            const previousOption = newOptions[index];
                                                            newOptions[index] = e.target.value;
                                                            const autoFillRules = selectedField.autoFillRules?.map(
                                                                (rule) => rule.sourceValue === previousOption
                                                                    ? { ...rule, sourceValue: e.target.value }
                                                                    : rule
                                                            );

                                                            updateField(
                                                                selectedField.id,
                                                                {
                                                                    options:
                                                                        newOptions,
                                                                    autoFillRules,
                                                                }
                                                            );

                                                            setSelectedField({
                                                                ...selectedField,
                                                                options:
                                                                    newOptions,
                                                                autoFillRules,
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

                            {(selectedField.type === "select" ||
                                (selectedField.type === "linked-job-field" &&
                                    resolvedFieldOptions(selectedField).length > 0)) && (
                                <div className="rounded border border-blue-200 bg-blue-50 p-3">
                                    <label className="text-xs font-bold">
                                        OPTION-SPECIFIC AUTO-FILL
                                    </label>
                                    <p className="mt-1 text-[10px] text-gray-600">
                                        Choose which fields each individual option should fill with that option's value.
                                    </p>
                                    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                                        {resolvedFieldOptions(selectedField).map((option) => (
                                            <details key={option} className="rounded border bg-white">
                                                <summary className="cursor-pointer px-2 py-2 text-xs font-bold">
                                                    {option}
                                                    <span className="ml-1 font-normal text-gray-500">
                                                        ({selectedField.autoFillRules?.find((rule) => rule.sourceValue === option)?.targetFieldIds.length || 0} targets)
                                                    </span>
                                                </summary>
                                                <div className="space-y-1 border-t p-2">
                                                    {fields
                                                        .filter((field) =>
                                                            field.id !== selectedField.id && canReceiveAutoFill(field)
                                                        )
                                                        .map((field) => {
                                                            const rule = selectedField.autoFillRules?.find(
                                                                (item) => item.sourceValue === option
                                                            );
                                                            const checked = rule?.targetFieldIds.includes(field.id) === true;

                                                            return (
                                                                <label key={field.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-blue-50">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="mt-0.5"
                                                                        checked={checked}
                                                                        onChange={(event) => {
                                                                            const rules = [...(selectedField.autoFillRules || [])];
                                                                            const ruleIndex = rules.findIndex(
                                                                                (item) => item.sourceValue === option
                                                                            );
                                                                            const currentTargets = ruleIndex >= 0
                                                                                ? rules[ruleIndex].targetFieldIds
                                                                                : [];
                                                                            const targetFieldIds = event.target.checked
                                                                                ? Array.from(new Set([...currentTargets, field.id]))
                                                                                : currentTargets.filter((id) => id !== field.id);

                                                                            if (ruleIndex >= 0) {
                                                                                if (targetFieldIds.length) {
                                                                                    rules[ruleIndex] = { sourceValue: option, targetFieldIds };
                                                                                } else {
                                                                                    rules.splice(ruleIndex, 1);
                                                                                }
                                                                            } else if (targetFieldIds.length) {
                                                                                rules.push({ sourceValue: option, targetFieldIds });
                                                                            }

                                                                            updateField(selectedField.id, { autoFillRules: rules });
                                                                            setSelectedField({ ...selectedField, autoFillRules: rules });
                                                                        }}
                                                                    />
                                                                    <span className="font-semibold">{autoFillTargetLabel(field)}</span>
                                                                    <span className="text-[10px] text-gray-400">({field.type})</span>
                                                                </label>
                                                            );
                                                        })}
                                                </div>
                                            </details>
                                        ))}
                                        {fields.filter((field) => field.id !== selectedField.id && canReceiveAutoFill(field)).length === 0 && (
                                            <div className="text-[10px] text-gray-500">
                                                Add another fillable field to use as a target.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!selectedField.pageFooter && canReceiveAutoFill(selectedField) && (
                                <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
                                    <label className="text-xs font-bold">CUSTOMER FLEET MAPPING</label>
                                    <p className="mt-1 text-[10px] text-gray-600">
                                        Maps this form field to a truck or trailer record for prefill, lookup, and fleet updates.
                                    </p>
                                    <label className="mt-2 block text-[10px] font-bold">ASSET GROUP</label>
                                    <select
                                        className="w-full border bg-white p-2 text-xs"
                                        value={selectedField.fleetAssetRole || ""}
                                        onChange={(event) => {
                                            const fleetAssetRole = event.target.value as FormField["fleetAssetRole"] || undefined;
                                            const updates = { fleetAssetRole };
                                            updateField(selectedField.id, updates);
                                            setSelectedField({ ...selectedField, ...updates });
                                        }}
                                    >
                                        <option value="">Not linked to fleet</option>
                                        <option value="truck">Truck / Job Vehicle</option>
                                        <option value="trailer-a">Trailer A</option>
                                        <option value="trailer-b">Trailer B</option>
                                    </select>
                                    <label className="mt-2 block text-[10px] font-bold">FLEET DATA FIELD</label>
                                    <select
                                        className="w-full border bg-white p-2 text-xs"
                                        value={selectedField.fleetProperty || ""}
                                        onChange={(event) => {
                                            const fleetProperty = event.target.value as FormField["fleetProperty"] || undefined;
                                            const updates = { fleetProperty };
                                            updateField(selectedField.id, updates);
                                            setSelectedField({ ...selectedField, ...updates });
                                        }}
                                    >
                                        <option value="">Select fleet data field</option>
                                        <option value="vehicleMake">Make</option>
                                        <option value="vehicleModel">Model</option>
                                        <option value="vehicleType">Type</option>
                                        <option value="regNo">Registration number</option>
                                        <option value="fleetNo">Fleet number</option>
                                        <option value="vinNumber">VIN / Chassis number</option>
                                    </select>
                                </div>
                            )}
                            {!selectedField.pageFooter && (
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
                            )}

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
