import "server-only";

import { effectivePermissions } from "../permissions.ts";
import { ServerAccessError } from "../serverAuthCore.ts";
import type { ServerUserContext } from "../serverAuth.ts";
import {
    KNOWLEDGE_PREVIEW_EXCERPT_LIMIT,
    KNOWLEDGE_PREVIEW_IMAGE_DIMENSION_LIMIT,
    KNOWLEDGE_PREVIEW_PAGE_LIMIT,
    KNOWLEDGE_PREVIEW_TOTAL_TEXT_LIMIT,
    type KnowledgeApprovalStatus,
    type KnowledgeDocumentPreviewResponse,
    type KnowledgePreviewPage,
    isKnowledgeApprovalStatus,
} from "./knowledgeContracts.ts";
import { buildKnowledgePageId, buildRenderedPageStoragePath, hashProcessingContent } from "./knowledgePageProcessingCore.ts";
import { KNOWLEDGE_ID } from "./knowledgeValidation.ts";

const HASH = /^[a-f0-9]{64}$/;
const PAGE_ID = /^page-\d{6}$/;
const MAX_KNOWLEDGE_PAGE_INDEX = 1999;

export interface KnowledgePreviewSnapshot {
    id: string;
    exists: boolean;
    data(): Record<string, unknown> | undefined;
}

export interface KnowledgePreviewWindow {
    document: KnowledgePreviewSnapshot | null;
    cursorPage: KnowledgePreviewSnapshot | null;
    pages: KnowledgePreviewSnapshot[];
}

export interface KnowledgePreviewStore {
    readDocumentWindow(input: {
        companyId: string;
        documentId: string;
        cursor: string | null;
        limit: number;
    }): Promise<KnowledgePreviewWindow>;
}

type PublishedGeneration = { attemptId: string; invocationId: string; approvalStatus: KnowledgeApprovalStatus };

function notFound(): never {
    throw new ServerAccessError("NOT_FOUND", "Knowledge document or page not found.", 404);
}

function invalidInput(): never {
    throw new ServerAccessError("INVALID_INPUT", "Knowledge preview input is invalid.", 400);
}

function unavailable(): never {
    throw new ServerAccessError("KNOWLEDGE_PREVIEW_UNAVAILABLE", "Knowledge preview is unavailable for this document.", 409);
}

function id(value: unknown): value is string {
    return typeof value === "string" && KNOWLEDGE_ID.test(value);
}

function safeDimension(value: unknown): number | null {
    return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= KNOWLEDGE_PREVIEW_IMAGE_DIMENSION_LIMIT
        ? value as number
        : null;
}

function publishedGeneration(
    document: Record<string, unknown>,
    companyId: string,
    documentId: string,
): PublishedGeneration {
    if (document.companyId !== companyId || document.documentId !== documentId) notFound();
    if (document.processingStatus !== "READY" || !isKnowledgeApprovalStatus(document.approvalStatus)) unavailable();

    const attemptId = document.publishedProcessingAttemptId;
    const invocationId = document.publishedProcessingInvocationId;
    if (
        !id(attemptId) ||
        !id(invocationId) ||
        document.processingAttemptId !== attemptId ||
        document.processingInvocationAttemptId !== attemptId ||
        document.processingInvocationId !== invocationId
    ) notFound();
    return { attemptId, invocationId, approvalStatus: document.approvalStatus };
}

function verifiedPage(
    snapshot: KnowledgePreviewSnapshot,
    companyId: string,
    documentId: string,
    generation: PublishedGeneration,
): KnowledgePreviewPage & { pageIndex: number } {
    if (!snapshot.exists) notFound();
    const page = snapshot.data();
    if (!page || page.documentId !== documentId) notFound();
    const pageIndex = page.pageIndex;
    if (!Number.isSafeInteger(pageIndex) || (pageIndex as number) < 0 || (pageIndex as number) > MAX_KNOWLEDGE_PAGE_INDEX) notFound();
    const validPageIndex = pageIndex as number;
    if (
        snapshot.id !== buildKnowledgePageId(validPageIndex) ||
        !PAGE_ID.test(snapshot.id) ||
        page.displayPageNumber !== String(validPageIndex + 1) ||
        page.processingAttemptId !== generation.attemptId ||
        page.processingInvocationId !== generation.invocationId
    ) notFound();

    const extractedText = page.extractedText;
    const textContentHash = page.textContentHash;
    if (typeof extractedText !== "string" || typeof textContentHash !== "string" || !HASH.test(textContentHash)) notFound();
    if (hashProcessingContent(extractedText) !== textContentHash) notFound();

    const imageWidth = safeDimension(page.imageWidth);
    const imageHeight = safeDimension(page.imageHeight);
    const expectedImagePath = buildRenderedPageStoragePath({
        companyId,
        documentId,
        processingAttemptId: generation.attemptId,
        processingInvocationId: generation.invocationId,
    }, validPageIndex);
    const imagePresent = page.imageStorageRef === expectedImagePath && imageWidth !== null && imageHeight !== null;

    return {
        pageIndex: validPageIndex,
        pageId: snapshot.id,
        pageNumber: String(validPageIndex + 1),
        extractedText: extractedText.slice(0, KNOWLEDGE_PREVIEW_EXCERPT_LIMIT),
        textContentHash,
        imagePresent,
        imageWidth: imagePresent ? imageWidth : null,
        imageHeight: imagePresent ? imageHeight : null,
        publishedOwnershipVerified: true,
    };
}

