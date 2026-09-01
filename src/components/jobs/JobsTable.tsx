"use client";

import { Job } from "@/types/job";
import StatusBadge from "@/components/jobs/StatusBadge";

type Props = {
  jobs: Job[];
};

export function JobsList({ jobs }: Props) {
  if (!jobs || jobs.length === 0) {
    return (
      <div className="p-4 text-gray-500">
        No jobs found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="border rounded-xl p-4 shadow-sm bg-white"
        >
          <div className="grid grid-cols-7 gap-3 text-sm font-semibold items-center">

            {/* 1. Job Number */}
            <div>{job.jobNumber}</div>

            {/* 2. Status */}
            <div>
              <StatusBadge status={job.status} />
            </div>

            {/* 3. Customer */}
            <div>{job.customerName}</div>

            {/* 4. Vehicle */}
            <div className="text-xs text-gray-600">
              {[job.vehicle.vehicleReg, job.vehicle.fleetNo].filter(Boolean).join(" / ") || "—"}
            </div>

            {/* 5. Description */}
            <div className="truncate">
              {job.description}
            </div>

            {/* 6. Location */}
            <div className="truncate">
              {typeof job.location === "string"
                ? job.location
                : job.location?.name ||
                "Unknown Location"}
            </div>

            {/* 7. Booking Date */}
            <div>{job.dateBooked}</div>

          </div>
        </div>
      ))}
    </div>
  );
}
