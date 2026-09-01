import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";

import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

function queueOrder(job: any): number {
  const queueNumber = Number(String(job.queueNumber ?? "").replace(/\D/g, ""));
  return Number.isFinite(queueNumber) && queueNumber > 0
    ? queueNumber
    : Number.MAX_SAFE_INTEGER;
}

function dateOrder(job: any): number {
  const value = job.bookingAt?.toDate?.() || job.createdAt?.toDate?.() ||
    (job.dateBooked ? new Date(job.dateBooked) : null);
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? value.getTime()
    : Number.MAX_SAFE_INTEGER;
}

function assignedUserKeys(job: any): string[] {
  const ids = Array.isArray(job.assignedUserIds) ? job.assignedUserIds.filter(Boolean) : [];
  if (ids.length > 0) return ids.map(String);
  const embeddedIds = Array.isArray(job.assignedUsers)
    ? job.assignedUsers.map((user: any) => user?.id).filter(Boolean).map(String)
    : [];
  if (embeddedIds.length > 0) return embeddedIds;
  if (job.assignedUserId) return [String(job.assignedUserId)];
  return [`unassigned:${job.id}`];
}

function firestoreDate(value: any): Date | null {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

function jobIsOnRoute(job: any) {
  return /on\s*route|en\s*route|travell?ing|dispatched/i.test(String(job.status || ""));
}

function liveQueuePriority(job: any): number {
  if (job.workStartedAt != null && !jobIsOnRoute(job)) return 0;
  if (jobIsOnRoute(job)) return 1;
  return 2;
}

export async function recalculateActiveJobQueue(): Promise<void> {
  const jobsCollection = collection(clientDb, "companies", COMPANY_ID, "jobs");
  const snapshot = await getDocs(jobsCollection);
  const jobs = snapshot.docs
    .map((jobDocument) => ({ id: jobDocument.id, ...jobDocument.data() } as any))
    .sort((left, right) =>
      queueOrder(left) - queueOrder(right) ||
      dateOrder(left) - dateOrder(right) ||
      String(left.id).localeCompare(String(right.id))
    );

  const activeJobs = jobs
    .filter((job) =>
      job.isClosed !== true && job.isCompleted !== true && job.archived !== true
    )
    .sort((left, right) =>
      liveQueuePriority(left) - liveQueuePriority(right) ||
      queueOrder(left) - queueOrder(right) ||
      dateOrder(left) - dateOrder(right) ||
      String(left.id).localeCompare(String(right.id))
    );
  const closedJobsWithQueue = jobs.filter((job) =>
    (job.isClosed === true || job.isCompleted === true || job.archived === true) && job.queueNumber != null
  );
  const calculationTime = Date.now();
  const technicianAvailableAt = new Map<string, number>();
  const technicianQueuePosition = new Map<string, number>();

  // Closing a job completes the work at the job location. Its assigned user is
  // still unavailable until the remaining one-way return trip to base is done.
  jobs.filter((job) => job.isClosed === true || job.isCompleted === true).forEach((job) => {
    const closedAt = firestoreDate(job.completedAt) || firestoreDate(job.closedAt);
    if (!closedAt) return;
    const returnMinutes = Math.ceil(Math.max(0, Number(job.travelTimeMinutes) || 0) / 2);
    const returnToBaseAt = closedAt.getTime() + returnMinutes * 60_000;
    if (returnToBaseAt <= calculationTime) return;
    assignedUserKeys(job).forEach((userKey) => {
      technicianAvailableAt.set(
        userKey,
        Math.max(technicianAvailableAt.get(userKey) || calculationTime, returnToBaseAt)
      );
    });
  });

  const updates = [
    ...activeJobs.map((job, index) => {
      const userKeys = assignedUserKeys(job);
      const queuePosition = Math.max(
        ...userKeys.map((userKey) => (technicianQueuePosition.get(userKey) || 0) + 1)
      );
      userKeys.forEach((userKey) => technicianQueuePosition.set(userKey, queuePosition));
      const etaPaused = job.edtPaused === true ||
        /on\s*hold|hold/.test(String(job.status || "").toLowerCase()) ||
        job.externalServiceProvider === true ||
        (job.workStartedAt != null && !jobIsOnRoute(job));
      let estimatedArrivalAt = null;

      if (!etaPaused) {
        const userAvailableAt = Math.max(
          calculationTime,
          ...userKeys.map((userKey) => technicianAvailableAt.get(userKey) || calculationTime)
        );
        const bookingTime = firestoreDate(job.bookingAt)?.getTime() ||
          firestoreDate(job.dateBooked)?.getTime() || 0;
        const jobStartsAt = job.isAdvancedBooking === true
          ? Math.max(userAvailableAt, bookingTime)
          : userAvailableAt;
        const roundTripTravelMinutes = Math.max(0, Number(job.travelTimeMinutes) || 0);
        const repairMinutes = Math.max(
          15,
          Number(job.actualRepairMinutes) || Number(job.estimatedRepairMinutes) || 120
        );
        estimatedArrivalAt = Timestamp.fromDate(new Date(
          jobStartsAt + (Math.ceil(roundTripTravelMinutes / 2) + 20) * 60_000
        ));
        const availableAfterJob = jobStartsAt +
          (roundTripTravelMinutes + repairMinutes) * 60_000;
        userKeys.forEach((userKey) => technicianAvailableAt.set(userKey, availableAfterJob));
      } else if (job.workStartedAt != null && !jobIsOnRoute(job)) {
        // The technician has already arrived, so this job has no ETA. It must
        // still occupy the technician's queue until repair and return travel
        // are expected to finish.
        const startedAt = firestoreDate(job.workStartedAt)?.getTime() || calculationTime;
        const repairMinutes = Math.max(
          15,
          Number(job.actualRepairMinutes) || Number(job.estimatedRepairMinutes) || 120
        );
        const returnTravelMinutes = Math.ceil(
          Math.max(0, Number(job.travelTimeMinutes) || 0) / 2
        );
        const availableAfterJob = Math.max(
          calculationTime,
          startedAt + (repairMinutes + returnTravelMinutes) * 60_000
        );
        userKeys.forEach((userKey) => technicianAvailableAt.set(userKey, availableAfterJob));
      }

      return {
        id: job.id,
        data: {
        queueNumber: job.queueNumber ?? index + 1,
        queuePosition,
        estimatedArrivalAt,
        // Keep the legacy field synchronized for templates and older screens.
        estimatedDispatchAt: estimatedArrivalAt,
        edtCalculatedAt: serverTimestamp(),
        queueUpdatedAt: serverTimestamp(),
        },
      };
    }),
    ...closedJobsWithQueue.map((job) => ({
      id: job.id,
      data: {
        queueNumberAtClose: job.queueNumberAtClose || job.queueNumber,
        queueNumber: null,
        queuePosition: null,
        queueUpdatedAt: serverTimestamp(),
      },
    })),
  ];

  for (let offset = 0; offset < updates.length; offset += 450) {
    const batch = writeBatch(clientDb);
    updates.slice(offset, offset + 450).forEach((update) => {
      batch.update(doc(jobsCollection, update.id), update.data);
    });
    await batch.commit();
  }
}
