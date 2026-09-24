import { createHash } from "node:crypto";

import type { KnowledgePage } from "./knowledgeContracts.ts";
import type { ParsedPage, PdfParseResult } from "./knowledgePdfParser.ts";
import type { RenderedPageResult } from "./knowledgePdfRenderer.ts";
import { KnowledgeProcessingError, verifyAttemptOwnership, type ProcessingFailureCode } from "./knowledgeProcessingCore.ts";
import { MAX_IQ200_KNOWLEDGE_UPLOAD_BYTES, buildStoragePath } from "./knowledgeUploadCore.ts";

export interface ClaimedKnowledgeDocument {
  companyId: string;
  documentId: string;
  processingAttemptId: string;
}

export interface ProcessingInvocation extends ClaimedKnowledgeDocument {
  processingInvocationId: string;
}

export type ProcessingPageRecord = KnowledgePage & { processingInvocationId: string };
export type ProcessingDocumentData = Record<string, unknown> & {
  companyId?: string;
  documentId?: string;
  storagePath?: string;
  processingStatus?: string;
  processingAttemptId?: string;
  processingInvocationAttemptId?: string;
  processingInvocationId?: string;
};

export interface ProcessingTransaction {
  getDocument(claim: ClaimedKnowledgeDocument): Promise<ProcessingDocumentData | undefined>;
  getPage(claim: ClaimedKnowledgeDocument, pageId: string): Promise<ProcessingPageRecord | undefined>;
  setPage(claim: ClaimedKnowledgeDocument, pageId: string, record: ProcessingPageRecord & { updatedAt: unknown }): void;
  deletePage(claim: ClaimedKnowledgeDocument, pageId: string): void;
  updateDocument(claim: ClaimedKnowledgeDocument, fields: Record<string, unknown>): void;
}

export interface ProcessingStateStore {
  runTransaction<T>(work: (transaction: ProcessingTransaction) => Promise<T>): Promise<T>;
  serverTimestamp(): unknown;
}

export interface ProcessingAssetStore {
  download(path: string): Promise<Uint8Array>;
  save(path: string, bytes: Uint8Array, metadata: Record<string, string>): Promise<void>;
  delete(path: string): Promise<void>;
}

export interface KnowledgePageProcessingDependencies {
  acquireSource(invocation: ProcessingInvocation): Promise<Uint8Array>;
  parse(bytes: Uint8Array): Promise<PdfParseResult>;
  renderPage(bytes: Uint8Array, pageIndex: number): Promise<RenderedPageResult>;
  persistPage(args: {
    invocation: ProcessingInvocation;
    pageId: string;
    assetPath: string;
    pngBytes: Uint8Array;
    record: ProcessingPageRecord;
  }): Promise<void>;
  complete(invocation: ProcessingInvocation, pageCount: number): Promise<void>;
  compensate(invocation: ProcessingInvocation, pageIds: string[], assetPaths: string[]): Promise<void>;
  fail(invocation: ProcessingInvocation, code: ProcessingFailureCode): Promise<void>;
}

export interface KnowledgePageProcessingResult {
  documentId: string;
  processingAttemptId: string;
  pageCount: number;
  processingStatus: "READY";
}

export function assertOwnedProcessingAttempt(data: ProcessingDocumentData | undefined, claim: ClaimedKnowledgeDocument): void {
  if (!data || data.companyId !== claim.companyId || data.documentId !== claim.documentId) {
    throw new KnowledgeProcessingError("SOURCE_UNAVAILABLE", "Knowledge document is unavailable.", 404);
  }
  if (!verifyAttemptOwnership(data.processingStatus || "", data.processingAttemptId, claim.processingAttemptId)) {
    throw new KnowledgeProcessingError("STALE_ATTEMPT", "Processing attempt is no longer current.", 409);
  }
}

export function assertOwnedProcessingInvocation(data: ProcessingDocumentData | undefined, invocation: ProcessingInvocation): void {
  assertOwnedProcessingAttempt(data, invocation);
  if (
    data?.processingInvocationAttemptId !== invocation.processingAttemptId ||
    data.processingInvocationId !== invocation.processingInvocationId
  ) {
    throw new KnowledgeProcessingError("STALE_ATTEMPT", "Processing invocation is no longer current.", 409);
  }
}

export function buildKnowledgePageId(pageIndex: number): string {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "Page identity could not be created.", 500);
  }
  return `page-${String(pageIndex + 1).padStart(6, "0")}`;
}

