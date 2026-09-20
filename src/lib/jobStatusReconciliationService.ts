import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type { ServerUserContext } from "@/lib/serverAuth";
import {
  canReconcileJobStatuses,
  isConcurrentTransactionError,
  parseStatusReconciliationRequest,
  planCompleteReconciliation,
  planStatusReconciliation,
  StatusReconciliationError,
  type CanonicalCollectionPlan,
  type StatusReconciliationRequest,
} from "@/lib/jobStatusReconciliation";
import type { JobStatusDocument } from "@/lib/jobStatusContract";

export interface StatusReconciliationResult {
  result: "assigned" | "already_assigned";
  status: { id: string; name: string; systemKey: StatusReconciliationRequest["systemKey"] };
  auditId: string | null;
}

function actorName(context: ServerUserContext): string {
  for (const value of [context.companyUser.name, context.companyUser.displayName, context.companyUser.email]) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
  }
  return "FleetFix administrator";
}

export async function reconcileJobStatus(
  context: ServerUserContext,
  requestValue: unknown,
): Promise<StatusReconciliationResult> {
  if (!canReconcileJobStatuses(context.companyUser)) {
    throw new StatusReconciliationError("FORBIDDEN", 403, "Status reconciliation is not permitted.");
  }
  const request = parseStatusReconciliationRequest(requestValue);
  const statuses = adminDb.collection("companies").doc(context.companyId).collection("statuses");
  const audit = adminDb.collection("companies").doc(context.companyId).collection("audit_log").doc();

  try {
    return await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(statuses);
      const plan = planStatusReconciliation(
        snapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
        request,
      );
      if (plan.result === "already_assigned") {
        return { ...plan, auditId: null };
      }

      transaction.update(statuses.doc(plan.status.id), { systemKey: plan.status.systemKey });
      transaction.create(audit, {
        action: "STATUS_CANONICAL_IDENTITY_ASSIGNED",
        statusId: plan.status.id,
        statusName: plan.status.name,
        systemKey: plan.status.systemKey,
        actorId: context.uid,
        actorName: actorName(context),
        createdAt: FieldValue.serverTimestamp(),
      });
      return { ...plan, auditId: audit.id };
    });
  } catch (error) {
    if (error instanceof StatusReconciliationError) throw error;
    if (isConcurrentTransactionError(error)) {
      throw new StatusReconciliationError("CONCURRENT_CONFLICT", 409, "The status collection changed concurrently.");
    }
    throw error;
  }
}

// ─── Complete-Collection Canonical Reconciliation ────────────────────────

export interface CanonicalReconciliationAuditEntry {
  action: string;
  statusId: string;
  statusName: string;
  systemKey: string;
  actorId: string;
  actorName: string;
  createdAt: ReturnType<typeof FieldValue.serverTimestamp>;
}

export interface CanonicalReconciliationResult {
  plan: CanonicalCollectionPlan;
  auditIds: string[];
  createdIds: string[];
  updatedIds: string[];
  noOp: boolean;
}

export async function reconcileAllCanonicalStatuses(
  context: ServerUserContext,
): Promise<CanonicalReconciliationResult> {
  if (!canReconcileJobStatuses(context.companyUser)) {
    throw new StatusReconciliationError("FORBIDDEN", 403, "Status reconciliation is not permitted.");
  }
  const statusesRef = adminDb.collection("companies").doc(context.companyId).collection("statuses");
  const auditRef = adminDb.collection("companies").doc(context.companyId).collection("audit_log");

  try {
    return await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(statusesRef);
      const allStatuses: JobStatusDocument[] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const plan = planCompleteReconciliation(allStatuses);

      if (plan.hasErrors) {
        throw new StatusReconciliationError(
          "INVALID_EXISTING_METADATA", 409,
          `Reconciliation aborted: ${plan.errorReasons.join("; ")}`,
        );
      }

      const noOp = plan.updates.length === 0 && plan.creates.length === 0;
      if (noOp) {
        return { plan, auditIds: [], createdIds: [], updatedIds: [], noOp: true };
      }

      const actor = actorName(context);
      const auditIds: string[] = [];
      const createdIds: string[] = [];
      const updatedIds: string[] = [];

      // Apply legacy identity updates
      for (const update of plan.updates) {
        const existingDoc = allStatuses.find((s) => s.id === update.documentId);
        transaction.update(statusesRef.doc(update.documentId), { systemKey: update.systemKey });
        const auditDoc = auditRef.doc();
        transaction.create(auditDoc, {
          action: "STATUS_CANONICAL_IDENTITY_ASSIGNED",
          statusId: update.documentId,
          statusName: typeof existingDoc?.name === "string" ? existingDoc.name : "",
          systemKey: update.systemKey,
          actorId: context.uid,
          actorName: actor,
          createdAt: FieldValue.serverTimestamp(),
        } as CanonicalReconciliationAuditEntry);
        auditIds.push(auditDoc.id);
        updatedIds.push(update.documentId);
      }

      // Create missing canonical documents
      for (const create of plan.creates) {
        const newDoc = statusesRef.doc();
        transaction.create(newDoc, {
          name: create.name,
          systemKey: create.systemKey,
          active: create.active,
          startStatus: create.startStatus,
          color: create.color,
          sortOrder: create.sortOrder,
        });
        const auditDoc = auditRef.doc();
        transaction.create(auditDoc, {
          action: "STATUS_CANONICAL_CREATED",
          statusId: newDoc.id,
          statusName: create.name,
          systemKey: create.systemKey,
          actorId: context.uid,
          actorName: actor,
          createdAt: FieldValue.serverTimestamp(),
        } as CanonicalReconciliationAuditEntry);
        auditIds.push(auditDoc.id);
        createdIds.push(newDoc.id);
      }

      return { plan, auditIds, createdIds, updatedIds, noOp: false };
    });
  } catch (error) {
    if (error instanceof StatusReconciliationError) throw error;
    if (isConcurrentTransactionError(error)) {
      throw new StatusReconciliationError("CONCURRENT_CONFLICT", 409,
        "The status collection changed concurrently.");
    }
    throw error;
  }
}
