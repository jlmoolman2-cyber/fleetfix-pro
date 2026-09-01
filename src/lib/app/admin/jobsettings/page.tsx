"use client";

import Link from "next/link";

const sections = [
  {
    title: "Job Statuses",
    description: "Manage workflow statuses and communication",
    href: "/admin/statuses",
    icon: "📋",
  },
  {
    title: "Communication",
    description: "Automated communication workflows",
    href: "/admin/communication",
    icon: "⚡",
  },
  {
    title: "Job Type",
    description: "Manage job types and categories",
    href: "/admin/jobType",
    icon: "🛠️",
  },
  {
    title: "Status Reasons",
    description: "Manage Status reasons",
    href: "/admin/reason",
    icon: "🤔",
  },
  {
    title: "Status Instructions",
    description: "Manage workflow instructions",
    href: "/admin/instructions",
    icon: "📎",
  },
  {
    title: "Job Card Fields",
    description: "Custom Job Card settings & numbering",
    href: "/admin/jobcardfields",
    icon: "💬",
  },
  {
    title: "Job Terms & Signature",
    description: "Manage terms and conditions",
    href: "/admin/terms",
    icon: "📄",
  },
  {
    title: "Job Card Categories",
    description: "Manage job card categories",
    href: "/admin/jobformcategories",
    icon: "🗃️",
  },
  {
    title: "Job Card Preferances",
    description: "Manage job card preferances",
    href: "/admin/jobcardpreferances",
    icon: "⚙️",
  },
  {
    title: "Job Card Taskes",
    description: "Manage job card taskes for users",
    href: "/admin/jobcardtasks",
    icon: "⚙️",
  },
];

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="mx-auto max-w-7xl">

        {/* HEADER */}
        <div
          className="
            mb-6
            flex
            flex-col
            gap-4
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
            md:flex-row
            md:items-center
            md:justify-between
          "
        >

          <div>

            <h1 className="text-3xl font-black text-gray-900">
              Job Card Settings
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Configure job card workflow and operational preferences
            </p>

          </div>

          <div className="flex gap-3">

            {/* BACK */}
            <Link
              href="/admin"
              className="
                rounded-2xl
                border
                border-gray-300
                bg-white
                px-5
                py-3
                text-sm
                font-semibold
                text-gray-700
                hover:bg-gray-100
              "
            >
              ← Back
            </Link>

            {/* SAVE */}
            <button
              className="
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
              Save
            </button>

          </div>

        </div>

        {/* GRID */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">

          {sections.map((section) => (

            <Link
              key={section.title}
              href={section.href}
              className="
                rounded-3xl
                border
                border-gray-200
                bg-white
                p-6
                shadow-sm
                transition
                hover:-translate-y-1
                hover:shadow-lg
              "
            >

              <div className="mb-5 flex items-start justify-between">

                <div className="text-5xl">
                  {section.icon}
                </div>

                <span
                  className="
                    rounded-full
                    bg-blue-50
                    px-3
                    py-1
                    text-xs
                    font-semibold
                    text-blue-600
                  "
                >
                  Open →
                </span>

              </div>

              <h2 className="mb-2 text-2xl font-black text-gray-900">
                {section.title}
              </h2>

              <p className="text-sm leading-6 text-gray-500">
                {section.description}
              </p>

            </Link>

          ))}

        </div>

      </div>

    </div>
  );
}