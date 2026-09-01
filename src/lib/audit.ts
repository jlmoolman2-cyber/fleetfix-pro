import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";

import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "PROCESS"
  | "TRANSFER"
  | "ADJUST"
  | "COMPLETE";

export function getAuditActor() {
  const user = getAuth().currentUser;

  return {
    userId: user?.uid || "",
    userName: user?.displayName || user?.email || "Unknown User",
    userEmail: user?.email || "",
  };
}

export function auditFields(action: AuditAction) {
  const actor = getAuditActor();

  return {
    lastAction: action,
    lastChangedById: actor.userId,
    lastChangedByName: actor.userName,
    lastChangedByEmail: actor.userEmail,
    lastChangedAt: serverTimestamp(),
  };
}

export function creationAuditFields() {
  const actor = getAuditActor();

  return {
    createdById: actor.userId,
    createdByName: actor.userName,
    createdByEmail: actor.userEmail,
    createdAt: serverTimestamp(),
    ...auditFields("CREATE"),
  };
}

export async function writeAuditRecord({
  action,
  entityType,
  entityId,
  description,
  changes,
}: {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  description: string;
  changes?: DocumentData;
}) {
  const actor = getAuditActor();

  return addDoc(
    collection(
      clientDb,
      "companies",
      COMPANY_ID,
      "audit_log"
    ),
    {
      action,
      entityType,
      entityId: entityId || "",
      description,
      changes: changes || {},
      userId: actor.userId,
      userName: actor.userName,
      userEmail: actor.userEmail,
      occurredAt: serverTimestamp(),
    }
  );
}

