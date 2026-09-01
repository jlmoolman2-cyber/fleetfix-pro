"use client";

import { useEffect, useMemo, useState } from "react";
import { Columns3, GripVertical } from "lucide-react";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import * as XLSX from "xlsx";

import { Job } from "@/types/job";
import StatusBadge from "@/components/jobs/StatusBadge";
import { formatDateTime24 } from "@/lib/dateTime";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import UserAvatar, { userDisplayName } from "@/components/shared/UserAvatar";

type ColumnDefinition = { id: string; label: string };

type Props = {
  jobs: Job[];
  linkEnabled?: boolean;
  canOpenRestricted?: boolean;
  customColumns?: ColumnDefinition[];
};

const standardColumns: ColumnDefinition[] = [
  { id: "status", label: "Status" },
  { id: "open", label: "Open" },
  { id: "archived", label: "Archived" },
  { id: "jobNumber", label: "Job Number" },
  { id: "queueNumber", label: "Queue Number" },
  { id: "customerName", label: "Customer" },
  { id: "contact", label: "Contact" },
  { id: "customerCode", label: "Customer Code" },
  { id: "vehicle", label: "Vehicle Details" },
  { id: "location", label: "Location" },
  { id: "description", label: "Description" },
  { id: "assignedTo", label: "Assigned To" },
  { id: "jobType", label: "Job Type" },
  { id: "referenceNumber", label: "Reference" },
  { id: "createdBy", label: "Created By" },
  { id: "dateBooked", label: "Created Date" },
  { id: "updatedBy", label: "Updated By" },
];

const defaultSelected = ["jobNumber", "status", "customerName", "vehicle", "description", "location", "dateBooked"];
const legacyStorageKey = "fleetfix_jobs_columns_v1";
const excludedColumnIds = new Set(["faultCode", "faultCause", "faultReason"]);
const emptyCustomColumns: ColumnDefinition[] = [];

function displayValue(value: any): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value?.toDate === "function") return formatDateTime24(value.toDate());
  if (value instanceof Date) return formatDateTime24(value);
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? item.name || item.label || JSON.stringify(item) : item).join(", ");
  if (typeof value === "object") return value.name || value.label || value.addressText || JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function displayQueueNumber(value: any): string {
  const queueNumber = Number(String(value ?? "").replace(/\D/g, ""));
  return Number.isFinite(queueNumber) && queueNumber > 0 ? String(queueNumber) : displayValue(value);
}

