"use client";

import { useEffect, useState, ChangeEvent } from "react";

import {
    Save,
    Building2,
    Mail,
    Phone,
    Globe,
    MapPin,
    Landmark,
    CreditCard,
    Image as ImageIcon,
} from "lucide-react";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
} from "firebase/firestore";

import {
    clientDb,
} from "@/lib/firebaseClient";

import {
    COMPANY_ID,
} from "@/lib/company";

interface CompanyDetails {

    companyName: string;
    registrationNumber: string;
    telephone: string;
    email: string;
    website: string;

    vatNumber: string;
    taxPercentage: string;
    currency: string;
    timezone: string;

    physicalAddress: string;

    bankName: string;
    branchCode: string;
    accountName: string;
    accountNumber: string;

    replyToName: string;
    replyToAddress: string;
    replyToEmployee: boolean;

    logo: string;
}

export default function CompanyDetailsPage() {

    const [loading, setLoading] =
        useState(true);

    const [saving, setSaving] =
        useState(false);

    const [logoPreview, setLogoPreview] =
        useState("");

    const [form, setForm] =
        useState<CompanyDetails>({
            companyName: "",
            registrationNumber: "",
            telephone: "",
            email: "",
            website: "",

            vatNumber: "",
            taxPercentage: "15",
            currency: "South African Rand",
            timezone: "South Africa Standard Time",

            physicalAddress: "",

            bankName: "",
            branchCode: "",
            accountName: "",
            accountNumber: "",

            replyToName: "",
            replyToAddress: "",
            replyToEmployee: false,

            logo: "",
        });

    useEffect(() => {

        loadCompany();

    }, []);

    async function loadCompany() {

        try {

            const ref =
                doc(
                    clientDb,
                    "companies",
                    COMPANY_ID
                );

            const snap =
                await getDoc(ref);

            if (snap.exists()) {

                const data =
                    snap.data();

                setForm({
                    companyName:
                        data.companyName || "",

                    registrationNumber:
                        data.registrationNumber || "",

                    telephone:
                        data.telephone || "",

                    email:
                        data.email || "",

                    website:
                        data.website || "",

                    vatNumber:
                        data.vatNumber || "",

                    taxPercentage:
                        data.taxPercentage || "15",

                    currency:
                        data.currency ||
                        "South African Rand",

                    timezone:
                        data.timezone ||
                        "South Africa Standard Time",

                    physicalAddress:
                        data.physicalAddress || "",

                    bankName:
                        data.bankName || "",

                    branchCode:
                        data.branchCode || "",

                    accountName:
                        data.accountName || "",

                    accountNumber:
                        data.accountNumber || "",

                    replyToName:
                        data.replyToName || "",

                    replyToAddress:
                        data.replyToAddress || "",

                    replyToEmployee:
                        data.replyToEmployee || false,

                    logo:
                        data.logo || "",
                });

                setLogoPreview(
                    data.logo || ""
                );
            }

        } catch (err) {

            console.error(err);
        }

        setLoading(false);
    }

    async function saveCompany() {

        try {

            setSaving(true);

            await setDoc(
                doc(
                    clientDb,
                    "companies",
                    COMPANY_ID
                ),
                {
                    ...form,

                    updatedAt:
                        serverTimestamp(),
                },
                {
                    merge: true,
                }
            );

            alert(
                "Company details saved"
            );

        } catch (err) {

            console.error(err);

            alert(
                "Failed to save company details"
            );

        } finally {

            setSaving(false);
        }
    }

    function updateField(
        key: keyof CompanyDetails,
        value: any
    ) {

        setForm((prev) => ({
            ...prev,
            [key]: value,
        }));
    }

    function handleLogoUpload(
        e: ChangeEvent<HTMLInputElement>
    ) {

        const file =
            e.target.files?.[0];

        if (!file) return;

        const reader =
            new FileReader();

        reader.onloadend = () => {

            const result =
                reader.result as string;

            setLogoPreview(result);

            updateField(
                "logo",
                result
            );
        };

        reader.readAsDataURL(file);
    }

    if (loading) {

        return (
            <div className="p-10">
                Loading...
            </div>
        );
    }

    return (

        <div className="min-h-screen bg-[#eef2f7]">

            {/* HEADER */}
            <div className="sticky top-0 z-50 bg-white border-b shadow-sm">

                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">

                    <div>

                        <h1 className="text-2xl font-bold text-gray-900">
                            Company Details
                        </h1>

                        <p className="text-sm text-gray-500 mt-1">
                            Manage company information, branding,
                            banking and communication settings.
                        </p>

                    </div>

                    <button
                        onClick={saveCompany}
                        disabled={saving}
                        className="
                            bg-blue-600
                            hover:bg-blue-700
                            text-white
                            px-6
                            py-3
                            rounded-xl
                            flex
                            items-center
                            gap-2
                            font-semibold
                            shadow-sm
                        "
                    >

                        <Save size={18} />

                        {saving
                            ? "Saving..."
                            : "Save Changes"}

                    </button>

                </div>

            </div>

            <div className="max-w-7xl mx-auto p-6 space-y-6">

                {/* COMPANY */}
                <div className="bg-white rounded-2xl shadow-sm border p-6">

                    <div className="flex items-center gap-2 mb-6">

                        <Building2 size={20} />

                        <h2 className="text-lg font-bold">
                            Company Information
                        </h2>

                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* LEFT */}
                        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">

                            <Input
                                label="Company Name *"
                                value={form.companyName}
                                onChange={(v) =>
                                    updateField(
                                        "companyName",
                                        v
                                    )
                                }
                            />

                            <Input
                                label="Registration Number"
                                value={form.registrationNumber}
                                onChange={(v) =>
                                    updateField(
                                        "registrationNumber",
                                        v
                                    )
                                }
                            />

                            <Input
                                label="Telephone"
                                value={form.telephone}
                                onChange={(v) =>
                                    updateField(
                                        "telephone",
                                        v
                                    )
                                }
                            />

                            <Input
                                label="Email Address"
                                value={form.email}
                                onChange={(v) =>
                                    updateField(
                                        "email",
                                        v
                                    )
                                }
                            />

                            <Input
                                label="Website"
                                value={form.website}
                                onChange={(v) =>
                                    updateField(
                                        "website",
                                        v
                                    )
                                }
                            />

                            <Input
                                label="VAT Number"
                                value={form.vatNumber}
                                onChange={(v) =>
                                    updateField(
                                        "vatNumber",
                                        v
                                    )
                                }
                            />

                            <Input
                                label="Tax Percentage"
                                value={form.taxPercentage}
                                onChange={(v) =>
                                    updateField(
                                        "taxPercentage",
                                        v
                                    )
                                }
                            />

                            <Input
                                label="Currency"
                                value={form.currency}
                                onChange={(v) =>
                                    updateField(
                                        "currency",
                                        v
                                    )
                                }
                            />

                        </div>

                        {/* LOGO */}
                        <div>

                            <div className="border-2 border-dashed rounded-2xl p-5 bg-gray-50 text-center">

                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    className="mb-4"
                                />

                                {logoPreview ? (

                                    <img
                                        src={logoPreview}
                                        alt="Logo"
                                        className="
                                            w-full
                                            h-64
                                            object-contain
                                            rounded-xl
                                            bg-white
                                            border
                                            p-4
                                        "
                                    />

                                ) : (

                                    <div className="h-64 flex flex-col items-center justify-center text-gray-400">

                                        <ImageIcon size={40} />

                                        <p className="mt-3">
                                            Upload Company Logo
                                        </p>

                                    </div>

                                )}

                            </div>

                        </div>

                    </div>

                </div>

                {/* ADDRESS */}
                <div className="bg-white rounded-2xl shadow-sm border p-6">

                    <div className="flex items-center gap-2 mb-6">

                        <MapPin size={20} />

                        <h2 className="text-lg font-bold">
                            Company Address
                        </h2>

                    </div>

                    <textarea
                        value={form.physicalAddress}
                        onChange={(e) =>
                            updateField(
                                "physicalAddress",
                                e.target.value
                            )
                        }
                        className="
                            w-full
                            border
                            rounded-xl
                            p-4
                            min-h-[140px]
                            outline-none
                            focus:ring-2
                            focus:ring-blue-500
                        "
                    />

                </div>

                {/* BANK */}
                <div className="bg-white rounded-2xl shadow-sm border p-6">

                    <div className="flex items-center gap-2 mb-6">

                        <Landmark size={20} />

                        <h2 className="text-lg font-bold">
                            Banking Details
                        </h2>

                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        <Input
                            label="Bank Name"
                            value={form.bankName}
                            onChange={(v) =>
                                updateField(
                                    "bankName",
                                    v
                                )
                            }
                        />

                        <Input
                            label="Branch Code"
                            value={form.branchCode}
                            onChange={(v) =>
                                updateField(
                                    "branchCode",
                                    v
                                )
                            }
                        />

                        <Input
                            label="Account Name"
                            value={form.accountName}
                            onChange={(v) =>
                                updateField(
                                    "accountName",
                                    v
                                )
                            }
                        />

                        <Input
                            label="Account Number"
                            value={form.accountNumber}
                            onChange={(v) =>
                                updateField(
                                    "accountNumber",
                                    v
                                )
                            }
                        />

                    </div>

                </div>

                {/* COMMUNICATION */}
                <div className="bg-white rounded-2xl shadow-sm border p-6">

                    <div className="flex items-center gap-2 mb-6">

                        <Mail size={20} />

                        <h2 className="text-lg font-bold">
                            Communication Settings
                        </h2>

                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        <Input
                            label="Reply To Name"
                            value={form.replyToName}
                            onChange={(v) =>
                                updateField(
                                    "replyToName",
                                    v
                                )
                            }
                        />

                        <Input
                            label="Reply To Address"
                            value={form.replyToAddress}
                            onChange={(v) =>
                                updateField(
                                    "replyToAddress",
                                    v
                                )
                            }
                        />

                    </div>

                    <label className="flex items-center gap-3 mt-5">

                        <input
                            type="checkbox"
                            checked={form.replyToEmployee}
                            onChange={(e) =>
                                updateField(
                                    "replyToEmployee",
                                    e.target.checked
                                )
                            }
                        />

                        <span className="text-sm">
                            Reply to employee email
                        </span>

                    </label>

                </div>

            </div>

        </div>
    );
}

function Input({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
}) {

    return (

        <div>

            <label className="block text-sm font-semibold mb-2 text-gray-700">

                {label}

            </label>

            <input
                value={value}
                onChange={(e) =>
                    onChange(
                        e.target.value
                    )
                }
                className="
                    w-full
                    border
                    rounded-xl
                    px-4
                    py-3
                    outline-none
                    focus:ring-2
                    focus:ring-blue-500
                    bg-white
                "
            />

        </div>
    );
}