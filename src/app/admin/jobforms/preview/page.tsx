"use client";

import React, {
    useEffect,
    useState,
} from "react";

import {
    doc,
    getDoc,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import {
    buildJobFormLayoutFields,
    getJobFormCanvasHeight,
    getJobFormPageCount,
    JOB_FORM_PAGE_HEIGHT,
    JOB_FORM_PAGE_GAP,
    JOB_FORM_PAGE_STRIDE,
    moveJobFormFieldsPastFooters,
} from "@/lib/jobFormLayout";

export default function PreviewPage() {

    const [fields, setFields] =
        useState<any[]>([]);

    const [company, setCompany] =
        useState<any>({});

    const companyAddressHeights = Object.fromEntries(
        fields
            .filter((field) => field.linkedType === "Company Address")
            .map((field) => [
                field.id,
                Math.max(
                    field.height,
                    String(company.physicalAddress || "").split(/\r?\n/).length *
                        ((field.fontSize ?? 11) * 1.2) + 6
                ),
            ])
    );
    const sizedFields = fields.map((field) => ({
        ...field,
        height: companyAddressHeights[field.id] ?? field.height,
    }));
    const paginatedFields = moveJobFormFieldsPastFooters(sizedFields);
    const pageCount = getJobFormPageCount(paginatedFields);
    const layoutFields = buildJobFormLayoutFields(paginatedFields, pageCount);
    const canvasHeight = getJobFormCanvasHeight(pageCount);

    useEffect(() => {

        async function loadCompanyDetails() {

            try {

                const snapshot = await getDoc(
                    doc(
                        clientDb,
                        "companies",
                        COMPANY_ID
                    )
                );

                if (snapshot.exists()) {

                    setCompany(snapshot.data());
                }

            } catch (error) {

                console.error(
                    "Failed to load company details for job form preview",
                    error
                );
            }
        }

        loadCompanyDetails();

        const data =
            localStorage.getItem(
                "jobform-preview"
            );

        if (data) {

            setFields(
                JSON.parse(data)
            );
        }

        /* PRINT STYLES */
        const style =
            document.createElement(
                "style"
            );

        style.innerHTML = `

            @media print {

                body {
                    background: white !important;
                }

                button {
                    display: none !important;
                }

                @page {
                    size: A4;
                    margin: 1.3cm;
                }
            }
        `;

        document.head.appendChild(
            style
        );

        return () => {

            document.head.removeChild(
                style
            );
        };

    }, []);

    function getLinkedPreviewValue(
        linkedType: string
    ) {

        const companyValues: Record<string, string> = {
            "Company Name": company.companyName || "",
            "Company Phone": company.telephone || "",
            "Company Email": company.email || "",
            "Company Address": company.physicalAddress || "",
        };

        return companyValues[linkedType] ?? linkedType;
    }

    function renderField(
        field: any
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

            case "image":

                if (
                    field.label === "Company Logo" &&
                    company.logo
                ) {

                    return (
                        <img
                            src={company.logo}
                            alt={company.companyName || "Company logo"}
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                            }}
                        />
                    );
                }

                return (
                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border: "1px dashed #000000",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#000000",
                            fontSize: 11,
                            fontFamily: "Arial",
                        }}
                    >
                        {field.label || "Image"}
                    </div>
                );

            case "section":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border:
                                "1px solid black",
                            display:
                                "flex",
                            flexDirection:
                                "column",
                            background:
                                "#fff",
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
                                alignItems: "center",
                                paddingLeft: 8,
                                fontWeight,
                                fontSize,
                            }}
                        >

                            {showLabel ? field.label : ""}

                        </div>

                    </div>
                );

            case "textarea":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
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
                                borderBottom:
                                    "1px solid black",
                                background:
                                    "#ffffff",
                                fontWeight,
                                fontSize,
                            }}
                        >

                            {showLabel ? field.label : ""}

                        </div>

                    </div>
                );

            case "checkbox":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border:
                                "1px solid black",
                            display:
                                "flex",
                            alignItems:
                                "center",
                            paddingLeft: 6,
                            gap: 8,
                            fontSize,
                            fontWeight,
                            fontFamily:
                                "Arial",
                        }}
                    >

                        <div
                            style={{
                                width: 14,
                                height: 14,
                                border:
                                    "1px solid black",
                            }}
                        />

                        {showLabel ? field.label : ""}

                    </div>
                );

            case "linked-job-field":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border: fieldBorder,
                            display:
                                "flex",
                            fontSize,
                            background:
                                "#ffffff",
                            fontFamily:
                                "Arial",
                        }}
                    >

                        <div
                            style={{
                                width: showLabel ? field.labelWidth ?? 120 : 0,
                                flexShrink: 0,
                                borderRight: labelDivider,
                                background:
                                    "#ffffff",
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
                                display:
                                    "flex",
                                alignItems: field.linkedType === "Company Address"
                                    ? "flex-start"
                                    : "center",
                                paddingLeft: 8,
                                paddingTop: field.linkedType === "Company Address" ? 3 : 0,
                                paddingRight: 4,
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.2,
                                overflow: "hidden",
                                color:
                                    "#000000",
                                fontWeight:
                                    600,
                                fontSize: inputFontSize,
                            }}
                        >

                            {String(field.linkedType || "").startsWith("Vehicle Category:") || field.options?.length ? (
                                <>
                                    <span style={{ flex: 1 }}>Select {field.label}</span>
                                    <span>▼</span>
                                </>
                            ) : field.linkedType === "Company Logo" && company.logo ? (
                                <img
                                    src={company.logo}
                                    alt={company.companyName || "Company logo"}
                                    style={{
                                        maxWidth: "100%",
                                        maxHeight: "100%",
                                        objectFit: "contain",
                                    }}
                                />
                            ) : (
                                getLinkedPreviewValue(field.linkedType)
                            )}

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
                            border: fieldBorder,
                            display:
                                "flex",
                            fontSize,
                            fontFamily:
                                "Arial",
                        }}
                    >

                        <div
                            style={{
                                width: showLabel ? field.labelWidth ?? 110 : 0,
                                flexShrink: 0,
                                minWidth: 0,
                                overflow: "hidden",
                                borderRight: labelDivider,
                                background:
                                    "#ffffff",
                                padding: showLabel ? "2px 4px" : 0,
                                fontWeight,
                            }}
                        >

                            {showLabel ? field.label : ""}

                        </div>

                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: "hidden",
                                padding:
                                    "2px 6px",
                                display:
                                    "flex",
                                alignItems:
                                    "center",
                                justifyContent:
                                    "space-between",
                            }}
                        >

                            <span style={{ minWidth: 0, overflow: "hidden" }}>

                                Select

                            </span>

                            <span className="no-print">▼</span>

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
                            background:
                                "#fff",
                            fontFamily:
                                "Arial",
                        }}
                    >

                        <tbody>

                            {Array.from({
                                length: 5,
                            }).map(
                                (_, row) => (

                                    <tr key={row}>

                                        {(field.options?.length
                                            ? field.options
                                            : ["Header 1", "Header 2", "Header 3", "Header 4"]
                                        ).map(
                                            (
                                                heading: string,
                                                col: number
                                            ) => (

                                                <td
                                                    key={col}
                                                    style={{
                                                        border:
                                                            "1px solid black",
                                                        padding: 4,
                                                    }}
                                                >

                                                    {row ===
                                                        0
                                                        ? heading
                                                        : ""}

                                                </td>
                                            )
                                        )}

                                    </tr>
                                )
                            )}

                        </tbody>

                    </table>
                );

            case "title":

                return (
                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            fontSize,
                            fontWeight,
                            fontFamily: "Arial",
                        }}
                    >
                        {String(showLabel ? field.label : "").replace(
                            /\{\{jobNumber\}\}/gi,
                            "[Allocated Job Number]"
                        )}
                    </div>
                );

            case "info-text":

                return (
                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            padding: 8,
                            fontSize,
                            fontWeight,
                            whiteSpace: "pre-wrap",
                            fontFamily: "Arial",
                            boxSizing: "border-box",
                        }}
                    >
                        {showLabel ? field.label : ""}
                    </div>
                );

            case "signature":

                return (
                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border: "1px solid black",
                            display: "flex",
                            fontFamily: "Arial",
                        }}
                    >
                        <div style={{ width: "50%", display: "flex", flexDirection: "column", borderRight: "1px solid black" }}>
                            <div style={{ display: showLabel ? "flex" : "none", height: field.labelHeight ?? 28, alignItems: "center", padding: "4px 6px", borderBottom: "1px solid black", fontWeight, fontSize }}>
                                {showLabel ? field.label : ""}
                            </div>
                            <div style={{ flex: 1 }} />
                            <div style={{ height: 32, borderTop: "1px solid black", padding: "7px 6px", fontSize: 10 }}>
                                Driver name &amp; surname
                            </div>
                        </div>
                        <div style={{ width: "50%", display: "flex", flexDirection: "column" }}>
                            <div style={{ height: field.labelHeight ?? 28, display: "flex", alignItems: "center", padding: "4px 6px", borderBottom: "1px solid black", fontWeight, fontSize }}>
                                Terms
                            </div>
                            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "6px", whiteSpace: "pre-wrap", fontSize: 9, lineHeight: 1.2 }}>
                                {field.linkedTermsText || "No signature terms template selected"}
                            </div>
                        </div>
                    </div>
                );

            default:

                return (

                    <div
                        style={{
                            width:
                                "100%",
                            height:
                                "100%",
                            border: fieldBorder,
                            display:
                                "flex",
                            fontSize,
                            fontFamily:
                                "Arial",
                        }}
                    >

                        <div
                            style={{
                                width: showLabel ? field.labelWidth ?? 110 : 0,
                                flexShrink: 0,
                                borderRight: labelDivider,
                                background:
                                    "#ffffff",
                                padding: showLabel ? "2px 4px" : 0,
                                fontWeight,
                            }}
                        >

                        {showLabel ? field.label : ""}

                        </div>

                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                            }}
                        />

                    </div>
                );
        }
    }

    return (

        <div
            style={{
                background:
                    "#d1d5db",
                minHeight:
                    "100vh",
                padding: 40,
            }}
        >

            {/* TOP BAR */}
            <div
                className="no-print"
                style={{
                    width: 794,
                    margin:
                        "0 auto 20px auto",
                    display:
                        "flex",
                    justifyContent:
                        "flex-end",
                    gap: 10,
                }}
            >

                <button
                    onClick={() => {

                        const sourcePage = document.getElementById("pdf-page");
                        const printablePage = sourcePage?.cloneNode(true) as HTMLElement | undefined;

                        printablePage?.querySelectorAll(".no-print").forEach(
                            (element) => element.remove()
                        );
                        printablePage?.querySelectorAll<HTMLElement>(":scope > div").forEach(
                            (element) => {
                                const top = Number.parseFloat(element.style.top);
                                if (!Number.isFinite(top)) return;
                                const page = Math.floor(top / JOB_FORM_PAGE_STRIDE);
                                element.style.top = `${top - page * JOB_FORM_PAGE_GAP}px`;
                            }
                        );

                        const printContents = printablePage?.innerHTML;

                        const win =
                            window.open(
                                "",
                                "",
                                "width=900,height=1200"
                            );

                        if (
                            !win ||
                            !printContents
                        ) {
                            return;
                        }

                        win.document.write(`

                        <html>

                        <head>

                            <title>
                                PDF Preview
                            </title>

                            <style>

                                *, *::before, *::after {

                                    box-sizing: border-box;
                                }

                                body {

                                    margin: 0;

                                    padding: 0;

                                    background: white;

                                    font-family: Arial;
                                }

                                .no-print {

                                    display: none !important;
                                }

                                select {

                                    appearance: none;

                                    -webkit-appearance: none;

                                    background-image: none !important;
                                }

                                .page {

                                    width: 794px;

                                    height: ${pageCount * 1122}px;

                                    margin: 0 auto;

                                    background: white;

                                    position: relative;

                                    box-sizing: border-box;

                                    padding:
                                        1.3cm;
                                }

                                @page {

                                    size: A4;

                                    margin: 0;
                                }

                            </style>

                        </head>

                        <body>

                            <div class="page">

                                ${printContents}

                            </div>

                        </body>

                        </html>
                    `);

                        win.document.close();

                        win.focus();

                        setTimeout(() => {

                            win.print();

                        }, 500);
                    }}
                    style={{
                        background:
                            "#111827",
                        color:
                            "white",
                        border:
                            "none",
                        padding:
                            "10px 18px",
                        borderRadius: 6,
                        cursor:
                            "pointer",
                        fontWeight: 600,
                    }}
                >

                    Download PDF

                </button>

            </div>

            {/* A4 PAGE */}
            <div
                id="pdf-page"
                style={{

                    width: 794,

                    height: canvasHeight,

                    background:
                        "white",

                    margin:
                        "0 auto",

                    position:
                        "relative",

                    boxShadow:
                        "0 10px 30px rgba(0,0,0,0.15)",

                    paddingTop:
                        "1.5cm",

                    paddingBottom:
                        "1.5cm",

                    paddingLeft:
                        "1.5cm",

                    paddingRight:
                        "1.5cm",

                    boxSizing:
                        "border-box",
                }}
            >

                {Array.from({ length: pageCount - 1 }).map((_, page) => (
                    <div
                        key={`page-gap-${page}`}
                        className="no-print"
                        style={{
                            position: "absolute",
                            top: page * JOB_FORM_PAGE_STRIDE + JOB_FORM_PAGE_HEIGHT,
                            left: 0,
                            width: "100%",
                            height: 32,
                            background: "#d1d5db",
                        }}
                    />
                ))}

                {layoutFields.map(
                    (field) => (

                        <div
                            key={field.id}
                            className={field.showBorder === false ? "[&>*]:!border-transparent [&_*]:!border-transparent" : undefined}
                            style={{

                                position:
                                    "absolute",

                                left:
                                    field.x,

                                top:
                                    field.y,

                                width:
                                    field.width,

                                height:
                                    companyAddressHeights[field.id] ?? field.height,
                            }}
                        >

                            {renderField(
                                field
                            )}

                        </div>
                    )
                )}

            </div>

        </div>
    );
}
