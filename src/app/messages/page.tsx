"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Columns3, Filter } from "lucide-react";
import ModuleSearchField from "@/components/ModuleSearchField";

import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import { formatDateTime24 } from "@/lib/dateTime";

function asDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateLabel(value: any) {
  const date = asDate(value);
  return date ? formatDateTime24(date) : "—";
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);

  const optionalColumns = ["Scheduled", "Sent", "Delivered", "Retry", "Created"];
  const toggleColumn = (column: string) => setHiddenColumns((current) =>
    current.includes(column) ? current.filter((item) => item !== column) : [...current, column]
  );

  useEffect(() => {
    const unsubscribeMessages = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "communicationQueue"),
      (snapshot) => setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    );
    const unsubscribeTemplates = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "messageTemplates"),
      (snapshot) => setTemplates(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    );
    return () => {
      unsubscribeMessages();
      unsubscribeTemplates();
    };
  }, []);

  const rows = useMemo(() => messages.map((message) => {
    const template = templates.find((item) =>
      item.id === message.templateId || item.name === message.templateId || item.name === message.templateName
    );
    const recipientType = message.recipientType || message.notificationType || "System";
    const messageType = message.messageType || (message.sendEmail ? "Email" : message.sendSms ? "SMS" : "Message");
    return {
      ...message,
      template,
      messageType,
      module: message.module || template?.module || (message.jobId ? "JobCard" : "System"),
      userType: /customer/i.test(recipientType) ? "Customer" : /employee|user/i.test(recipientType) ? "Employee" : recipientType,
      subject: message.subject || template?.subject || template?.name || message.communicationName || "System message",
      body: message.body || template?.htmlBody || template?.smsText || "",
      recipient: message.recipientEmail || message.recipientPhone || message.recipientName || message.recipientId || recipientType,
      status: message.status || message.state || "pending",
      createdDate: asDate(message.createdAt),
    };
  }).sort((left, right) => (right.createdDate?.getTime() || 0) - (left.createdDate?.getTime() || 0)), [messages, templates]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const searchable = `${row.messageType} ${row.module} ${row.jobNumber || ""} ${row.userType} ${row.subject} ${row.recipient} ${row.status}`.toLowerCase();
    if (search && !searchable.includes(search.toLowerCase())) return false;
    if (statusFilter && row.status !== statusFilter) return false;
    if (typeFilter && row.messageType !== typeFilter) return false;
    if (userTypeFilter && row.userType !== userTypeFilter) return false;
    if (moduleFilter && row.module !== moduleFilter) return false;
    if (startDate && (!row.createdDate || row.createdDate < new Date(`${startDate}T00:00:00`))) return false;
    if (endDate && (!row.createdDate || row.createdDate > new Date(`${endDate}T23:59:59`))) return false;
    return true;
  }), [rows, search, statusFilter, typeFilter, userTypeFilter, moduleFilter, startDate, endDate]);

  const options = (key: string) => Array.from(new Set(rows.map((row) => String(row[key] || "")).filter(Boolean))).sort();

  return <main className="module-list-page bg-[#f5f7fb] p-6">
    <div className="module-list-content w-full">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-black text-gray-900">Messages</h1><p className="mt-1 text-sm text-gray-500">Every communication created and sent by the system</p></div>
        <div className="flex gap-2"><Link href="/messages/compose" className="inline-flex h-11 items-center justify-center rounded-2xl bg-blue-600 px-6 text-sm font-black text-white hover:bg-blue-700">+ Compose Message</Link><Link href="/admin/messages" className="inline-flex h-11 items-center justify-center rounded-2xl bg-blue-500 px-6 text-sm font-black text-white hover:bg-blue-600">Message Templates</Link></div>
      </div>

      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <ModuleSearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages..." className="min-w-[240px] flex-1" />
          <button onClick={() => setFiltersOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold"><Filter className="h-4 w-4" />Filter</button>
          <div className="relative">
            <button onClick={() => setColumnsOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold"><Columns3 className="h-4 w-4" />Columns</button>
            {columnsOpen && <div className="absolute right-0 top-12 z-30 w-48 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">{optionalColumns.map((column) => <label key={column} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-gray-50"><input type="checkbox" checked={!hiddenColumns.includes(column)} onChange={() => toggleColumn(column)} />{column}</label>)}</div>}
          </div>
        </div>
        {filtersOpen && <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-gray-200 p-3 text-sm"><option value="">Message Status</option>{options("status").map((value) => <option key={value}>{value}</option>)}</select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-lg border border-gray-200 p-3 text-sm"><option value="">Message Type</option>{options("messageType").map((value) => <option key={value}>{value}</option>)}</select>
          <select value={userTypeFilter} onChange={(event) => setUserTypeFilter(event.target.value)} className="rounded-lg border border-gray-200 p-3 text-sm"><option value="">User Type</option>{options("userType").map((value) => <option key={value}>{value}</option>)}</select>
          <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} className="rounded-lg border border-gray-200 p-3 text-sm"><option value="">Module</option>{options("module").map((value) => <option key={value}>{value}</option>)}</select>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-lg border border-gray-200 p-3 text-sm" aria-label="Start date" />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-lg border border-gray-200 p-3 text-sm" aria-label="End date" />
        </div>}
      </div>

      <div className="module-list-scroll rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[1500px] w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 text-[10px] font-black uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-3">Message Type</th><th className="px-3 py-3">Module</th><th className="px-3 py-3">Item</th><th className="px-3 py-3">User Type</th><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Recipient</th>{!hiddenColumns.includes("Scheduled") && <th className="px-3 py-3">Scheduled</th>}{!hiddenColumns.includes("Sent") && <th className="px-3 py-3">Sent</th>}{!hiddenColumns.includes("Delivered") && <th className="px-3 py-3">Delivered</th>}{!hiddenColumns.includes("Retry") && <th className="px-3 py-3">Retry</th>}<th className="px-3 py-3">Status</th>{!hiddenColumns.includes("Created") && <th className="px-3 py-3">Created</th>}</tr></thead>
          <tbody className="divide-y divide-gray-200">
            {filteredRows.map((row) => <tr key={row.id} className="group hover:bg-blue-50/40">
              <td className="px-3 py-3"><span className="block rounded bg-gray-100 px-3 py-1 text-center font-bold">{row.messageType}</span></td>
              <td className="px-3 py-3"><span className="block rounded bg-gray-100 px-3 py-1 text-center font-bold">{row.module}</span></td>
              <td className="px-3 py-3 font-black text-blue-700">{row.jobId ? <Link href={`/jobs/${row.jobId}`}>{row.jobNumber || row.jobId}</Link> : row.itemNumber || "—"}</td>
              <td className="px-3 py-3"><span className="block rounded bg-gray-100 px-3 py-1 text-center font-bold">{row.userType}</span></td>
              <td className="max-w-[300px] px-3 py-3"><details><summary className="cursor-pointer truncate font-bold text-gray-900">{row.subject}</summary>{row.body && <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-normal text-gray-600">{String(row.body).replace(/<[^>]*>/g, " ")}</div>}</details></td>
              <td className="max-w-[230px] truncate px-3 py-3" title={row.recipient}>{row.recipient}</td>
              {!hiddenColumns.includes("Scheduled") && <td className="whitespace-nowrap px-3 py-3">{dateLabel(row.scheduledAt)}</td>}
              {!hiddenColumns.includes("Sent") && <td className="whitespace-nowrap px-3 py-3">{dateLabel(row.sentAt)}</td>}
              {!hiddenColumns.includes("Delivered") && <td className="whitespace-nowrap px-3 py-3">{dateLabel(row.deliveredAt)}</td>}
              {!hiddenColumns.includes("Retry") && <td className="px-3 py-3 text-center font-bold">{row.retryCount ?? row.retry ?? 0}</td>}
              <td className="px-3 py-3"><span className={`rounded-full px-3 py-1 font-bold capitalize ${/deliver|sent/i.test(row.status) ? "bg-green-100 text-green-700" : /fail|error/i.test(row.status) ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{row.status}</span></td>
              {!hiddenColumns.includes("Created") && <td className="whitespace-nowrap px-3 py-3">{dateLabel(row.createdAt)}</td>}
            </tr>)}
            {filteredRows.length === 0 && <tr><td colSpan={12 - hiddenColumns.length} className="p-16 text-center text-sm text-gray-500">No messages match the selected filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-sm font-semibold text-gray-500">Showing {filteredRows.length} of {rows.length} messages</div>
    </div>
  </main>;
}
