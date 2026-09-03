"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, Check, CheckCheck, CircleAlert, Inbox, Loader2, LockKeyhole, MessageCircle, Search, UserRound, X } from "lucide-react";
import { subscribeWhatsAppLive, whatsappApi } from "@/lib/whatsapp/clientApi";
import { formatPhoneForDisplay } from "@/lib/whatsapp/phoneNumbers";
import { appendOlderMessagePage } from "@/lib/whatsapp/messageCore";
import { mergeLiveMessagePage } from "@/lib/whatsapp/liveUpdatesCore";

type Capabilities = { view: boolean; manage: boolean; assign: boolean; close: boolean; manualOutbound: boolean; automationOutbound: boolean; templateOutbound: boolean };
type Conversation = {
  id: string; customerId: string | null; contactId: string | null; customerName: string; contactName: string;
  jobId: string | null; jobNumber: string | null; phoneNumber: string; assignedUserId: string | null;
  assignedUserName: string; status: string; unreadCount: number; lastMessageText: string; lastMessageAt: string | null;
  needsJobAssignment: boolean; serviceWindowExpiresAt: string | null; linkedJobs: LinkedJobOption[];
};
type Message = { id: string; direction: "incoming" | "outgoing"; messageText: string; jobId: string | null; jobNumber: string | null; status: string; timestamp: string | null; failureReason: string | null; mediaType: string | null; mediaFilename: string | null; mediaMimeType: string | null; mediaSize: number; mediaIngestionStatus: string | null; mediaFailureReason: string | null };
type UserOption = { id: string; name: string };
type LinkedJobOption = { jobId: string; jobNumber: string; vehicleRegistration: string; fleetNumber: string; status: string; bookingAt: string | null; description: string; location: string };
type JobOption = { id: string; jobNumber: string; vehicleRegistration: string; fleetNumber: string; status: string; active: boolean; bookingAt: string | null; description: string; location: string };
type ContactOption = { id: string; name: string; phoneNumber: string };
type CustomerOption = { id: string; name: string; phoneNumber: string; contacts: ContactOption[] };

const scopes = [
  ["all", "All"], ["unread", "Unread"], ["open", "Open"], ["closed", "Closed"],
  ["unassigned", "Unassigned"], ["mine", "Assigned to me"], ["needs-job", "Needs Job"],
] as const;

function shortDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })
    : date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
}

function fullTime(value: string | null) {
  return value ? new Date(value).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
}

function dateKey(value: string | null) { return value ? new Date(value).toDateString() : "Unknown date"; }

