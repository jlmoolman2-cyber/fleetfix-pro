import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/lib/firebaseAdmin";
import { authenticateServerRequest, safeServerErrorResponse, ServerAccessError, type ServerUserContext } from "@/lib/serverAuth";
import { authorisedJob, getIQ200JobContext } from "./service";
import { handleKnowledgeRequest, type KnowledgeReadDependencies, type KnowledgeOperation, type ServicePage } from "./knowledgeRetrievalServiceCore";
import type { RetrievalDocument } from "./knowledgeRetrievalContracts";

const text = (value: unknown): string => typeof value === "string" ? value : "";
const unavailable = (): never => { throw new ServerAccessError("NOT_FOUND", "Supporting technical evidence is unavailable.", 404); };
function documentData(id: string, data: Record<string, unknown>): RetrievalDocument {
  if (data.documentId !== id) unavailable();
  return {
    documentId: id, companyId: text(data.companyId), title: text(data.title), description: text(data.description),
    originalFilename: text(data.originalFilename), contentHash: text(data.contentHash),
    processingStatus: text(data.processingStatus), approvalStatus: text(data.approvalStatus),
    publishedProcessingAttemptId: text(data.publishedProcessingAttemptId), publishedProcessingInvocationId: text(data.publishedProcessingInvocationId),
    manufacturer: text(data.manufacturer), vehicleMake: text(data.vehicleMake), vehicleModel: text(data.vehicleModel),
    vehicleSeries: text(data.vehicleSeries), system: text(data.system), subsystem: text(data.subsystem), component: text(data.component),
  };
}
function pageData(id: string, data: Record<string, unknown>): ServicePage {
  return {
    pageId: id, documentId: text(data.documentId), pageIndex: typeof data.pageIndex === "number" ? data.pageIndex : -1,
    displayPageNumber: text(data.displayPageNumber), extractedText: text(data.extractedText), textContentHash: text(data.textContentHash),
    processingAttemptId: text(data.processingAttemptId), processingInvocationId: text(data.processingInvocationId), imageStorageRef: text(data.imageStorageRef),
    ...(data.imageWidth === undefined ? {} : { imageWidth: typeof data.imageWidth === "number" ? data.imageWidth : NaN }),
    ...(data.imageHeight === undefined ? {} : { imageHeight: typeof data.imageHeight === "number" ? data.imageHeight : NaN }),
  };
}
function readDependencies(context: ServerUserContext): KnowledgeReadDependencies {
  const documentRef = (companyId: string, documentId: string) => {
    if (companyId !== context.companyId) unavailable();
    return adminDb.doc(`companies/${context.companyId}/iq200_documents/${documentId}`);
  };
  return {
    async authorizeJob(_context, jobId) {
      const { data } = await authorisedJob(context, jobId);
      const { job } = await getIQ200JobContext(context, jobId);
      return {
        manufacturer: text(data.manufacturer), vehicleMake: job.vehicle.make, vehicleModel: job.vehicle.model,
        vehicleSeries: text(data.vehicleSeries), system: text(data.system), subsystem: text(data.subsystem), component: text(data.component),
        faultCodes: job.faultCodes, complaint: job.description, technicianFindings: job.notes.map(note => note.text),
      };
    },
    async documents(companyId, cursor, limit) {
      if (companyId !== context.companyId) unavailable();
      let query = adminDb.collection(`companies/${context.companyId}/iq200_documents`).orderBy(FieldPath.documentId()).limit(limit);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.select("documentId", "companyId", "title", "description", "originalFilename", "contentHash", "processingStatus", "approvalStatus", "publishedProcessingAttemptId", "publishedProcessingInvocationId", "manufacturer", "vehicleMake", "vehicleModel", "vehicleSeries", "system", "subsystem", "component").get();
      return snapshot.docs.map(doc => documentData(doc.id, doc.data()));
    },
    async pages(companyId, documentId, limit) {
      const snapshot = await documentRef(companyId, documentId).collection("pages").orderBy(FieldPath.documentId()).limit(limit).get();
      return snapshot.docs.map(page => pageData(page.id, page.data()));
    },
    async currentPage(companyId, documentId, pageId) {
      const ref = documentRef(companyId, documentId);
      // Transactional read-only snapshot keeps document eligibility/publication and page consistent.
      return adminDb.runTransaction(async transaction => {
        const [document, page] = await transaction.getAll(ref, ref.collection("pages").doc(pageId));
        if (!document.exists || !page.exists) return null;
        return { document: documentData(document.id, document.data()!), page: pageData(page.id, page.data()!) };
      }, { readOnly: true });
    },
    async assetMetadata(path) {
      try {
        const [metadata] = await adminStorage.bucket().file(path).getMetadata();
        const size = typeof metadata.size === "number" ? metadata.size : /^\d+$/.test(text(metadata.size)) ? Number(metadata.size) : NaN;
        return { size, contentType: text(metadata.contentType), generation: text(metadata.generation) };
      } catch { return null; }
    },
    async imageBytes(path, generation, maximum) {
      // Pin the metadata-validated generation; bound the stream even if size metadata is inconsistent.
      const stream = adminStorage.bucket().file(path, { generation }).createReadStream();
      const chunks: Buffer[] = []; let size = 0;
      try {
        for await (const value of stream) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          size += chunk.byteLength;
          if (size > maximum) { stream.destroy(); throw new ServerAccessError("IMAGE_TOO_LARGE", "Supporting page exceeds the protected delivery limit.", 413); }
          chunks.push(chunk);
        }
        return new Uint8Array(Buffer.concat(chunks, size));
      } catch (error) {
        stream.destroy();
        if (error instanceof ServerAccessError) throw error;
        return unavailable();
      }
    },
  };
}
export async function technicalKnowledgeRequest(request: Request, params: { jobId: string; documentId?: string; pageId?: string }, operation: KnowledgeOperation): Promise<Response> {
  return handleKnowledgeRequest(request, params, operation, authenticateServerRequest, context => readDependencies(context as ServerUserContext), safeServerErrorResponse);
}
