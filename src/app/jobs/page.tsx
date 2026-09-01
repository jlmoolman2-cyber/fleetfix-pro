"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

import {
  clientDb,
} from "@/lib/firebaseClient";

import JobsList from "@/components/jobs/JobsList";
import ModuleSearchField from "@/components/ModuleSearchField";

import {
  Job,
  JobStatus,
} from "@/types/job";

import PageHeader from "@/app/components/PageHeader";
import { hasPrivilegedRole } from "@/lib/accessControl";
import { COMPANY_ID } from "@/lib/company";

const JOB_LIFECYCLE_FILTERS_KEY = `${COMPANY_ID}:jobs:lifecycle-filters`;

export default function JobsPage() {

  const [jobs, setJobs] =
    useState<Job[]>([]);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [jobTypeFilter, setJobTypeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [customColumns, setCustomColumns] = useState<Array<{ id: string; label: string }>>([]);
  const [jobLocations, setJobLocations] = useState<any[]>([]);

  const [
    statuses,
    setStatuses,
  ] = useState<any[]>([]);

  useEffect(() => {
    async function loadLifecyclePreferences() {
      try {
        const auth = getAuth();
        await auth.authStateReady();
        const userId = auth.currentUser?.uid || "anonymous";
        const savedFilters = window.localStorage.getItem(`${JOB_LIFECYCLE_FILTERS_KEY}:${userId}`) || window.localStorage.getItem(JOB_LIFECYCLE_FILTERS_KEY);
        let parsed: any = savedFilters ? JSON.parse(savedFilters) : null;
        if (auth.currentUser) {
          try {
            const userSnapshot = await getDoc(doc(clientDb, "companies", COMPANY_ID, "users", userId));
            parsed = userSnapshot.exists() && userSnapshot.data().screenPreferences?.jobsLifecycle
              ? userSnapshot.data().screenPreferences.jobsLifecycle
              : parsed;
          } catch (error) {
            console.warn("Unable to load cloud lifecycle filters; using this browser's preferences.", error);
          }
        }
        setShowClosed(parsed?.showClosed === true);
        setShowArchived(parsed?.showArchived === true);
      } catch (error) {
        console.warn("Unable to restore the saved job lifecycle filters.", error);
      }
    }
    void loadLifecyclePreferences();
  }, []);

  function setLifecycleFilter(filter: "closed" | "archived") {
    const nextClosed = filter === "closed" ? !showClosed : showClosed;
    const nextArchived = filter === "archived" ? !showArchived : showArchived;
    setShowClosed(nextClosed);
    setShowArchived(nextArchived);
    const preferences = { showClosed: nextClosed, showArchived: nextArchived };
    void (async () => {
      try {
        const auth = getAuth();
        await auth.authStateReady();
        const userId = auth.currentUser?.uid || "anonymous";
        window.localStorage.setItem(`${JOB_LIFECYCLE_FILTERS_KEY}:${userId}`, JSON.stringify(preferences));
        if (auth.currentUser) await setDoc(doc(clientDb, "companies", COMPANY_ID, "users", userId), { screenPreferences: { jobsLifecycle: preferences } }, { merge: true });
      } catch (error) {
        console.warn("Unable to save the job lifecycle filters.", error);
      }
    })();
  }

  useEffect(() => {


    const unsub =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "statuses"
        ),

        (snapshot) => {


          const data =
            snapshot.docs.map(
              (doc) => ({

                id: doc.id,

                ...doc.data(),

              })
            );


          setStatuses(
            data
          );


        }


      );


    return () => unsub();


  }, []);

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "job_locations"),
    (snapshot) => setJobLocations(snapshot.docs.map((locationDoc) => ({ id: locationDoc.id, ...locationDoc.data() })))
  ), []);

  useEffect(() => onSnapshot(
    doc(clientDb, "companies", COMPANY_ID, "jobcard_settings", "Job"),
    (snapshot) => {
      if (!snapshot.exists()) return setCustomColumns([]);
      const data = snapshot.data();
      const labels = data.editableLabels || {};
      setCustomColumns((data.selectedFields || []).map((id: string) => ({
        id,
        label: labels[id] || id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character: string) => character.toUpperCase()),
      })));
    }
  ), []);

  useEffect(() => {
    async function loadRole() {
      const auth = getAuth();
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) return;
      let userData: any = null;
      const companyUser = await getDoc(doc(clientDb, "companies", COMPANY_ID, "users", user.uid));
      if (companyUser.exists()) userData = companyUser.data();
      else {
        const globalUser = await getDoc(doc(clientDb, "users", user.uid));
        if (globalUser.exists()) userData = globalUser.data();
      }
      const role = String(userData?.primaryRole || userData?.role || "").toLowerCase();
      setIsAdmin(hasPrivilegedRole(role));
    }
    loadRole();
  }, []);

  useEffect(() => {

    const jobsQuery = query(

      collection(
        clientDb,
        "companies",
        "comp_001",
        "jobs"
      ),

      orderBy(
        "createdAt",
        "desc"
      )
    );

    const unsub = onSnapshot(

      jobsQuery,

      (snapshot) => {

        const data: Job[] =

          snapshot.docs.map(
            (doc) => {

              const jobData =
                doc.data() as any;

              // LOCATION
              const configuredLocation = jobLocations.find((configured) =>
                (jobData.locationId && configured.id === jobData.locationId) ||
                String(configured.name || "").toLowerCase() === String(jobData.location || "").toLowerCase()
              );
              const locationDetails = jobData.locationDetails ||
                (typeof jobData.location === "object" ? jobData.location : configuredLocation || {});
              const location = configuredLocation?.name ||
                locationDetails.name ||
                (typeof jobData.location === "string" ? jobData.location : "") ||
                "Unknown Location";

              // VEHICLE
              const vehicle = {

                fleetNo:

                  jobData.vehicleFleetNo ||

                  jobData.vehicle?.fleetNo ||

                  "",


                vehicleReg:

                  jobData.vehicleRegNo ||

                  jobData.vehicle?.vehicleReg ||

                  "",


                make:

                  jobData.vehicleMake ||

                  "",


                model:

                  jobData.vehicleModel ||

                  "",


                type:

                  jobData.vehicleType ||

                  "",

              };

              // STATUS

              const statusSetup =

                statuses.find(

                  (s) =>

                    (jobData.statusId && s.id === jobData.statusId) ||
                    s.name === jobData.status

                );



              const status: any = {

                id:

                  statusSetup?.id || jobData.statusId || "",

                name:

                  (jobData.isAdvancedBooking === true ? "Setup (Advanced Booking)" : statusSetup?.name) ||

                  jobData.status ||
                  "Job Booked",


                color:

                  statusSetup?.color ||

                  "bg-gray-200",


                textColor:

                  statusSetup?.textColor ||

                  "text-gray-800",

              };

              const closedAt = jobData.closedAt?.toDate?.() ||
                (statusSetup?.closeJob === true ? jobData.updatedAt?.toDate?.() : null);
              const isClosed = jobData.isClosed === true || statusSetup?.closeJob === true ||
                ["closed", "job closed"].includes(String(jobData.status || "").trim().toLowerCase());
              const archived = jobData.archived === true || Boolean(
                isClosed && closedAt && Date.now() - closedAt.getTime() >= 60 * 24 * 60 * 60 * 1000
              );
              const bookedDate = jobData.bookingAt?.toDate?.() ||
                (jobData.dateBooked ? new Date(jobData.dateBooked) : null) ||
                jobData.createdAt?.toDate?.() || null;
              const assignedUser = (jobData.assignedUsers || [])
                .map((user: any) => user.name || user.displayName || user.email)
                .filter(Boolean)
                .join(", ") || jobData.assignedTo || jobData.technician || "Unassigned";
              const statusHistory = Array.isArray(jobData.statusHistory) ? jobData.statusHistory : [];
              const createdBy = jobData.createdByName || jobData.createdBy ||
                statusHistory[0]?.updatedByName || statusHistory[0]?.createdByName || "System";
              const updatedBy = jobData.updatedByName || jobData.updatedBy ||
                statusHistory[statusHistory.length - 1]?.updatedByName ||
                statusHistory[statusHistory.length - 1]?.createdByName || createdBy;

              return {

                id:
                  doc.id,

                jobNumber:

                  jobData.jobNumber ||
                  "Unknown",

                status,

                customerName:

                  jobData.customerName ||

                  jobData.customer ||

                  "Unknown",

                description:

                  jobData.description ||

                  "No description",

                location,

                dateBooked:

                  jobData.dateBooked ||

                  jobData.createdAt
                    ?.toDate?.()
                    ?.toLocaleDateString?.() ||

                  "Unknown",

                vehicle,

                statusId:
                  jobData.statusId || "",

                isClosed,
                archived,
                closedAt,
                assignedUser,
                jobType: jobData.jobType || jobData.jobTypeName || "Unspecified",
                bookedDate,
                searchText: JSON.stringify(jobData).toLowerCase(),
                columnValues: {
                  ...jobData,
                  ...(jobData.dynamicFields || {}),
                  ...(jobData.statusFieldValues || {}),
                  contact: jobData.customerContact || jobData.contactName || "",
                  customerCode: jobData.customerCode || "",
                  assignedTo: assignedUser,
                  assignedUsers: Array.isArray(jobData.assignedUsers) ? jobData.assignedUsers : [],
                  jobType: jobData.jobType || jobData.jobTypeName || "",
                  createdDate: bookedDate,
                  updatedBy,
                  createdBy,
                },
              };
            }
          );

        setJobs(data);
      }
    );

    return () => unsub();

  }, [statuses, jobLocations]);

  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const lifecycleMatches = job.archived ? showArchived : job.isClosed ? showClosed : true;
    if (!lifecycleMatches) return false;
    if (job.archived && !isAdmin) return false;
    if (search && !job.searchText?.includes(search.toLowerCase())) return false;
    const statusName = typeof job.status === "string" ? job.status : job.status.name;
    if (statusFilter && statusName !== statusFilter) return false;
    if (userFilter && job.assignedUser !== userFilter) return false;
    if (jobTypeFilter && job.jobType !== jobTypeFilter) return false;
    if (startDate && (!job.bookedDate || job.bookedDate < new Date(`${startDate}T00:00:00`))) return false;
    if (endDate && (!job.bookedDate || job.bookedDate > new Date(`${endDate}T23:59:59`))) return false;
    return true;
  }), [jobs, showClosed, showArchived, isAdmin, search, statusFilter, userFilter, jobTypeFilter, startDate, endDate]);

  const uniqueValues = (values: Array<string | undefined>) =>
    Array.from(new Set(values.filter(Boolean) as string[])).sort();

  const lifecycleSwitch = (label: string, checked: boolean, onChange: () => void, disabled = false) => (
    <label className={`flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-bold ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={onChange} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-blue-600" : "bg-slate-300"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`} />
      </button>
      {label}
    </label>
  );

  return (

    <div className="module-list-page bg-[#f5f7fb]">

      <div className="module-list-content relative p-6">

        <PageHeader />

        {/* JOB TOOLBAR */}
        <div className="
          bg-white
          border
          border-gray-200
          rounded-3xl
          p-3
          shadow-sm
          mb-3
          md:absolute
          md:right-6
          md:top-6
          md:w-auto
          md:border-0
          md:bg-transparent
          md:p-0
          md:shadow-none
        ">

          <div className="
            flex
            flex-col
            md:flex-row
            md:items-center
            md:justify-between
            gap-4
          ">

            {/* SEARCH */}
            <ModuleSearchField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search jobs..."
              className="flex-1 md:w-[420px] md:flex-none"
            />

            {/* MESSAGES */}
            <div className="
              flex
              flex-wrap
              gap-3
            ">

              <button onClick={() => setFiltersOpen((open) => !open)} className="
                h-11
                rounded-full
                bg-blue-500
                px-5
                py-2
                text-sm
                font-semibold
                text-white
                hover:bg-blue-600
              ">
                Filters
              </button>

              {lifecycleSwitch("Closed", showClosed, () => setLifecycleFilter("closed"))}
              {lifecycleSwitch("Archived", showArchived, () => setLifecycleFilter("archived"), !isAdmin)}

              <a
                href="/jobs/new"
                className="
                  h-11
                  rounded-2xl
                  bg-blue-600
                  px-6
                  py-2
                  text-sm
                  font-black
                  text-white
                  inline-flex
                  flex-col
                  items-center
                  justify-center
                  leading-tight
                "
              >
                + Add<br />Job
              </a>

            </div>

          </div>

          {filtersOpen && <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 md:grid-cols-2 xl:grid-cols-5">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-gray-200 p-3 text-sm"><option value="">All statuses</option>{uniqueValues(jobs.map((job) => typeof job.status === "string" ? job.status : job.status.name)).map((value) => <option key={value}>{value}</option>)}</select>
            <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} className="rounded-xl border border-gray-200 p-3 text-sm"><option value="">All users</option>{uniqueValues(jobs.map((job) => job.assignedUser)).map((value) => <option key={value}>{value}</option>)}</select>
            <select value={jobTypeFilter} onChange={(event) => setJobTypeFilter(event.target.value)} className="rounded-xl border border-gray-200 p-3 text-sm"><option value="">All job types</option>{uniqueValues(jobs.map((job) => job.jobType)).map((value) => <option key={value}>{value}</option>)}</select>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-xl border border-gray-200 p-3 text-sm" aria-label="Start date" />
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-xl border border-gray-200 p-3 text-sm" aria-label="End date" />
          </div>}

        </div>

        {/* JOBS TABLE */}
        <div className="module-list-content pb-6">

          <JobsList jobs={filteredJobs} canOpenRestricted={isAdmin} customColumns={customColumns} />

        </div>

      </div>

    </div>
  );
}