export function buildRenderedPageStoragePath(invocation: ProcessingInvocation, pageIndex: number): string {
  const pageId = buildKnowledgePageId(pageIndex);
  return buildRenderedPageStoragePathForPageId(invocation, pageId);
}

function buildRenderedPageStoragePathForPageId(invocation: ProcessingInvocation, pageId: string): string {
  return `companies/${invocation.companyId}/iq200/documents/${invocation.documentId}/processing/${invocation.processingAttemptId}/${invocation.processingInvocationId}/pages/${pageId}.png`;
}

export function hashProcessingContent(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildProcessingPageRecord(
  invocation: ProcessingInvocation,
  parsed: ParsedPage,
  rendered: RenderedPageResult,
  assetPath: string,
): ProcessingPageRecord {
  if (parsed.pageIndex !== rendered.pageIndex) {
    throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "Parsed and rendered page identity did not match.", 500);
  }
  return {
    documentId: invocation.documentId,
    processingAttemptId: invocation.processingAttemptId,
    processingInvocationId: invocation.processingInvocationId,
    pageIndex: parsed.pageIndex,
    displayPageNumber: String(parsed.pageIndex + 1),
    extractedText: parsed.nativeText,
    textContentHash: hashProcessingContent(parsed.nativeText),
    searchIndex: "",
    imageStorageRef: assetPath,
    thumbnailStorageRef: "",
    imageWidth: rendered.widthPixels,
    imageHeight: rendered.heightPixels,
  };
}

export function createKnowledgeProcessingAdapters(
  state: ProcessingStateStore,
  assets: ProcessingAssetStore,
): Pick<KnowledgePageProcessingDependencies, "acquireSource" | "persistPage" | "complete" | "compensate" | "fail"> {
  return {
    async acquireSource(invocation) {
      const trustedPath = await state.runTransaction(async (transaction) => {
        const data = await transaction.getDocument(invocation);
        assertOwnedProcessingAttempt(data, invocation);
        if (
          data?.processingInvocationAttemptId === invocation.processingAttemptId &&
          typeof data.processingInvocationId === "string" &&
          data.processingInvocationId !== invocation.processingInvocationId
        ) {
          throw new KnowledgeProcessingError("STALE_ATTEMPT", "Processing attempt is already owned by another invocation.", 409);
        }
        const expectedPath = buildStoragePath(invocation.companyId, invocation.documentId);
        if (data?.storagePath !== expectedPath) {
          throw new KnowledgeProcessingError("SOURCE_UNAVAILABLE", "Knowledge document source is unavailable.", 404);
        }
        transaction.updateDocument(invocation, {
          processingInvocationAttemptId: invocation.processingAttemptId,
          processingInvocationId: invocation.processingInvocationId,
          updatedAt: state.serverTimestamp(),
        });
        return expectedPath;
      });
      try {
        const bytes = await assets.download(trustedPath);
        if (!bytes.length || bytes.length > MAX_IQ200_KNOWLEDGE_UPLOAD_BYTES) {
          throw new KnowledgeProcessingError("SOURCE_UNAVAILABLE", "Knowledge document source is unavailable.", 404);
        }
        return bytes;
      } catch (error) {
        if (error instanceof KnowledgeProcessingError) throw error;
        throw new KnowledgeProcessingError("SOURCE_UNAVAILABLE", "Knowledge document source is unavailable.", 404);
      }
    },

    async persistPage({ invocation, pageId, assetPath, pngBytes, record }) {
      try {
        await assets.save(assetPath, pngBytes, {
          companyId: invocation.companyId,
          documentId: invocation.documentId,
          processingAttemptId: invocation.processingAttemptId,
          processingInvocationId: invocation.processingInvocationId,
          pageId,
        });
        await state.runTransaction(async (transaction) => {
          assertOwnedProcessingInvocation(await transaction.getDocument(invocation), invocation);
          transaction.setPage(invocation, pageId, { ...record, updatedAt: state.serverTimestamp() });
        });
      } catch (error) {
        await assets.delete(assetPath).catch(() => undefined);
        if (error instanceof KnowledgeProcessingError) throw error;
        throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "Knowledge page could not be persisted.", 500);
      }
    },

    async complete(invocation, pageCount) {
      await state.runTransaction(async (transaction) => {
        assertOwnedProcessingInvocation(await transaction.getDocument(invocation), invocation);
        for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
          const page = await transaction.getPage(invocation, buildKnowledgePageId(pageIndex));
          if (
            page?.processingAttemptId !== invocation.processingAttemptId ||
            page.processingInvocationId !== invocation.processingInvocationId
          ) {
            throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "Processed page ownership did not match.", 500);
          }
        }
        transaction.updateDocument(invocation, {
          processingStatus: "READY",
          pageCount,
          publishedProcessingAttemptId: invocation.processingAttemptId,
          publishedProcessingInvocationId: invocation.processingInvocationId,
          processingCompletedAt: state.serverTimestamp(),
          processingLeaseExpiresAt: null,
          processingFailureCode: null,
          updatedAt: state.serverTimestamp(),
        });
      });
    },

    async compensate(invocation, pageIds, assetPaths) {
      for (let index = 0; index < pageIds.length; index++) {
        const pageId = pageIds[index];
        const assetPath = assetPaths[index];
        const ownsAssetPath = assetPath === buildRenderedPageStoragePathForPageId(invocation, pageId);
        await state.runTransaction(async (transaction) => {
          const page = await transaction.getPage(invocation, pageId);
          if (
            page?.processingAttemptId === invocation.processingAttemptId &&
            page.processingInvocationId === invocation.processingInvocationId
          ) transaction.deletePage(invocation, pageId);
        }).catch(() => undefined);
        if (ownsAssetPath) await assets.delete(assetPath).catch(() => undefined);
      }
    },

    async fail(invocation, code) {
      await state.runTransaction(async (transaction) => {
        const data = await transaction.getDocument(invocation);
        try {
          assertOwnedProcessingInvocation(data, invocation);
        } catch {
          return;
        }
        transaction.updateDocument(invocation, {
          processingStatus: "FAILED",
          processingFailureCode: code,
          processingFailedAt: state.serverTimestamp(),
          processingLeaseExpiresAt: null,
          updatedAt: state.serverTimestamp(),
        });
      });
    },
  };
}

