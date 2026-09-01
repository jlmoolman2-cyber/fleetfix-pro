"use client";

import { useEffect } from "react";
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

function nextDate(current: Date, frequency: string) {
  const next = new Date(current);
  if (frequency === "daily") next.setDate(next.getDate() + 1);
  else if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  else return null;
  return next;
}

export default function RecurringJobActivator() {
  useEffect(() => {
    const processing = new Set<string>();
    const unsubscribe = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "recurringJobs"),
      (snapshot) => snapshot.docs.forEach((recurringDocument) => {
        const data = recurringDocument.data() as any;
        const activationDate = data.nextActivation?.toDate?.() || new Date(data.nextActivation || 0);
        if (data.active === false || Number.isNaN(activationDate.getTime()) || activationDate.getTime() > Date.now() || processing.has(recurringDocument.id)) return;
        processing.add(recurringDocument.id);
        runTransaction(clientDb, async (transaction) => {
          const recurringRef = recurringDocument.ref;
          const preferencesRef = doc(clientDb, "companies", COMPANY_ID, "jobcard_preferences", "Job");
          const [freshRecurring, preferencesSnapshot] = await Promise.all([
            transaction.get(recurringRef),
            transaction.get(preferencesRef),
          ]);
          if (!freshRecurring.exists()) return;
          const recurring = freshRecurring.data() as any;
          const dueDate = recurring.nextActivation?.toDate?.() || new Date(recurring.nextActivation || 0);
          if (recurring.active === false || dueDate.getTime() > Date.now()) return;

          const settings = preferencesSnapshot.exists() ? preferencesSnapshot.data() : {};
          const prefix = String(settings.jobPrefix || "NJ").trim().toUpperCase();
          const currentSequence = String(settings.currentJobSequence ?? "00000");
          const nextSequence = String((Number(currentSequence) || 0) + 1).padStart(currentSequence.length, "0");
          const jobNumber = `${prefix}${nextSequence}`;
          const jobRef = doc(collection(clientDb, "companies", COMPANY_ID, "jobs"));
          const activatedAt = new Date().toISOString();

          transaction.set(preferencesRef, { jobPrefix: prefix, currentJobSequence: nextSequence, updatedAt: serverTimestamp() }, { merge: true });
          transaction.set(jobRef, {
            jobNumber,
            status: recurring.startStatusName || "Job Booked",
            statusId: recurring.startStatusId || "",
            customerId: recurring.customerId,
            customerName: recurring.customerName,
            vehicleId: recurring.vehicleId || "",
            vehicleRegNo: recurring.vehicleRegNo || "",
            vehicleFleetNo: recurring.vehicleFleetNo || "",
            vehicleMake: recurring.vehicleMake || "",
            vehicleModel: recurring.vehicleModel || "",
            location: recurring.location || "",
            jobType: recurring.jobType || "",
            jobTypeId: recurring.jobTypeId || "",
            description: recurring.description || "",
            complaint: recurring.description || "",
            assignedUserIds: recurring.assignedUserIds || [],
            assignedUsers: recurring.assignedUsers || [],
            assignedTo: (recurring.assignedUsers || []).map((user: any) => user.name).join(", "),
            recurringJobId: recurringDocument.id,
            recurringJobName: recurring.name || "Recurring Job",
            isClosed: false,
            archived: false,
            statusHistory: [{ id: crypto.randomUUID(), statusId: recurring.startStatusId || "", statusName: recurring.startStatusName || "Job Booked", enteredAt: activatedAt, createdAt: activatedAt, updatedAt: activatedAt, updatedByName: "Recurring Job Scheduler" }],
            createdByName: "Recurring Job Scheduler",
            updatedByName: "Recurring Job Scheduler",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          (recurring.assignedUsers || []).forEach((user: any) => {
            const notificationRef = doc(collection(clientDb, "companies", COMPANY_ID, "communicationQueue"));
            transaction.set(notificationRef, {
              module: "JobCard",
              messageType: "System",
              communicationName: "Recurring job activated",
              jobId: jobRef.id,
              jobNumber,
              notificationType: "Assigned Employees",
              recipientType: "Employee",
              recipientId: user.id || "",
              recipientName: user.name || user.email || "Assigned User",
              recipientEmail: user.email || "",
              subject: `Recurring job ${jobNumber} has been booked`,
              body: `${recurring.name || "Recurring job"} is now active and booked for ${recurring.customerName}.`,
              sendEmail: Boolean(user.email),
              state: "pending",
              createdAt: serverTimestamp(),
            });
          });

          const followingDate = nextDate(dueDate, recurring.frequency || "once");
          transaction.update(recurringRef, {
            lastActivatedAt: serverTimestamp(),
            lastJobId: jobRef.id,
            lastJobNumber: jobNumber,
            nextActivation: followingDate || dueDate,
            active: Boolean(followingDate),
            updatedAt: serverTimestamp(),
          });
        }).catch((error) => console.error("Recurring job activation failed", recurringDocument.id, error)).finally(() => processing.delete(recurringDocument.id));
      })
    );
    return unsubscribe;
  }, []);
  return null;
}