function isCanonicalCursor(value: string): boolean {
    return value.length <= 128 && PAGE_ID.test(value);
}

async function firebasePreviewStore(): Promise<KnowledgePreviewStore> {
    const [{ adminDb }, { FieldPath }] = await Promise.all([
        import("@/lib/firebaseAdmin"),
        import("firebase-admin/firestore"),
    ]);
    return {
        async readDocumentWindow({ companyId, documentId, cursor, limit }) {
            const documentReference = adminDb.doc(`companies/${companyId}/iq200_documents/${documentId}`);
            return adminDb.runTransaction(async (transaction) => {
                const documentSnapshot = await transaction.get(documentReference);
                if (!documentSnapshot.exists) return { document: null, cursorPage: null, pages: [] };

                const pageCollection = documentReference.collection("pages");
                let cursorSnapshot = null;
                if (cursor) {
                    cursorSnapshot = await transaction.get(pageCollection.doc(cursor));
                    if (!cursorSnapshot.exists) {
                        return {
                            document: documentSnapshot,
                            cursorPage: null,
                            pages: [],
                        };
                    }
                }

                let query = pageCollection.orderBy("pageIndex", "asc").orderBy(FieldPath.documentId(), "asc");
                if (cursorSnapshot) query = query.startAfter(cursorSnapshot);
                const pageSnapshot = await transaction.get(query.limit(limit));
                return {
                    document: documentSnapshot,
                    cursorPage: cursorSnapshot,
                    pages: pageSnapshot.docs,
                };
            });
        },
    };
}

export async function getKnowledgeDocumentPreview(
    context: ServerUserContext,
    documentId: string,
    options: { cursor?: string; store?: KnowledgePreviewStore } = {},
): Promise<KnowledgeDocumentPreviewResponse> {
    if (!context?.uid) throw new ServerAccessError("AUTH_REQUIRED", "Authentication is required.", 401);
    if (!context.companyId || !context.companyUser || context.companyUser.active === false) {
        throw new ServerAccessError("FORBIDDEN", "An active company membership is required.", 403);
    }
    if (effectivePermissions(context.companyUser)["View IQ200 Knowledge"] !== true) {
        throw new ServerAccessError("FORBIDDEN", "View IQ200 Knowledge permission is required.", 403);
    }
    if (!id(context.companyId) || !id(documentId)) notFound();
    if (options.cursor !== undefined && !isCanonicalCursor(options.cursor)) invalidInput();

    const store = options.store ?? await firebasePreviewStore();
    const window = await store.readDocumentWindow({
        companyId: context.companyId,
        documentId,
        cursor: options.cursor ?? null,
        limit: KNOWLEDGE_PREVIEW_PAGE_LIMIT + 1,
    });
    if (!window.document?.exists) notFound();
    const document = window.document.data();
    if (!document) notFound();
    const generation = publishedGeneration(document, context.companyId, documentId);

    let cursorIndex = -1;
    if (options.cursor) {
        if (!window.cursorPage?.exists) notFound();
        cursorIndex = verifiedPage(window.cursorPage, context.companyId, documentId, generation).pageIndex;
    }
    if (window.pages.length > KNOWLEDGE_PREVIEW_PAGE_LIMIT + 1) {
        throw new ServerAccessError("INTERNAL", "Knowledge preview read bound exceeded.", 500);
    }

    const selected = window.pages.slice(0, KNOWLEDGE_PREVIEW_PAGE_LIMIT);
    const pages = selected.map((snapshot) => verifiedPage(snapshot, context.companyId, documentId, generation));
    let previousIndex = cursorIndex;
    for (const page of pages) {
        if (page.pageIndex <= previousIndex) notFound();
        previousIndex = page.pageIndex;
    }
    const totalTextLength = pages.reduce((total, page) => total + page.extractedText.length, 0);
    if (pages.length > KNOWLEDGE_PREVIEW_PAGE_LIMIT || totalTextLength > KNOWLEDGE_PREVIEW_TOTAL_TEXT_LIMIT) {
        throw new ServerAccessError("INTERNAL", "Knowledge preview response bound exceeded.", 500);
    }
    const nextCursor = window.pages.length > KNOWLEDGE_PREVIEW_PAGE_LIMIT ? pages.at(-1)?.pageId ?? null : null;

    return {
        documentId,
        processingStatus: "READY",
        approvalStatus: generation.approvalStatus,
        pages: pages.map((page) => ({
            pageId: page.pageId,
            pageNumber: page.pageNumber,
            extractedText: page.extractedText,
            textContentHash: page.textContentHash,
            imagePresent: page.imagePresent,
            imageWidth: page.imageWidth,
            imageHeight: page.imageHeight,
            publishedOwnershipVerified: true,
        })),
        nextCursor,
    };
}