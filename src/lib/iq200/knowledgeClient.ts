import { getAuth } from "firebase/auth";

// Mirrors knowledgeUploadCore.ts, which imports node:crypto and cannot be bundled for the browser.
export const KNOWLEDGE_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const KNOWLEDGE_PDF_MIME = "application/pdf";
export const KNOWLEDGE_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

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

export type KnowledgeLibraryResponse = { capabilities: KnowledgeCapabilities; documents: KnowledgeDocument[] };

export type KnowledgeUploadResponse = {
    documentId: string;
    originalFilename: string;
    processingStatus: string;
    approvalStatus: string;
    idempotentRetry: boolean;
};

export type KnowledgeUploadOutcome = { created: boolean; idempotentRetry: boolean; document: KnowledgeUploadResponse };

type ApiPayload = { error?: { code?: unknown; message?: unknown }; documentId?: unknown; originalFilename?: unknown; processingStatus?: unknown; approvalStatus?: unknown; idempotentRetry?: unknown };

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
