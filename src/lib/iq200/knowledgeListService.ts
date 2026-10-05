import { effectivePermissions } from "../permissions.ts";
import { ServerAccessError } from "../serverAuthCore.ts";
import type { ServerUserContext } from "../serverAuth.ts";

export const KNOWLEDGE_LIST_LIMIT = 50;

export type StoredKnowledgeDocument = { id: string; data: Record<string, unknown> };
export type KnowledgeDocumentLoader = (companyId: string, limit: number) => Promise<StoredKnowledgeDocument[]>;

export type KnowledgeCapabilities = { view: boolean; upload: boolean; manage: boolean; approve: boolean };

export type KnowledgeDocumentDto = {
    documentId: string;
    title: string;
    description: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string | null;
    processingStatus: string;
    approvalStatus: string;
    pageCount: number;
};

export type KnowledgeListResponse = { capabilities: KnowledgeCapabilities; documents: KnowledgeDocumentDto[] };

function serializeTimestamp(value: unknown): string | null {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return Number.isNaN(Date.parse(value)) ? null : new Date(value).toISOString();
    if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
        const date = value.toDate();
        return date instanceof Date ? date.toISOString() : null;
    }
    return null;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

function toDto(item: StoredKnowledgeDocument): KnowledgeDocumentDto {
    const data = item.data;
    return {
        documentId: item.id,
        title: text(data.title),
        description: text(data.description),
        originalFilename: text(data.originalFilename),
        mimeType: text(data.mimeType),
        sizeBytes: count(data.sizeBytes),
        uploadedAt: serializeTimestamp(data.uploadedAt),
        processingStatus: text(data.processingStatus),
        approvalStatus: text(data.approvalStatus),
        pageCount: count(data.pageCount),
    };
}

export function knowledgeCapabilitiesFor(companyUser: unknown): KnowledgeCapabilities {
    const permissions = effectivePermissions(companyUser);
    return {
        view: permissions["View IQ200 Knowledge"] === true,
        upload: permissions["Upload IQ200 Knowledge"] === true,
        manage: permissions["Manage IQ200 Knowledge"] === true,
        approve: permissions["Approve IQ200 Knowledge"] === true,
    };
}

export async function listKnowledgeDocuments(
    context: ServerUserContext,
    loadDocuments: KnowledgeDocumentLoader,
): Promise<KnowledgeListResponse> {
    const capabilities = knowledgeCapabilitiesFor(context.companyUser);
    if (!capabilities.view && !capabilities.upload && !capabilities.manage && !capabilities.approve) {
        throw new ServerAccessError("FORBIDDEN", "IQ200 Knowledge permission is required.", 403);
    }
    if (!capabilities.view) return { capabilities, documents: [] };

    const stored = await loadDocuments(context.companyId, KNOWLEDGE_LIST_LIMIT);
    const documents = stored
        .map(toDto)
        .sort((left, right) => (Date.parse(right.uploadedAt || "") || 0) - (Date.parse(left.uploadedAt || "") || 0))
        .slice(0, KNOWLEDGE_LIST_LIMIT);
    return { capabilities, documents };
}

export const loadCompanyKnowledgeDocuments: KnowledgeDocumentLoader = async (companyId, limit) => {
    const { adminDb } = await import("@/lib/firebaseAdmin");
    const snapshot = await adminDb
        .collection(`companies/${companyId}/iq200_documents`)
        .orderBy("uploadedAt", "desc")
        .limit(limit)
        .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
};
