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
    clientAuth,
    clientDb,
} from "@/lib/firebaseClient";

import {
    collection,
    doc,
    setDoc,
    getDoc,
} from "firebase/firestore";
import { ALL_PERMISSIONS, PERMISSION_SECTIONS, PRIMARY_ROLES, permissionsForRole } from "@/lib/permissions";
import { COMPANY_ID } from "@/lib/company";
import UserAvatar from "@/components/shared/UserAvatar";
import { defaultNotificationPreferences, NOTIFICATION_PREFERENCE_OPTIONS } from "@/lib/notificationPreferences";

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

    const [notificationPreferences, setNotificationPreferences] = useState(defaultNotificationPreferences);
    const [canManageAccess, setCanManageAccess] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [changingPassword, setChangingPassword] = useState(false);

    const togglePermission = (
        permission: string
    ) => {

        setPermissions((prev) => ({
            ...prev,
            [permission]:
                !prev[permission],
        }));

    };

    const togglePermissionGroup = (name: string, sub: string[] = []) => {
        setPermissions((previous) => {
            const enabled = !previous[name];
            return { ...previous, [name]: enabled, ...Object.fromEntries(sub.map((permission) => [permission, enabled])) };
        });
    };
    const saveUser = async () => {

        try {

            const creating = String(params.id) === "new";
            const ref = creating
                ? doc(collection(clientDb, "users"))
                : doc(clientDb, "users", String(params.id));

            const normalizedPermissions = Object.fromEntries(ALL_PERMISSIONS.map((permission) => [permission, permissions[permission] === true]));
            const values = {
                firstName,
                lastName,
                email,
                mobile,

                color:
                    userColor,

                active: isActive,

                ...(canManageAccess ? { permissions: normalizedPermissions, notificationPreferences, primaryRole } : {}),

                updatedAt:
                    new Date(),

            };
            await setDoc(ref, values, {
                merge: true,
            });
            await setDoc(doc(clientDb, "companies", COMPANY_ID, "users", ref.id), values, { merge: true });

            alert(
                "User saved successfully"
            );

            if (creating) {
                router.replace(`/admin/users/${ref.id}`);
            }

        } catch (error) {

            console.error(error);

            alert(
                "Failed to save user"
            );

        }

    };

    const permissionSections = PERMISSION_SECTIONS;

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

    useEffect(() => {
        const currentUserId = clientAuth.currentUser?.uid;
        if (!currentUserId) return;
        void getDoc(doc(clientDb, "companies", COMPANY_ID, "users", currentUserId)).then((snapshot) => {
            const data = snapshot.exists() ? snapshot.data() : {};
            const role = String(data.primaryRole || data.role || "").trim().toLowerCase();
            setCanManageAccess(data.active !== false && (role === "business owner" || role === "administrator"));
        });
    }, []);

    async function changeUserPassword() {
        if (String(params.id) === "new") return alert("Save the employee before setting a password.");
        if (!canManageAccess) return alert("Only a Business Owner or Administrator may change passwords.");
        if (newPassword.length < 8) return alert("Use a password of at least 8 characters.");
        if (newPassword !== confirmPassword) return alert("The passwords do not match.");
        try {
            setChangingPassword(true);
            const token = await clientAuth.currentUser?.getIdToken();
            const response = await fetch("/api/admin/users/password", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
                body: JSON.stringify({ userId: String(params.id), password: newPassword }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Unable to change password.");
            setNewPassword("");
            setConfirmPassword("");
            alert("User password changed successfully.");
        } catch (error) {
            alert(error instanceof Error ? error.message : "Unable to change password.");
        } finally {
            setChangingPassword(false);
        }
    }

    const [userColor, setUserColor] =
        useState("#2563eb");

    const [primaryRole, setPrimaryRole] =
        useState("");

    const changePrimaryRole = (role: string) => {
        setPrimaryRole(role);
        setPermissions(permissionsForRole(role));
    };

    const loadUser = async () => {

        try {

            if (String(params.id) === "new") {
                setLoading(false);
                return;
            }

            const companySnap = await getDoc(doc(clientDb, "companies", COMPANY_ID, "users", String(params.id)));
            const snap = companySnap.exists() ? companySnap : await getDoc(doc(clientDb, "users", String(params.id)));

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
                setNotificationPreferences({ ...defaultNotificationPreferences(), ...(data.notificationPreferences || {}) });
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

                    <UserAvatar user={{ firstName, lastName, userColor }} size="lg" className="h-28 w-28 rounded-2xl text-4xl" />


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
                    onChange={(e) => changePrimaryRole(e.target.value)}
                    disabled={!canManageAccess}
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
                    {PRIMARY_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}

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
                    disabled={!canManageAccess}
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
                                onChange={(e) => changePrimaryRole(e.target.value)}
                                disabled={!canManageAccess}
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
                                {PRIMARY_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}

                            </select>

                        </div>

                    </div>

                )
            }

            {/* PERMISSIONS TAB */}
            {
                activeTab === "permissions" && canManageAccess && (

                    <div className="space-y-6">

                        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-blue-200 bg-blue-50 p-6">
                            <div>
                                <div className="text-lg font-black text-blue-950">Primary Role Permissions</div>
                                <div className="mt-1 text-sm text-blue-700">Apply the recommended permissions for {primaryRole || "the selected role"}, then select or deselect individual permissions below.</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={!primaryRole} onClick={() => setPermissions(permissionsForRole(primaryRole))} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-40">Apply Role Defaults</button>
                                <button type="button" onClick={() => setPermissions(Object.fromEntries(ALL_PERMISSIONS.map((permission) => [permission, true])))} className="rounded-xl border border-blue-300 bg-white px-5 py-3 text-sm font-black text-blue-700">Enable All</button>
                                <button type="button" onClick={() => setPermissions(Object.fromEntries(ALL_PERMISSIONS.map((permission) => [permission, false])))} className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-700">Clear All</button>
                            </div>
                        </div>

                        {permissionSections.map(
                            (section) => (

                                <div
                                    key={
                                        section.title
                                    }
                                    className="
                                    rounded-3xl
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
                                        px-6
                                        py-4
                                    "
                                    >

                                        <div>

                                            <div
                                                className="
                                                text-xl
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
                                            px-4
                                            py-2
                                            text-sm
                                            font-black
                                            text-blue-700
                                        "
                                        >

                                            Enable All

                                        </button>

                                    </div>

                                    {/* BODY */}
                                    <div className="grid items-start gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">

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
                                                    p-4
                                                "
                                                >

                                                    {/* MAIN */}
                                                    <div
                                                        className="
                                                        mb-3
                                                        flex
                                                        items-center
                                                        justify-between
                                                    "
                                                    >

                                                        <div
                                                            className="
                                                            text-base
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
                                                                togglePermissionGroup(item.name, item.sub)
                                                            }
                                                            className="h-5 w-5"
                                                        />

                                                    </div>

                                                    {/* SUB */}
                                                    {item.sub && (

                                                        <div
                                                            className="
                                                            grid
                                                            grid-cols-1
                                                            gap-2
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
                                                                        px-3
                                                                        py-2.5
                                                                    "
                                                                    >

                                                                        <div
                                                                            className="
                                                                            text-sm font-bold
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

                        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-6 py-4">
                                <div>
                                    <div className="text-xl font-black text-gray-900">Notifications User Can Receive</div>
                                    <div className="mt-1 text-sm text-gray-500">Select which FleetFix notifications, alerts and communication events this user may receive.</div>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setNotificationPreferences(defaultNotificationPreferences())} className="rounded-xl bg-blue-50 px-5 py-3 text-sm font-black text-blue-700">Enable All</button>
                                    <button type="button" onClick={() => setNotificationPreferences(Object.fromEntries(NOTIFICATION_PREFERENCE_OPTIONS.map(({ key }) => [key, false])) as ReturnType<typeof defaultNotificationPreferences>)} className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-700">Clear All</button>
                                </div>
                            </div>
                            <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                                {NOTIFICATION_PREFERENCE_OPTIONS.map((option) => <label key={option.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                                    <span><span className="block text-xs font-black uppercase tracking-wider text-blue-600">{option.group}</span><span className="mt-1 block font-bold text-gray-900">{option.label}</span></span>
                                    <input type="checkbox" checked={notificationPreferences[option.key] !== false} onChange={(event) => setNotificationPreferences((current) => ({ ...current, [option.key]: event.target.checked }))} className="h-5 w-5 shrink-0" />
                                </label>)}
                            </div>
                        </div>

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

                        {canManageAccess && String(params.id) !== "new" && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                            <div className="font-black text-blue-950">Set New Password</div>
                            <p className="mt-1 text-xs text-blue-700">Existing passwords cannot be viewed. They are securely hashed by Firebase Authentication.</p>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" className="h-12 rounded-xl border border-blue-200 bg-white px-4" />
                                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" autoComplete="new-password" className="h-12 rounded-xl border border-blue-200 bg-white px-4" />
                            </div>
                            <button type="button" disabled={changingPassword || newPassword.length < 8 || newPassword !== confirmPassword} onClick={() => void changeUserPassword()} className="mt-3 rounded-xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-40">{changingPassword ? "Changing Password…" : "Change Password"}</button>
                        </div>}

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
