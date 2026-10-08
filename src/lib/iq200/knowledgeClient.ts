import { getAuth } from "firebase/auth";
import {
    KNOWLEDGE_PREVIEW_EXCERPT_LIMIT,
    KNOWLEDGE_PREVIEW_IMAGE_DIMENSION_LIMIT,
    KNOWLEDGE_PREVIEW_PAGE_LIMIT,
    KNOWLEDGE_PREVIEW_TOTAL_TEXT_LIMIT,
    isKnowledgeApprovalStatus,
    type KnowledgeDocumentPreviewResponse,
    type KnowledgePreviewPage,
} from "./knowledgeContracts.ts";

// Mirrors knowledgeUploadCore.ts, which imports node:crypto and cannot be bundled for the browser.
export const KNOWLEDGE_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const KNOWLEDGE_PDF_MIME = "application/pdf";
export const KNOWLEDGE_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_KNOWLEDGE_PREVIEW_PAGE_NUMBER = 2000;

export type KnowledgeCapabilities = { view: boolean; upload: boolean; manage: boolean; approve: boolean };

export type KnowledgeDocument = {
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

export type KnowledgeLibraryResponse = { capabilities: KnowledgeCapabilities; documents: KnowledgeDocument[]; commissioningAvailable: boolean };

export type KnowledgeUploadResponse = {
    documentId: string;
    originalFilename: string;
    processingStatus: string;
    approvalStatus: string;
    idempotentRetry: boolean;
};

export type KnowledgeUploadOutcome = { created: boolean; idempotentRetry: boolean; document: KnowledgeUploadResponse };
export type KnowledgeApprovalResponse = {
    documentId: string;
    processingStatus: string;
    approvalStatus: string;
};

type ApiPayload = { error?: { code?: unknown; message?: unknown }; documentId?: unknown; originalFilename?: unknown; processingStatus?: unknown; approvalStatus?: unknown; idempotentRetry?: unknown; pages?: unknown; nextCursor?: unknown };

export class KnowledgeApiError extends Error {
    readonly code: string;
    readonly status: number | null;

    constructor(code: string, message: string, status: number | null = null) {
        super(message);
        this.name = "KnowledgeApiError";
        this.code = code;
        this.status = status;
    }
}

export type KnowledgeClientDependencies = {
    getAuth: () => { authStateReady(): Promise<void>; currentUser: { getIdToken(): Promise<string> } | null };
    fetch: typeof fetch;
};

const defaultDependencies = (): KnowledgeClientDependencies => ({
    getAuth: () => getAuth() as unknown as ReturnType<KnowledgeClientDependencies["getAuth"]>,
    fetch: (input, init) => fetch(input, init),
});

export function createKnowledgeIdempotencyKey(): string {
    return crypto.randomUUID();
}

export function validateKnowledgePdf(file: { size: number; type: string } | null | undefined): string | null {
    if (!file) return "Select a PDF file.";
    if (file.size <= 0) return "The selected file is empty.";
    if (file.type !== KNOWLEDGE_PDF_MIME) return "Only PDF files (application/pdf) are accepted.";
    if (file.size > KNOWLEDGE_MAX_UPLOAD_BYTES) return "The file exceeds the 20 MB limit.";
    return null;
}

export function knowledgeSurfaceFor(capabilities: KnowledgeCapabilities | null) {
    return {
        showList: capabilities?.view === true,
        showUpload: capabilities?.upload === true,
        showNoViewMessage: capabilities !== null && capabilities.view !== true,
    };
}

async function bearerHeader(dependencies: KnowledgeClientDependencies): Promise<string> {
    const auth = dependencies.getAuth();
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) throw new KnowledgeApiError("AUTH_REQUIRED", "Sign in to continue.");
    return `Bearer ${await user.getIdToken()}`;
}

