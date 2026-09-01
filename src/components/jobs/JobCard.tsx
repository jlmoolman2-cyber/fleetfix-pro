"use client";

import { Job } from "@/types/job";
import StatusBadge from "@/components/jobs/StatusBadge";

type Props = {
  job: Job;
};

export default function JobCard({ job }: Props) {
  return (
    <div className="border rounded-xl p-4 bg-white shadow-sm">

      <a
        href={`/jobs/${job.id}`}
        className="text-red-600 font-bold text-lg hover:underline"
      >
        {job.jobNumber}
      </a>

      <div className="mt-2 text-sm">
        <strong>Status:</strong> <StatusBadge status={job.status} />
      </div>

      <div className="text-sm">
        <strong>Customer:</strong> {job.customerName}
      </div>

      <div className="text-sm">
        <strong>Description:</strong> {job.description}
      </div>

      <div className="text-sm">
        <strong>Location:</strong>{" "}
        {typeof job.location === "string"
          ? job.location
          : job.location && typeof job.location === "object"
            ? job.location.addressText || job.location.name || "Unknown Location"
            : "Unknown Location"}
      </div>

      <div className="text-sm mt-2">
        <strong>Vehicle:</strong>

        <div>{job.vehicle?.fleetNo ?? 'Unknown'}</div>
        <div>{job.vehicle?.vehicleReg ?? 'Unknown'}</div>
      </div>

      <div className="text-sm mt-2">
        <strong>Date:</strong> {job.dateBooked}
      </div>

    </div>
  );
}
