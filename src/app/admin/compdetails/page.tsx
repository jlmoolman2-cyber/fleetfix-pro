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
import {
    coordinatesFromGoogleMapsLink,
    googleMapsLinkFromCoordinates,
} from "@/lib/googleMapsCoordinates";

type CompanyBranch = {
    id: string;
    name: string;
    address: string;
    latitude: string;
    longitude: string;
    googleMapsLink: string;
};

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
    latitude: string;
    longitude: string;
    googleMapsLink: string;
    branches: CompanyBranch[];

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
            latitude: "",
            longitude: "",
            googleMapsLink: "",
            branches: [],

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

                    latitude:
                        data.latitude || "",

                    longitude:
                        data.longitude || "",

                    googleMapsLink:
                        data.googleMapsLink || data.googleMaps || "",

                    branches:
                        Array.isArray(data.branches) ? data.branches : [],

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

        setForm((prev) => {
            const updated = {
                ...prev,
                [key]: value,
            };

            if (key === "googleMapsLink") {
                const coordinates = coordinatesFromGoogleMapsLink(String(value));
                return coordinates
                    ? { ...updated, latitude: coordinates.latitude, longitude: coordinates.longitude }
                    : updated;
            }

            if (key === "latitude" || key === "longitude") {
                const googleMapsLink = googleMapsLinkFromCoordinates(
                    String(updated.latitude),
                    String(updated.longitude)
                );
                return googleMapsLink ? { ...updated, googleMapsLink } : updated;
            }

            return updated;
        });
    }

    function addBranch() {
        updateField("branches", [
            ...form.branches,
            { id: crypto.randomUUID(), name: "", address: "", latitude: "", longitude: "", googleMapsLink: "" },
        ]);
    }

    function updateBranch(id: string, key: keyof CompanyBranch, value: string) {
        updateField("branches", form.branches.map((branch) => {
            if (branch.id !== id) return branch;

            const updated = { ...branch, [key]: value };

            if (key === "googleMapsLink") {
                const coordinates = coordinatesFromGoogleMapsLink(value);
                return coordinates
                    ? { ...updated, latitude: coordinates.latitude, longitude: coordinates.longitude }
                    : updated;
            }

            if (key === "latitude" || key === "longitude") {
                const googleMapsLink = googleMapsLinkFromCoordinates(updated.latitude, updated.longitude);
                return googleMapsLink ? { ...updated, googleMapsLink } : updated;
            }

            return updated;
        }));
    }

    function removeBranch(id: string) {
        updateField("branches", form.branches.filter((branch) => branch.id !== id));
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
                            Primary Company Branch
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

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input
                            label="GPS Latitude"
                            value={form.latitude}
                            onChange={(value) => updateField("latitude", value)}
                        />
                        <Input
                            label="GPS Longitude"
                            value={form.longitude}
                            onChange={(value) => updateField("longitude", value)}
                        />
                        <div className="md:col-span-2">
                            <Input
                                label="Company Google Maps Link"
                                value={form.googleMapsLink}
                                onChange={(value) => updateField("googleMapsLink", value)}
                            />
                        </div>
                    </div>

                    <div className="mt-6 border-t pt-6">
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <div>
                                <h3 className="font-bold text-gray-900">Additional Branches</h3>
                                <p className="text-sm text-gray-500">EDT uses the branch closest to the breakdown location.</p>
                            </div>
                            <button type="button" onClick={addBranch} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
                                Add Branch
                            </button>
                        </div>

                        <div className="space-y-4">
                            {form.branches.map((branch, index) => (
                                <div key={branch.id} className="rounded-xl border bg-gray-50 p-4">
                                    <div className="mb-4 flex items-center justify-between">
                                        <strong>Branch {index + 2}</strong>
                                        <button type="button" onClick={() => removeBranch(branch.id)} className="text-sm font-bold text-red-600 hover:text-red-800">Remove</button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <Input label="Branch Name" value={branch.name} onChange={(value) => updateBranch(branch.id, "name", value)} />
                                        <Input label="Branch Address" value={branch.address} onChange={(value) => updateBranch(branch.id, "address", value)} />
                                        <Input label="GPS Latitude" value={branch.latitude} onChange={(value) => updateBranch(branch.id, "latitude", value)} />
                                        <Input label="GPS Longitude" value={branch.longitude} onChange={(value) => updateBranch(branch.id, "longitude", value)} />
                                        <div className="md:col-span-2">
                                            <Input label="Google Maps Link" value={branch.googleMapsLink} onChange={(value) => updateBranch(branch.id, "googleMapsLink", value)} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

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
