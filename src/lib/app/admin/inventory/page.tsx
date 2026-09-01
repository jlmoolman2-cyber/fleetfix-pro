"use client";

import {
    useState,
    useEffect
} from "react";

import {
    Package,
    Warehouse,
    Truck,
    Ruler,
    Plus,
    Save,
    Pencil,
    Trash2,
} from "lucide-react";

import {
    collection,
    doc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
}
    from "firebase/firestore";


import { clientDb }
    from "@/lib/firebaseClient";


import { COMPANY_ID }
    from "@/lib/company";

export default function InventorySettingsPage() {

    const [activeTab, setActiveTab] =
        useState<
            "general" |
            "units" |
            "warehouses" |
            "vans"
        >("general");

    const [inventoryPrefix, setInventoryPrefix] =
        useState("STOCK");

    const [currentNumber, setCurrentNumber] =
        useState("1000");

    const [units, setUnits] =
        useState([
            "Each",
            "Box",
            "Liter",
            "Kilogram",
        ]);

    const [warehouses, setWarehouses]
        =
        useState<any[]>([]);

    const [vans, setVans]
        =
        useState<any[]>([]);

    const [newUnit, setNewUnit] =
        useState("");

    const [newWarehouse, setNewWarehouse] =
        useState("");

    const [newVan, setNewVan] =
        useState("");

    const [editingVanId, setEditingVanId] =
        useState<number | null>(null);

    const [editingVanName, setEditingVanName] =
        useState("");

    const nextNumber =
        `${inventoryPrefix}${Number(currentNumber) + 1}`;

    const [users] = useState([
        "Lafras Moolman",
        "Workshop Admin",
        "Technician 1",
    ]);

    const [inventoryItems] = useState([
        {
            id: 1,
            name: "Oil Filter",
            linkedVanId: 1,
        },
        {
            id: 2,
            name: "Brake Pads",
            linkedVanId: null,
        },
    ]);

    useEffect(() => {

        loadInventorySettings();

    }, []);



    async function loadInventorySettings() {


        const warehouseSnap =
            await getDocs(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "inventory_settings",
                    "setup",
                    "warehouses"
                )

            );


        setWarehouses(

            warehouseSnap.docs.map(d => ({

                id: d.id,
                ...d.data()

            }))

        );




        const ravSnap =
            await getDocs(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "inventory_settings",
                    "setup",
                    "rav"
                )

            );


        setVans(

            ravSnap.docs.map(d => ({

                id: d.id,
                ...d.data()

            }))

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
                        Admin / Settings
                    </div>

                    <h1
                        className="
                            text-5xl
                            font-black
                            text-gray-900
                        "
                    >
                        Inventory Setup
                    </h1>

                    <p className="mt-3 text-lg text-gray-500">

                        Configure inventory settings,
                        numbering, warehouses and RAV - Roadside Assistance Vehicle.

                    </p>

                </div>

                <button
                    onClick={() =>
                        alert("Settings Saved")
                    }
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

                    Save Settings

                </button>

            </div>

            {/* TABS */}
            <div className="mb-8 flex flex-wrap gap-4">

                {[
                    {
                        id: "general",
                        label: "General Settings",
                    },
                    {
                        id: "units",
                        label: "Units of Measurement",
                    },
                    {
                        id: "warehouses",
                        label: "Warehouses",
                    },
                    {
                        id: "vans",
                        label: "RAV",
                    },
                ].map((tab) => (

                    <button
                        key={tab.id}
                        onClick={() =>
                            setActiveTab(
                                tab.id as any
                            )
                        }
                        className={`
                            rounded-2xl
                            px-6
                            py-4
                            font-black
                            transition-all
                            ${activeTab === tab.id
                                ? "bg-blue-600 text-white shadow-lg"
                                : "border border-gray-300 bg-white text-gray-700"
                            }
                        `}
                    >

                        {tab.label}

                    </button>

                ))}

            </div>

            {/* GENERAL */}
            {activeTab === "general" && (

                <div className="space-y-8">

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
                                mb-8
                                flex
                                items-center
                                gap-3
                            "
                        >

                            <Package
                                size={28}
                                className="text-blue-600"
                            />

                            <div>

                                <div
                                    className="
                                        text-2xl
                                        font-black
                                        text-gray-900
                                    "
                                >
                                    Prefix and Numbering Settings
                                </div>

                                <div className="text-gray-500">

                                    Control how inventory
                                    record numbers are generated.

                                </div>

                            </div>

                        </div>

                        <div className="grid grid-cols-2 gap-8">

                            {/* LEFT */}
                            <div
                                className="
                                    rounded-3xl
                                    border
                                    border-gray-200
                                    bg-gray-50
                                    p-6
                                "
                            >

                                <div
                                    className="
                                        mb-6
                                        text-xl
                                        font-black
                                        text-gray-900
                                    "
                                >
                                    Prefix
                                </div>

                                <input
                                    value={inventoryPrefix}
                                    onChange={(e) =>
                                        setInventoryPrefix(
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
                                        font-bold
                                    "
                                />

                                <div
                                    className="
                                        mt-8
                                        text-xl
                                        font-black
                                        text-gray-900
                                    "
                                >
                                    Numbering Sequence
                                </div>

                                <div className="mt-6 grid grid-cols-2 gap-6">

                                    <div>

                                        <div
                                            className="
                                                mb-2
                                                text-sm
                                                font-bold
                                                text-gray-500
                                            "
                                        >
                                            Current Inventory Number
                                        </div>

                                        <div
                                            className="
                                                rounded-2xl
                                                bg-blue-50
                                                px-5
                                                py-4
                                                text-2xl
                                                font-black
                                                text-blue-700
                                            "
                                        >
                                            {inventoryPrefix}
                                            {currentNumber}
                                        </div>

                                    </div>

                                    <div>

                                        <div
                                            className="
                                                mb-2
                                                text-sm
                                                font-bold
                                                text-gray-500
                                            "
                                        >
                                            Next Inventory Number
                                        </div>

                                        <div
                                            className="
                                                rounded-2xl
                                                bg-green-50
                                                px-5
                                                py-4
                                                text-2xl
                                                font-black
                                                text-green-700
                                            "
                                        >
                                            {nextNumber}
                                        </div>

                                    </div>

                                </div>

                                <div className="mt-6">

                                    <div
                                        className="
                                            mb-2
                                            text-sm
                                            font-bold
                                            text-gray-500
                                        "
                                    >
                                        Set Current Number
                                    </div>

                                    <input
                                        value={currentNumber}
                                        onChange={(e) =>
                                            setCurrentNumber(
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
                                            font-bold
                                        "
                                    />

                                </div>

                            </div>

                            {/* RIGHT */}
                            <div
                                className="
                                    rounded-3xl
                                    border
                                    border-blue-200
                                    bg-blue-50
                                    p-6
                                "
                            >

                                <div
                                    className="
                                        mb-4
                                        text-xl
                                        font-black
                                        text-blue-900
                                    "
                                >
                                    Hint
                                </div>

                                <ul
                                    className="
                                        space-y-3
                                        text-sm
                                        font-semibold
                                        text-blue-900
                                    "
                                >

                                    <li>
                                        • Inventory numbers
                                        automatically increment.
                                    </li>

                                    <li>
                                        • Use leading zeros if required.
                                    </li>

                                    <li>
                                        • Prefixes help separate inventory types.
                                    </li>

                                </ul>

                            </div>

                        </div>

                    </div>

                </div>

            )}

            {/* UNITS */}
            {activeTab === "units" && (

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
                            mb-8
                            flex
                            items-center
                            justify-between
                        "
                    >

                        <div
                            className="
                                flex
                                items-center
                                gap-3
                            "
                        >

                            <Ruler
                                size={28}
                                className="text-blue-600"
                            />

                            <div
                                className="
                                    text-2xl
                                    font-black
                                    text-gray-900
                                "
                            >
                                Units of Measurement
                            </div>

                        </div>

                        <div className="flex gap-3">

                            <input
                                value={newUnit}
                                onChange={(e) =>
                                    setNewUnit(
                                        e.target.value
                                    )
                                }
                                placeholder="New Unit"
                                className="
                                    h-14
                                    rounded-2xl
                                    border
                                    border-gray-300
                                    px-5
                                "
                            />

                            <button
                                onClick={() => {

                                    if (!newUnit) return;

                                    setUnits([
                                        ...units,
                                        newUnit,
                                    ]);

                                    setNewUnit("");

                                }}
                                className="
                                    flex
                                    items-center
                                    gap-2
                                    rounded-2xl
                                    bg-blue-600
                                    px-6
                                    py-4
                                    font-black
                                    text-white
                                "
                            >

                                <Plus size={18} />

                                Add

                            </button>

                        </div>

                    </div>

                    <div className="space-y-4">

                        {units.map((unit, index) => (

                            <div
                                key={index}
                                className="
                                    flex
                                    items-center
                                    justify-between
                                    rounded-2xl
                                    border
                                    border-gray-200
                                    bg-gray-50
                                    px-6
                                    py-5
                                "
                            >

                                <div
                                    className="
                                        text-lg
                                        font-black
                                        text-gray-900
                                    "
                                >
                                    {unit}
                                </div>

                                <button
                                    onClick={() =>
                                        setUnits(
                                            units.filter(
                                                (_, i) =>
                                                    i !== index
                                            )
                                        )
                                    }
                                    className="
                                        rounded-xl
                                        bg-red-50
                                        p-3
                                        text-red-600
                                    "
                                >

                                    <Trash2 size={18} />

                                </button>

                            </div>

                        ))}

                    </div>

                </div>

            )}

            {/* WAREHOUSES */}
            {activeTab === "warehouses" && (

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
                            mb-8
                            flex
                            items-center
                            justify-between
                        "
                    >

                        <div
                            className="
                                flex
                                items-center
                                gap-3
                            "
                        >

                            <Warehouse
                                size={28}
                                className="text-blue-600"
                            />

                            <div
                                className="
                                    text-2xl
                                    font-black
                                    text-gray-900
                                "
                            >
                                Warehouses
                            </div>

                        </div>

                        <div className="flex gap-3">

                            <input
                                value={newWarehouse}
                                onChange={(e) =>
                                    setNewWarehouse(
                                        e.target.value
                                    )
                                }
                                placeholder="Warehouse Name"
                                className="
                                    h-14
                                    rounded-2xl
                                    border
                                    border-gray-300
                                    px-5
                                "
                            />

                            <button

                                onClick={async () => {

                                    try {

                                        if (!newWarehouse.trim()) {
                                            alert("Enter warehouse name");
                                            return;
                                        }


                                        await addDoc(

                                            collection(
                                                clientDb,
                                                "companies",
                                                COMPANY_ID,
                                                "inventory_settings",
                                                "setup",
                                                "warehouses"
                                            ),

                                            {

                                                name: newWarehouse.trim(),

                                                active: true,

                                                createdAt:
                                                    serverTimestamp()

                                            }

                                        );


                                        setNewWarehouse("");


                                        await loadInventorySettings();


                                        alert("Warehouse Added");


                                    }
                                    catch (error) {

                                        console.error(error);

                                        alert("Failed to add warehouse");

                                    }

                                }}

                                className="
rounded-2xl
bg-blue-600
px-6
py-4
font-black
text-white
"
                            >

                                Add Warehouse

                            </button>

                        </div>

                    </div>

                    <div className="space-y-4">

                        {warehouses.map(
                            (warehouse) => (

                                <div
                                    key={warehouse.id}
                                    className="
                                        flex
                                        items-center
                                        justify-between
                                        rounded-2xl
                                        border
                                        border-gray-200
                                        bg-gray-50
                                        px-6
                                        py-5
                                    "
                                >

                                    <div
                                        className="
                                            text-lg
                                            font-black
                                            text-gray-900
                                        "
                                    >
                                        {warehouse.name}

                                        <div
                                            className={`
        mt-2
        inline-flex
        rounded-full
        px-3
        py-1
        text-xs
        font-black
        ${warehouse.active
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-red-100 text-red-700"
                                                }
    `}
                                        >

                                            {warehouse.active
                                                ? "Active"
                                                : "Inactive"}

                                        </div>
                                    </div>

                                    <button
                                        onClick={async () => {

                                            await deleteDoc(

                                                doc(
                                                    clientDb,
                                                    "companies",
                                                    COMPANY_ID,
                                                    "inventory_settings",
                                                    "setup",
                                                    "warehouses",
                                                    warehouse.id
                                                )

                                            );


                                            await loadInventorySettings();


                                        }}

                                        className="
rounded-xl
bg-red-50
p-3
text-red-600
"
                                    >

                                        <Trash2 size={18} />

                                    </button>

                                </div>

                            )
                        )}

                    </div>

                </div>

            )}

            {/* RAV`s */}
            {activeTab === "vans" && (

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
                            mb-8
                            flex
                            items-center
                            justify-between
                        "
                    >

                        <div
                            className="
                                flex
                                items-center
                                gap-3
                            "
                        >

                            <Truck
                                size={28}
                                className="text-blue-600"
                            />

                            <div
                                className="
                                    text-2xl
                                    font-black
                                    text-gray-900
                                "
                            >
                                RAV`s - Roadside Assistance Vehicles
                            </div>

                        </div>

                        <div className="flex gap-3">

                            <input
                                value={newVan}
                                onChange={(e) =>
                                    setNewVan(
                                        e.target.value
                                    )
                                }
                                placeholder="RAV Name"
                                className="
                                    h-14
                                    rounded-2xl
                                    border
                                    border-gray-300
                                    px-5
                                "
                            />

                            <button

                                onClick={async () => {

                                    try {


                                        if (!newVan.trim()) {

                                            alert("Enter RAV name");

                                            return;

                                        }


                                        await addDoc(

                                            collection(
                                                clientDb,
                                                "companies",
                                                COMPANY_ID,
                                                "inventory_settings",
                                                "setup",
                                                "rav"
                                            ),

                                            {

                                                name:
                                                    newVan.trim(),


                                                assignedUserId:
                                                    "",


                                                assignedUserName:
                                                    "",


                                                active:
                                                    true,


                                                createdAt:
                                                    serverTimestamp()

                                            }

                                        );


                                        setNewVan("");


                                        await loadInventorySettings();


                                        alert("RAV Added");


                                    }
                                    catch (error) {

                                        console.error(error);

                                        alert("Failed to add RAV");

                                    }

                                }}

                                className="
rounded-2xl
bg-blue-600
px-6
py-4
font-black
text-white
"
                            >

                                Add RAV

                            </button>

                        </div>

                    </div>

                    <div className="space-y-4">

                        {vans.map((van, index) => (

                            <div
                                key={van.id}
                                className="
                                    flex
                                    items-center
                                    justify-between
                                    rounded-2xl
                                    border
                                    border-gray-200
                                    bg-gray-50
                                    px-6
                                    py-5
                                "
                            >

                                <div>

                                    <div className="flex items-center gap-3">

                                        {editingVanId === van.id ? (

                                            <input
                                                value={editingVanName}
                                                onChange={(e) =>
                                                    setEditingVanName(
                                                        e.target.value
                                                    )
                                                }
                                                className="
                h-12
                rounded-xl
                border
                border-blue-300
                bg-white
                px-4
                text-lg
                font-black
                text-gray-900
            "
                                            />

                                        ) : (

                                            <div
                                                className="
                text-lg
                font-black
                text-gray-900
            "
                                            >
                                                {van.name}
                                            </div>

                                        )}

                                        <button

                                            onClick={async () => {


                                                const hasInventory =
                                                    inventoryItems.some(
                                                        (item) =>
                                                            item.linkedVanId === van.id
                                                    );


                                                if (
                                                    van.active &&
                                                    hasInventory
                                                ) {

                                                    alert(
                                                        "This RAV cannot be deactivated because inventory items are linked to it."
                                                    );

                                                    return;

                                                }


                                                await updateDoc(

                                                    doc(
                                                        clientDb,
                                                        "companies",
                                                        COMPANY_ID,
                                                        "inventory_settings",
                                                        "setup",
                                                        "rav",
                                                        van.id
                                                    ),

                                                    {

                                                        active:
                                                            !van.active,

                                                        updatedAt:
                                                            serverTimestamp()

                                                    }

                                                );


                                                await loadInventorySettings();


                                            }}

                                            className={`
rounded-xl
px-4
py-3
text-sm
font-black
transition-all
${van.active
                                                    ? "bg-red-50 text-red-600"
                                                    : "bg-green-50 text-green-700"
                                                }
`}
                                        >

                                            {van.active
                                                ? "Deactivate"
                                                : "Activate"}

                                        </button>

                                    </div>

                                    <div className="mt-4">

                                        <div
                                            className="
                mb-2
                text-xs
                font-black
                uppercase
                tracking-wide
                text-gray-500
            "
                                        >
                                            Assigned User
                                        </div>

                                        <select
                                            value={van.assignedUserName || ""}
                                            onChange={async (e) => {


                                                await updateDoc(

                                                    doc(
                                                        clientDb,
                                                        "companies",
                                                        COMPANY_ID,
                                                        "inventory_settings",
                                                        "setup",
                                                        "rav",
                                                        van.id
                                                    ),

                                                    {

                                                        assignedUserName:
                                                            e.target.value,

                                                        updatedAt:
                                                            serverTimestamp()

                                                    }

                                                );


                                                await loadInventorySettings();


                                            }}
                                            className="
                h-12
                rounded-xl
                border
                border-gray-300
                bg-white
                px-4
                text-sm
                font-bold
            "
                                        >

                                            <option value="">
                                                No User Assigned
                                            </option>

                                            {users.map((user) => (

                                                <option
                                                    key={user}
                                                    value={user}
                                                >

                                                    {user}

                                                </option>

                                            ))}

                                        </select>

                                    </div>

                                    <div
                                        className={`
            mt-4
            inline-flex
            rounded-full
            px-3
            py-1
            text-xs
            font-black
            ${van.active
                                                ? "bg-green-100 text-green-700"
                                                : "bg-red-100 text-red-700"
                                            }
        `}
                                    >

                                        {van.active
                                            ? "Active"
                                            : "Inactive"}

                                    </div>

                                </div>


                            </div>

                        ))}

                    </div>

                </div>

            )}

        </div>

    );

}