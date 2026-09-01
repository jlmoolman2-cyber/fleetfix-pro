
"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import {
  Plus,
  Search,
  Trash2,
  Pencil,
} from "lucide-react";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";
import { MESSAGE_TEMPLATE_MODULES } from "@/lib/messageTemplateModules";

type Template = {
  id: string;
  name: string;
  module: string;
  subject?: string;
  createdBy?: string;
};

export default function AdminTemplatesPage() {

  const [templates, setTemplates] =
    useState<Template[]>([]);

  const [search, setSearch] =
    useState("");

  const [showModal, setShowModal] =
    useState(false);

  const [templateName, setTemplateName] =
    useState("");

  const [module, setModule] =
    useState("JobCard");

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {

    const q = query(
      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "messageTemplates"
      ),
      orderBy("name")
    );

    const unsub =
      onSnapshot(q, (snapshot) => {

        setTemplates(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as any),
          }))
        );
      });

    return () => unsub();

  }, []);

  const filteredTemplates =
    useMemo(() => {

      return templates.filter((item) => {

        const value =
          `${item.name} ${item.subject || ""} ${item.module}`
            .toLowerCase();

        return value.includes(
          search.toLowerCase()
        );
      });

    }, [templates, search]);

  async function createTemplate() {

    if (!templateName.trim()) {

      alert("Please enter template name");

      return;
    }

    try {

      setSaving(true);

      const ref =
        await addDoc(
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "messageTemplates"
          ),
          {
            name: templateName,
            module,
            subject: "",
            htmlBody: "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy:
              "admin@fleetfix.co.za",
          }
        );

      setShowModal(false);

      setTemplateName("");

      window.location.href =
        `/admin/messages/${ref.id}`;

    } catch (error) {

      console.error(error);

      alert("Failed to create template");

    } finally {

      setSaving(false);
    }
  }

  async function deleteTemplate(
    id: string
  ) {

    const confirmed =
      confirm("Delete template?");

    if (!confirmed) {
      return;
    }

    try {

      await deleteDoc(
        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "messageTemplates",
          id
        )
      );

    } catch (error) {

      console.error(error);

      alert("Failed to delete template");
    }
  }

  return (

    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="w-full">

        {/* TOOLBAR */}
        <div className="mb-6 flex items-center justify-between gap-4">

          <div className="flex items-center gap-3">

            <div className="relative w-[320px]">

              <Search
                size={18}
                className="absolute left-4 top-4 text-gray-400"
              />

              <input
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="Search"
                className="h-12 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-4 outline-none focus:border-blue-500"
              />

            </div>

          </div>

          <button
            onClick={() => setShowModal(true)}
            className="flex h-12 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700"
          >
            Add Template
            <Plus size={16} />
          </button>

        </div>

        {/* TABLE */}
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">

          <table className="w-full">

            <thead>

              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">

                <th className="px-6 py-4">
                  Name
                </th>

                <th className="px-6 py-4">
                  Subject
                </th>

                <th className="px-6 py-4">
                  Module
                </th>

                <th className="px-6 py-4">
                  Created By
                </th>

                <th className="px-6 py-4">
                  Actions
                </th>

              </tr>

            </thead>

            <tbody>

              {filteredTemplates.map((item) => (

                <tr
                  key={item.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >

                  <td className="px-6 py-4 font-bold text-blue-700">

                    <Link
                      href={`/admin/messages/${item.id}`}
                    >
                      {item.name}
                    </Link>

                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    {item.subject || "-"}
                  </td>

                  <td className="px-6 py-4">

                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                      {item.module}
                    </span>

                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    {item.createdBy}
                  </td>

                  <td className="px-6 py-4">

                    <div className="flex gap-2">

                      <Link
                        href={`/admin/messages/${item.id}`}
                        className="rounded-xl border border-gray-300 p-2 hover:bg-gray-100"
                      >
                        <Pencil size={16} />
                      </Link>

                      <button
                        onClick={() =>
                          deleteTemplate(item.id)
                        }
                        className="rounded-xl bg-red-100 p-2 text-red-700 hover:bg-red-200"
                      >
                        <Trash2 size={16} />
                      </button>

                    </div>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

      {/* MODAL */}
      {showModal && (

        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-10">

          <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl">

            <h2 className="mb-8 text-3xl font-black text-gray-900">
              Template Details
            </h2>

            <div className="space-y-6">

              <div>

                <label className="mb-2 block text-sm font-bold text-gray-700">
                  Name of the template
                </label>

                <input
                  value={templateName}
                  onChange={(e) =>
                    setTemplateName(e.target.value)
                  }
                  className="h-14 w-full rounded-xl border border-gray-300 px-4 outline-none focus:border-blue-500"
                />

              </div>

              <div>

                <label className="mb-2 block text-sm font-bold text-gray-700">
                  Module
                </label>

                <select
                  value={module}
                  onChange={(e) =>
                    setModule(e.target.value)
                  }
                  className="h-14 w-full rounded-xl border border-gray-300 px-4 outline-none focus:border-blue-500"
                >

                  {MESSAGE_TEMPLATE_MODULES.map((item) => (

                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>

                  ))}

                </select>

              </div>

            </div>

            <div className="mt-10 flex gap-3">

              <button
                onClick={() =>
                  setShowModal(false)
                }
                className="rounded-xl border border-blue-600 px-8 py-3 font-bold text-blue-700"
              >
                Cancel
              </button>

              <button
                onClick={createTemplate}
                disabled={saving}
                className="rounded-xl bg-blue-600 px-8 py-3 font-bold text-white hover:bg-blue-700"
              >
                {saving
                  ? "Creating..."
                  : "Create"}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}
