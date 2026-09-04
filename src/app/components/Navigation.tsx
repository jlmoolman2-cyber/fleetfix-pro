"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  Briefcase,
  FileQuestion,
  FileText,
  Home,
  MapPin,
  MessageSquare,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  Truck,
  Bell,
  LogOut,
} from "lucide-react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import RecurringJobActivator from "./RecurringJobActivator";
import AdvancedBookingActivator from "./AdvancedBookingActivator";
import JobQueuePositionUpdater from "./JobQueuePositionUpdater";
import GlobalBackBar from "./GlobalBackBar";
import { COMPANY_ID } from "@/lib/company";
import { clientAuth, clientDb } from "@/lib/firebaseClient";
import { effectivePermissions } from "@/lib/permissions";
import { canReceiveNotification, type NotificationPreferences } from "@/lib/notificationPreferences";

const navItems = [
  { label: "Dashboard", href: "/", icon: Home },
  { label: "Jobs", href: "/jobs", icon: Briefcase },
  { label: "Job Locations", href: "/job-locations", icon: MapPin },
  { label: "Queries", href: "/queries", icon: FileQuestion },
  { label: "Quotes", href: "/quotes", icon: FileText },
  { label: "Invoices", href: "/invoices", icon: Receipt },
  { label: "Purchases", href: "/purchases", icon: ShoppingCart },
  { label: "Suppliers", href: "/suppliers", icon: Truck },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "WhatsApp", href: "/communications/whatsapp", icon: MessageSquare },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Admin", href: "/admin", icon: Settings },
];

const navigationPermissions: Record<string, string> = {
  "/": "View dashboard",
  "/jobs": "View jobs",
  "/job-locations": "View jobs",
  "/queries": "View queries",
  "/quotes": "View quotes",
  "/invoices": "View invoices",
  "/purchases": "View purchase orders",
  "/suppliers": "View suppliers",
  "/customers": "View customers",
  "/inventory": "View inventory",
  "/messages": "View messages",
  "/communications/whatsapp": "View WhatsApp",
  "/notifications": "View notifications",
};

export default function Navigation({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isModuleListPage = [
    "/jobs", "/job-locations", "/queries", "/quotes", "/invoices",
    "/purchases", "/suppliers", "/customers", "/inventory", "/messages",
    "/notifications", "/communications/whatsapp",
  ].includes(pathname);
  const [openNotificationCount, setOpenNotificationCount] = useState(0);
  const [whatsappUnreadCount, setWhatsappUnreadCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<User | null>(clientAuth.currentUser);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({});
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const knownActiveNotificationIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!currentUser) { setOpenNotificationCount(0); knownActiveNotificationIds.current = null; return; }
    return onSnapshot(collection(clientDb, "companies", COMPANY_ID, "notifications"), (snapshot) => {
    const unique = new Map<string, string>();
    snapshot.docs.forEach((entry) => {
      const data = entry.data();
      const recipientIds = Array.isArray(data.recipientIds) ? data.recipientIds : [];
      const intended = data.recipientId ? data.recipientId === currentUser.uid : data.assignedUserId ? data.assignedUserId === currentUser.uid : recipientIds.length ? recipientIds.includes(currentUser.uid) : true;
      if (!intended || !canReceiveNotification(data, notificationPreferences) || data.finalized === true || data.status === "finalized") return;
      const key = `${data.type || "notification"}|${data.sourcePath || data.title || entry.id}|${data.recipientId || data.assignedUserId || currentUser.uid}`;
      if (!unique.has(key)) unique.set(key, entry.id);
    });
    const activeIds = new Set(unique.values());
    const previousIds = knownActiveNotificationIds.current;
    setOpenNotificationCount(activeIds.size);
    knownActiveNotificationIds.current = activeIds;
    if (!previousIds || !Array.from(activeIds).some((id) => !previousIds.has(id)) || window.localStorage.getItem("fleetfix-notification-sound") === "off") return;
    try {
      const AudioContextClass = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.32);
      oscillator.addEventListener("ended", () => void context.close());
    } catch (error) {
      console.warn("Notification sound could not be played", error);
    }
    });
  }, [currentUser, notificationPreferences]);

  useEffect(() => onAuthStateChanged(clientAuth, setCurrentUser), []);

  useEffect(() => {
    if (!currentUser) { setNotificationPreferences({}); setPermissions({}); return; }
    void getDoc(doc(clientDb, "companies", COMPANY_ID, "users", currentUser.uid)).then((snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      setNotificationPreferences(data.notificationPreferences || {});
      setPermissions(effectivePermissions(data));
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || permissions["View WhatsApp"] !== true) { setWhatsappUnreadCount(0); return; }
    let disposed = false;
    const refresh = async () => {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch("/api/whatsapp/summary", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { unreadConversations?: number };
        if (!disposed) setWhatsappUnreadCount(Math.max(0, Number(data.unreadConversations || 0)));
      } catch { /* Keep navigation usable while the preview endpoint is unavailable. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [currentUser, permissions]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <RecurringJobActivator />
      <AdvancedBookingActivator />
      <JobQueuePositionUpdater />
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col overflow-y-auto bg-[#142d60] text-slate-100 lg:flex">
        <div className="border-b border-white/10 px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold">
              F
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-300">
                FleetFix
              </p>
              <p className="text-lg font-semibold">Service Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
          {navItems.map((item) => {
            const requiredPermission = navigationPermissions[item.href];
            if (requiredPermission && permissions[requiredPermission] !== true) return null;
            if (item.href === "/admin" && !Object.entries(permissions).some(([permission, enabled]) => enabled && permission.startsWith("Manage "))) return null;
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));
            const isNotificationAlert = item.href === "/notifications" && openNotificationCount > 0;

            return (
              <Link
                key={item.label}
                href={item.href}
                replace
                className={`
                  group
                  flex
                  items-center
                  justify-between
                  rounded-xl
                  px-3
                  py-2.5
                  text-sm
                  font-medium
                  transition

                  ${
                    isNotificationAlert
                      ? "bg-red-600 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.15)] hover:bg-red-700"
                      : isActive
                      ? "bg-white/10 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }
                `}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </span>

                {item.href === "/notifications" && openNotificationCount > 0 ? <span className="min-w-6 rounded-full bg-white px-2 py-0.5 text-center text-[11px] font-black text-red-700">{openNotificationCount > 99 ? "99+" : openNotificationCount}</span> : item.href === "/communications/whatsapp" && whatsappUnreadCount > 0 ? <span className="min-w-6 rounded-full bg-emerald-500 px-2 py-0.5 text-center text-[11px] font-black text-white">{whatsappUnreadCount > 99 ? "99+" : whatsappUnreadCount}</span> : isActive && (
                  <span className="rounded-full bg-slate-50/10 px-2 py-0.5 text-[11px] text-slate-200">
                    Active
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="mb-3 min-w-0 px-2">
            <p className="truncate text-sm font-bold text-white">{currentUser?.displayName || currentUser?.email || "FleetFix user"}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Signed in</p>
          </div>
          <button type="button" onClick={() => void signOut(clientAuth)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"><LogOut size={18} />Sign out</button>
        </div>
      </aside>

      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-[#f5f7fb]">
        {!pathname.startsWith("/admin") && <GlobalBackBar />}
        <div className={`min-h-0 flex-1 ${isModuleListPage ? "module-list-viewport overflow-hidden" : "overflow-y-auto"}`}>{children}</div>
      </main>
    </div>
  );
}
