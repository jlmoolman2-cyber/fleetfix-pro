"use client";

import React, {
    useEffect,
    useState,
} from "react";

export default function PreviewPage() {

    const [fields, setFields] =
        useState<any[]>([]);

    useEffect(() => {

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

    function renderField(
        field: any
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

                            {field.label}

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

                            {field.label}

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
                            fontSize: 11,
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

                        {field.label}

                    </div>
                );

            case "linked-job-field":

                return (

                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            border:
                                "1px solid #2563eb",
                            display:
                                "flex",
                            fontSize: 11,
                            background:
                                "#eff6ff",
                            fontFamily:
                                "Arial",
                        }}
                    >

                        <div
                            style={{
                                width: 120,
                                borderRight:
                                    "1px solid #2563eb",
                                background:
                                    "#dbeafe",
                                padding:
                                    "2px 6px",
                                fontWeight:
                                    "bold",
                            }}
                        >

                            {field.label}

                        </div>

                        <div
                            style={{
                                flex: 1,
                                display:
                                    "flex",
                                alignItems:
                                    "center",
                                paddingLeft: 8,
                                color:
                                    "#1d4ed8",
                                fontWeight:
                                    600,
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
                            border:
                                "1px solid black",
                            display:
                                "flex",
                            fontSize: 11,
                            fontFamily:
                                "Arial",
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

                            {field.label}

                        </div>

                        <div
                            style={{
                                flex: 1,
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

                                        {Array.from({
                                            length: 4,
                                        }).map(
                                            (
                                                _,
                                                col
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
                                                        ? `Header ${col + 1}`
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
                            fontFamily:
                                "Arial",
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

                            {field.label}

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

                        const printContents =
                            document.getElementById(
                                "pdf-page"
                            )?.innerHTML;

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

                                body {

                                    margin: 0;

                                    padding: 0;

                                    background: white;

                                    font-family: Arial;
                                }

                                .page {

                                    width: 794px;

                                    min-height: 1123px;

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

                    minHeight: 1123,

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

                {fields.map(
                    (field) => (

                        <div
                            key={field.id}
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
                                    field.height,
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