function failureCode(error: unknown): ProcessingFailureCode {
  if (error instanceof KnowledgeProcessingError) {
    if (error.code === "SOURCE_UNAVAILABLE" || error.code === "STALE_ATTEMPT") return "SOURCE_UNAVAILABLE";
    if (error.code === "PERSISTENCE_FAILED") return "PERSISTENCE_FAILED";
  }
  if (error instanceof Error && error.name === "PdfParserError") {
    if ((error as Error & { code?: string }).code === "PDF_PASSWORD_REQUIRED") return "PASSWORD_PROTECTED_PDF";
    return "TEXT_EXTRACTION_FAILED";
  }
  if (error instanceof Error && error.name === "PdfRenderError") return "RENDER_FAILED";
  return "INTERNAL_ERROR";
}

export async function processClaimedKnowledgeDocumentCore(
  invocation: ProcessingInvocation,
  dependencies: KnowledgePageProcessingDependencies,
): Promise<KnowledgePageProcessingResult> {
  const pageIds: string[] = [];
  const assetPaths: string[] = [];
  try {
    const bytes = await dependencies.acquireSource(invocation);
    const parsed = await dependencies.parse(bytes);
    if (parsed.pageCount !== parsed.pages.length) {
      throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "Processed page count did not match.", 500);
    }

    for (let pageIndex = 0; pageIndex < parsed.pageCount; pageIndex++) {
      const renderedPage = await dependencies.renderPage(bytes, pageIndex);
      const pageId = buildKnowledgePageId(pageIndex);
      const assetPath = buildRenderedPageStoragePath(invocation, pageIndex);
      const record = buildProcessingPageRecord(invocation, parsed.pages[pageIndex], renderedPage, assetPath);
      await dependencies.persistPage({ invocation, pageId, assetPath, pngBytes: renderedPage.pngBytes, record });
      pageIds.push(pageId);
      assetPaths.push(assetPath);
    }

    if (pageIds.length !== parsed.pageCount) {
      throw new KnowledgeProcessingError("PERSISTENCE_FAILED", "Processed page count did not match.", 500);
    }
    await dependencies.complete(invocation, parsed.pageCount);
    return { documentId: invocation.documentId, processingAttemptId: invocation.processingAttemptId, pageCount: parsed.pageCount, processingStatus: "READY" };
  } catch (error) {
    await dependencies.compensate(invocation, pageIds, assetPaths).catch(() => undefined);
    await dependencies.fail(invocation, failureCode(error)).catch(() => undefined);
    throw error;
  }
}