export default function JobsList({ jobs, linkEnabled = true, canOpenRestricted = false, customColumns = emptyCustomColumns }: Props) {
  const [userProfiles, setUserProfiles] = useState<Record<string, any>>({});
  const availableColumns = useMemo(() => {
    const seen = new Set<string>();
    const customLabels = new Map(customColumns.map((column) => [column.id, column.label]));
    const labelledStandardColumns = standardColumns.map((column) => ({
      ...column,
      label: customLabels.get(column.id) || column.label,
    }));
    return [...labelledStandardColumns, ...customColumns].filter((column) => {
      if (excludedColumnIds.has(column.id)) return false;
      if (seen.has(column.id)) return false;
      seen.add(column.id);
      return true;
    });
  }, [customColumns]);

  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelected);
  const [orderedIds, setOrderedIds] = useState<string[]>(standardColumns.map((column) => column.id));
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columnsLoaded, setColumnsLoaded] = useState(false);
  const [draggedId, setDraggedId] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "jobNumber", direction: "desc" });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [preferenceUserId, setPreferenceUserId] = useState("");

  useEffect(() => {
    Promise.all([
      getDocs(collection(clientDb, "users")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "users")),
    ]).then(([globalUsers, companyUsers]) => {
      const profiles: Record<string, any> = {};
      globalUsers.docs.forEach((snapshot) => { profiles[snapshot.id] = { id: snapshot.id, ...snapshot.data() }; });
      companyUsers.docs.forEach((snapshot) => { profiles[snapshot.id] = { ...profiles[snapshot.id], id: snapshot.id, ...snapshot.data() }; });
      setUserProfiles(profiles);
    }).catch((error) => console.error("Unable to load assigned-user colours", error));
  }, []);

  useEffect(() => {
    let active = true;
    async function loadPreferences() {
      try {
        const auth = getAuth();
        await auth.authStateReady();
        const userId = auth.currentUser?.uid || "anonymous";
        const userStorageKey = `${COMPANY_ID}:${userId}:jobs:screen-preferences:v2`;
        const saved = localStorage.getItem(userStorageKey) || localStorage.getItem(legacyStorageKey);
        let remote: any = null;
        if (auth.currentUser) {
          try {
            const userSnapshot = await getDoc(doc(clientDb, "companies", COMPANY_ID, "users", userId));
            remote = userSnapshot.exists() ? userSnapshot.data().screenPreferences?.jobs : null;
          } catch (error) {
            console.warn("Unable to load cloud job preferences; using this browser's saved preferences.", error);
          }
        }
        const parsed = remote && typeof remote === "object" ? remote : saved ? JSON.parse(saved) : null;
        if (!active) return;
        if (Array.isArray(parsed?.selectedIds)) setSelectedIds(parsed.selectedIds);
        if (Array.isArray(parsed?.orderedIds)) setOrderedIds(parsed.orderedIds);
        if (parsed?.columnWidths && typeof parsed.columnWidths === "object") setColumnWidths(parsed.columnWidths);
        if (parsed?.sort?.key && ["asc", "desc"].includes(parsed.sort.direction)) setSort(parsed.sort);
        setPreferenceUserId(userId);
      } catch (error) {
        console.error("Unable to load saved job columns", error);
      } finally {
        if (active) setColumnsLoaded(true);
      }
    }
    void loadPreferences();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const availableIds = availableColumns.map((column) => column.id);
    setOrderedIds((current) => {
      const missingIds = availableIds.filter((id) => !current.includes(id));
      return missingIds.length > 0 ? [...current, ...missingIds] : current;
    });
  }, [availableColumns]);

  useEffect(() => {
    if (!columnsLoaded || !preferenceUserId) return;
    const preferences = { selectedIds, orderedIds, columnWidths, sort };
    const userStorageKey = `${COMPANY_ID}:${preferenceUserId}:jobs:screen-preferences:v2`;
    localStorage.setItem(userStorageKey, JSON.stringify(preferences));
    if (preferenceUserId === "anonymous") return;
    const saveTimer = window.setTimeout(() => {
      void setDoc(
        doc(clientDb, "companies", COMPANY_ID, "users", preferenceUserId),
        { screenPreferences: { jobs: preferences } },
        { merge: true }
      ).catch((error) => console.error("Unable to save job screen preferences", error));
    }, 500);
    return () => window.clearTimeout(saveTimer);
  }, [columnsLoaded, selectedIds, orderedIds, columnWidths, sort, preferenceUserId]);

  const orderedColumns = orderedIds.map((id) => availableColumns.find((column) => column.id === id)).filter(Boolean) as ColumnDefinition[];
  const visibleColumns = orderedColumns.filter((column) => selectedIds.includes(column.id));

  function rawColumnValue(job: Job, id: string): any {
    if (id === "status") return typeof job.status === "string" ? job.status : job.status.name;
    if (id === "open") return !job.isClosed && !job.archived;
    if (id === "archived") return job.archived === true;
    if (id === "jobNumber") return job.jobNumber;
    if (id === "queueNumber") return job.columnValues?.queueNumber || "";
    if (id === "customerName") return job.customerName;
    if (id === "vehicle") return [job.vehicle?.vehicleReg, job.vehicle?.fleetNo].filter(Boolean).join(" / ");
    if (id === "location") return typeof job.location === "string" ? job.location : job.location?.name;
    if (id === "description") return job.description;
    if (id === "dateBooked") return job.bookedDate || job.dateBooked;
    return job.columnValues?.[id];
  }

  function assignedUsers(job: Job): any[] {
    const storedUsers = Array.isArray(job.columnValues?.assignedUsers) ? job.columnValues.assignedUsers : [];
    if (storedUsers.length > 0) return storedUsers.map((user: any) => ({ ...userProfiles[user.id], ...user }));
    const names = String(job.columnValues?.assignedTo || job.assignedUser || "").split(",").map((name) => name.trim()).filter((name) => name && name !== "Unassigned");
    return names.map((name) => Object.values(userProfiles).find((profile: any) => userDisplayName(profile).toLowerCase() === name.toLowerCase()) || { name });
  }

  function assignedUserAvatars(job: Job) {
    const users = assignedUsers(job);
    if (users.length === 0) return <span className="text-gray-400">—</span>;
    return <div className="flex flex-nowrap items-center gap-1 overflow-visible">{users.map((user, index) => {
      const name = userDisplayName(user);
      return <UserAvatar key={user.id || `${name}-${index}`} user={user} />;
    })}</div>;
  }

  function userAvatarForValue(value: any) {
    const name = displayValue(value);
    if (name === "â€”") return <span className="text-gray-400">â€”</span>;
    const profile = Object.values(userProfiles).find((user: any) => userDisplayName(user).toLowerCase() === name.toLowerCase()) || name;
    return <UserAvatar user={profile} />;
  }

  const sortedJobs = useMemo(() => [...jobs].sort((left, right) => {
    const leftValue = displayValue(rawColumnValue(left, sort.key));
    const rightValue = displayValue(rawColumnValue(right, sort.key));
    return leftValue.localeCompare(rightValue, undefined, { numeric: true }) * (sort.direction === "asc" ? 1 : -1);
  }), [jobs, sort]);

  function toggleColumn(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function moveDraggedColumn(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setOrderedIds((current) => {
      const next = current.filter((id) => id !== draggedId);
      next.splice(next.indexOf(targetId), 0, draggedId);
      return next;
    });
    setDraggedId("");
  }

  function exportVisibleJobs() {
    if (visibleColumns.length === 0 || sortedJobs.length === 0) {
      alert("There are no visible jobs and columns to export.");
      return;
    }
    const exportRows = sortedJobs.map((job) => Object.fromEntries(
      visibleColumns.map((column) => [column.label, displayValue(rawColumnValue(job, column.id))])
    ));
    const worksheet = XLSX.utils.json_to_sheet(exportRows, {
      header: visibleColumns.map((column) => column.label),
    });
    worksheet["!cols"] = visibleColumns.map((column) => ({
      wch: Math.min(45, Math.max(14, column.label.length + 2)),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Jobs");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `FleetFix-Jobs-${date}.xlsx`);
  }

  function startColumnResize(event: React.MouseEvent, columnId: string) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[columnId] || 160;
    const handleMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(90, Math.min(600, startWidth + moveEvent.clientX - startX));
      setColumnWidths((current) => ({ ...current, [columnId]: nextWidth }));
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  const largestAssignedUserCount = jobs.reduce((largest, job) => Math.max(largest, assignedUsers(job).length), 0);
  const assignedUsersAutoWidth = Math.max(160, largestAssignedUserCount * 36 + 24);
  const visibleWidths = visibleColumns.map((column) => {
    const savedWidth = columnWidths[column.id] || 160;
    return column.id === "assignedTo" || column.id === "assignedUsers"
      ? Math.max(savedWidth, assignedUsersAutoWidth)
      : savedWidth;
  });
  const gridStyle = {
    gridTemplateColumns: visibleWidths.map((width) => `${width}px`).join(" ") || "160px",
    minWidth: `${visibleWidths.reduce((total, width) => total + width, 0) || 160}px`,
  };

  return <div className="module-list-panel">
    <div className="relative mb-3 flex items-center justify-between">
      <span className="text-sm font-semibold text-gray-500">{jobs.length} jobs · {visibleColumns.length} columns</span>
      <div className="flex gap-2">
        <button onClick={exportVisibleJobs} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold shadow-sm hover:bg-gray-50">Export Excel</button>
        <button onClick={() => setColumnsOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold shadow-sm hover:bg-gray-50"><Columns3 className="h-4 w-4" />Columns</button>
      </div>
      {columnsOpen && <div className="absolute right-0 top-11 z-40 max-h-[70vh] w-72 overflow-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl">
        <div className="mb-2 border-b border-gray-200 px-2 pb-3"><h3 className="font-black text-gray-900">Columns</h3><p className="text-xs text-gray-500">Select columns and drag to reorder.</p></div>
        {orderedColumns.map((column) => <div key={column.id} draggable onDragStart={() => setDraggedId(column.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveDraggedColumn(column.id)} className="flex cursor-move items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-gray-50">
          <GripVertical className="h-4 w-4 shrink-0 text-gray-400" />
          <input type="checkbox" checked={selectedIds.includes(column.id)} onChange={() => toggleColumn(column.id)} className="h-4 w-4 rounded" />
          <span className="truncate text-sm">{column.label}</span>
        </div>)}
      </div>}
    </div>

    {visibleColumns.length === 0 ? <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-gray-500">Select at least one column from the Columns menu.</div> : <div className="module-list-scroll pb-2">
      <div className="sticky top-0 z-20 grid gap-2 bg-[#f5f7fb] px-3 pb-2 text-xs font-extrabold uppercase tracking-wide text-gray-600" style={gridStyle}>
        {visibleColumns.map((column) => <div key={column.id} className="relative flex min-w-0 items-center pr-3"><button onClick={() => setSort((current) => ({ key: column.id, direction: current.key === column.id && current.direction === "asc" ? "desc" : "asc" }))} className="flex min-w-0 items-center gap-1 truncate text-left hover:text-blue-700"><span className="truncate">{column.label}</span><span>{sort.key === column.id ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span></button><span onMouseDown={(event) => startColumnResize(event, column.id)} className="absolute -right-1 top-0 h-full w-3 cursor-col-resize border-r-2 border-transparent hover:border-blue-500" title="Drag to resize column" /></div>)}
      </div>

      <div className="space-y-1.5">
        {sortedJobs.map((job) => {
          const row = <div className="grid items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium leading-5 text-gray-800 shadow-sm transition hover:border-blue-300 hover:shadow" style={gridStyle}>
            {visibleColumns.map((column) => <div key={column.id} className="min-w-0 truncate" title={displayValue(rawColumnValue(job, column.id))}>
              {column.id === "status" ? <StatusBadge status={job.status} /> : column.id === "jobNumber" ? <span className="font-black text-blue-600">{job.jobNumber}</span> : column.id === "assignedTo" || column.id === "assignedUsers" ? assignedUserAvatars(job) : column.id === "createdBy" || column.id === "updatedBy" ? userAvatarForValue(rawColumnValue(job, column.id)) : column.id === "queueNumber" ? <span className="font-black text-black">{displayQueueNumber(rawColumnValue(job, column.id))}</span> : column.id === "open" || column.id === "archived" ? <span className={`inline-flex rounded-full px-2 py-0.5 font-bold ${rawColumnValue(job, column.id) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{rawColumnValue(job, column.id) ? "Yes" : "No"}</span> : displayValue(rawColumnValue(job, column.id))}
            </div>)}
          </div>;
          const canOpen = linkEnabled && (!(job.isClosed || job.archived) || canOpenRestricted);
          return canOpen ? <a href={`/jobs/${job.id}`} key={job.id} className="block">{row}</a> : <div key={job.id} title="Only an administrator can open this job">{row}</div>;
        })}
        {sortedJobs.length === 0 && <div className="rounded-xl border bg-white p-8 text-center text-gray-500">No jobs found</div>}
      </div>
    </div>}
  </div>;
}
