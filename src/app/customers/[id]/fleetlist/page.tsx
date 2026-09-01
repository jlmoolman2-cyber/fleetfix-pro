"use client";

import Link from "next/link";
import {
    useParams,
} from "next/navigation";
import {
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    addDoc,
    collection,
    doc,
    getDocs,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from "firebase/firestore";

import {
    Search,
    Plus,
    Pencil,
    Truck,
} from "lucide-react";

import {
    clientDb,
} from "@/lib/firebaseClient";

import {
    COMPANY_ID,
} from "@/lib/company";

const vehicleMakes = [
    "Volvo",
    "Scania",
    "Mercedes-Benz",
    "MAN",
    "DAF",
    "Iveco",
    "Isuzu",
    "Hino",
    "Toyota",
    "Ford",
    "Nissan",
    "Other",
];

const vehicleTypes = [
    "Truck",
    "Trailer",
    "Bakkie",
    "Bus",
    "LDV",
    "Car",
    "Earthmoving",
    "Generator",
    "Forklift",
    "Other",
];

export default function FleetListPage() {


    const params =
        useParams();

    const customerId =
        params.id as string;

    const [vehicles, setVehicles] =
        useState<any[]>([]);

    const [search, setSearch] =
        useState("");

    const [loading, setLoading] =
        useState(true);

    const [saving, setSaving] =
        useState(false);

    const [showModal, setShowModal] =
        useState(false);

    const [editingVehicle, setEditingVehicle] =
        useState<any>(null);

    const [form, setForm] =
        useState({

            regNo: "",

            fleetNo: "",

            vehicleMake: "",

            vehicleModel: "",

            vehicleType: "",

            vinNumber: "",

            driverName: "",

            driverContactNumber: "",
        });

    useEffect(() => {

        loadVehicles();

    }, []);

    async function loadVehicles() {

        try {

            setLoading(true);

            const snap =
                await getDocs(

                    collection(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "customers",
                        customerId,
                        "fleet"
                    )
                );

            setVehicles(

                snap.docs.map((d) => ({

                    id: d.id,

                    ...d.data(),

                }))
            );

        } catch (err) {

            console.error(err);

        } finally {

            setLoading(false);
        }
    }

    async function saveVehicle() {

        try {

            setSaving(true);

            const reg =
                form.regNo
                    .trim()
                    .toUpperCase();

            const fleet =
                form.fleetNo
                    .trim()
                    .toUpperCase();

            /* DUPLICATE CHECK */
            const duplicateQuery =
                query(

                    collection(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "customers",
                        customerId,
                        "fleet"
                    ),

                    where(
                        "searchRegNo",
                        "==",
                        reg
                    )
                );

            const duplicateSnap =
                await getDocs(
                    duplicateQuery
                );

            const existing =
                duplicateSnap.docs.find(
                    (d) =>
                        d.id !==
                        editingVehicle?.id
                );

            if (existing) {

                alert(
                    "Vehicle already exists"
                );

                return;
            }

            const payload = {

                regNo: reg,

                fleetNo: fleet,

                vehicleMake:
                    form.vehicleMake,

                vehicleModel:
                    form.vehicleModel,

                vehicleType:
                    form.vehicleType,

                vinNumber:
                    form.vinNumber,

                driverName:
                    form.driverName,

                driverContactNumber:
                    form.driverContactNumber,

                searchRegNo: reg,

                searchFleetNo:
                    fleet,

                updatedAt:
                    serverTimestamp(),
            };

            if (editingVehicle) {

                await updateDoc(

                    doc(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "customers",
                        customerId,
                        "fleet",
                        editingVehicle.id
                    ),

                    payload
                );

            } else {

                await addDoc(

                    collection(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "customers",
                        customerId,
                        "fleet"
                    ),

                    {

                        ...payload,

                        createdAt:
                            serverTimestamp(),
                    }
                );
            }

            await loadVehicles();

            closeModal();

        } catch (err) {

            console.error(err);

            alert(
                "Failed to save vehicle"
            );

        } finally {

            setSaving(false);
        }
    }

    function closeModal() {

        setShowModal(false);

        setEditingVehicle(null);

        setForm({

            regNo: "",

            fleetNo: "",

            vehicleMake: "",

            vehicleModel: "",

            vehicleType: "",

            vinNumber: "",

            driverName: "",

            driverContactNumber: "",
        });
    }

    function editVehicle(
        vehicle: any
    ) {

        setEditingVehicle(vehicle);

        setForm({

            regNo:
                vehicle.regNo || "",

            fleetNo:
                vehicle.fleetNo || "",

            vehicleMake:
                vehicle.vehicleMake || "",

            vehicleModel:
                vehicle.vehicleModel || "",

            vehicleType:
                vehicle.vehicleType || "",

            vinNumber:
                vehicle.vinNumber || "",

            driverName:
                vehicle.driverName || "",

            driverContactNumber:
                vehicle.driverContactNumber || "",
        });

        setShowModal(true);
    }

    const filteredVehicles =
        useMemo(() => {

            const term =
                search.toLowerCase();

            return vehicles.filter(
                (vehicle) =>

                    vehicle.regNo
                        ?.toLowerCase()
                        .includes(term) ||

                    vehicle.fleetNo
                        ?.toLowerCase()
                        .includes(term) ||

                    vehicle.vehicleMake
                        ?.toLowerCase()
                        .includes(term) ||

                    vehicle.vehicleModel
                        ?.toLowerCase()
                        .includes(term) ||

                    vehicle.vehicleType
                        ?.toLowerCase()
                        .includes(term) ||

                    vehicle.vinNumber
                        ?.toLowerCase()
                        .includes(term) ||

                    vehicle.driverName
                        ?.toLowerCase()
                        .includes(term) ||

                    vehicle.driverContactNumber
                        ?.toLowerCase()
                        .includes(term)
            );

        }, [vehicles, search]);

    return (

        <div className="min-h-screen bg-[#f5f7fb] p-6">

            <div className="w-full">

                {/* HEADER */}
                <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

                    <div>

                        <h1 className="text-4xl font-black tracking-tight text-gray-900">

                            Fleet List

                        </h1>

                        <p className="mt-2 text-sm text-gray-500">
                            Manage company vehicles and fleet assets
                        </p>

                    </div>

                    <div className="flex items-center gap-3">

                        <Link
                            href="/customers"
                            className="
                rounded-2xl
                border
                border-gray-200
                bg-white
                px-5
                py-3
                text-sm
                font-semibold
                hover:bg-gray-50
              "
                        >
                            Customers
                        </Link>

                        <button
                            onClick={() =>
                                setShowModal(true)
                            }
                            className="
                inline-flex
                items-center
                gap-2
                rounded-2xl
                bg-blue-600
                px-5
                py-3
                text-sm
                font-semibold
                text-white
                hover:bg-blue-700
              "
                        >

                            <Plus size={18} />

                            Add Vehicle

                        </button>

                    </div>

                </div>

                {/* SEARCH */}
                <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">

                    <div className="relative">

                        <Search
                            size={18}
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                        />

                        <input
                            value={search}
                            onChange={(e) =>
                                setSearch(
                                    e.target.value
                                )
                            }
                            placeholder="Search registration, fleet number, VIN, driver, make, model..."
                            className="
                h-12
                w-full
                rounded-xl
                border
                border-gray-300
                bg-white
                pl-11
                pr-4
                text-sm
                outline-none
                focus:border-blue-500
              "
                        />

                    </div>

                </div>

                {/* TABLE */}
                <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">

                    <div className="overflow-x-auto">

                        <table className="min-w-full">

                            <thead className="bg-gray-50">

                                <tr className="text-left text-xs font-bold uppercase tracking-wider text-gray-500">

                                    <th className="px-5 py-4">
                                        Reg No
                                    </th>

                                    <th className="px-5 py-4">
                                        Fleet No
                                    </th>

                                    <th className="px-5 py-4">
                                        Make
                                    </th>

                                    <th className="px-5 py-4">
                                        Model
                                    </th>

                                    <th className="px-5 py-4">
                                        Type
                                    </th>

                                    <th className="px-5 py-4">
                                        VIN / Chassis
                                    </th>

                                    <th className="px-5 py-4">
                                        Driver
                                    </th>

                                    <th className="px-5 py-4">
                                        Driver Contact
                                    </th>

                                    <th className="px-5 py-4">
                                    </th>

                                </tr>

                            </thead>

                            <tbody>

                                {loading ? (

                                    <tr>

                                        <td
                                            colSpan={9}
                                            className="px-5 py-10 text-center text-sm text-gray-500"
                                        >
                                            Loading fleet...
                                        </td>

                                    </tr>

                                ) : filteredVehicles.length === 0 ? (

                                    <tr>

                                        <td
                                            colSpan={9}
                                            className="px-5 py-10 text-center text-sm text-gray-500"
                                        >
                                            No vehicles found
                                        </td>

                                    </tr>

                                ) : (

                                    filteredVehicles.map(
                                        (vehicle) => (

                                            <tr
                                                key={vehicle.id}
                                                className="border-t border-gray-100 hover:bg-gray-50"
                                            >

                                                <td className="px-5 py-4 font-bold text-gray-900">
                                                    {vehicle.regNo || "-"}
                                                </td>

                                                <td className="px-5 py-4 text-sm text-gray-700">
                                                    {vehicle.fleetNo || "-"}
                                                </td>

                                                <td className="px-5 py-4 text-sm text-gray-700">
                                                    {vehicle.vehicleMake || "-"}
                                                </td>

                                                <td className="px-5 py-4 text-sm text-gray-700">
                                                    {vehicle.vehicleModel || "-"}
                                                </td>

                                                <td className="px-5 py-4 text-sm text-gray-700">
                                                    {vehicle.vehicleType || "-"}
                                                </td>

                                                <td className="px-5 py-4 text-sm text-gray-700">
                                                    {vehicle.vinNumber || "-"}
                                                </td>

                                                <td className="px-5 py-4 text-sm text-gray-700">
                                                    {vehicle.driverName || "-"}
                                                </td>

                                                <td className="px-5 py-4 text-sm text-gray-700">
                                                    {vehicle.driverContactNumber || "-"}
                                                </td>

                                                <td className="px-5 py-4">

                                                    <button
                                                        onClick={() =>
                                                            editVehicle(
                                                                vehicle
                                                            )
                                                        }
                                                        className="
                              inline-flex
                              items-center
                              gap-2
                              rounded-xl
                              border
                              border-gray-200
                              bg-white
                              px-3
                              py-2
                              text-sm
                              font-medium
                              hover:bg-gray-50
                            "
                                                    >

                                                        <Pencil size={16} />

                                                        Edit

                                                    </button>

                                                </td>

                                            </tr>

                                        )
                                    )

                                )}

                            </tbody>

                        </table>

                    </div>

                </div>

            </div>

            {/* MODAL */}
            {showModal && (

                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6">

                    <div className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white">

                        <div className="border-b border-gray-200 px-8 py-6">

                            <div className="flex items-center justify-between">

                                <div>

                                    <h2 className="text-3xl font-black text-gray-900">

                                        {editingVehicle
                                            ? "Edit Vehicle"
                                            : "Add Vehicle"}

                                    </h2>

                                    <p className="mt-1 text-sm text-gray-500">
                                        Fleet vehicle information
                                    </p>

                                </div>

                                <button
                                    onClick={closeModal}
                                    className="
                    rounded-xl
                    border
                    border-gray-200
                    px-4
                    py-2
                    text-sm
                    hover:bg-gray-50
                  "
                                >
                                    Close
                                </button>

                            </div>

                        </div>

                        <div className="grid grid-cols-1 gap-6 p-8 md:grid-cols-2">

                            <Field
                                label="Reg No"
                                value={form.regNo}
                                onChange={(v: string) =>
                                    setForm({
                                        ...form,
                                        regNo: v,
                                    })
                                }
                            />

                            <Field
                                label="Fleet No"
                                value={form.fleetNo}
                                onChange={(v: string) =>
                                    setForm({
                                        ...form,
                                        fleetNo: v,
                                    })
                                }
                            />

                            <SelectField
                                label="Vehicle Make"
                                value={form.vehicleMake}
                                options={vehicleMakes}
                                onChange={(v: string) =>
                                    setForm({
                                        ...form,
                                        vehicleMake: v,
                                    })
                                }
                            />

                            <Field
                                label="Vehicle Model"
                                value={form.vehicleModel}
                                onChange={(v: string) =>
                                    setForm({
                                        ...form,
                                        vehicleModel: v,
                                    })
                                }
                            />

                            <SelectField
                                label="Vehicle Type"
                                value={form.vehicleType}
                                options={vehicleTypes}
                                onChange={(v: string) =>
                                    setForm({
                                        ...form,
                                        vehicleType: v,
                                    })
                                }
                            />

                            <Field
                                label="VIN / Chassis No"
                                value={form.vinNumber}
                                onChange={(v: string) =>
                                    setForm({
                                        ...form,
                                        vinNumber: v,
                                    })
                                }
                            />

                            <Field
                                label="Driver Name"
                                value={form.driverName}
                                onChange={(v: string) =>
                                    setForm({
                                        ...form,
                                        driverName: v,
                                    })
                                }
                            />

                            <Field
                                label="Driver Contact Number"
                                value={form.driverContactNumber}
                                onChange={(v: string) =>
                                    setForm({
                                        ...form,
                                        driverContactNumber: v,
                                    })
                                }
                            />

                        </div>

                        <div className="flex justify-end border-t border-gray-200 px-8 py-6">

                            <button
                                onClick={saveVehicle}
                                disabled={saving}
                                className="
                  inline-flex
                  items-center
                  gap-2
                  rounded-2xl
                  bg-blue-600
                  px-6
                  py-3
                  text-sm
                  font-semibold
                  text-white
                  hover:bg-blue-700
                "
                            >

                                <Truck size={18} />

                                {saving
                                    ? "Saving..."
                                    : "Save Vehicle"}

                            </button>

                        </div>

                    </div>

                </div>

            )}

        </div>

    );
}

function Field({
    label,
    value,
    onChange,
}: any) {

    return (

        <div>

            <label className="mb-2 block text-sm font-semibold text-gray-700">
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
          h-12
          w-full
          rounded-xl
          border
          border-gray-300
          bg-white
          px-4
          text-sm
          outline-none
          focus:border-blue-500
        "
            />

        </div>

    );
}

function SelectField({
    label,
    value,
    options,
    onChange,
}: any) {

    return (

        <div>

            <label className="mb-2 block text-sm font-semibold text-gray-700">
                {label}
            </label>

            <select
                value={value}
                onChange={(e) =>
                    onChange(
                        e.target.value
                    )
                }
                className="
          h-12
          w-full
          rounded-xl
          border
          border-gray-300
          bg-white
          px-4
          text-sm
          outline-none
          focus:border-blue-500
        "
            >

                <option value="">
                    Select
                </option>

                {options.map(
                    (option: string) => (

                        <option
                            key={option}
                            value={option}
                        >
                            {option}
                        </option>

                    )
                )}

            </select>

        </div>

    );
}
