"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";
import { formatDateTime24 } from "@/lib/dateTime";

const attachmentTypes = [

  "Other",
  "Quote",
  "Invoice",
  "POP",
  "POD",
  "Image",
  "Audio",
  "Contract",
  "Logo",
  "Job Card",
  "Purchase Order",
  "None",

];

export default function CustomerAttachmentsPage() {

  const params = useParams();

  const customerId =
    params.id as string;

  const [attachments, setAttachments] =
    useState<any[]>([]);

  const [attachmentType, setAttachmentType] =
    useState("Other");

  useEffect(() => {

    const savedAttachments =
      JSON.parse(
        localStorage.getItem(
          `customer_attachments_${customerId}`
        ) || "[]"
      );

    setAttachments(savedAttachments);

  }, [customerId]);

  const handleUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {

    const file =
      e.target.files?.[0];

    if (!file) return;

    const newAttachment = {

      id: Date.now(),

      name: file.name,

      type: attachmentType,

      size:
        (
          file.size / 1024
        ).toFixed(1) + " KB",

      uploaded:
        formatDateTime24(new Date()),

      jobNumber:
        "JOB-10228",

      uploadedBy:
        "Admin",

    };

    const updatedAttachments = [

      ...attachments,
      newAttachment,

    ];

    localStorage.setItem(
      `customer_attachments_${customerId}`,
      JSON.stringify(updatedAttachments)
    );

    setAttachments(updatedAttachments);
  };

  return (

    <div className="min-h-screen bg-[#f5f7fb]">

      {/* HEADER */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">

        <div className="flex items-center justify-between">

          <div>

            <div className="mb-2 text-sm text-gray-500">
              Customers
            </div>

            <h1 className="text-3xl font-black text-gray-900">
              Attachments
            </h1>

          </div>

          <Link
            href={`/customers/${customerId}`}
            className="
              h-12
              px-6
              rounded-xl
              border
              border-gray-300
              bg-white
              hover:bg-gray-100
              flex
              items-center
              justify-center
              font-bold
            "
          >
            Back
          </Link>

        </div>

      </div>

      {/* MAIN */}
      <div className="flex">

        {/* SIDEBAR */}
        <div
          className="
            w-[260px]
            min-h-screen
            border-r
            border-gray-200
            bg-white
            p-4
          "
        >

          <div className="space-y-2">

            <Link
              href={`/customers/${customerId}`}
              className="
                flex
                items-center
                w-full
                h-12
                rounded-2xl
                hover:bg-gray-100
                px-5
                font-bold
                text-gray-700
              "
            >
              ℹ️ Details
            </Link>

            <Link
              href={`/customers/${customerId}/contacts`}
              className="
                flex
                items-center
                w-full
                h-12
                rounded-2xl
                hover:bg-gray-100
                px-5
                font-bold
                text-gray-700
              "
            >
              🗃️ Contacts
            </Link>

            <Link
              href={`/customers/${customerId}/jobs`}
              className="
                flex
                items-center
                w-full
                h-12
                rounded-2xl
                hover:bg-gray-100
                px-5
                font-bold
                text-gray-700
              "
            >
              📋 Jobs
            </Link>

            <Link href={`/customers/${customerId}/recurring-jobs`} className="flex h-12 w-full items-center rounded-2xl px-5 font-bold text-gray-700 hover:bg-gray-100">🔁 Recurring Jobs</Link>

            <Link
              href={`/customers/${customerId}/system-dm`}
              className="
                flex
                items-center
                w-full
                h-12
                rounded-2xl
                hover:bg-gray-100
                px-5
                font-bold
                text-gray-700
              "
            >
              💬 System DM
            </Link>

            <Link
              href={`/customers/${customerId}/attachments`}
              className="
                flex
                items-center
                w-full
                h-12
                rounded-2xl
                bg-blue-600
                text-white
                px-5
                font-bold
              "
            >
              📎 Attachments
            </Link>

          </div>

        </div>

        {/* CONTENT */}
        <div className="flex-1 p-6">

          {/* UPLOAD CARD */}
          <div
            className="
              mb-6
              rounded-3xl
              border
              border-gray-200
              bg-white
              p-8
              shadow-sm
            "
          >

            <h2 className="text-2xl font-black text-gray-900">
              Upload Attachment
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Upload customer or job related documents
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">

              {/* TYPE */}
              <div>

                <label className="mb-2 block text-sm font-bold text-gray-700">
                  Attachment Type
                </label>

                <select
                  value={attachmentType}
                  onChange={(e) =>
                    setAttachmentType(
                      e.target.value
                    )
                  }
                  className="
                    w-full
                    h-14
                    rounded-2xl
                    border-2
                    border-gray-200
                    bg-white
                    px-5
                    outline-none
                    focus:border-blue-500
                  "
                >

                  {attachmentTypes.map((type) => (

                    <option
                      key={type}
                      value={type}
                    >
                      {type}
                    </option>

                  ))}

                </select>

              </div>

              {/* FILE */}
              <div>

                <label className="mb-2 block text-sm font-bold text-gray-700">
                  Select File
                </label>

                <input
                  type="file"
                  onChange={handleUpload}
                  className="
                    w-full
                    rounded-2xl
                    border-2
                    border-gray-200
                    bg-white
                    p-3
                  "
                />

              </div>

            </div>

          </div>

          {/* ATTACHMENT LIST */}
          <div
            className="
              rounded-3xl
              border
              border-gray-200
              bg-white
              p-8
              shadow-sm
            "
          >

            <h2 className="text-2xl font-black text-gray-900">
              Attachment History
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              All uploaded customer and job attachments
            </p>

            {/* EMPTY */}
            {attachments.length === 0 && (

              <div
                className="
                  mt-8
                  rounded-3xl
                  border-2
                  border-dashed
                  border-gray-300
                  p-20
                  text-center
                "
              >

                <div className="mb-5 text-7xl">
                  📎
                </div>

                <h3 className="text-3xl font-black text-gray-900">
                  No Attachments Found
                </h3>

                <p className="mt-3 text-gray-500">
                  Upload your first attachment
                </p>

              </div>

            )}

            {/* LIST */}
            {attachments.length > 0 && (

              <div className="mt-8 space-y-4">

                {attachments.map((attachment) => (

                  <div
                    key={attachment.id}
                    className="
                      flex
                      items-center
                      justify-between
                      rounded-2xl
                      border
                      border-gray-200
                      p-5
                    "
                  >

                    {/* LEFT */}
                    <div>

                      <div className="flex items-center gap-3">

                        <div className="text-2xl">
                          📎
                        </div>

                        <div>

                          <div className="text-lg font-black text-gray-900">
                            {attachment.name}
                          </div>

                          <div className="mt-1 flex items-center gap-2">

                            <span
                              className="
                                rounded-full
                                bg-blue-100
                                px-3
                                py-1
                                text-xs
                                font-bold
                                text-blue-700
                              "
                            >
                              {attachment.type}
                            </span>

                            <span className="text-xs text-gray-500">
                              {attachment.size}
                            </span>

                          </div>

                        </div>

                      </div>

                    </div>

                    {/* RIGHT */}
                    <div className="text-right">

                      <div className="text-sm font-bold text-gray-700">
                        {attachment.jobNumber}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {attachment.uploaded}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {attachment.uploadedBy}
                      </div>

                    </div>

                  </div>

                ))}

              </div>

            )}

          </div>

        </div>

      </div>

    </div>
  );
}