async function send(
    dependencies: KnowledgeClientDependencies,
    path: string,
    init: RequestInit,
): Promise<{ response: Response; payload: ApiPayload }> {
    let response: Response;
    try {
        response = await dependencies.fetch(path, init);
    } catch {
        throw new KnowledgeApiError("NETWORK", "The request could not be completed.");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new KnowledgeApiError(
            String(payload?.error?.code || "HTTP_ERROR"),
            String(payload?.error?.message || `Request failed (${response.status}).`),
            response.status,
        );
    }
    return { response, payload };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalPreviewPageId(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 128 || !/^page-\d{6}$/.test(value)) return false;
    const pageNumber = Number(value.slice("page-".length));
    return pageNumber >= 1 && pageNumber <= MAX_KNOWLEDGE_PREVIEW_PAGE_NUMBER;
}

function invalidPreviewResponse(): never {
    throw new KnowledgeApiError("INVALID_RESPONSE", "The Knowledge preview response was invalid.");
}

function parseKnowledgePreviewResponse(value: unknown, documentId: string): KnowledgeDocumentPreviewResponse {
    if (!isRecord(value)) invalidPreviewResponse();
    const allowedResponseKeys = ["documentId", "processingStatus", "approvalStatus", "pages", "nextCursor"];
    if (Object.keys(value).some((key) => !allowedResponseKeys.includes(key))) invalidPreviewResponse();
    if (
        value.documentId !== documentId ||
        value.processingStatus !== "READY" ||
        !isKnowledgeApprovalStatus(value.approvalStatus) ||
        !Array.isArray(value.pages) ||
        value.pages.length > KNOWLEDGE_PREVIEW_PAGE_LIMIT
    ) invalidPreviewResponse();

    let totalTextLength = 0;
    const pages: KnowledgePreviewPage[] = value.pages.map((entry) => {
        if (!isRecord(entry)) invalidPreviewResponse();
        const allowedPageKeys = ["pageId", "pageNumber", "extractedText", "textContentHash", "imagePresent", "imageWidth", "imageHeight", "publishedOwnershipVerified"];
        if (Object.keys(entry).some((key) => !allowedPageKeys.includes(key))) invalidPreviewResponse();
        if (!isCanonicalPreviewPageId(entry.pageId)) invalidPreviewResponse();
        const pageNumber = Number(entry.pageId.slice("page-".length));
        if (entry.pageNumber !== String(pageNumber)) invalidPreviewResponse();
        if (
            typeof entry.extractedText !== "string" ||
            entry.extractedText.length > KNOWLEDGE_PREVIEW_EXCERPT_LIMIT ||
            typeof entry.textContentHash !== "string" ||
            !/^[a-f0-9]{64}$/.test(entry.textContentHash) ||
            typeof entry.imagePresent !== "boolean" ||
            entry.publishedOwnershipVerified !== true
        ) invalidPreviewResponse();
        const dimensionIsSafe = (dimension: unknown): dimension is number =>
            Number.isSafeInteger(dimension) && (dimension as number) > 0 && (dimension as number) <= KNOWLEDGE_PREVIEW_IMAGE_DIMENSION_LIMIT;
        if (entry.imagePresent) {
            if (!dimensionIsSafe(entry.imageWidth) || !dimensionIsSafe(entry.imageHeight)) invalidPreviewResponse();
        } else if (entry.imageWidth !== null || entry.imageHeight !== null) {
            invalidPreviewResponse();
        }
        totalTextLength += entry.extractedText.length;
        return {
            pageId: entry.pageId,
            pageNumber: entry.pageNumber,
            extractedText: entry.extractedText,
            textContentHash: entry.textContentHash,
            imagePresent: entry.imagePresent,
            imageWidth: entry.imageWidth as number | null,
            imageHeight: entry.imageHeight as number | null,
            publishedOwnershipVerified: true,
        };
    });
    if (totalTextLength > KNOWLEDGE_PREVIEW_TOTAL_TEXT_LIMIT) invalidPreviewResponse();

    const nextCursor = value.nextCursor;
    if (nextCursor !== null && (!isCanonicalPreviewPageId(nextCursor) || pages.length !== KNOWLEDGE_PREVIEW_PAGE_LIMIT || nextCursor !== pages.at(-1)?.pageId)) {
        invalidPreviewResponse();
    }
    if (pages.length === 0 && nextCursor !== null) invalidPreviewResponse();

    return {
        documentId,
        processingStatus: "READY",
        approvalStatus: value.approvalStatus,
        pages,
        nextCursor,
    };
}