function StatusIcon({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-blue-500" aria-label="Read" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-gray-500" aria-label="Delivered" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5 text-gray-500" aria-label="Sent" />;
  if (status === "failed") return <CircleAlert className="h-3.5 w-3.5 text-red-600" aria-label="Failed" />;
  return null;
}

export default function WhatsAppInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities>({ view: false, manage: false, assign: false, close: false, manualOutbound: false, automationOutbound: false, templateOutbound: false });
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [assignedUser, setAssignedUser] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [jobLinkOpen, setJobLinkOpen] = useState(false);
  const [associationOpen, setAssociationOpen] = useState(false);
  const [associationSearch, setAssociationSearch] = useState("");
  const [associationCustomers, setAssociationCustomers] = useState<CustomerOption[]>([]);
  const [associationCustomerId, setAssociationCustomerId] = useState("");
  const [associationContactId, setAssociationContactId] = useState("");
  const [associationLoading, setAssociationLoading] = useState(false);
  const [associationSearched, setAssociationSearched] = useState(false);
  const [outboundText, setOutboundText] = useState("");
  const [outboundJobId, setOutboundJobId] = useState("");
  const sendingRef = useRef(false);

  const listQuery = useMemo(() => {
    const params = new URLSearchParams({ scope });
    if (appliedSearch) params.set("search", appliedSearch);
    if (assignedUser) params.set("assignedUser", assignedUser);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return params;
  }, [scope, appliedSearch, assignedUser, startDate, endDate]);

  const loadList = useCallback(async (append = false) => {
    try {
      setLoading(true); setError("");
      const params = new URLSearchParams(listQuery);
      if (append && nextCursor) params.set("cursor", nextCursor);
      const data = await whatsappApi<{ items: Conversation[]; nextCursor: string | null; currentUserId: string; users: UserOption[]; capabilities: Capabilities }>(`/api/whatsapp/conversations?${params}`);
      setConversations((current) => append ? [...current, ...data.items] : data.items);
      setNextCursor(data.nextCursor); setCapabilities(data.capabilities); setUsers(data.users); setCurrentUserId(data.currentUserId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load WhatsApp conversations."); }
    finally { setLoading(false); }
  }, [listQuery, nextCursor]);
  const loadListRef = useRef(loadList);

  useEffect(() => { loadListRef.current = loadList; }, [loadList]);

  useEffect(() => { void loadList(false); }, [listQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadConversation = useCallback(async (id: string, jobsNeedle = "") => {
    try {
      setLoadingConversation(true); setError("");
      const detail = await whatsappApi<{ conversation: Conversation; users: UserOption[]; jobs: JobOption[]; capabilities: Capabilities }>(`/api/whatsapp/conversations/${id}?jobSearch=${encodeURIComponent(jobsNeedle)}`);
      const messageData = await whatsappApi<{ messages: Message[]; nextCursor: string | null }>(`/api/whatsapp/conversations/${id}/messages`);
      setSelected(detail.conversation); setUsers(detail.users); setJobs(detail.jobs); setCapabilities(detail.capabilities);
      setOutboundJobId(detail.conversation.linkedJobs.length === 1 ? detail.conversation.linkedJobs[0].jobId : "");
      setMessages(messageData.messages); setMessageCursor(messageData.nextCursor);
      if (detail.conversation.unreadCount > 0) {
        await whatsappApi(`/api/whatsapp/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ action: "read" }) });
        setSelected((current) => current ? { ...current, unreadCount: 0 } : current);
        setConversations((current) => current.map((item) => item.id === id ? { ...item, unreadCount: 0 } : item));
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to open this conversation."); }
    finally { setLoadingConversation(false); }
  }, []);

  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshListRequested = false;
    let refreshMessagesRequested = false;
    const refreshSelected = async (id: string, includeDetail: boolean) => {
      try {
        const [detail, messageData] = await Promise.all([
          includeDetail ? whatsappApi<{ conversation: Conversation; users: UserOption[]; jobs: JobOption[]; capabilities: Capabilities }>(`/api/whatsapp/conversations/${id}`) : Promise.resolve(null),
          whatsappApi<{ messages: Message[]; nextCursor: string | null }>(`/api/whatsapp/conversations/${id}/messages`),
        ]);
        if (!active) return;
        if (detail) {
          setSelected(detail.conversation); setUsers(detail.users); setJobs(detail.jobs); setCapabilities(detail.capabilities);
          if (detail.conversation.unreadCount > 0) {
            await whatsappApi(`/api/whatsapp/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ action: "read" }) });
            if (!active) return;
            setSelected((current) => current?.id === id ? { ...current, unreadCount: 0 } : current);
            setConversations((current) => current.map((item) => item.id === id ? { ...item, unreadCount: 0 } : item));
          }
        }
        setMessages((current) => mergeLiveMessagePage(messageData.messages, current));
        setMessageCursor((current) => current || messageData.nextCursor);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "WhatsApp live updates could not be refreshed.");
      }
    };
    const flushRefresh = () => {
      refreshTimer = null;
      const updateList = refreshListRequested;
      const updateMessages = refreshMessagesRequested;
      refreshListRequested = false;
      refreshMessagesRequested = false;
      if (updateList) void loadListRef.current(false);
      if (selectedId && (updateList || updateMessages)) void refreshSelected(selectedId, updateList);
    };
    const unsubscribe = subscribeWhatsAppLive(
      `/api/whatsapp/live${selectedId ? `?conversationId=${encodeURIComponent(selectedId)}` : ""}`,
      (event) => {
        if (event === "conversations") refreshListRequested = true;
        if (event === "messages") refreshMessagesRequested = true;
        if (!refreshTimer) refreshTimer = setTimeout(flushRefresh, 100);
      },
      (reason) => { if (active) setError(reason.message); },
    );
    return () => {
      active = false;
      unsubscribe();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [selectedId]); // The stream reconnects only when the selected conversation changes. eslint-disable-line react-hooks/exhaustive-deps

  const openConversation = (id: string) => { setSelectedId(id); setJobSearch(""); setJobLinkOpen(false); setAssociationOpen(false); void loadConversation(id); };

  const mutate = async (body: Record<string, unknown>) => {
    if (!selectedId) return false;
    try {
      setSaving(true); setError("");
      const data = await whatsappApi<{ conversation: Conversation; users: UserOption[]; jobs: JobOption[] }>(`/api/whatsapp/conversations/${selectedId}`, { method: "PATCH", body: JSON.stringify(body) });
      setSelected(data.conversation); setUsers(data.users); setJobs(data.jobs);
      setConversations((current) => current.map((item) => item.id === selectedId ? data.conversation : item));
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The conversation could not be updated."); return false; }
    finally { setSaving(false); }
  };

  const searchAssociationOptions = async () => {
    const needle = associationSearch.trim();
    if (needle.length < 2) { setError("Enter at least two characters to search customers and contacts."); return; }
    try {
      setAssociationLoading(true); setAssociationSearched(false); setError(""); setAssociationCustomerId(""); setAssociationContactId("");
      const data = await whatsappApi<{ customers: CustomerOption[] }>(`/api/whatsapp/association-options?search=${encodeURIComponent(needle)}`);
      setAssociationCustomers(data.customers); setAssociationSearched(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Customers and contacts could not be searched."); }
    finally { setAssociationLoading(false); }
  };

  const associateCustomerContact = async () => {
    if (!associationCustomerId) { setError("Select a customer before associating this conversation."); return; }
    const succeeded = await mutate({ action: "associate-customer-contact", customerId: associationCustomerId, contactId: associationContactId || undefined });
    if (succeeded) { setAssociationOpen(false); setAssociationSearch(""); setAssociationCustomers([]); setAssociationCustomerId(""); setAssociationContactId(""); }
  };

  const linkSelectedJob = async (jobId: string) => {
    if (jobId && await mutate({ action: "link-job", jobId })) { setJobLinkOpen(false); setJobSearch(""); }
  };

  const unlinkSelectedJob = async (job: LinkedJobOption) => {
    const jobId = job.jobId;
    if (window.confirm(`Remove ${job.jobNumber} from this WhatsApp conversation? The FleetFix job will not be deleted.`)) {
      await mutate({ action: "unlink-job", jobId });
    }
  };

  const assignMessageJob = async (messageId: string, jobId: string) => {
    if (!selectedId || !jobId) return;
    try {
      setSaving(true); setError("");
      const result = await whatsappApi<{ message: { id: string; jobId: string; jobNumber: string }; needsJobAssignment: boolean }>(`/api/whatsapp/conversations/${selectedId}/messages`, { method: "PATCH", body: JSON.stringify({ action: "assign-job-context", messageId, jobId }) });
      setMessages((current) => current.map((message) => message.id === result.message.id ? { ...message, jobId: result.message.jobId, jobNumber: result.message.jobNumber } : message));
      setSelected((current) => current ? { ...current, needsJobAssignment: result.needsJobAssignment } : current);
      setConversations((current) => current.map((conversation) => conversation.id === selectedId ? { ...conversation, needsJobAssignment: result.needsJobAssignment } : conversation));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The message job could not be assigned."); }
    finally { setSaving(false); }
  };

  const sendManualMessage = async () => {
    const text = outboundText.trim();
    if (!selectedId || !capabilities.manualOutbound || !text || sendingRef.current) return;
    sendingRef.current = true;
    try {
      setSaving(true); setError("");
      const result = await whatsappApi<{ state: string; persistencePending: boolean }>(`/api/whatsapp/conversations/${selectedId}/messages`, { method: "POST", body: JSON.stringify({ text, clientRequestId: crypto.randomUUID(), jobId: outboundJobId || null }) });
      if (result.state === "accepted") {
        setOutboundText("");
        if (result.persistencePending) setError("Meta accepted the message; FleetFix is still reconciling the local inbox record.");
      } else if (result.state === "outcome_unknown") setError("The send outcome could not be confirmed. Do not resend automatically; an administrator must review it.");
      else if (result.state === "processing") setError("This message request is still processing.");
      else setError("Meta did not accept the WhatsApp message.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The WhatsApp message could not be sent."); }
    finally { sendingRef.current = false; setSaving(false); }
  };

  const loadOlderMessages = async () => {
    if (!selectedId || !messageCursor) return;
    try {
      const data = await whatsappApi<{ messages: Message[]; nextCursor: string | null }>(`/api/whatsapp/conversations/${selectedId}/messages?cursor=${encodeURIComponent(messageCursor)}`);
      setMessages((current) => appendOlderMessagePage(current, data.messages)); setMessageCursor(data.nextCursor);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Older messages could not be loaded."); }
  };

  let previousDate = "";
  const associationCustomer = associationCustomers.find((customer) => customer.id === associationCustomerId);
  return <main className="flex h-full min-h-0 flex-col bg-[#f5f7fb] p-3 md:p-5">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Communications</p><h1 className="text-2xl font-black text-slate-900">WhatsApp Inbox</h1></div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">Preview mode · Outbound sending disabled</div>
    </header>
    {error && <div className="mb-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
    <section className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <aside className={`${selectedId ? "hidden md:flex" : "flex"} w-full min-w-0 flex-col border-r border-slate-200 md:w-[390px] md:shrink-0`}>
        <div className="border-b bg-white p-3">
          <form onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); }} className="flex gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3"><Search size={16} className="text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, phone or job" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
            <button className="rounded-xl bg-[#142d60] px-3 text-xs font-black text-white">Search</button>
          </form>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">{scopes.map(([value, label]) => <button key={value} onClick={() => setScope(value)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black ${scope === value ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</button>)}</div>
          <details className="mt-2"><summary className="cursor-pointer text-xs font-bold text-slate-500">Additional filters</summary><div className="mt-2 grid grid-cols-2 gap-2"><select value={assignedUser} onChange={(event) => setAssignedUser(event.target.value)} className="col-span-2 rounded-lg border p-2 text-xs"><option value="">Any assigned employee</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-lg border p-2 text-xs" aria-label="From date" /><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-lg border p-2 text-xs" aria-label="To date" /></div></details>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.map((conversation) => <button key={conversation.id} onClick={() => openConversation(conversation.id)} className={`w-full border-b px-4 py-3 text-left transition hover:bg-slate-50 ${selectedId === conversation.id ? "bg-emerald-50" : conversation.unreadCount ? "bg-blue-50/50" : "bg-white"}`}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{conversation.contactName || conversation.customerName || formatPhoneForDisplay(conversation.phoneNumber)}</div>{conversation.customerId && <div className="truncate text-[11px] font-semibold text-slate-500">{formatPhoneForDisplay(conversation.phoneNumber)}</div>}{conversation.contactName && conversation.customerName && <div className="truncate text-[11px] font-semibold text-slate-500">{conversation.customerName}</div>}</div><span className={`shrink-0 text-[10px] ${conversation.unreadCount ? "font-black text-emerald-700" : "text-slate-400"}`}>{shortDate(conversation.lastMessageAt)}</span></div>
            <div className="mt-1 flex items-center justify-between gap-2"><p className="truncate text-xs text-slate-500">{conversation.lastMessageText || "No messages"}</p>{conversation.unreadCount > 0 && <span className="min-w-5 shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-center text-[10px] font-black text-white">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span>}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase tracking-wide">{conversation.linkedJobs.map((job) => <span key={job.jobId} className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">{job.jobNumber}</span>)}{conversation.status === "unassigned" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Unassigned</span>}{conversation.needsJobAssignment && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">Job required</span>}{conversation.status === "closed" && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-600">Closed</span>}</div>
          </button>)}
          {!loading && conversations.length === 0 && <div className="p-10 text-center"><Inbox className="mx-auto h-9 w-9 text-slate-300" /><h2 className="mt-3 text-sm font-black text-slate-700">No WhatsApp conversations</h2><p className="mt-1 text-xs text-slate-500">No conversations match the selected filters.</p></div>}
          {loading && <div className="flex items-center justify-center p-8 text-slate-400"><Loader2 className="animate-spin" /></div>}
        </div>
        {nextCursor && <button onClick={() => void loadList(true)} disabled={loading} className="border-t p-3 text-xs font-black text-blue-700">Load more conversations</button>}
      </aside>

      <div className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[#efeae2]`}>
        {!selectedId ? <div className="flex h-full flex-col items-center justify-center text-center"><MessageCircle className="h-14 w-14 text-emerald-500" /><h2 className="mt-4 text-xl font-black text-slate-700">FleetFix WhatsApp</h2><p className="mt-2 max-w-sm text-sm text-slate-500">Select a conversation to review its messages and FleetFix association.</p></div> : loadingConversation || !selected ? <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-emerald-600" /></div> : <>
          <header className="border-b bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3"><button onClick={() => { setSelectedId(null); setSelected(null); }} className="md:hidden" aria-label="Back to conversations"><ArrowLeft /></button><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><UserRound size={19} /></div><div className="min-w-0 flex-1"><div className="truncate font-black">{selected.contactName || selected.customerName || formatPhoneForDisplay(selected.phoneNumber)}</div>{selected.customerId && <div className="truncate text-xs text-slate-500">{formatPhoneForDisplay(selected.phoneNumber)}</div>}{selected.contactName && selected.customerName && <div className="truncate text-xs font-semibold text-slate-500">{selected.customerName}</div>}</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${selected.status === "closed" ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>{selected.status}</span></div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
              {selected.customerId ? <Link href={selected.contactId ? `/customers/${selected.customerId}/contacts/${selected.contactId}` : `/customers/${selected.customerId}`} className="font-black text-blue-700 hover:underline">{selected.contactName || selected.customerName}</Link> : <span className="rounded bg-amber-100 px-2 py-1 font-black text-amber-800">Not associated</span>}
              <span className="font-black text-slate-600">Jobs:</span>
              {selected.linkedJobs.map((job) => <span key={job.jobId} className="inline-flex items-center rounded bg-blue-100 text-blue-700"><Link href={`/jobs/${job.jobId}`} className="inline-flex items-center gap-1 px-2 py-1 font-black"><BriefcaseBusiness size={13} />{job.jobNumber}</Link>{capabilities.manage && <button type="button" disabled={saving} onClick={() => void unlinkSelectedJob(job)} aria-label={`Unlink ${job.jobNumber}`} title={`Unlink ${job.jobNumber}`} className="border-l border-blue-200 px-1.5 py-1 font-black disabled:opacity-50">×</button>}</span>)}
              {selected.linkedJobs.length === 0 && <span className="rounded bg-red-100 px-2 py-1 font-black text-red-700">Job assignment required</span>}
              {capabilities.manage && <button type="button" disabled={saving} onClick={() => setJobLinkOpen((open) => !open)} className="rounded border bg-white px-2 py-1 font-black text-blue-700 disabled:opacity-50">+ Link Job</button>}
              <span className="text-slate-500">Assigned: <strong>{selected.assignedUserName || "Unassigned"}</strong></span>
              <span className={`rounded px-2 py-1 font-black ${selected.serviceWindowExpiresAt && new Date(selected.serviceWindowExpiresAt) > new Date() ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{selected.serviceWindowExpiresAt && new Date(selected.serviceWindowExpiresAt) > new Date() ? `Service window open until ${fullTime(selected.serviceWindowExpiresAt)}` : "Service window closed"}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {capabilities.assign && <select value={selected.assignedUserId || ""} disabled={saving} onChange={(event) => void mutate({ action: "assign-user", userId: event.target.value || null })} className="h-9 rounded-lg border bg-white px-2 text-xs font-bold"><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>}
              {capabilities.assign && <button disabled={saving || !currentUserId} onClick={() => void mutate({ action: "assign-user", userId: currentUserId })} className="h-9 rounded-lg border bg-white px-3 text-xs font-bold">Assign to me</button>}
              {capabilities.close && <button disabled={saving} onClick={() => void mutate({ action: selected.status === "closed" ? "reopen" : "close" })} className="h-9 rounded-lg border bg-white px-3 text-xs font-bold">{selected.status === "closed" ? "Reopen" : "Close"}</button>}
              {!selected.customerId && <button disabled={!capabilities.manage || saving} onClick={() => { setAssociationOpen(true); setAssociationSearched(false); setAssociationSearch(""); setAssociationCustomers([]); setAssociationCustomerId(""); setAssociationContactId(""); }} title={capabilities.manage ? "Associate this conversation with an existing customer or contact" : "Manage conversations permission is required"} className="h-9 rounded-lg border bg-white px-3 text-xs font-bold text-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">Associate customer/contact</button>}
            </div>
            {associationOpen && !selected.customerId && <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-black uppercase text-blue-800">Associate customer/contact</div><p className="mt-1 text-xs text-slate-600">Search existing FleetFix records. This does not change the customer or contact phone number.</p></div><button type="button" onClick={() => setAssociationOpen(false)} disabled={saving} aria-label="Close association panel" className="rounded-lg p-1 text-slate-500 hover:bg-white disabled:opacity-50"><X size={16} /></button></div>
              <form onSubmit={(event) => { event.preventDefault(); void searchAssociationOptions(); }} className="mt-3 flex gap-2"><input value={associationSearch} onChange={(event) => setAssociationSearch(event.target.value)} placeholder="Customer, contact or phone number" className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-xs" /><button disabled={associationLoading || associationSearch.trim().length < 2} className="rounded-lg bg-blue-700 px-3 text-xs font-black text-white disabled:opacity-50">{associationLoading ? "Searching…" : "Search"}</button></form>
              {associationCustomers.length > 0 && <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">Customer<select value={associationCustomerId} onChange={(event) => { setAssociationCustomerId(event.target.value); setAssociationContactId(""); }} className="mt-1 w-full rounded-lg border bg-white p-2 text-xs"><option value="">Select a customer</option>{associationCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phoneNumber ? ` · ${customer.phoneNumber}` : ""}</option>)}</select></label>
                <label className="text-xs font-bold text-slate-700">Contact (optional)<select value={associationContactId} onChange={(event) => setAssociationContactId(event.target.value)} disabled={!associationCustomerId} className="mt-1 w-full rounded-lg border bg-white p-2 text-xs disabled:bg-slate-100"><option value="">Customer only</option>{associationCustomer?.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.phoneNumber ? ` · ${contact.phoneNumber}` : ""}</option>)}</select></label>
              </div>}
              {associationSearched && !associationLoading && associationCustomers.length === 0 && <p className="mt-3 text-xs font-semibold text-slate-500">No matching customers or contacts. Try another name or phone number.</p>}
              <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setAssociationOpen(false)} disabled={saving} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold disabled:opacity-50">Cancel</button><button type="button" onClick={() => void associateCustomerContact()} disabled={saving || !associationCustomerId} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? "Associating…" : "Associate"}</button></div>
            </div>}
            {(jobLinkOpen || selected.needsJobAssignment || selected.linkedJobs.length === 0) && capabilities.manage && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3"><div className="flex items-center justify-between"><div className="text-xs font-black uppercase text-red-700">{selected.linkedJobs.length ? "Link another job" : "Job assignment required"}</div>{jobLinkOpen && <button type="button" onClick={() => setJobLinkOpen(false)} aria-label="Close job lookup"><X size={15} /></button>}</div><div className="mt-2 flex gap-2"><input value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} placeholder="Job, registration or fleet no." className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-xs" /><button onClick={() => void loadConversation(selected.id, jobSearch)} className="rounded-lg bg-white px-3 text-xs font-black text-blue-700">Find</button></div><select value="" disabled={saving} onChange={(event) => void linkSelectedJob(event.target.value)} className="mt-2 w-full rounded-lg border bg-white p-2 text-xs font-bold"><option value="">Select the correct FleetFix job</option>{jobs.filter((job) => !selected.linkedJobs.some((linked) => linked.jobId === job.id)).map((job) => <option key={job.id} value={job.id}>{job.jobNumber} · {job.vehicleRegistration || "No registration"} · {job.fleetNumber || "No fleet no."} · {job.status}{job.bookingAt ? ` · ${new Date(job.bookingAt).toLocaleString("en-ZA")}` : ""}{job.description ? ` · ${job.description}` : ""}{job.location ? ` · ${job.location}` : ""}</option>)}</select></div>}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-8">
            {messageCursor && <div className="mb-4 text-center"><button onClick={() => void loadOlderMessages()} className="rounded-full bg-white px-4 py-2 text-xs font-black text-blue-700 shadow">Load older messages</button></div>}
            {messages.map((message) => { const key = dateKey(message.timestamp); const showDate = key !== previousDate; previousDate = key; return <div key={message.id}>{showDate && <div className="my-4 text-center"><span className="rounded-lg bg-white/90 px-3 py-1.5 text-[10px] font-bold text-slate-500 shadow-sm">{key}</span></div>}<div className={`mb-2 flex ${message.direction === "outgoing" ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-xl px-3 py-2 text-sm shadow-sm ${message.direction === "outgoing" ? "rounded-tr-sm bg-[#d9fdd3]" : "rounded-tl-sm bg-white"}`}>{message.jobNumber && <Link href={`/jobs/${message.jobId}`} className="mb-1 inline-flex rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700">{message.jobNumber}</Link>}{message.mediaType && <div className="mb-2 rounded-lg border border-black/10 bg-black/5 p-2 text-xs"><strong className="capitalize">{message.mediaType}</strong><div className="mt-1 text-slate-500">{message.mediaFilename || message.mediaMimeType || "WhatsApp attachment"}</div>{message.mediaIngestionStatus === "stored" && <button onClick={async () => { if (!selectedId) return; try { const response = await whatsappApi<Blob>(`/api/whatsapp/conversations/${selectedId}/messages/${message.id}/media`, { rawResponse: true } as RequestInit & { rawResponse: true }); void response; } catch { setError("The attachment could not be opened."); } }} className="mt-2 font-black text-blue-700">Attachment stored securely</button>}{message.mediaIngestionStatus === "pending" && <div className="mt-1 font-bold text-amber-700">Processing attachment…</div>}{message.mediaIngestionStatus === "failed" && <div className="mt-1 font-bold text-red-700">{message.mediaFailureReason || "Attachment unavailable"}</div>}</div>}<p className="whitespace-pre-wrap break-words text-slate-800">{message.messageText}</p><div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">{capabilities.manage && selected.linkedJobs.length > 0 && <select value={message.jobId || ""} disabled={saving} onChange={(event) => void assignMessageJob(message.id, event.target.value)} aria-label={`Assign job to message at ${fullTime(message.timestamp)}`} className="mr-1 max-w-28 rounded border bg-white px-1 py-0.5 text-[9px] font-bold"><option value="" disabled>Assign job</option>{selected.linkedJobs.map((job) => <option key={job.jobId} value={job.jobId}>{job.jobNumber}</option>)}</select>}<span>{fullTime(message.timestamp)}</span>{message.direction === "outgoing" && <StatusIcon status={message.status} />}</div>{message.status === "failed" && <p className="mt-1 text-[10px] font-bold text-red-600">{message.failureReason || "Message failed"}</p>}</div></div></div>; })}
            {messages.length === 0 && <div className="mt-20 text-center text-slate-500"><MessageCircle className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 font-black">No messages</h2><p className="mt-1 text-sm">This conversation does not contain any messages yet.</p></div>}
          </div>
          <footer className="border-t bg-white p-3">{capabilities.manualOutbound ? <div className="flex flex-wrap items-end gap-2"><label className="min-w-36 text-[10px] font-black uppercase text-slate-500">Job context<select value={outboundJobId} onChange={(event) => setOutboundJobId(event.target.value)} disabled={saving} className="mt-1 block h-10 w-full rounded-lg border bg-white px-2 text-xs font-bold"><option value="">No specific job</option>{selected.linkedJobs.map((job) => <option key={job.jobId} value={job.jobId}>{job.jobNumber}</option>)}</select></label><textarea value={outboundText} onChange={(event) => setOutboundText(event.target.value)} maxLength={4096} rows={2} placeholder="Type a manual WhatsApp reply" className="min-w-52 flex-1 resize-none rounded-xl border bg-white px-3 py-2 text-sm" /><button type="button" disabled={saving || !outboundText.trim()} onClick={() => void sendManualMessage()} className="h-10 rounded-lg bg-emerald-600 px-4 text-xs font-black text-white disabled:bg-slate-300">{saving ? "Sending…" : "Send"}</button></div> : <div className="flex items-center gap-3 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-500"><LockKeyhole size={17} /><span className="flex-1">Preview mode · Manual outbound sending disabled</span><button disabled className="rounded-lg bg-slate-300 px-4 py-2 text-xs font-black text-white">Send</button></div>}</footer>
        </>}
      </div>
    </section>
  </main>;
}
