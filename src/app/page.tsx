"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { AlertTriangle, Bell, Boxes, Briefcase, ChevronRight, ClipboardList, FileText, Plus, Receipt, ShoppingCart, Users } from "lucide-react";

import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";
import { formatDateTime24 } from "@/lib/dateTime";
import { canReceiveNotification, type NotificationPreferences } from "@/lib/notificationPreferences";

type RecordItem = { id: string; [key: string]: any };

const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value || 0);
const dateValue = (value: any) => value?.toDate?.() || (value ? new Date(value) : null);
const timeValue = (item: RecordItem) => dateValue(item.updatedAt || item.createdAt || item.dateBooked)?.getTime?.() || 0;
const normalizedStatus = (item: RecordItem) => String(item.statusName || item.status || "").trim().toLowerCase();
const vehicleSummary = (item: RecordItem) => {
  const registration = item.vehicleRegNo || item.vehicleRegistration || item.registration || item.regNo || item.vehicleReg || item.vehicle?.vehicleReg || item.vehicle?.regNo;
  const fleetNumber = item.vehicleFleetNo || item.fleetNumber || item.fleetNo || item.vehicle?.fleetNo;
  return Array.from(new Set([registration, fleetNumber].map((value) => String(value || "").trim()).filter(Boolean))).join(" / ") || "—";
};
const isClosed = (item: RecordItem, configuredClosedStatuses?: Set<string>) => {
  const statusId = String(item.statusId || "").trim().toLowerCase();
  return item.isClosed === true || item.closed === true ||
    ["closed", "job closed", "completed", "job completed", "cancelled", "fully received", "fully invoiced", "paid"].includes(normalizedStatus(item)) ||
    Boolean(configuredClosedStatuses?.has(statusId) || configuredClosedStatuses?.has(normalizedStatus(item)));
};