export function knowledgePreviewVisible(capabilities: KnowledgeCapabilities | null, processingStatus: string): boolean {
    return capabilities?.view === true && processingStatus === "READY";
}

export async function fetchKnowledgeLibrary(
    dependencies: KnowledgeClientDependencies = defaultDependencies(),
): Promise<KnowledgeLibraryResponse> {
    const authorization = await bearerHeader(dependencies);
    const { payload } = await send(dependencies, "/api/iq200/knowledge/documents", {
        method: "GET",
        cache: "no-store",
        headers: { authorization },
    });
    return payload as KnowledgeLibraryResponse;
}

export async function fetchKnowledgeDocumentPreview(
    documentId: string,
    cursor?: string,
    dependencies: KnowledgeClientDependencies = defaultDependencies(),
): Promise<KnowledgeDocumentPreviewResponse> {
    if (!KNOWLEDGE_IDEMPOTENCY_KEY_PATTERN.test(documentId)) {
        throw new KnowledgeApiError("INVALID_DOCUMENT_ID", "The knowledge document ID is invalid.", 400);
    }
    if (cursor !== undefined && !isCanonicalPreviewPageId(cursor)) {
        throw new KnowledgeApiError("INVALID_CURSOR", "The Knowledge preview cursor is invalid.", 400);
    }
    const authorization = await bearerHeader(dependencies);
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const { payload } = await send(dependencies, `/api/iq200/knowledge/documents/${encodeURIComponent(documentId)}/preview${query}`, {
        method: "GET",
        cache: "no-store",
        headers: { authorization },
    });
    return parseKnowledgePreviewResponse(payload, documentId);
}

export async function approveKnowledgeDocument(
    documentId: string,
    dependencies: KnowledgeClientDependencies = defaultDependencies(),
): Promise<KnowledgeApprovalResponse> {
    if (!KNOWLEDGE_IDEMPOTENCY_KEY_PATTERN.test(documentId)) {
        throw new KnowledgeApiError("INVALID_DOCUMENT_ID", "The knowledge document ID is invalid.", 400);
    }
    const authorization = await bearerHeader(dependencies);
    const { payload } = await send(dependencies, `/api/iq200/knowledge/documents/${encodeURIComponent(documentId)}/approve`, {
        method: "POST",
        cache: "no-store",
        headers: { authorization },
    });
    return {
        documentId: String(payload.documentId || documentId),
        processingStatus: String(payload.processingStatus || ""),
        approvalStatus: String(payload.approvalStatus || ""),
    };
}

export async function uploadKnowledgePdf(
    input: { file: File | Blob; title?: string; description?: string },
    idempotencyKey: string,
    dependencies: KnowledgeClientDependencies = defaultDependencies(),
): Promise<KnowledgeUploadOutcome> {
    if (!KNOWLEDGE_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
        throw new KnowledgeApiError("INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
    }
    const authorization = await bearerHeader(dependencies);
    const body = new FormData();
    body.append("file", input.file);
    if (input.title) body.append("title", input.title);
    if (input.description) body.append("description", input.description);

    // No content-type: the browser must generate the multipart boundary.
    const { response, payload } = await send(dependencies, "/api/iq200/knowledge/documents/upload", {
        method: "POST",
        cache: "no-store",
        headers: { authorization, "Idempotency-Key": idempotencyKey },
        body,
    });
    const document: KnowledgeUploadResponse = {
        documentId: String(payload.documentId || ""),
        originalFilename: String(payload.originalFilename || ""),
        processingStatus: String(payload.processingStatus || ""),
        approvalStatus: String(payload.approvalStatus || ""),
        idempotentRetry: payload.idempotentRetry === true,
    };
    return { created: response.status === 201, idempotentRetry: document.idempotentRetry, document };
}
