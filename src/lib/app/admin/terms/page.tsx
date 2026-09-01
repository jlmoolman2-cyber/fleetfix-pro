"use client";

import {
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";

import {
    ArrowLeft,
    FileText,
    Pencil,
    Plus,
    Save,
    Signature,
    Trash2,
} from "lucide-react";

import {
    useRouter,
} from "next/navigation";

import {
    clientDb,
} from "@/lib/firebaseClient";

import {
    COMPANY_ID,
} from "@/lib/company";

type TermsTemplate = {

    id: string;

    name: string;

    linkedFormId: string;

    linkedFormName: string;

    signatureType:
    | "Employee"
    | "Customer";

    termsText: string;

    allowResign: boolean;

    hideAfterSigned: boolean;

    active: boolean;

    createdAt?: any;
};

type JobForm = {

    id: string;

    name?: string;

    title?: string;

    formName?: string;

    active?: boolean;
};

export default function TermsPage() {

    const router =
        useRouter();

    const [templates, setTemplates] =
        useState<TermsTemplate[]>([]);

    const [
        forms,
        setForms,
    ] = useState<JobForm[]>([]);

    const [search, setSearch] =
        useState("");

    const [showModal, setShowModal] =
        useState(false);

    const [editingId, setEditingId] =
        useState<string | null>(null);

    const [name, setName] =
        useState("");

    const [
        linkedFormId,
        setLinkedFormId,
    ] = useState("");

    const [
        linkedFormName,
        setLinkedFormName,
    ] = useState("");

    const [
        signatureType,
        setSignatureType,
    ] = useState<
        "Employee" | "Customer"
    >("Customer");

    const [
        termsText,
        setTermsText,
    ] = useState("");

    const [
        allowResign,
        setAllowResign,
    ] = useState(true);

    const [
        hideAfterSigned,
        setHideAfterSigned,
    ] = useState(false);


    useEffect(() => {

        const unsub =
            onSnapshot(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "termsTemplates"
                ),

                (snapshot) => {

                    setTemplates(

                        snapshot.docs.map(
                            (doc) => ({

                                id: doc.id,

                                ...(doc.data() as any),
                            })
                        )
                    );
                }
            );

        return () => unsub();

    }, []);

    useEffect(() => {

        const unsub =
            onSnapshot(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobforms"
                ),

                (snapshot) => {

                    setForms(

                        snapshot.docs.map(
                            (doc) => ({

                                id: doc.id,

                                ...(doc.data() as any),
                            })
                        )
                    );
                }
            );

        return () => unsub();

    }, []);

    async function saveTemplate() {

        if (
            !name.trim() ||
            !linkedFormId ||
            !termsText.trim()
        ) {

            alert(
                "Please complete required fields"
            );

            return;
        }

        try {

            const payload = {

                name,

                linkedFormId,

                linkedFormName,

                signatureType,

                termsText,

                allowResign,

                hideAfterSigned,

                active: true,

                updatedAt:
                    serverTimestamp(),
            };

            if (editingId) {

                await updateDoc(

                    doc(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "termsTemplates",
                        editingId
                    ),

                    payload
                );

            } else {

                await addDoc(

                    collection(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "termsTemplates"
                    ),

                    {
                        ...payload,

                        createdAt:
                            serverTimestamp(),
                    }
                );
            }

            resetForm();

        } catch (error) {

            console.error(error);

            alert(
                "Failed to save template"
            );
        }
    }

    async function removeTemplate(
        id: string
    ) {

        const confirmed =
            confirm(
                "Delete this template?"
            );

        if (!confirmed) {

            return;
        }

        try {

            await deleteDoc(

                doc(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "termsTemplates",
                    id
                )
            );

        } catch (error) {

            console.error(error);

            alert(
                "Failed to delete"
            );
        }
    }

    function resetForm() {

        setEditingId(null);

        setName("");

        setLinkedFormId("");

        setLinkedFormName("");

        setSignatureType(
            "Customer"
        );

        setTermsText("");

        setAllowResign(true);

        setHideAfterSigned(false);

        setShowModal(false);
    }

    const filtered =
        useMemo(() => {

            return templates.filter(
                (item) =>

                    item.name
                        ?.toLowerCase()
                        .includes(
                            search.toLowerCase()
                        )
            );

        }, [templates, search]);

    return (

        <div className="min-h-screen bg-[#f4f7fb] p-6">

            <div className="mx-auto max-w-[1800px]">

                {/* HEADER */}
                <div className="mb-8 flex items-center justify-between">

                    <div>

                        <button
                            onClick={() =>
                                router.back()
                            }
                            className="
                mb-4
                flex
                items-center
                gap-2
                rounded-xl
                border
                border-gray-300
                bg-white
                px-4
                py-2
                text-sm
                font-bold
                text-gray-700
                hover:bg-gray-100
              "
                        >

                            <ArrowLeft size={16} />

                            Back

                        </button>

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
                            Admin / Terms
                        </div>

                        <h1
                            className="
                text-5xl
                font-black
                text-gray-900
              "
                        >
                            Terms & Conditions
                        </h1>

                        <p className="mt-3 text-gray-500">

                            Link signatures and
                            terms to specific forms.

                        </p>

                    </div>

                    <button
                        onClick={() =>
                            setShowModal(true)
                        }
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
              hover:bg-blue-700
            "
                    >

                        <Plus size={18} />

                        Add Template

                    </button>

                </div>

                {/* SEARCH */}
                <div
                    className="
            mb-6
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
          "
                >

                    <input
                        type="text"
                        placeholder="Search templates..."
                        value={search}
                        onChange={(e) =>
                            setSearch(
                                e.target.value
                            )
                        }
                        className="
              h-14
              w-full
              rounded-2xl
              border-2
              border-gray-200
              px-5
              outline-none
              focus:border-blue-500
            "
                    />

                </div>

                {/* TABLE */}
                <div
                    className="
            overflow-hidden
            rounded-3xl
            border
            border-gray-200
            bg-white
            shadow-sm
          "
                >

                    <div className="overflow-x-auto">

                        <table className="w-full">

                            <thead>

                                <tr
                                    className="
                    bg-gray-50
                    text-left
                    text-xs
                    uppercase
                    tracking-wider
                    text-gray-500
                  "
                                >

                                    <th className="px-6 py-4">
                                        Template
                                    </th>

                                    <th className="px-6 py-4">
                                        Linked Form
                                    </th>

                                    <th className="px-6 py-4">
                                        Signature
                                    </th>

                                    <th className="px-6 py-4">
                                        Re-sign
                                    </th>

                                    <th className="px-6 py-4">
                                        Actions
                                    </th>

                                </tr>

                            </thead>

                            <tbody>

                                {filtered.map(
                                    (item) => (

                                        <tr
                                            key={item.id}
                                            className="
                        border-t
                        border-gray-100
                        hover:bg-gray-50
                      "
                                        >

                                            <td className="px-6 py-4">

                                                <div className="flex items-center gap-3">

                                                    <div
                                                        className="
                              rounded-2xl
                              bg-blue-50
                              p-3
                              text-blue-600
                            "
                                                    >

                                                        <FileText size={18} />

                                                    </div>

                                                    <div>

                                                        <div className="font-black text-gray-900">
                                                            {item.name}
                                                        </div>

                                                    </div>

                                                </div>

                                            </td>

                                            <td className="px-6 py-4 font-semibold">
                                                {item.linkedFormName}
                                            </td>

                                            <td className="px-6 py-4">

                                                <div className="flex items-center gap-2">

                                                    <Signature size={16} />

                                                    {item.signatureType}

                                                </div>

                                            </td>

                                            <td className="px-6 py-4">

                                                {item.allowResign
                                                    ? "Allowed"
                                                    : "Disabled"}

                                            </td>

                                            <td className="px-6 py-4">

                                                <div className="flex gap-2">

                                                    <button
                                                        onClick={() => {

                                                            setEditingId(
                                                                item.id
                                                            );

                                                            setName(
                                                                item.name
                                                            );

                                                            setLinkedFormId(
                                                                item.linkedFormId
                                                            );

                                                            setLinkedFormName(
                                                                item.linkedFormName
                                                            );

                                                            setSignatureType(
                                                                item.signatureType
                                                            );

                                                            setTermsText(
                                                                item.termsText
                                                            );

                                                            setAllowResign(
                                                                item.allowResign
                                                            );

                                                            setHideAfterSigned(
                                                                item.hideAfterSigned
                                                            );

                                                            setShowModal(true);

                                                        }}
                                                        className="
                              rounded-xl
                              bg-blue-50
                              p-3
                              text-blue-600
                            "
                                                    >

                                                        <Pencil size={16} />

                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            removeTemplate(
                                                                item.id
                                                            )
                                                        }
                                                        className="
                              rounded-xl
                              bg-red-50
                              p-3
                              text-red-600
                            "
                                                    >

                                                        <Trash2 size={16} />

                                                    </button>

                                                </div>

                                            </td>

                                        </tr>

                                    )
                                )}

                            </tbody>

                        </table>

                    </div>

                </div>

            </div>

            {/* MODAL */}
            {showModal && (

                <div
                    className="
            fixed
            inset-0
            z-[99999]
            flex
            items-center
            justify-center
            bg-black/40
            p-6
          "
                >

                    <div
                        className="
              w-full
              max-w-4xl
              rounded-3xl
              bg-white
              p-8
              shadow-2xl
            "
                    >

                        <div className="mb-8">

                            <h2
                                className="
                  text-3xl
                  font-black
                  text-gray-900
                "
                            >

                                {editingId
                                    ? "Edit Template"
                                    : "Create Template"}

                            </h2>

                        </div>

                        {/* NAME */}
                        <div className="mb-6">

                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Template Name *
                            </label>

                            <input
                                value={name}
                                onChange={(e) =>
                                    setName(
                                        e.target.value
                                    )
                                }
                                placeholder="Vehicle Release Terms"
                                className="
                  h-14
                  w-full
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
                            />

                        </div>

                        {/* FORM */}
                        <div className="mb-6">

                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Linked Form *
                            </label>

                            <select
                                value={linkedFormId}
                                onChange={(e) => {

                                    setLinkedFormId(
                                        e.target.value
                                    );

                                    const selected =
                                        forms.find(
                                            (x) =>
                                                x.id ===
                                                e.target.value
                                        );

                                    setLinkedFormName(
                                        selected?.name || ""
                                    );

                                }}
                                className="
                  h-14
                  w-full
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                "
                            >

                                <option value="">
                                    Select Form
                                </option>

                                {forms.map(
                                    (form) => (

                                        <option
                                            key={form.id}
                                            value={form.id}
                                        >
                                            {
                                                form.name ||
                                                form.title ||
                                                form.formName ||
                                                "Unnamed Form"
                                            }
                                        </option>

                                    )
                                )}

                            </select>

                        </div>

                        {/* SIGNATURE TYPE */}
                        <div className="mb-6">

                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Signature Type *
                            </label>

                            <select
                                value={signatureType}
                                onChange={(e) =>
                                    setSignatureType(
                                        e.target.value as any
                                    )
                                }
                                className="
                  h-14
                  w-full
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                "
                            >

                                <option value="Customer">
                                    Customer
                                </option>

                                <option value="Employee">
                                    Employee
                                </option>

                            </select>

                        </div>

                        {/* TERMS */}
                        <div className="mb-8">

                            <label className="mb-2 block text-sm font-bold text-gray-700">
                                Terms & Conditions *
                            </label>

                            <textarea
                                value={termsText}
                                onChange={(e) =>
                                    setTermsText(
                                        e.target.value
                                    )
                                }
                                placeholder="Enter full terms and conditions..."
                                className="
                  min-h-[220px]
                  w-full
                  rounded-2xl
                  border-2
                  border-gray-200
                  p-5
                  outline-none
                  focus:border-blue-500
                "
                            />

                        </div>

                        {/* OPTIONS */}
                        <div className="mb-8 space-y-4">

                            <label className="flex items-center gap-3">

                                <input
                                    type="checkbox"
                                    checked={allowResign}
                                    onChange={(e) =>
                                        setAllowResign(
                                            e.target.checked
                                        )
                                    }
                                    className="h-5 w-5"
                                />

                                <span className="font-semibold text-gray-700">
                                    Allow re-sign
                                </span>

                            </label>

                            <label className="flex items-center gap-3">

                                <input
                                    type="checkbox"
                                    checked={hideAfterSigned}
                                    onChange={(e) =>
                                        setHideAfterSigned(
                                            e.target.checked
                                        )
                                    }
                                    className="h-5 w-5"
                                />

                                <span className="font-semibold text-gray-700">
                                    Do not display signature once signed
                                </span>

                            </label>

                        </div>

                        {/* FOOTER */}
                        <div
                            className="
                flex
                justify-end
                gap-4
                border-t
                border-gray-200
                pt-6
              "
                        >

                            <button
                                onClick={resetForm}
                                className="
                  rounded-xl
                  border
                  border-gray-300
                  px-6
                  py-3
                  font-bold
                  text-gray-700
                  hover:bg-gray-100
                "
                            >
                                Cancel
                            </button>

                            <button
                                onClick={saveTemplate}
                                className="
                  flex
                  items-center
                  gap-2
                  rounded-xl
                  bg-blue-600
                  px-6
                  py-3
                  font-bold
                  text-white
                  hover:bg-blue-700
                "
                            >

                                <Save size={18} />

                                Save Template

                            </button>

                        </div>

                    </div>

                </div>

            )}

        </div>

    );

}