"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Printer, RefreshCw, Search } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "file-saver";

import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

type ReportConfig = { collection: string; reports: string[]; columns: Array<[string, string]>; amountFields?: string[] };

const REPORT_MODULES: Record<string, ReportConfig> = {
  Jobs: { collection: "jobs", reports: ["Job List", "Job Status", "Job History", "Job Costing", "Job Materials", "Job Timers", "Jobs by Customer", "Jobs by User"], columns: [["jobNumber", "Job Number"], ["customerName", "Customer"], ["vehicleReg", "Vehicle"], ["jobType", "Job Type"], ["status", "Status"], ["assignedTo", "Assigned User"], ["createdAt", "Created"], ["closedAt", "Closed"]], amountFields: ["invoiceTotal", "labourTotal", "partsTotal"] },
  Customers: { collection: "customers", reports: ["Customer List", "Customer Contacts", "Customer Activity", "Top Customers"], columns: [["customerCode", "Code"], ["companyName", "Customer"], ["contactName", "Contact"], ["email", "Email"], ["phone", "Telephone"], ["isActive", "Active"], ["createdAt", "Created"]] },
  Suppliers: { collection: "suppliers", reports: ["Supplier List", "Supplier Contacts", "Supplier Activity"], columns: [["supplierCode", "Code"], ["supplierName", "Supplier"], ["contactName", "Contact"], ["email", "Email"], ["phone", "Telephone"], ["isActive", "Active"], ["createdAt", "Created"]] },
  Inventory: { collection: "inventory", reports: ["Inventory List", "Stock on Hand", "Stock by Location", "Low Stock", "Inventory Valuation", "Serial Numbers", "Stock Movement"], columns: [["partNumber", "Part Number"], ["description", "Description"], ["category", "Category"], ["brand", "Brand"], ["grandTotal", "Quantity"], ["costPrice", "Cost"], ["sellPrice", "Selling Price"], ["isActive", "Active"]], amountFields: ["grandTotal", "costPrice", "sellPrice"] },
  Quotes: { collection: "quotes", reports: ["Quote List", "Quote Status", "Approved Quotes", "Declined Quotes", "Quotes by Customer", "Quote Values"], columns: [["quoteNumber", "Quote Number"], ["customerName", "Customer"], ["referenceNumber", "Reference"], ["jobNumber", "Job"], ["status", "Status"], ["subtotal", "Subtotal"], ["vatTotal", "VAT"], ["grandTotal", "Total"], ["createdAt", "Created"]], amountFields: ["subtotal", "vatTotal", "grandTotal"] },
  Invoices: { collection: "invoices", reports: ["Invoice List", "Invoice Status", "Invoices by Customer", "Paid Invoices", "Outstanding Invoices", "Invoice Values", "Payments and Receipts"], columns: [["invoiceNumber", "Invoice Number"], ["customerName", "Customer"], ["referenceNumber", "Reference"], ["jobNumber", "Job"], ["status", "Status"], ["grandTotal", "Total"], ["amountPaid", "Paid"], ["amountDue", "Outstanding"], ["createdAt", "Created"]], amountFields: ["grandTotal", "amountPaid", "amountDue"] },
  "Purchase Orders": { collection: "purchase_orders", reports: ["Purchase Order List", "Purchase Order Status", "Orders by Supplier", "Open Orders", "Received Orders", "Purchase Values"], columns: [["purchaseOrderNumber", "PO Number"], ["supplier", "Supplier"], ["referenceNumber", "Reference"], ["jobNumber", "Job"], ["status", "Status"], ["grandTotal", "Total"], ["purchaseDate", "Purchase Date"], ["deliveryDate", "Delivery Date"]], amountFields: ["grandTotal"] },
  GRVs: { collection: "grvs", reports: ["GRV List", "GRVs by Supplier", "GRVs by Purchase Order", "Received Stock"], columns: [["grvNumber", "GRV Number"], ["purchaseOrderNumber", "PO Number"], ["supplierName", "Supplier"], ["referenceNumber", "Reference"], ["locationName", "Location"], ["totalQty", "Quantity"], ["createdAt", "Received"]], amountFields: ["totalQty"] },
  Queries: { collection: "queries", reports: ["Query List", "Query Status", "Follow-up Report", "Queries by Customer", "Queries by User", "Overdue Follow-ups"], columns: [["queryNumber", "Query Number"], ["subject", "Subject"], ["queryType", "Type"], ["customerName", "Customer"], ["assignedUserName", "Assigned User"], ["status", "Status"], ["followUpAt", "Follow-up"], ["createdAt", "Created"]] },
  Users: { collection: "users", reports: ["User List", "Users by Role", "User Permissions", "Active Users"], columns: [["name", "Name"], ["email", "Email"], ["primaryRole", "Primary Role"], ["jobTitle", "Job Title"], ["isActive", "Active"], ["lastLoginAt", "Last Login"]] },
  Messages: { collection: "communicationQueue", reports: ["Message History", "Delivered Messages", "Pending Messages", "Failed Messages", "Messages by Module", "Messages by Recipient"], columns: [["module", "Module"], ["communicationName", "Message"], ["recipientType", "Recipient Type"], ["recipientName", "Recipient"], ["recipientEmail", "Email"], ["subject", "Subject"], ["state", "Status"], ["createdAt", "Created"], ["deliveredAt", "Delivered"]] },
  Notifications: { collection: "notifications", reports: ["Notification List", "Open Notifications", "Finalized Notifications", "Notifications by Type"], columns: [["type", "Type"], ["title", "Title"], ["message", "Message"], ["status", "Status"], ["createdByName", "Created By"], ["createdAt", "Created"], ["finalizedByName", "Finalized By"], ["finalizedAt", "Finalized"]] },
  "Audit Log": { collection: "audit_log", reports: ["Complete Audit Log", "Activity by User", "Activity by Module", "Created Records", "Updated Records", "Deleted Records"], columns: [["action", "Action"], ["entityType", "Module"], ["entityId", "Record ID"], ["description", "Description"], ["userName", "User"], ["occurredAt", "Date and Time"]] },
};

