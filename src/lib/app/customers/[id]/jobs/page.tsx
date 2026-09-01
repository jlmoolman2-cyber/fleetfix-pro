"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

export default function CustomerJobsPage() {

  const params = useParams();

  const customerId =
    params.id as string;

  const [jobs, setJobs] =
    useState<any[]>([]);

  useEffect(() => {

    const savedJobs =
      JSON.parse(
        localStorage.getItem(
          "jobs"
        ) || "[]"
      );

    const customerJobs =
      savedJobs.filter(
        (job: any) =>
          job.customerId === customerId
      );

    setJobs(customerJobs);

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
              Customer Jobs
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
                bg-blue-600
                text-white
                px-5
                font-bold
              "
            >
              📋 Jobs
            </Link>

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
                Customer Jobs
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                All jobs linked to this customer
              </p>

            </div>

            {/* EMPTY */}
            {jobs.length === 0 && (

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
                  📋
                </div>

                <h3 className="text-3xl font-black text-gray-900">
                  No Jobs Found
                </h3>

                <p className="mt-3 text-gray-500">
                  No jobs linked to this customer yet
                </p>

              </div>

            )}

            {/* JOB LIST */}
            {jobs.length > 0 && (

              <div className="space-y-4">

                {jobs.map((job) => (

                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="
                      flex
                      items-center
                      justify-between
                      rounded-2xl
                      border
                      border-gray-200
                      p-5
                      transition
                      hover:border-blue-300
                      hover:bg-blue-50
                    "
                  >

                    {/* LEFT */}
                    <div>

                      <div className="text-lg font-black text-gray-900">
                        {job.jobNumber}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        {job.description}
                      </div>

                    </div>

                    {/* RIGHT */}
                    <div className="text-right">

                      <div className="text-sm font-semibold text-gray-700">
                        {job.status}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        {job.dateBooked}
                      </div>

                    </div>

                  </Link>

                ))}

              </div>

            )}

          </div>

        </div>

      </div>

    </div>
  );
}