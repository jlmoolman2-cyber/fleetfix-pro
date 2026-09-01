"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";

import PageHeader from "@/app/components/PageHeader";
import JobsList from "@/components/jobs/JobsList";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import { Job } from "@/types/job";
import { hasPrivilegedRole } from "@/lib/accessControl";
import { recalculateActiveJobQueue } from "@/lib/jobQueue";

type LifecycleMode = "closed" | "archived";

const ARCHIVE_AFTER_MS = 60 * 24 * 60 * 60 * 1000;

function asDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isAdministrator(userData: any) {
  return hasPrivilegedRole(userData?.primaryRole || userData?.role);
}

export default function JobLifecyclePage({ mode }: { mode: LifecycleMode }) {
  const router = useRouter();
  const [rawJobs, setRawJobs] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [restoringId, setRestoringId] = useState("");

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "statuses"),
    (snapshot) => setStatuses(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
  ), []);

  useEffect(() => {
    const jobsQuery = query(
      collection(clientDb, "companies", COMPANY_ID, "jobs"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(jobsQuery, (snapshot) => {
      setRawJobs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
  }, []);

  useEffect(() => {
    if (!isAdmin || statuses.length === 0) return;
    const overdueJobs = rawJobs.filter((jobData) => {
      if (jobData.archived === true) return false;
      const statusSetup = statuses.find((status) =>
        (jobData.statusId && status.id === jobData.statusId) || status.name === jobData.status
      );
      const isClosed = jobData.isClosed === true || statusSetup?.closeJob === true ||
        ["closed", "job closed"].includes(String(jobData.status || "").trim().toLowerCase());
      const closedAt = asDate(jobData.closedAt) ||
        (statusSetup?.closeJob === true ? asDate(jobData.updatedAt) : null);
      return Boolean(isClosed && closedAt && Date.now() - closedAt.getTime() >= ARCHIVE_AFTER_MS);
    });
    overdueJobs.forEach((jobData) => {
      updateDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", jobData.id), {
        archived: true,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((error) => console.error("Unable to archive overdue job", jobData.id, error));
    });
  }, [isAdmin, rawJobs, statuses]);

  useEffect(() => {
    let active = true;
    async function loadRole() {
      const auth = getAuth();
      await auth.authStateReady();
      const user = auth.currentUser;
      let userData: any = null;
      if (user) {
        const companyUser = await getDoc(doc(clientDb, "companies", COMPANY_ID, "users", user.uid));
        if (companyUser.exists()) userData = companyUser.data();
        else {
          const globalUser = await getDoc(doc(clientDb, "users", user.uid));
          if (globalUser.exists()) userData = globalUser.data();
        }
      }
      if (active) {
        setIsAdmin(isAdministrator(userData));
        setAuthChecked(true);
      }
    }
    loadRole();
    return () => { active = false; };
  }, []);

  const jobs = useMemo(() => rawJobs.flatMap((jobData): Job[] => {
    const statusSetup = statuses.find((status) =>
      (jobData.statusId && status.id === jobData.statusId) || status.name === jobData.status
    );
    const closedAt = asDate(jobData.closedAt) ||
      (statusSetup?.closeJob === true ? asDate(jobData.updatedAt) : null);
    const isClosed = jobData.isClosed === true || statusSetup?.closeJob === true ||
      ["closed", "job closed"].includes(String(jobData.status || "").trim().toLowerCase());
    const isOlderThan60Days = Boolean(closedAt && Date.now() - closedAt.getTime() >= ARCHIVE_AFTER_MS);
    const archived = jobData.archived === true || (isClosed && isOlderThan60Days);
    if (mode === "closed" ? (!isClosed || archived) : !archived) return [];

    const location = typeof jobData.location === "string"
      ? jobData.location
      : jobData.location?.addressText || jobData.location?.name || "Unknown Location";
    return [{
      id: jobData.id,
      jobNumber: jobData.jobNumber || "Unknown",
      status: {
        id: statusSetup?.id || jobData.statusId || "",
        name: statusSetup?.name || jobData.status || "Job Closed",
        color: statusSetup?.color || "bg-gray-200",
        textColor: statusSetup?.textColor || "text-gray-800",
      },
      customerName: jobData.customerName || jobData.customer || "Unknown",
      description: jobData.description || "No description",
      location,
      dateBooked: jobData.dateBooked || asDate(jobData.createdAt)?.toLocaleDateString("en-ZA") || "Unknown",
      vehicle: {
        fleetNo: jobData.vehicleFleetNo || jobData.vehicle?.fleetNo || "-",
        vehicleReg: jobData.vehicleRegNo || jobData.vehicle?.vehicleReg || "-",
        make: jobData.vehicleMake || "",
        model: jobData.vehicleModel || "",
        type: jobData.vehicleType || "",
      },
      isClosed,
      archived,
      closedAt,
    }];
  }), [mode, rawJobs, statuses]);

  async function restoreAndOpen(jobId: string) {
    if (!isAdmin) return;
    const startStatus = statuses.find((status) => status.startStatus === true && status.active !== false);
    if (!startStatus) {
      alert("Configure an active Start Status before restoring an archived job.");
      return;
    }
    try {
      setRestoringId(jobId);
      await updateDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", jobId), {
        archived: false,
        archivedAt: null,
        isClosed: false,
        closedAt: null,
        isCompleted: false,
        completedAt: null,
        reopenedAt: serverTimestamp(),
        status: startStatus.name,
        statusId: startStatus.id,
        updatedAt: serverTimestamp(),
      });
      await recalculateActiveJobQueue();
      router.push(`/jobs/${jobId}`);
    } finally {
      setRestoringId("");
    }
  }

  if (mode === "archived" && authChecked && !isAdmin) {
    return <main className="min-h-screen bg-[#f5f7fb] p-6"><div className="mx-auto max-w-3xl rounded-3xl border bg-white p-10 text-center"><h1 className="text-2xl font-black">Administrator access required</h1><p className="mt-2 text-gray-500">Only administrators can view or restore archived jobs.</p><Link href="/jobs" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Back to jobs</Link></div></main>;
  }

  return <main className="min-h-screen bg-[#f5f7fb] p-6">
    <PageHeader />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div><h1 className="text-2xl font-black">{mode === "closed" ? "Closed Jobs" : "Archived Jobs"}</h1><p className="mt-1 text-sm text-gray-500">{mode === "closed" ? "Closed during the last 60 days" : "Jobs closed for 60 days or longer"}</p></div>
      <div className="flex gap-2"><Link href="/jobs" className="rounded-full bg-slate-100 px-5 py-3 font-bold text-slate-700">Active Jobs</Link><Link href="/jobs/closed" className="rounded-full bg-slate-100 px-5 py-3 font-bold text-slate-700">Closed Jobs</Link>{isAdmin && <Link href="/jobs/archive" className="rounded-full bg-slate-100 px-5 py-3 font-bold text-slate-700">Archived Jobs</Link>}</div>
    </div>
    <JobsList jobs={jobs} linkEnabled={mode === "closed" ? true : isAdmin} />
    {mode === "archived" && isAdmin && jobs.length > 0 && <div className="mt-4 space-y-2 rounded-2xl border bg-white p-4"><h2 className="font-black">Administrator actions</h2>{jobs.map((job) => <div key={job.id} className="flex items-center justify-between border-t py-3"><span className="font-bold">{job.jobNumber} — {job.customerName}</span><button onClick={() => restoreAndOpen(job.id)} disabled={restoringId === job.id} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">{restoringId === job.id ? "Restoring…" : "Restore & Open"}</button></div>)}</div>}
  </main>;
}
