"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/", icon: "🏠" },

  { label: "Jobs", href: "/jobs", icon: "📋" },

  {
    label: "Job Locations",
    href: "/job-locations",
    icon: "📍",
  },

  {
    label: "Queries",
    href: "/queries",
    icon: "❓",
  },

  {
    label: "Quotes",
    href: "/quotes",
    icon: "📝",
  },

  {
    label: "Invoices",
    href: "/invoices",
    icon: "💰",
  },

  {
    label: "Purchases",
    href: "/purchases",
    icon: "🛒",
  },

  {
    label: "Customers",
    href: "/customers",
    icon: "👥",
  },

  {
    label: "Inventory",
    href: "/inventory",
    icon: "📦",
  },

  {
    label: "Reports",
    href: "/reports",
    icon: "📊",
  },

  {
    label: "Repair Manuals",
    href: "/manuals",
    icon: "📚",
  },

  {
    label: "Messages",
    href: "/messages",
    icon: "💬",
  },

  {
    label: "Admin",
    href: "/admin",
    icon: "⚙️",
  },
];

export default function Navigation({
  children,
}: {
  children: React.ReactNode;
}) {

  const pathname =
    usePathname();

  return (

    <div className="flex min-h-screen w-full">

      {/* SIDEBAR */}
      <aside className="
        hidden
        lg:flex
        w-72
        flex-col
        bg-[#142d60]
        text-slate-100
      ">

        {/* LOGO */}
        <div className="
          px-6
          py-6
          border-b
          border-white/10
        ">

          <div className="
            flex
            items-center
            gap-3
          ">

            <div className="
              h-11
              w-11
              rounded-2xl
              bg-white/10
              flex
              items-center
              justify-center
              text-lg
              font-semibold
            ">
              F
            </div>

            <div>

              <p className="
                text-sm
                uppercase
                tracking-[0.24em]
                text-slate-300
              ">
                FleetFix
              </p>

              <p className="
                text-lg
                font-semibold
              ">
                Service Portal
              </p>

            </div>

          </div>

        </div>

        {/* NAVIGATION */}
        <nav className="
          flex
          flex-1
          flex-col
          gap-1
          px-3
          py-4
        ">

          {navItems.map((item) => {

            const isActive =

              pathname === item.href ||

              (
                item.href !== "/" &&
                pathname?.startsWith(item.href)
              );

            return (

              <Link
                key={item.label}
                href={item.href}
                className={`
                  group
                  flex
                  items-center
                  justify-between
                  rounded-3xl
                  px-4
                  py-3
                  text-sm
                  font-medium
                  transition

                  ${isActive

                    ? "bg-white/10 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"

                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }
                `}
              >

                <div className="flex items-center gap-3">

                  {item.icon && (
                    <span className="text-lg">
                      {item.icon}
                    </span>
                  )}

                  <span>
                    {item.label}
                  </span>

                </div>

                {isActive && (

                  <span className="
                    rounded-full
                    bg-slate-50/10
                    px-2
                    py-0.5
                    text-[11px]
                    text-slate-200
                  ">
                    Active
                  </span>
                )}

              </Link>
            );
          })}

        </nav>

      </aside>

      {/* PAGE CONTENT */}
      <main className="
        flex-1
        overflow-auto
        bg-[#f5f7fb]
      ">

        {children}

      </main>

    </div>
  );
}