export default function ReportsPage() {
  const [module, setModule] = useState("Jobs");
  const [report, setReport] = useState(REPORT_MODULES.Jobs.reports[0]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const config = REPORT_MODULES[module];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    async function loadReportData() {
      try {
        await getAuth().authStateReady();
        if (!getAuth().currentUser) throw new Error("Your sign-in session is not ready. Please sign in again.");
        if (module === "Audit Log") {
          const sourceCollections = Array.from(new Set(Object.values(REPORT_MODULES).map((item) => item.collection).filter((name) => name !== "audit_log")));
          const snapshots = await Promise.allSettled([
            getDocs(collection(clientDb, "companies", COMPANY_ID, "audit_log")),
            ...sourceCollections.map((name) => getDocs(collection(clientDb, "companies", COMPANY_ID, name))),
          ]);
          const auditRecords: any[] = [];
          const dedicated = snapshots[0];
          if (dedicated.status === "fulfilled") dedicated.value.docs.forEach((entry) => auditRecords.push({ id: entry.id, ...entry.data() }));
          snapshots.slice(1).forEach((result, index) => {
            if (result.status !== "fulfilled") return;
            const entityType = sourceCollections[index];
            result.value.docs.forEach((entry) => {
              const data: any = entry.data();
              const base = { entityType, entityId: entry.id };
              if (data.createdAt) auditRecords.push({ id: `${entityType}:${entry.id}:created`, ...base, action: "CREATE", description: `Created ${entityType} record`, userName: data.createdByName || data.createdByEmail || "System", occurredAt: data.createdAt });
              if (data.lastChangedAt || data.updatedAt) auditRecords.push({ id: `${entityType}:${entry.id}:changed`, ...base, action: data.lastAction || "UPDATE", description: `${data.lastAction || "Updated"} ${entityType} record`, userName: data.lastChangedByName || data.updatedByName || data.updatedByEmail || "System", occurredAt: data.lastChangedAt || data.updatedAt });
            });
          });
          if (active) setRecords(deduplicateAuditRecords(auditRecords));
        } else {
          const snapshot = await getDocs(collection(clientDb, "companies", COMPANY_ID, config.collection));
          if (active) setRecords(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        }
      } catch (error) {
        console.error(`Unable to load ${module} report data`, error);
        if (active) {
          setRecords([]);
          setLoadError(error instanceof Error ? error.message : "Unable to load report data.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadReportData();
    return () => { active = false; };
  }, [config.collection, module, reloadKey]);

  const statuses = useMemo(() => Array.from(new Set(records.map((item) => String(item.status || item.state || "")).filter(Boolean))).sort(), [records]);
  const rows = useMemo(() => records.filter((item) => {
    const itemStatus = String(item.status || item.state || "");
    const date = recordDate(item);
    if (search && !JSON.stringify(item).toLowerCase().includes(search.toLowerCase())) return false;
    if (status && itemStatus.toLowerCase() !== status.toLowerCase()) return false;
    if (startDate && (!date || date < new Date(`${startDate}T00:00:00`))) return false;
    if (endDate && (!date || date > new Date(`${endDate}T23:59:59`))) return false;
    const lowerReport = report.toLowerCase();
    if (lowerReport.includes("open") && !["open", "active"].includes(itemStatus.toLowerCase())) return false;
    if (lowerReport.includes("closed") && itemStatus.toLowerCase() !== "closed") return false;
    if (lowerReport.includes("paid invoice") && Number(item.amountDue || 0) > 0) return false;
    if (lowerReport.includes("outstanding") && Number(item.amountDue || 0) <= 0) return false;
    if (lowerReport.includes("delivered") && !["delivered", "sent", "completed"].includes(itemStatus.toLowerCase())) return false;
    if (lowerReport.includes("pending") && itemStatus.toLowerCase() !== "pending") return false;
    if (lowerReport.includes("failed") && !["failed", "error"].includes(itemStatus.toLowerCase())) return false;
    if (lowerReport.includes("created records") && String(item.action || "").toUpperCase() !== "CREATE") return false;
    if (lowerReport.includes("updated records") && !["UPDATE", "ADJUST", "PROCESS", "TRANSFER", "COMPLETE"].includes(String(item.action || "").toUpperCase())) return false;
    if (lowerReport.includes("deleted records") && String(item.action || "").toUpperCase() !== "DELETE") return false;
    if (lowerReport.includes("finalized") && item.finalized !== true) return false;
    if (lowerReport.includes("overdue") && (!(item.followUpAt) || (asDate(item.followUpAt)?.getTime() || Infinity) >= Date.now())) return false;
    if (lowerReport.includes("low stock")) return Number(item.grandTotal ?? item.totalQty ?? 0) <= Number(item.minimumQty ?? item.reorderLevel ?? 0);
    return true;
  }), [endDate, records, report, search, startDate, status]);

  const reportRows = useMemo(() => rows.map((item) => Object.fromEntries(config.columns.map(([key, label]) => [label, displayValue(valueAt(item, key))]))), [config.columns, rows]);
  const totalValue = useMemo(() => rows.reduce((sum, item) => sum + Number(item.grandTotal || item.invoiceTotal || item.amount || 0), 0), [rows]);

  function exportExcel() { const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(reportRows), safeSheetName(report)); saveAs(new Blob([XLSX.write(book, { type: "array", bookType: "xlsx" })]), `${report}.xlsx`); setExportOpen(false); }
  function exportCsv() { const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(reportRows)); saveAs(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${report}.csv`); setExportOpen(false); }
  function exportPdf() { const pdf = new jsPDF({ orientation: config.columns.length > 7 ? "landscape" : "portrait" }); pdf.setFontSize(16); pdf.text(report, 14, 16); autoTable(pdf, { startY: 22, head: [config.columns.map(([, label]) => label)], body: reportRows.map((row) => config.columns.map(([, label]) => row[label])), styles: { fontSize: 7 }, headStyles: { fillColor: [37, 99, 235] } }); pdf.save(`${report}.pdf`); setExportOpen(false); }

  return <main className="min-h-screen bg-[#eef3f8] p-5 md:p-7"><div className="mx-auto max-w-[1800px]"><header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-black">Reports</h1><p className="mt-1 text-gray-500">FleetFix Pro reporting for every operational module</p></div><div className="relative"><button onClick={() => setExportOpen((value) => !value)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-black text-white"><Download size={17} />Export<ChevronDown size={17} /></button>{exportOpen && <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-xl border bg-white py-2 shadow-xl"><button onClick={exportExcel} className="flex w-full gap-2 px-4 py-3 font-bold hover:bg-gray-50"><FileSpreadsheet size={18} />Excel</button><button onClick={exportCsv} className="flex w-full gap-2 px-4 py-3 font-bold hover:bg-gray-50"><FileText size={18} />CSV</button><button onClick={exportPdf} className="flex w-full gap-2 px-4 py-3 font-bold hover:bg-gray-50"><FileText size={18} />PDF</button><button onClick={() => window.print()} className="flex w-full gap-2 px-4 py-3 font-bold hover:bg-gray-50"><Printer size={18} />Print</button></div>}</div></header>
    <div className="grid gap-5 lg:grid-cols-[220px_280px_1fr]"><aside className="rounded-2xl border bg-white p-3 shadow-sm"><p className="px-3 py-2 text-xs font-black uppercase text-gray-400">Modules</p>{Object.keys(REPORT_MODULES).map((item) => <button key={item} onClick={() => { setModule(item); setReport(REPORT_MODULES[item].reports[0]); setStatus(""); }} className={`mb-1 block w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold ${module === item ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}>{item}</button>)}</aside>
      <aside className="rounded-2xl border bg-white p-3 shadow-sm"><p className="px-3 py-2 text-xs font-black uppercase text-gray-400">{module} Reports</p>{config.reports.map((item) => <button key={item} onClick={() => setReport(item)} className={`mb-1 block w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold ${report === item ? "bg-blue-500 text-white" : "hover:bg-gray-100"}`}>{item}</button>)}</aside>
      <section className="space-y-5"><div className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-xl font-black">{report}</h2>{loadError && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"><span>{loadError}</span><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2"><RefreshCw className="h-4 w-4" />Retry</button></div>}<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report..." className="h-11 w-full rounded-xl border pl-10 pr-3" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-xl border px-3"><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 rounded-xl border px-3" aria-label="Start date" /><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 rounded-xl border px-3" aria-label="End date" /></div></div>
        <div className="grid gap-3 sm:grid-cols-3"><Summary label="Records" value={rows.length.toLocaleString()} /><Summary label="Total Value" value={`R ${totalValue.toFixed(2)}`} /><Summary label="Module" value={module} /></div>
      </section></div>
    <section className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b p-5"><div><h3 className="text-lg font-black">Report Preview</h3><p className="text-sm text-gray-500">{rows.length} matching records</p></div>{loading && <Loader2 className="animate-spin" />}</div><div className="overflow-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50"><tr>{config.columns.map(([, label]) => <th key={label} className="whitespace-nowrap border-b px-4 py-3 text-left text-xs font-black uppercase text-gray-500">{label}</th>)}</tr></thead><tbody>{reportRows.map((row, index) => <tr key={rows[index]?.id || index} className="border-b hover:bg-blue-50/30">{config.columns.map(([, label]) => <td key={label} className="max-w-[360px] whitespace-nowrap px-4 py-3">{row[label]}</td>)}</tr>)}{!loading && reportRows.length === 0 && <tr><td colSpan={config.columns.length} className="p-12 text-center font-bold text-gray-400">No report data found.</td></tr>}</tbody></table></div></section>
    </div></main>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-gray-400">{label}</p><p className="mt-2 text-2xl font-black text-gray-900">{value}</p></div>; }
function asDate(value: any): Date | null { if (!value) return null; if (typeof value?.toDate === "function") return value.toDate(); const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function recordDate(item: any) { return asDate(item.createdAt || item.occurredAt || item.purchaseDate || item.followUpAt || item.updatedAt); }
function valueAt(item: any, key: string) { if (key === "name") return item.name || item.displayName || `${item.firstName || ""} ${item.lastName || ""}`.trim(); if (key === "companyName") return item.companyName || item.customerName || item.name; if (key === "contactName") return item.contactName || item.primaryContact || `${item.contactFirstName || ""} ${item.contactLastName || ""}`.trim(); if (key === "email") return item.email || item.email1; if (key === "phone") return item.phone || item.phone1 || item.mobile; if (key === "vehicleReg") return item.vehicleReg || item.vehicleRegistration; if (key === "assignedTo") return item.assignedTo || item.assignedUserName || (item.assignedUsers || []).map((user: any) => user.name).join(", "); if (key === "grandTotal") return item.grandTotal ?? item.total ?? 0; if (key === "amountDue") return item.amountDue ?? Math.max(0, Number(item.grandTotal || 0) - Number(item.amountPaid || 0)); return item[key]; }
function displayValue(value: any) { const date = asDate(value); if (date && (typeof value?.toDate === "function" || value instanceof Date)) return date.toLocaleString("en-ZA", { hour12: false }); if (typeof value === "boolean") return value ? "Yes" : "No"; if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? item.name || item.description || JSON.stringify(item) : item).join(", "); if (value && typeof value === "object") return JSON.stringify(value); return String(value ?? ""); }
function safeSheetName(value: string) { return value.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) || "Report"; }
function deduplicateAuditRecords(records: any[]) { const seen = new Set<string>(); return records.filter((record) => { const time = asDate(record.occurredAt)?.getTime() || 0; const key = `${record.action}|${record.entityType}|${record.entityId}|${time}`; if (seen.has(key)) return false; seen.add(key); return true; }).sort((left, right) => (asDate(right.occurredAt)?.getTime() || 0) - (asDate(left.occurredAt)?.getTime() || 0)); }
