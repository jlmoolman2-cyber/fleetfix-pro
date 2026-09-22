import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/lib/firebaseAdmin";
import { ServerAccessError, type ServerUserContext } from "@/lib/serverAuth";
import { effectivePermissions } from "@/lib/permissions";
import {
  KnowledgeUploadError,
  validateIdempotencyKey,
  validatePdfEnvelope,
  validatePdfMimeType,
  sanitizeFilename,
  generateDocumentId,
  computeContentHash,
  buildStoragePath,
  type KnowledgeUploadResult,
} from "./knowledgeUploadCore";

const UPLOAD_KNOWLEDGE_PERMISSION = "Upload IQ200 Knowledge";

function requireUploadKnowledgePermission(context: ServerUserContext): void {
  const permissions = effectivePermissions(context.companyUser);
  if (permissions[UPLOAD_KNOWLEDGE_PERMISSION] !== true) {
    throw new ServerAccessError("FORBIDDEN", "Upload IQ200 Knowledge permission is required.", 403);
  }
}

async function compensateStorageObject(storagePath: string): Promise<void> {
  try {
    await adminStorage.bucket().file(storagePath).delete();
  } catch (compensationError) {
    console.error("IQ200 knowledge upload compensation failed for path:", storagePath, compensationError);
  }
}

export async function uploadKnowledgeDocument(
  context: ServerUserContext,
  fileBytes: Uint8Array,
  originalFilename: string,
  mimeType: string,
  idempotencyKey: string,
  title?: string,
  description?: string,
): Promise<KnowledgeUploadResult> {
  requireUploadKnowledgePermission(context);
  const safeIdempotencyKey = validateIdempotencyKey(idempotencyKey);
  if (!fileBytes || fileBytes.length === 0) {
    throw new KnowledgeUploadError("MISSING_FILE", "A PDF file is required.", 400);
  }
  validatePdfMimeType(mimeType);
  validatePdfEnvelope(fileBytes);
  const companyId = context.companyId;
  const documentId = generateDocumentId();
  const contentHash = computeContentHash(fileBytes);
  const storagePath = buildStoragePath(companyId, documentId);
  const safeFilename = sanitizeFilename(originalFilename);
  let storageUploadSucceeded = false;
  try {
    await adminStorage.bucket().file(storagePath).save(fileBytes, {
      resumable: false,
      contentType: "application/pdf",
      metadata: { metadata: { companyId, documentId, contentHash, originalFilename: safeFilename } },
    });
    storageUploadSucceeded = true;
  } catch {
    throw new KnowledgeUploadError("UPLOAD_FAILED", "The file could not be stored.", 500);
  }
  try {
    const result = await runUploadTransaction(companyId, documentId, contentHash, storagePath, safeIdempotencyKey, context.uid, fileBytes.length, safeFilename, title, description);
    if (result.idempotentRetry) {
      await compensateStorageObject(storagePath);
      const existingDoc = await adminDb.doc(`companies/${companyId}/iq200_documents/${result.existingDocumentId}`).get();
      const data = existingDoc.data() || {};
      return {
        documentId: result.existingDocumentId,
        contentHash: data.contentHash || contentHash,
        storagePath: data.storagePath || storagePath,
        originalFilename: data.originalFilename || safeFilename,
        mimeType: data.mimeType || "application/pdf",
        sizeBytes: data.sizeBytes || fileBytes.length,
        processingStatus: "PENDING", approvalStatus: "DRAFT",
        uploadedAt: data.uploadedAt?.toDate?.()?.toISOString?.() || new Date().toISOString(),
        idempotentRetry: true,
      };
    }
    return {
      documentId, contentHash, storagePath,
      originalFilename: safeFilename, mimeType: "application/pdf",
      sizeBytes: fileBytes.length,
      processingStatus: "PENDING", approvalStatus: "DRAFT",
      uploadedAt: new Date().toISOString(), idempotentRetry: false,
    };
  } catch (error) {
    if (storageUploadSucceeded) await compensateStorageObject(storagePath);
    if (error instanceof KnowledgeUploadError) throw error;
    throw new KnowledgeUploadError("PERSISTENCE_FAILED", "The upload could not be persisted.", 500);
  }
}

async function runUploadTransaction(
  companyId: string, documentId: string, contentHash: string, storagePath: string,
  safeIdempotencyKey: string, uid: string, sizeBytes: number, safeFilename: string,
  title?: string, description?: string,
): Promise<{ idempotentRetry: boolean; existingDocumentId: string }> {
  return adminDb.runTransaction(async (transaction) => {
    const idemRef = adminDb.doc(`companies/${companyId}/iq200_idempotency_keys/${safeIdempotencyKey}`);
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const idemData = idemSnap.data();
      if (idemData?.contentHash && idemData.contentHash !== contentHash) {
        throw new KnowledgeUploadError("IDEMPOTENCY_CONFLICT", "This Idempotency-Key was already used for a different upload.", 409);
      }
      return { idempotentRetry: true, existingDocumentId: idemData?.documentId as string };
    }
    const hashRef = adminDb.doc(`companies/${companyId}/iq200_content_hashes/${contentHash}`);
    const hashSnap = await transaction.get(hashRef);
    if (hashSnap.exists) {
      throw new KnowledgeUploadError("DUPLICATE_DOCUMENT", "An identical document already exists for this company.", 409);
    }
    const now = FieldValue.serverTimestamp();
    const docRef = adminDb.doc(`companies/${companyId}/iq200_documents/${documentId}`);
    transaction.create(docRef, {
      documentId, companyId,
      title: typeof title === "string" ? title.trim().slice(0, 300) : "",
      description: typeof description === "string" ? description.trim().slice(0, 2000) : "",
      originalFilename: safeFilename, mimeType: "application/pdf",
      sizeBytes, contentHash, storagePath,
      uploadedBy: uid, uploadedAt: now,
      processingStatus: "PENDING", approvalStatus: "DRAFT",
      manufacturer: "", vehicleMake: "", vehicleModel: "", vehicleSeries: "",
      system: "", subsystem: "", component: "",
      documentType: "technical_reference", documentVersion: "",
      publicationNumber: "", referenceNumber: "", language: "", pageCount: 0,
    });
    transaction.create(idemRef, { companyId, documentId, contentHash, createdAt: now });
    transaction.create(hashRef, { companyId, documentId, createdAt: now });
    return { idempotentRetry: false, existingDocumentId: documentId };
  });
}
