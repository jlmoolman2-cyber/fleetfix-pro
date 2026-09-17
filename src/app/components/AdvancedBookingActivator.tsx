"use client";

import { useEffect } from "react";
import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import { selectAdvancedBookingTarget } from "@/lib/jobStatusLifecycle";

export default function AdvancedBookingActivator() {
  useEffect(() => {
    const processing = new Set<string>();
    let pendingDocuments: any[] = [];
    let statusDocuments: any[] = [];
    let statusesLoaded = false;

    const activateDueBookings = () => {
      if (!statusesLoaded) return;
      pendingDocuments.forEach((jobDocument) => {
        const job = jobDocument.data();
        const bookingDate = job.bookingAt?.toDate?.() || new Date(job.bookingAt || job.dateBooked || 0);
        if (Number.isNaN(bookingDate.getTime()) || bookingDate.getTime() > Date.now() || processing.has(jobDocument.id)) return;

        processing.add(jobDocument.id);
        runTransaction(clientDb, async (transaction) => {
          const jobRef = doc(clientDb, "companies", COMPANY_ID, "jobs", jobDocument.id);
          const freshSnapshot = await transaction.get(jobRef);
          if (!freshSnapshot.exists()) return;

          const freshJob = freshSnapshot.data();
          const dueDate = freshJob.bookingAt?.toDate?.() || new Date(freshJob.bookingAt || freshJob.dateBooked || 0);
          if (freshJob.isAdvancedBooking !== true || Number.isNaN(dueDate.getTime()) || dueDate.getTime() > Date.now()) return;

          const target = selectAdvancedBookingTarget(statusDocuments, {
            statusId: freshJob.bookedStatusId,
            statusName: freshJob.bookedStatusName,
          });
          if (target.kind !== "selected") {
            throw new Error("Advanced booking has no safe active start status target.");
          }
          const { statusId, statusName } = target;
          const activatedAt = new Date().toISOString();
          transaction.update(jobRef, {
            status: statusName,
            statusId,
            isAdvancedBooking: false,
            advancedBookingActivatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedByName: "Advanced Booking Scheduler",
            statusHistory: [
              ...(Array.isArray(freshJob.statusHistory) ? freshJob.statusHistory : []),
              {
                id: crypto.randomUUID(),
                statusId,
                statusName,
                enteredAt: activatedAt,
                createdAt: activatedAt,
                updatedAt: activatedAt,
                updatedById: "",
                updatedByName: "Advanced Booking Scheduler",
              },
            ],
          });
        }).catch((error) => console.error("Advanced booking activation failed", jobDocument.id, error))
          .finally(() => processing.delete(jobDocument.id));
      });
    };

    const unsubscribeJobs = onSnapshot(
      query(collection(clientDb, "companies", COMPANY_ID, "jobs"), where("isAdvancedBooking", "==", true)),
      (snapshot) => {
        pendingDocuments = snapshot.docs;
        activateDueBookings();
      }
    );
    const unsubscribeStatuses = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "statuses"),
      (snapshot) => {
        statusDocuments = snapshot.docs.map((statusDocument) => ({
          ...statusDocument.data(),
          id: statusDocument.id,
        }));
        statusesLoaded = true;
        activateDueBookings();
      },
    );
    const interval = window.setInterval(activateDueBookings, 15_000);

    return () => {
      window.clearInterval(interval);
      unsubscribeJobs();
      unsubscribeStatuses();
    };
  }, []);

  return null;
}
