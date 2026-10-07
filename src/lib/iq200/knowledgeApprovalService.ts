import "server-only";

import { effectivePermissions } from "../permissions.ts";
import { ServerAccessError } from "../serverAuthCore.ts";
import type { ServerUserContext } from "../serverAuth.ts";
import {
  canApproveKnowledgeDocument,
  isKnowledgeApprovalStatus,
  isKnowledgeProcessingStatus,
} from "./knowledgeContracts.ts";
import { KNOWLEDGE_ID } from "./knowledgeValidation.ts";

export interface KnowledgeApprovalSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface KnowledgeApprovalTransaction {
  get(reference: unknown): Promise<KnowledgeApprovalSnapshot>;
  update(reference: unknown, fields: Record<string, unknown>): void;
}

export interface KnowledgeApprovalStore {
  doc(path: string): unknown;
  runTransaction<T>(work: (transaction: KnowledgeApprovalTransaction) => Promise<T>): Promise<T>;
  serverTimestamp(): unknown;
}

async function firebaseApprovalStore(): Promise<KnowledgeApprovalStore> {
  const [{ adminDb }, { FieldValue }] = await Promise.all([
    import("@/lib/firebaseAdmin"),
    import("firebase-admin/firestore"),
  ]);
  return {
    doc: (path) => adminDb.doc(path),
    runTransaction: (work) => adminDb.runTransaction(async (transaction) =>
      work(transaction as unknown as KnowledgeApprovalTransaction)),
    serverTimestamp: () => FieldValue.serverTimestamp(),
  };
}

function forbidden(): never {
  throw new ServerAccessError("FORBIDDEN", "Approve IQ200 Knowledge permission is required.", 403);
}

function notFound(): never {
  throw new ServerAccessError("NOT_FOUND", "Knowledge document not found.", 404);
}

export async function approveKnowledgeDocument(
  context: ServerUserContext,
  documentId: string,
  store?: KnowledgeApprovalStore,
): Promise<{ documentId: string; processingStatus: "READY"; approvalStatus: "APPROVED" }> {
  if (!context?.uid) {
    throw new ServerAccessError("AUTH_REQUIRED", "Authentication is required.", 401);
  }
  if (!context.companyId || !context.companyUser || context.companyUser.active === false) forbidden();
  if (effectivePermissions(context.companyUser)["Approve IQ200 Knowledge"] !== true) forbidden();
  if (typeof documentId !== "string" || !KNOWLEDGE_ID.test(documentId)) notFound();

  const persistence = store ?? await firebaseApprovalStore();
  const reference = persistence.doc(`companies/${context.companyId}/iq200_documents/${documentId}`);

  await persistence.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) notFound();
    const data = snapshot.data();
    if (!data || data.companyId !== context.companyId) notFound();

    const processingStatus = data.processingStatus;
    const approvalStatus = data.approvalStatus;
    if (
      !isKnowledgeProcessingStatus(processingStatus) ||
      !isKnowledgeApprovalStatus(approvalStatus) ||
      !canApproveKnowledgeDocument({ processingStatus, approvalStatus })
    ) {
      throw new ServerAccessError(
        "INVALID_KNOWLEDGE_DOCUMENT_TRANSITION",
        "Knowledge document is not ready for approval.",
        409,
      );
    }

    const timestamp = persistence.serverTimestamp();
    transaction.update(reference, {
      approvalStatus: "APPROVED",
      approvedBy: context.uid,
      approvedAt: timestamp,
      updatedAt: timestamp,
    });
  });

  return { documentId, processingStatus: "READY", approvalStatus: "APPROVED" };
}
