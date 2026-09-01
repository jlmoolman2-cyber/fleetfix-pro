"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

export default function CustomerSystemDMPage() {

  const params = useParams();

  const customerId =
    params.id as string;

  const [messages, setMessages] =
    useState<any[]>([]);

  useEffect(() => {

    const savedMessages =
      JSON.parse(
        localStorage.getItem(
          `customer_messages_${customerId}`
        ) || "[]"
      );

    setMessages(savedMessages);

  }, [customerId]);

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
              System DM
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
                bg-blue-600
                text-white
                px-5
                font-bold
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
                hover:bg-gray-100
                px-5
                font-bold
                text-gray-700
              "
            >
              📎 Attachments
            </Link>

          </div>

        </div>

        {/* CONTENT */}
        <div className="flex-1 p-6">

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

            {/* TITLE */}
            <div className="mb-6">

              <h2 className="text-2xl font-black text-gray-900">
                Communication History
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                All messages, notifications and communication sent from FleetFix
              </p>

            </div>

            {/* EMPTY */}
            {messages.length === 0 && (

              <div
                className="
                  rounded-3xl
                  border-2
                  border-dashed
                  border-gray-300
                  p-20
                  text-center
                "
              >

                <div className="mb-5 text-7xl">
                  💬
                </div>

                <h3 className="text-3xl font-black text-gray-900">
                  No Communication Found
                </h3>

                <p className="mt-3 text-gray-500">
                  No communication has been sent yet
                </p>

              </div>

            )}

            {/* MESSAGE LIST */}
            {messages.length > 0 && (

              <div className="space-y-4">

                {messages.map((message) => (

                  <div
                    key={message.id}
                    className="
                      rounded-2xl
                      border
                      border-gray-200
                      p-5
                    "
                  >

                    <div className="flex items-start justify-between">

                      {/* LEFT */}
                      <div>

                        <div className="flex items-center gap-2">

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
                            {message.type || "System"}
                          </span>

                          <span className="text-sm text-gray-500">
                            {message.date}
                          </span>

                        </div>

                        <div className="mt-3 text-lg font-black text-gray-900">
                          {message.title}
                        </div>

                        <div className="mt-2 text-sm leading-6 text-gray-600">
                          {message.message}
                        </div>

                      </div>

                      {/* RIGHT */}
                      <div className="text-right">

                        <div className="text-sm font-semibold text-gray-700">
                          {message.sentTo}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          {message.channel}
                        </div>

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
