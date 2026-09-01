"use client";

import { useEffect } from "react";
import { collection, onSnapshot, writeBatch } from "firebase/firestore";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

function queueSequence(value: unknown) {
  const sequence = Number(String(value || "").replace(/\D/g, ""));
  return Number.isFinite(sequence) && sequence > 0 ? sequence : Number.MAX_SAFE_INTEGER;
}

export default function JobQueuePositionUpdater() {
  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "jobs"),
    (snapshot) => {
      const isActive = (jobDocument: (typeof snapshot.docs)[number]) => {
        const job = jobDocument.data();
        const status = String(job.status || "").trim().toLowerCase();
        return job.isClosed !== true && job.archived !== true && !/(completed|closed|cancelled|canceled)/.test(status) && Boolean(job.queueNumber);
      };
      const activeJobs = snapshot.docs
        .filter((jobDocument) => {
          return isActive(jobDocument);
        })
        .sort((left, right) => queueSequence(left.data().queueNumber) - queueSequence(right.data().queueNumber));

      const changes = activeJobs.filter((jobDocument, index) => jobDocument.data().queuePosition !== index + 1);
      const removedJobs = snapshot.docs.filter((jobDocument) => !isActive(jobDocument) && jobDocument.data().queuePosition != null);
      if (!changes.length && !removedJobs.length) return;
      const batch = writeBatch(clientDb);
      changes.forEach((jobDocument) => {
        const position = activeJobs.indexOf(jobDocument) + 1;
        batch.update(jobDocument.ref, { queuePosition: position });
      });
      removedJobs.forEach((jobDocument) => batch.update(jobDocument.ref, { queuePosition: null }));
      batch.commit().catch((error) => console.error("Unable to update job queue positions", error));
    }
  ), []);

  return null;
}
