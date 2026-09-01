"use client";

import Link from "next/link";

const sections = [
  {
    title: "Company Details",
    description: "Company Details & Setup",
    href: "/admin/compdetails",
    icon: "🏢",
  },
  {
    title: "Job Card Setup",
    description: "Manage workflow statuses",
    href: "/admin/jobsettings",
    icon: "📋",
  },
  {
    title: "Customer Setup",
    description: "Manage customer setting",
    href: "/admin/customers",
    icon: "👥",
  },
  {
    title: "Query Setup",
    description: "Manage query settings",
    href: "/admin/querysettings",
    icon: "❓",
  },
  {
    title: "Quote Settings",
    description: "Manage quotation settings",
    href: "/admin/quotesettings",
    icon: "📝",
  },
  {
    title: "Invoice Setup",
    description: "Manage invoice settings",
    href: "/admin/invoicesettings",
    icon: "💰",
  },
  {
    title: "Users",
    description: "Manage employees and permissions",
    href: "/admin/users",
    icon: "👤",
  },
  {
    title: "Inventory Setup",
    description: "Stock and item configuration",
    href: "/admin/inventory",
    icon: "📦",
  },
  {
    title: "Reports",
    description: "Reporting and analytics settings",
    href: "/admin/reports",
    icon: "📊",
  },
  {
    title: "Message Templates",
    description: "Message Templates to Users, Customers, Suppliers",
    href: "/admin/messages",
    icon: "💬",
  },
  {
    title: "Job Form Templates",
    description: "Message Templates to Users, Customers, Suppliers",
    href: "/admin/jobforms",
    icon: "📄",
  },
];

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">

      {/* HEADER */}
      <div className="mb-8">

        <h1 className="text-3xl font-black text-gray-900">
          Admin Dashboard
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Configure FleetFix operational settings
        </p>

      </div>

      {/* GRID */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">

        {sections.map((section) => (

          <Link
            key={section.title}
            href={section.href}
            className="
              rounded-4xl
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
  );
}