"use client";

import {
    useState,
    useEffect,
} from "react";

import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";

import {
    ArrowLeft,
    Save,
    User2,
    Bell,
    Shield,
    CheckCircle2,
} from "lucide-react";

import {
    clientDb,
} from "@/lib/firebaseClient";

import {
    doc,
    setDoc,
    getDoc,
} from "firebase/firestore";

export default function EmployeeDetailsPage() {

    const router = useRouter();

    const [activeTab, setActiveTab] =
        useState<"details" | "permissions">(
            "details"
        );

    const [isActive, setIsActive] =
        useState(true);

    const [permissions, setPermissions] =
        useState<Record<string, boolean>>(
            {}
        );

    const togglePermission = (
        permission: string
    ) => {

        setPermissions((prev) => ({
            ...prev,
            [permission]:
                !prev[permission],
        }));

    };
    const saveUser = async () => {

        try {

            const ref = doc(
                clientDb,
                "users",
                String(params.id)
            );

            await setDoc(ref, {
                firstName,
                lastName,
                email,
                mobile,

                color:
                    userColor,

                active: isActive,

                permissions,
                primaryRole,

                updatedAt:
                    new Date(),

            }, {
                merge: true,
            });

            alert(
                "User saved successfully"
            );

        } catch (error) {

            console.error(error);

            alert(
                "Failed to save user"
            );

        }

    };

    const permissionSections = [
        {
            title: "General",
            items: [
                {
                    name: "Jobs",
                    sub: [
                        "Edit jobs",
                        "Archive jobs",
                        "Close jobs",
                    ],
                },
                {
                    name: "Customers",
                    sub: [
                        "Edit customer",
                    ],
                },
                {
                    name: "Queries",
                },
            ],
        },

        {
            title: "Financials",
            items: [
                {
                    name: "Quotes",
                    sub: [
                        "Approve quotes",
                    ],
                },
                {
                    name: "Invoices",
                    sub: [
                        "Approve invoices",
                    ],
                },
            ],
        },

        {
            title: "Administration",
            items: [
                {
                    name: "Super Admin",
                    sub: [
                        "Employees",
                        "Reports",
                    ],
                },
            ],
        },
    ];

    const params = useParams();

    const [loading, setLoading] =
        useState(true);

    const [firstName, setFirstName] =
        useState("");

    const [lastName, setLastName] =
        useState("");

    const [email, setEmail] =
        useState("");

    const [mobile, setMobile] =
        useState("");
    useEffect(() => {

        loadUser();

    }, []);

    const [userColor, setUserColor] =
        useState("#2563eb");

    const [primaryRole, setPrimaryRole] =
        useState("");

    const loadUser = async () => {

        try {

            const ref = doc(
                clientDb,
                "users",
                String(params.id)
            );

            const snap =
                await getDoc(ref);

            if (snap.exists()) {

                const data = snap.data();

                setFirstName(
                    data.firstName || ""
                );

                setLastName(
                    data.lastName || ""
                );

                setEmail(
                    data.email || ""
                );

                setMobile(
                    data.mobile || ""
                );

                setUserColor(
                    data.color ||
                    data.profileColor ||
                    "#2563eb"
                );

                setIsActive(
                    data.active !== false
                );

                setPermissions(
                    data.permissions || {}
                );
                setPrimaryRole(
                    data.primaryRole || ""
                );

            }

        } catch (error) {

            console.error(error);

        } finally {

            setLoading(false);

        }

    };


    if (loading) {

        return (

            <div
                className="
                flex
                min-h-screen
                items-center
                justify-center
                bg-[#f4f7fb]
            "
            >

                <div
                    className="
                    text-2xl
                    font-black
                    text-gray-700
                "
                >

                    Loading User...

                </div>

            </div>

        );

    }

    return (

        <div className="min-h-screen bg-[#f4f7fb] p-8">

            {/* HEADER */}
            <div className="mb-8 flex items-center justify-between">

                <div>

                    <div
                        className="
                            mb-2
                            text-xs
                            font-black
                            uppercase
                            tracking-[0.3em]
                            text-gray-400
                        "
                    >
                        Admin / Employees
                    </div>

                    <h1
                        className="
                            text-5xl
                            font-black
                            text-gray-900
                        "
                    >
                        Employee Details
                    </h1>

                </div>

                <div className="flex items-center gap-4">

                    {/* BACK */}
                    <button
                        onClick={() =>
                            router.push(
                                "/admin/users"
                            )
                        }
                        className="
                            flex
                            items-center
                            gap-2
                            rounded-2xl
                            border
                            border-gray-300
                            bg-white
                            px-6
                            py-4
                            font-black
                            text-gray-700
                        "
                    >

                        <ArrowLeft size={18} />

                        Back

                    </button>

                    {/* SAVE */}
                    <button
                        onClick={saveUser}

                        className="
                    flex
                    items-center
                    gap-2
                    rounded-2xl
                    bg-blue-600
                    px-8
                    py-4
                    font-black
                    text-white
                    shadow-lg
                    "
                    >

                        <Save size={18} />

                        Save

                    </button>

                    {/* ACTIVE */}
                    <button
                        onClick={() =>
                            setIsActive(
                                !isActive
                            )
                        }
                        className={`
                            rounded-2xl
                            px-6
                            py-4
                            font-black
                            transition-all
                            ${isActive
                                ? "bg-red-50 text-red-600"
                                : "bg-green-50 text-green-700"
                            }
                        `}
                    >

                        {isActive
                            ? "Deactivate User"
                            : "Reactivate User"}

                    </button>

                </div>

            </div>

            {/* PROFILE */}
            <div
                className="
                    mb-8
                    rounded-[32px]
                    border
                    border-gray-200
                    bg-white
                    p-8
                    shadow-sm
                "
            >

                <div className="flex items-center gap-8">

                    <div
                        className="
        flex
        h-28
        w-28
        items-center
        justify-center
        rounded-full
        text-4xl
        font-black
        text-white
        uppercase
        shadow
    "

                        style={{
                            backgroundColor:
                                userColor,
                        }}
                    >

                        {
                            `${firstName?.charAt(0) || ""}
         ${lastName?.charAt(0) || ""}`
                        }

                    </div>


                    {/* USER COLOUR PICKER */}
                    <div className="flex flex-col items-center gap-2">
                        <label
                            className="
                                text-xs
                                font-black
                                uppercase
                                text-gray-500
                            "
                        >
                            Colour
                        </label>

                        <input

                            type="color"

                            value={userColor}

                            onChange={(e) =>
                                setUserColor(
                                    e.target.value
                                )
                            }

                            className="
                                h-12
                                w-16
                                cursor-pointer
                                rounded-xl
                                border
                            "

                        />

                    </div>


                    <div>

                        <div
                            className="
                                text-4xl
                                font-black
                                text-gray-900
                            "
                        >

                            {firstName} {lastName}

                        </div>

                        <div className="mt-2 text-xl text-gray-500">

                            {primaryRole || "No Role Assigned"}

                        </div>

                        <div
                            className={`
                                mt-4
                                inline-flex
                                rounded-full
                                px-4
                                py-2
                                text-sm
                                font-black
                                ${isActive
                                    ? "bg-green-100 text-green-700"
                                    : "bg-red-100 text-red-700"
                                }
                            `}
                        >

                            {isActive
                                ? "Active User"
                                : "Inactive User"}

                        </div>

                    </div>

                </div>

            </div>

            {/* PRIMARY ROLE */}
            <div className="space-y-3">

                <label
                    className="
            text-sm
            font-black
            uppercase
            tracking-wide
            text-gray-700
        "
                >

                    Primary Role *

                </label>

                <select
                    value={primaryRole}
                    onChange={(e) =>
                        setPrimaryRole(
                            e.target.value
                        )
                    }
                    className="
            h-14
            w-full
            rounded-2xl
            border
            border-gray-300
            bg-white
            px-5
            text-base
            font-semibold
            text-gray-800
            outline-none
            transition-all
            focus:border-blue-500
            focus:ring-4
            focus:ring-blue-100
        "
                >

                    <option value="">
                        Select Role
                    </option>

                    <option value="Business Owner">
                        Business Owner
                    </option>

                    <option value="Administrator">
                        Administrator
                    </option>

                    <option value="Technician/Artisan/Tradesman">
                        Technician/Artisan/Tradesman
                    </option>

                    <option value="Accounts">
                        Accounts
                    </option>

                    <option value="Sales Rep">
                        Sales Rep
                    </option>

                    <option value="Driver">
                        Driver
                    </option>

                    <option value="Contractor">
                        Contractor
                    </option>

                    <option value="Other">
                        Other
                    </option>

                </select>

                <p className="text-sm text-gray-500">

                    Specify the employee's
                    primary role in the business.

                </p>

            </div>
            {/* TABS */}

            <div className="mb-8 flex gap-4">

                <button
                    onClick={() =>
                        setActiveTab(
                            "details"
                        )
                    }
                    className={`
                        rounded-2xl
                        px-8
                        py-4
                        text-lg
                        font-black
                        ${activeTab ===
                            "details"
                            ? "bg-blue-600 text-white"
                            : "border border-gray-300 bg-white text-gray-700"
                        }
                    `}
                >

                    Details

                </button>

                <button
                    onClick={() =>
                        setActiveTab(
                            "permissions"
                        )
                    }
                    className={`
                        rounded-2xl
                        px-8
                        py-4
                        text-lg
                        font-black
                        ${activeTab ===
                            "permissions"
                            ? "bg-blue-600 text-white"
                            : "border border-gray-300 bg-white text-gray-700"
                        }
                    `}
                >

                    Permissions

                </button>

            </div>

            {/* DETAILS TAB */}
            {
                activeTab === "details" && (

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

                        <div
                            className="
                            mb-6
                            flex
                            items-center
                            gap-3
                            text-2xl
                            font-black
                            text-gray-900
                        "
                        >

                            <User2 size={28} />

                            Employee Information

                        </div>

                        <div className="grid grid-cols-2 gap-6">

                            <input
                                placeholder="First Name"
                                value={firstName}
                                onChange={(e) =>
                                    setFirstName(
                                        e.target.value
                                    )
                                }
                                className="
                                h-14
                                rounded-2xl
                                border
                                border-gray-300
                                px-5
                            "
                            />

                            <input
                                placeholder="Last Name"
                                value={lastName}
                                onChange={(e) =>
                                    setLastName(
                                        e.target.value
                                    )
                                }
                                className="
                                h-14
                                rounded-2xl
                                border
                                border-gray-300
                                px-5
                            "
                            />

                            <input
                                placeholder="Email"
                                value={email}
                                onChange={(e) =>
                                    setEmail(
                                        e.target.value
                                    )
                                }
                                className="
                                h-14
                                rounded-2xl
                                border
                                border-gray-300
                                px-5
                            "
                            />

                            <input
                                placeholder="Mobile"
                                value={mobile}
                                onChange={(e) =>
                                    setMobile(
                                        e.target.value
                                    )
                                }

                                className="
                                h-14
                                rounded-2xl
                                border
                                border-gray-300
                                px-5
                            "
                            />

                            <select
                                value={primaryRole}
                                onChange={(e) =>
                                    setPrimaryRole(
                                        e.target.value
                                    )
                                }
                                className="
        h-14
        rounded-2xl
        border
        border-gray-300
        bg-white
        px-5
        font-bold
        text-gray-800
    "
                            >

                                <option value="">
                                    Select Role
                                </option>

                                <option value="Business Owner">
                                    Business Owner
                                </option>

                                <option value="Administrator">
                                    Administrator
                                </option>

                                <option value="Technician/Artisan/Tradesman">
                                    Technician/Artisan/Tradesman
                                </option>

                                <option value="Accounts">
                                    Accounts
                                </option>

                                <option value="Sales Rep">
                                    Sales Rep
                                </option>

                                <option value="Driver">
                                    Driver
                                </option>

                                <option value="Contractor">
                                    Contractor
                                </option>

                                <option value="Other">
                                    Other
                                </option>

                            </select>

                        </div>

                    </div>

                )
            }

            {/* PERMISSIONS TAB */}
            {
                activeTab === "permissions" && (

                    <div className="space-y-6">

                        {permissionSections.map(
                            (section) => (

                                <div
                                    key={
                                        section.title
                                    }
                                    className="
                                    rounded-[32px]
                                    border
                                    border-gray-200
                                    bg-white
                                    shadow-sm
                                "
                                >

                                    {/* HEADER */}
                                    <div
                                        className="
                                        flex
                                        items-center
                                        justify-between
                                        border-b
                                        border-gray-200
                                        px-8
                                        py-6
                                    "
                                    >

                                        <div>

                                            <div
                                                className="
                                                text-2xl
                                                font-black
                                                text-gray-900
                                            "
                                            >

                                                {
                                                    section.title
                                                }

                                            </div>

                                        </div>

                                        <button
                                            onClick={() => {

                                                const updated:
                                                    Record<
                                                        string,
                                                        boolean
                                                    > =
                                                    {};

                                                section.items.forEach(
                                                    (
                                                        item
                                                    ) => {

                                                        updated[
                                                            item.name
                                                        ] =
                                                            true;

                                                        item.sub?.forEach(
                                                            (
                                                                sub
                                                            ) => {

                                                                updated[
                                                                    sub
                                                                ] =
                                                                    true;

                                                            }
                                                        );

                                                    }
                                                );

                                                setPermissions(
                                                    (
                                                        prev
                                                    ) => ({
                                                        ...prev,
                                                        ...updated,
                                                    })
                                                );

                                            }}
                                            className="
                                            rounded-xl
                                            bg-blue-50
                                            px-5
                                            py-3
                                            text-sm
                                            font-black
                                            text-blue-700
                                        "
                                        >

                                            Enable All

                                        </button>

                                    </div>

                                    {/* BODY */}
                                    <div className="space-y-4 p-6">

                                        {section.items.map(
                                            (
                                                item
                                            ) => (

                                                <div
                                                    key={
                                                        item.name
                                                    }
                                                    className="
                                                    rounded-3xl
                                                    border
                                                    border-gray-200
                                                    bg-gray-50
                                                    p-6
                                                "
                                                >

                                                    {/* MAIN */}
                                                    <div
                                                        className="
                                                        mb-4
                                                        flex
                                                        items-center
                                                        justify-between
                                                    "
                                                    >

                                                        <div
                                                            className="
                                                            text-lg
                                                            font-black
                                                            text-gray-900
                                                        "
                                                        >

                                                            {
                                                                item.name
                                                            }

                                                        </div>

                                                        <input
                                                            type="checkbox"
                                                            checked={
                                                                permissions[
                                                                item.name
                                                                ] ||
                                                                false
                                                            }
                                                            onChange={() =>
                                                                togglePermission(
                                                                    item.name
                                                                )
                                                            }
                                                            className="h-6 w-6"
                                                        />

                                                    </div>

                                                    {/* SUB */}
                                                    {item.sub && (

                                                        <div
                                                            className="
                                                            grid
                                                            grid-cols-2
                                                            gap-4
                                                            border-t
                                                            border-gray-200
                                                            pt-4
                                                        "
                                                        >

                                                            {item.sub.map(
                                                                (
                                                                    sub
                                                                ) => (

                                                                    <div
                                                                        key={
                                                                            sub
                                                                        }
                                                                        className="
                                                                        flex
                                                                        items-center
                                                                        justify-between
                                                                        rounded-2xl
                                                                        border
                                                                        border-gray-200
                                                                        bg-white
                                                                        px-4
                                                                        py-4
                                                                    "
                                                                    >

                                                                        <div
                                                                            className="
                                                                            font-bold
                                                                            text-gray-800
                                                                        "
                                                                        >

                                                                            {
                                                                                sub
                                                                            }

                                                                        </div>

                                                                        <input
                                                                            type="checkbox"
                                                                            checked={
                                                                                permissions[
                                                                                sub
                                                                                ] ||
                                                                                false
                                                                            }
                                                                            onChange={() =>
                                                                                togglePermission(
                                                                                    sub
                                                                                )
                                                                            }
                                                                            className="h-5 w-5"
                                                                        />

                                                                    </div>

                                                                )
                                                            )}

                                                        </div>

                                                    )}

                                                </div>

                                            )
                                        )}

                                    </div>

                                </div>

                            )
                        )}

                    </div>

                )
            }

            {/* RIGHT SIDEBAR */}
            <div className="mt-8">

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

                    <div
                        className="
                            mb-6
                            flex
                            items-center
                            gap-3
                            text-2xl
                            font-black
                            text-gray-900
                        "
                    >

                        <Shield size={28} />

                        Security Status

                    </div>

                    <div className="space-y-4">

                        {[
                            "Login Access Enabled",
                            "Password Reset Available",
                            "Session Timeout Active",
                            "Two Factor Ready",
                        ].map((item) => (

                            <div
                                key={item}
                                className="
                                    flex
                                    items-center
                                    justify-between
                                    rounded-2xl
                                    border
                                    border-gray-200
                                    bg-gray-50
                                    px-5
                                    py-4
                                "
                            >

                                <div
                                    className="
                                        font-bold
                                        text-gray-700
                                    "
                                >

                                    {item}

                                </div>

                                <CheckCircle2
                                    size={20}
                                    className="text-green-600"
                                />

                            </div>

                        ))}

                    </div>

                </div>

            </div>

        </div >

    );
}