export default function DashboardPage() {
  const [data, setData] = useState<Record<string, RecordItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({});

  useEffect(() => onAuthStateChanged(getAuth(), (user) => setCurrentUserId(user?.uid || "")), []);

  useEffect(() => {
    if (!currentUserId) { setNotificationPreferences({}); return; }
    void getDoc(doc(clientDb, "companies", COMPANY_ID, "users", currentUserId)).then((snapshot) => setNotificationPreferences(snapshot.exists() ? (snapshot.data().notificationPreferences || {}) : {}));
  }, [currentUserId]);

  useEffect(() => {
    const collections = ["jobs", "statuses", "quotes", "invoices", "purchase_orders", "customers", "inventory", "notifications"];
    let loaded = 0;
    const unsubscribers = collections.map((name) => onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, name),
      (snapshot) => {
        setData((current) => ({ ...current, [name]: snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })) }));
        loaded += 1;
        if (loaded >= collections.length) setLoading(false);
      },
      (error) => {
        console.error(`Unable to load dashboard ${name}`, error);
        loaded += 1;
        if (loaded >= collections.length) setLoading(false);
      },
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const jobs = data.jobs || [];
  const quotes = data.quotes || [];
  const invoices = data.invoices || [];
  const purchaseOrders = data.purchase_orders || [];
  const notifications = data.notifications || [];
  const configuredClosedStatuses = useMemo(() => new Set(
    (data.statuses || [])
      .filter((status) => status.closeJob === true)
      .flatMap((status) => [status.id, status.name])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean),
  ), [data.statuses]);
  const openJobs = jobs.filter((item) => !isClosed(item, configuredClosedStatuses) && item.archived !== true);
  const draftQuotes = quotes.filter((item) => normalizedStatus(item) === "draft");
  const openPurchaseOrders = purchaseOrders.filter((item) => ["open", "partial received", "open partial received"].includes(normalizedStatus(item)));
  const unpaidInvoices = invoices.filter((item) => !["paid", "cancelled"].includes(normalizedStatus(item)) && Number(item.amountDue ?? Math.max(0, Number(item.grandTotal || item.total || 0) - Number(item.amountPaid || 0))) > 0);
  const outstandingAmount = unpaidInvoices.reduce((total, item) => total + Number(item.amountDue ?? Math.max(0, Number(item.grandTotal || item.total || 0) - Number(item.amountPaid || 0))), 0);
  const openNotifications = Array.from(new Map(notifications.filter((item) => {
    const recipientIds = Array.isArray(item.recipientIds) ? item.recipientIds : [];
    const intended = Boolean(currentUserId) && (item.recipientId ? item.recipientId === currentUserId : item.assignedUserId ? item.assignedUserId === currentUserId : recipientIds.length ? recipientIds.includes(currentUserId) : true);
    return intended && canReceiveNotification(item, notificationPreferences) && item.finalized !== true && normalizedStatus(item) !== "finalized";
  }).map((item) => [`${item.type || "notification"}|${item.sourcePath || item.title || item.id}|${item.recipientId || item.assignedUserId || currentUserId}`, item])).values());
  const lowStock = (data.inventory || []).filter((item) => {
    const quantity = Number(item.grandTotal ?? item.totalStock ?? item.warehouseTotal ?? 0);
    const minimum = Number(item.lowestQty ?? item.minimumStock ?? item.reorderLevel ?? 0);
    return quantity < 0 || (minimum > 0 && quantity <= minimum);
  });
  const recentJobs = useMemo(() => [...jobs].sort((left, right) => timeValue(right) - timeValue(left)).slice(0, 6), [jobs]);

  const cards = [
    { label: "Open Jobs", value: openJobs.length, detail: `${jobs.length} total jobs`, href: "/jobs", icon: Briefcase, tone: "blue" },
    { label: "Draft Quotes", value: draftQuotes.length, detail: `${quotes.length} total quotes`, href: "/quotes", icon: FileText, tone: "violet" },
    { label: "Outstanding Invoices", value: unpaidInvoices.length, detail: money(outstandingAmount), href: "/invoices", icon: Receipt, tone: "emerald" },
    { label: "Open Purchase Orders", value: openPurchaseOrders.length, detail: `${purchaseOrders.length} total orders`, href: "/purchases", icon: ShoppingCart, tone: "amber" },
  ];

  return <main className="min-h-screen bg-[#f4f7fb] p-5 md:p-8">
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">FleetFix Pro</p><h1 className="mt-2 text-4xl font-black text-slate-950">Operations Dashboard</h1><p className="mt-2 text-slate-500">Live workshop, sales, purchasing and inventory overview.</p></div>
        <div className="flex flex-wrap gap-2"><QuickLink href="/jobs/new" label="New Job" icon={Plus} primary /><QuickLink href="/quotes/new" label="New Quote" icon={FileText} /><QuickLink href="/invoices/new" label="New Invoice" icon={Receipt} /></div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <MetricCard key={card.label} {...card} loading={loading} />)}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <PanelHeader title="Recent Jobs" subtitle="Latest workshop activity" href="/jobs" />
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[120px_1.2fr_1fr_1fr_140px] gap-3 border-b bg-slate-50 px-6 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500"><span>Job</span><span>Customer</span><span>Vehicle</span><span>Status</span><span>Date</span></div>
              {recentJobs.map((job) => <Link key={job.id} href={`/jobs/${job.id}`} className="grid grid-cols-[120px_1.2fr_1fr_1fr_140px] items-center gap-3 border-b px-6 py-4 text-sm last:border-0 hover:bg-blue-50/50"><span className="font-black text-blue-700">{job.jobNumber || job.id.slice(0, 8)}</span><span className="truncate font-semibold">{job.customerName || job.customer || "—"}</span><span className="truncate text-slate-600">{vehicleSummary(job)}</span><span><span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${isClosed(job, configuredClosedStatuses) ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-700"}`}>{job.statusName || job.status || "Open"}</span></span><span className="text-xs text-slate-500">{dateValue(job.dateBooked || job.createdAt) ? formatDateTime24(dateValue(job.dateBooked || job.createdAt)) : "—"}</span></Link>)}
              {!loading && recentJobs.length === 0 && <EmptyState text="No jobs have been created." />}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><PanelHeader title="Attention Required" subtitle="Items needing action" />
            <div className="space-y-3 p-5"><AttentionRow href="/notifications" icon={Bell} label="Open notifications" count={openNotifications.length} color="red" /><AttentionRow href="/inventory" icon={AlertTriangle} label="Low-stock items" count={lowStock.length} color="amber" /><AttentionRow href="/invoices" icon={Receipt} label="Invoices outstanding" count={unpaidInvoices.length} color="emerald" /><AttentionRow href="/purchases" icon={ShoppingCart} label="Orders awaiting receipt" count={openPurchaseOrders.length} color="blue" /></div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><PanelHeader title="FleetFix Modules" subtitle="Open a workspace" />
            <div className="grid grid-cols-2 gap-3 p-5"><ModuleLink href="/customers" icon={Users} label="Customers" count={(data.customers || []).length} /><ModuleLink href="/inventory" icon={Boxes} label="Inventory" count={(data.inventory || []).length} /><ModuleLink href="/queries" icon={ClipboardList} label="Queries" /><ModuleLink href="/notifications" icon={Bell} label="Notifications" count={openNotifications.length} /></div>
          </div>
        </div>
      </section>
    </div>
  </main>;
}

function QuickLink({ href, label, icon: Icon, primary = false }: any) { return <Link href={href} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${primary ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "border border-slate-200 bg-white text-slate-800"}`}><Icon size={17} />{label}</Link>; }

function MetricCard({ label, value, detail, href, icon: Icon, tone, loading }: any) {
  const tones: Record<string, string> = { blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700", emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700" };
  return <Link href={href} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between"><span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[tone]}`}><Icon size={24} /></span><ChevronRight className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" size={20} /></div><p className="mt-5 text-sm font-bold text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-950">{loading ? "—" : value}</p><p className="mt-2 text-xs font-semibold text-slate-400">{loading ? "Loading live data…" : detail}</p></Link>;
}

function PanelHeader({ title, subtitle, href }: { title: string; subtitle: string; href?: string }) { return <div className="flex items-center justify-between border-b px-6 py-5"><div><h2 className="text-lg font-black text-slate-900">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{subtitle}</p></div>{href && <Link href={href} className="text-sm font-black text-blue-600">View all</Link>}</div>; }
function EmptyState({ text }: { text: string }) { return <div className="p-10 text-center text-sm font-semibold text-slate-400">{text}</div>; }

function AttentionRow({ href, icon: Icon, label, count, color }: any) { const tones: Record<string, string> = { red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700", emerald: "bg-emerald-50 text-emerald-700", blue: "bg-blue-50 text-blue-700" }; return <Link href={href} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3 hover:bg-slate-50"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[color]}`}><Icon size={19} /></span><span className="flex-1 text-sm font-bold text-slate-700">{label}</span><span className="min-w-8 rounded-full bg-slate-900 px-2 py-1 text-center text-xs font-black text-white">{count}</span></Link>; }
function ModuleLink({ href, icon: Icon, label, count }: any) { return <Link href={href} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 hover:border-blue-200 hover:bg-blue-50"><Icon className="text-blue-600" size={21} /><p className="mt-3 text-sm font-black text-slate-800">{label}</p>{count !== undefined && <p className="mt-1 text-xs font-bold text-slate-400">{count} records</p>}</Link>; }
