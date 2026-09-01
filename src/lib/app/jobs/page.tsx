"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import JobsList from "@/components/jobs/JobsList";

import {
  Job,
  JobStatus,
} from "@/types/job";

import PageHeader from "@/app/components/PageHeader";

export default function JobsPage() {

  const [jobs, setJobs] =
    useState<Job[]>([]);

  const [
    statuses,
    setStatuses,
  ] = useState<any[]>([]);

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
              const location =

                typeof jobData.location ===
                  "string"

                  ? jobData.location

                  : jobData.location
                    ?.addressText ||

                  jobData.location
                    ?.name ||

                  "Unknown Location";

              // VEHICLE
              const vehicle = {

                fleetNo:

                  jobData.vehicleFleetNo ||

                  jobData.vehicle?.fleetNo ||

                  "-",


                vehicleReg:

                  jobData.vehicleRegNo ||

                  jobData.vehicle?.vehicleReg ||

                  "-",


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

                    s.name ===
                    jobData.status

                );



              const status: any = {

                name:

                  statusSetup?.name ||

                  jobData.status ||
                  "Job Booked",


                color:

                  statusSetup?.color ||

                  "bg-gray-200",


                textColor:

                  statusSetup?.textColor ||

                  "text-gray-800",

              };

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
              };
            }
          );

        setJobs(data);
      }
    );

    return () => unsub();

  }, [statuses]);

  return (

    <div className="min-h-screen bg-[#f5f7fb]">

      <div className="p-6">

        <PageHeader />

        {/* JOB TOOLBAR */}
        <div className="
          bg-white
          border
          border-gray-200
          rounded-3xl
          p-5
          shadow-sm
          mb-6
        ">

          <div className="
            flex
            flex-col
            xl:flex-row
            xl:items-center
            xl:justify-between
            gap-4
          ">

            {/* SEARCH */}
            <div className="
              flex-1
              flex
              items-center
              gap-3
              rounded-2xl
              border
              border-gray-200
              bg-slate-50
              px-4
              py-3
            ">

              <span className="text-slate-400">
                🔍
              </span>

              <input
                type="search"
                placeholder="Search jobs..."
                className="
                  w-full
                  bg-transparent
                  text-sm
                  outline-none
                  placeholder:text-slate-400
                "
              />

            </div>

            {/* MESSAGES */}
            <div className="
              flex
              flex-wrap
              gap-3
            ">

              <button className="
                rounded-full
                bg-slate-800
                px-5
                py-3
                text-sm
                font-semibold
                text-white
              ">
                Filters
              </button>

              <button className="
                rounded-full
                bg-slate-100
                px-5
                py-3
                text-sm
                font-semibold
                text-slate-700
              ">
                Closed Jobs
              </button>

              <button className="
                rounded-full
                bg-slate-100
                px-5
                py-3
                text-sm
                font-semibold
                text-slate-700
              ">
                Archived Jobs
              </button>

              <button className="
                rounded-full
                border
                border-slate-300
                bg-white
                px-5
                py-3
                text-sm
                font-semibold
                text-slate-700
              ">
                Export
              </button>

              <a
                href="/jobs/new"
                className="
                  rounded-full
                  bg-[#1d4ed8]
                  px-5
                  py-3
                  text-sm
                  font-semibold
                  text-white
                  inline-flex
                  items-center
                  justify-center
                "
              >
                Add Job +
              </a>

            </div>

          </div>

        </div>

        {/* JOBS TABLE */}
        <div className="pb-6">

          <JobsList jobs={jobs} />

        </div>

      </div>

    </div>
  );
}