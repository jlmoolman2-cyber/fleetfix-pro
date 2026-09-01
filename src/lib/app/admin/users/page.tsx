"use client";

import {
    clientDb,
} from "@/lib/firebaseClient";

import {
    collection,
    onSnapshot,
    query,
    orderBy,
    doc,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";

import {
    useEffect,
    useState,
} from "react";
import { useRouter } from "next/navigation";

import {
    Users,
    UserPlus,
    Search,
    ShieldCheck,
    Mail,
    Smartphone,
    CheckCircle2,
    AlertCircle,
    Pencil,
    Filter,
    Columns3,
} from "lucide-react";

export default function AdminUsersPage() {

    const [includeInactive, setIncludeInactive] =
        useState(false);

    const [primaryRole, setPrimaryRole] =
        useState("");

    const router = useRouter();

    const [users, setUsers] =
        useState<any[]>([]);

    const [search, setSearch] =
        useState("");

    const [showFilters, setShowFilters] =
        useState(false);

    const [showColumns, setShowColumns] =
        useState(false);


    const [columns, setColumns] =
        useState<any>({

            name: true,
            username: true,
            email: true,
            mobile: true,
            alerts: true,
            updated: true,
            status: true,

        });

    const [loading, setLoading] =
        useState(true);

    useEffect(() => {

        const unsub =
            loadUsers();


        return () => unsub();


    }, []);

    const loadUsers = () => {


        const q = query(

            collection(
                clientDb,
                "users"
            ),

            orderBy(
                "name"
            )

        );


        const unsubscribe =
            onSnapshot(

                q,

                (snapshot) => {


                    const list =
                        snapshot.docs.map(doc => ({

                            id: doc.id,

                            ...doc.data(),

                        }));


                    setUsers(list);

                    setLoading(false);


                }

            );


        return unsubscribe;


    };

    async function toggleUser(
        user: any
    ) {


        await updateDoc(

            doc(
                clientDb,
                "users",
                user.id
            ),

            {

                active:
                    user.active === false
                        ? true
                        : false,


                updatedAt:
                    serverTimestamp(),

            }

        );


    }

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

                    Loading users...

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
                        Admin / Users
                    </div>

                    <h1
                        className="
                            text-5xl
                            font-black
                            text-gray-900
                        "
                    >
                        User Management
                    </h1>

                    <p className="mt-3 text-lg text-gray-500">

                        Manage workshop users,
                        permissions, communication
                        settings and access control.

                    </p>

                </div>

                <button

                    onClick={() =>

                        router.push(
                            "/admin/users/new"
                        )

                    }

                    className="
                        flex
                        items-center
                        gap-3
                        rounded-3xl
                        bg-blue-600
                        px-8
                        py-5
                        text-lg
                        font-black
                        text-white
                        shadow-lg
                        transition-all
                        hover:bg-blue-700
                    "
                >

                    <UserPlus size={22} />

                    Add User

                </button>

            </div>

            {/* STATS */}
            <div className="mb-8 grid grid-cols-4 gap-5">

                {[
                    {
                        title:
                            "Active Users",
                        value:
                            String(
                                users.filter(
                                    (u) =>
                                        u.active !== false
                                ).length
                            ),
                        icon:
                            Users,
                    },
                    {
                        title:
                            "Email Notifications",
                        value:
                            "Enabled",
                        icon:
                            Mail,
                    },
                    {
                        title:
                            "SMS Notifications",
                        value:
                            "Enabled",
                        icon:
                            Smartphone,
                    },
                    {
                        title:
                            "Security Access",
                        value:
                            "Protected",
                        icon:
                            ShieldCheck,
                    },
                ].map((item) => (

                    <div
                        key={item.title}
                        className="
                            rounded-3xl
                            border
                            border-gray-200
                            bg-white
                            p-6
                            shadow-sm
                            transition-all
                            hover:-translate-y-1
                            hover:shadow-lg
                        "
                    >

                        <div className="flex items-center gap-4">

                            <div
                                className="
                                    flex
                                    h-14
                                    w-14
                                    items-center
                                    justify-center
                                    rounded-2xl
                                    bg-blue-100
                                    text-blue-700
                                "
                            >

                                <item.icon size={28} />

                            </div>

                            <div>

                                <div
                                    className="
                                        text-sm
                                        font-bold
                                        uppercase
                                        tracking-wide
                                        text-gray-500
                                    "
                                >

                                    {item.title}

                                </div>

                                <div
                                    className="
                                        mt-1
                                        text-3xl
                                        font-black
                                        text-gray-900
                                    "
                                >

                                    {item.value}

                                </div>

                            </div>

                        </div>

                    </div>

                ))}

            </div>

            {/* USERS TABLE */}
            <div
                className="
                    overflow-hidden
                    rounded-[32px]
                    border
                    border-gray-200
                    bg-white
                    shadow-sm
                "
            >

                {/* TOP BAR */}
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

                    <div className="flex items-center gap-4">

                        {/* SEARCH */}
                        <div className="relative">

                            <Search
                                size={18}
                                className="
                                    absolute
                                    left-4
                                    top-1/2
                                    -translate-y-1/2
                                    text-gray-400
                                "
                            />

                            <input
                                type="text"
                                placeholder="Search users..."
                                className="
                                    h-14
                                    w-[340px]
                                    rounded-2xl
                                    border
                                    border-gray-300
                                    bg-gray-50
                                    pl-12
                                    pr-5
                                    text-base
                                "
                                value={search}

                                onChange={(e) =>
                                    setSearch(
                                        e.target.value
                                    )
                                }
                            />

                        </div>

                        {/* FILTER */}
                        <button

                            onClick={() =>
                                setShowFilters(
                                    !showFilters
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
                            px-5
                            py-4
                            font-bold
                            text-gray-700
                            "
                        >

                            <Filter size={18} />

                            Filter

                        </button>

                        {/* COLUMNS */}
                        <button

                            onClick={() =>
                                setShowColumns(
                                    !showColumns
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
                                px-5
                                py-4
                                font-bold
                                text-gray-700
                            "
                        >

                            <Columns3 size={18} />

                            Columns

                        </button>

                    </div>

                    <label
                        className="
                            flex
                            items-center
                            gap-3
                            rounded-2xl
                            bg-gray-50
                            px-5
                            py-4
                            text-sm
                            font-bold
                            text-gray-700
                        "
                    >

                        <input
                            type="checkbox"
                            checked={includeInactive}
                            onChange={(e) =>
                                setIncludeInactive(
                                    e.target.checked
                                )
                            }
                        />

                        Include disabled users

                    </label>

                </div>

                {/* TABLE */}
                <div className="overflow-x-auto">

                    <table className="w-full">

                        <thead
                            className="
                                border-b
                                border-gray-200
                                bg-gray-50
                            "
                        >

                            <tr>

                                {[
                                    "Name",
                                    "Username",
                                    "Email",
                                    "Mobile",
                                    "Email Alerts",
                                    "SMS Alerts",
                                    "Updated By",
                                    "Updated Date",
                                    "Status",
                                    "Action",
                                ].map((header) => (

                                    <th
                                        key={header}
                                        className="
                                            px-6
                                            py-5
                                            text-left
                                            text-xs
                                            font-black
                                            uppercase
                                            tracking-wide
                                            text-gray-500
                                        "
                                    >

                                        {header}

                                    </th>

                                ))}

                            </tr>

                        </thead>

                        <tbody>

                            {users

                                .filter(user =>

                                    [
                                        user.firstName,
                                        user.lastName,
                                        user.name,
                                        user.username,
                                        user.email,
                                        user.mobile,
                                        user.primaryRole,
                                        user.role
                                    ]

                                        .join(" ")
                                        .toLowerCase()
                                        .includes(
                                            search.toLowerCase()
                                        )

                                )

                                .filter((user) =>
                                    includeInactive
                                        ? true
                                        : user.active !== false
                                )
                                .map((user) => (


                                    <tr
                                        key={user.id}
                                        onClick={() =>
                                            router.push(
                                                `/admin/users/${user.id}`
                                            )
                                        }
                                        className="
        cursor-pointer
        border-b
        border-gray-100
        transition-all
        hover:bg-blue-50
    "
                                    >

                                        {/* NAME */}
                                        <td className="px-6 py-5">

                                            <div className="flex items-center gap-4">

                                                <div
                                                    className="
        flex
        h-11
        w-11
        items-center
        justify-center
        rounded-full
        text-sm
        font-black
        text-white
        uppercase
    "

                                                    style={{
                                                        backgroundColor:
                                                            user.color ||
                                                            user.profileColor ||
                                                            "#2563eb",
                                                    }}
                                                >

                                                    {
                                                        `${user.firstName?.charAt(0) || ""}
         ${user.lastName?.charAt(0) || ""}`
                                                    }

                                                </div>

                                                <div>

                                                    <div
                                                        className="
                                                            text-base
                                                            font-black
                                                            text-gray-900
                                                        "
                                                    >

                                                        {
                                                            (
                                                                `${user.firstName || ""}
         ${user.lastName || ""}`
                                                            ).trim()

                                                            ||

                                                            user.name
                                                        }

                                                    </div>

                                                    <div className="text-sm text-gray-500">

                                                        {
                                                            user.primaryRole ||
                                                            user.role ||
                                                            "-"
                                                        }

                                                    </div>

                                                </div>

                                            </div>

                                        </td>

                                        {/* USERNAME */}
                                        <td
                                            className="
                                                px-6
                                                py-5
                                                font-bold
                                                text-gray-700
                                            "
                                        >
                                            {user.username}

                                        </td>

                                        {/* EMAIL */}
                                        <td
                                            className="
                                                px-6
                                                py-5
                                                text-gray-600
                                            "
                                        >

                                            {user.email}
                                        </td>

                                        {/* MOBILE */}
                                        <td
                                            className="
                                                px-6
                                                py-5
                                                font-bold
                                                text-gray-700
                                            "
                                        >

                                            {user.mobile}

                                        </td>


                                        {/* EMAIL ALERT */}
                                        <td className="px-6 py-5">

                                            <CheckCircle2
                                                size={20}
                                                className="text-green-600"
                                            />

                                        </td>

                                        {/* SMS ALERT */}
                                        <td className="px-6 py-5">

                                            <CheckCircle2
                                                size={20}
                                                className="text-green-600"
                                            />

                                        </td>

                                        {/* UPDATED BY */}
                                        <td
                                            className="
                                                px-6
                                                py-5
                                                text-gray-600
                                            "
                                        >

                                            admin@fleetfix.co.za

                                        </td>

                                        {/* DATE */}
                                        <td
                                            className="
                                                px-6
                                                py-5
                                                text-gray-600
                                            "
                                        >

                                            {user.updatedAt
                                                ?.toDate()
                                                .toLocaleDateString()
                                                ||
                                                "-"}

                                        </td>

                                        {/* STATUS */}
                                        <td className="px-6 py-5">

                                            <button

                                                onClick={(e) => {

                                                    e.stopPropagation();

                                                    toggleUser(user);

                                                }}

                                                className={`
inline-flex
        items-center
        rounded-full
        px-4
        py-2
        text-sm
        font-black
        ${user.active !== false
                                                        ? "bg-green-100 text-green-700"
                                                        : "bg-red-100 text-red-700"
                                                    }
    `}
                                            >

                                                {user.active !== false
                                                    ? "Active"
                                                    : "Inactive"}

                                            </button>

                                        </td>

                                        {/* ACTION */}
                                        <td className="px-6 py-5">


                                            <button
                                                onClick={(e) => {

                                                    e.stopPropagation();

                                                    router.push(
                                                        `/admin/users/${user.id}`
                                                    );

                                                }}
                                                className="
        rounded-2xl
        bg-blue-100
        p-3
        text-blue-700
    "
                                            >

                                                <Pencil size={18} />

                                            </button>

                                        </td>

                                    </tr>

                                ))}

                        </tbody>

                    </table>

                </div>

                {/* FOOTER */}
                <div
                    className="
                        flex
                        items-center
                        justify-between
                        border-t
                        border-gray-200
                        bg-gray-50
                        px-8
                        py-5
                    "
                >

                    <div className="text-sm font-bold text-gray-500">

                        Showing {users.length} users

                    </div>

                    <div className="flex items-center gap-4">

                        <div className="text-sm font-bold text-gray-500">

                            Rows per page: 10

                        </div>

                        <div className="text-sm font-bold text-gray-500">

                            Page 1 of 1

                        </div>

                    </div>

                </div>

            </div>

            {/* INFO SECTION */}
            <div className="mt-6 grid grid-cols-2 gap-6">

                {/* STATUS */}
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

                    <div className="mb-6 flex items-center gap-4">

                        <div
                            className="
                                flex
                                h-14
                                w-14
                                items-center
                                justify-center
                                rounded-2xl
                                bg-green-100
                                text-green-700
                            "
                        >

                            <CheckCircle2 size={28} />

                        </div>

                        <div>

                            <div
                                className="
                                    text-2xl
                                    font-black
                                    text-gray-900
                                "
                            >
                                User System Status
                            </div>

                            <div className="text-gray-500">

                                User modules connected.

                            </div>

                        </div>

                    </div>

                    <div className="space-y-4">

                        {[
                            "User Authentication Enabled",
                            "SMS Notifications Enabled",
                            "Email Notifications Enabled",
                            "Permissions Active",
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

                                <div className="font-bold text-gray-700">

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

                {/* IMPORTANT */}
                <div
                    className="
                        rounded-[32px]
                        border
                        border-blue-200
                        bg-blue-50
                        p-8
                        shadow-sm
                    "
                >

                    <div className="mb-5 flex items-center gap-4">

                        <AlertCircle
                            size={28}
                            className="text-blue-600"
                        />

                        <div
                            className="
                                text-2xl
                                font-black
                                text-blue-900
                            "
                        >
                            Important
                        </div>

                    </div>

                    <ul
                        className="
                            space-y-4
                            text-sm
                            font-medium
                            text-blue-900
                        "
                    >

                        <li>
                            • Clicking a user row opens
                            the edit profile page.
                        </li>

                        <li>
                            • Users can be linked to
                            jobs, invoices and queries.
                        </li>

                        <li>
                            • Permissions affect system
                            visibility and access.
                        </li>

                        <li>
                            • Notification preferences
                            update in real-time.
                        </li>

                    </ul>

                </div>

            </div>

        </div >

    );
}