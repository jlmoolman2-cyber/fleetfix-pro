// IQ200 Knowledge Document PDF Renderer.
// Production server-side PDF page rendering with pdfjs-dist + @napi-rs/canvas.

import { createCanvas } from "@napi-rs/canvas";
import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
// pdfjs-dist 6.3.289 runs an in-process "fake worker" on Node. Statically importing the
// legacy worker module up-front registers `globalThis.pdfjsWorker.WorkerMessageHandler`,
// which the fake-worker loader consults before dynamically importing `./pdf.worker.mjs`.
// This avoids the module-not-found failure in the Next.js standalone/App Hosting output
// while keeping the renderer fully single-threaded and server-side.
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

export const TARGET_DPI = 300;
export const SCALE_FACTOR = TARGET_DPI / 72;
export const MAX_RENDER_WIDTH_PX = 10_000;
export const MAX_RENDER_HEIGHT_PX = 10_000;
export const MAX_RENDER_PIXELS = 50_000_000;

export const PDF_RENDER_ERROR_CODES = [
  "PDF_RENDER_FAILED",
  "PDF_RENDER_WIDTH_LIMIT_EXCEEDED",
  "PDF_RENDER_HEIGHT_LIMIT_EXCEEDED",
  "PDF_RENDER_PIXEL_LIMIT_EXCEEDED",
  "PNG_ENCODING_FAILED",
] as const;

export type PdfRenderErrorCode = typeof PDF_RENDER_ERROR_CODES[number];

export class PdfRenderError extends Error {
  code: PdfRenderErrorCode;

  constructor(code: PdfRenderErrorCode, message: string) {
    super(message);
    this.name = "PdfRenderError";
    this.code = code;
  }
}

/**
 * Maximum length of the diagnostic failure message logged by
 * renderPdfPageToPng on failure. Anything longer is truncated before
 * console.error receives it.
 */
export const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 500;

/**
 * Normalizes an unknown caught value into a bounded diagnostic string
 * (<= MAX_DIAGNOSTIC_MESSAGE_LENGTH characters). Error instances
 * contribute `message`; every other value is reduced to its String()
 * form. Never serializes nested objects, requests, headers,
 * environments, or byte payloads.
 */
export function normalizeDiagnosticMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.length <= MAX_DIAGNOSTIC_MESSAGE_LENGTH
    ? raw
    : raw.slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH);
}

export interface RenderedPageResult {
  pageIndex: number;
  widthPixels: number;
  heightPixels: number;
  dpi: number;
  mimeType: "image/png";
  pngBytes: Uint8Array;
}

export function enforceRenderLimits(widthPixels: number, heightPixels: number): void {
  if (widthPixels > MAX_RENDER_WIDTH_PX) {
    throw new PdfRenderError(
      "PDF_RENDER_WIDTH_LIMIT_EXCEEDED",
      `Rendered page width ${widthPixels}px exceeds limit ${MAX_RENDER_WIDTH_PX}px.`,
    );
  }

  if (heightPixels > MAX_RENDER_HEIGHT_PX) {
    throw new PdfRenderError(
      "PDF_RENDER_HEIGHT_LIMIT_EXCEEDED",
      `Rendered page height ${heightPixels}px exceeds limit ${MAX_RENDER_HEIGHT_PX}px.`,
    );
  }

  const totalPixels = widthPixels * heightPixels;
  if (totalPixels > MAX_RENDER_PIXELS) {
    throw new PdfRenderError(
      "PDF_RENDER_PIXEL_LIMIT_EXCEEDED",
      `Rendered page pixel area ${totalPixels}px exceeds limit ${MAX_RENDER_PIXELS}px.`,
    );
  }
}

async function cleanupDocument(document: PDFDocumentProxy | null): Promise<void> {
  if (!document) return;
  await document.cleanup();
}

function cleanupPage(page: PDFPageProxy | null): void {
  if (page) {
    page.cleanup();
  }
}

async function renderSinglePage(document: PDFDocumentProxy, pageIndex: number): Promise<RenderedPageResult> {
  const page = await document.getPage(pageIndex + 1);
  try {
    const viewport = page.getViewport({ scale: SCALE_FACTOR });
    const widthPixels = Math.ceil(viewport.width);
    const heightPixels = Math.ceil(viewport.height);

    enforceRenderLimits(widthPixels, heightPixels);

    const canvas = createCanvas(widthPixels, heightPixels);
    const context = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
    if (!context) {
      throw new PdfRenderError("PDF_RENDER_FAILED", "Canvas 2D context could not be created.");
    }

    const renderTask = page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    });
    await renderTask.promise;

    // Post-render validation: detect blank canvas when page has content.
    // PDF.js operator list tells us if the page has drawing operations.
    // If operators exist but canvas is white, rendering failed silently.
    // Note: an operator list with entries does NOT guarantee visible marks
    // (white-on-white, invisible text, clipped/empty paths, off-page graphics).
    // For pages with operators, we scan all pixels to detect a completely white
    // canvas. getImageData allocates O(total_pixels) memory -- bounded by
    // MAX_RENDER_PIXELS (50M pixels, max 200MB). The scan exits immediately
    // on the first non-white pixel, so valid pages incur negligible cost.
    const operatorList = await page.getOperatorList();
    const hasOperators = operatorList.fnArray.length > 0;

    if (hasOperators) {
      // Scan all pixels to detect a completely white canvas.
      // getImageData allocates O(total_pixels) memory -- bounded by
      // MAX_RENDER_PIXELS (50M pixels, max 200MB). The scan exits immediately
      // on the first non-white pixel, so valid pages incur negligible cost.
      const imageData = context.getImageData(0, 0, widthPixels, heightPixels);
      let hasVisibleContent = false;
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const a = imageData.data[i + 3];
        if (a !== 255 || r !== 255 || g !== 255 || b !== 255) {
          hasVisibleContent = true;
          break;
        }
      }

      if (!hasVisibleContent) {
        throw new PdfRenderError(
          "PDF_RENDER_FAILED",
          "Rendered page contains drawing operations but produced no visible content.",
        );
      }
    }

    const pngBytes = canvas.toBuffer("image/png");
    if (!pngBytes || pngBytes.length === 0) {
      throw new PdfRenderError("PNG_ENCODING_FAILED", "PNG encoding returned no bytes.");
    }

    return {
      pageIndex,
      widthPixels,
      heightPixels,
      dpi: TARGET_DPI,
      mimeType: "image/png",
      pngBytes: new Uint8Array(pngBytes),
    };
  } finally {
    cleanupPage(page);
  }
}

export async function renderPdfPageToPng(bytes: Uint8Array, pageIndex: number): Promise<RenderedPageResult> {
  const pdfBytes = new Uint8Array(bytes.byteLength);
  pdfBytes.set(bytes);
  const loadingTask = getDocument({ data: pdfBytes, useSystemFonts: true, disableFontFace: true });
  let document: PDFDocumentProxy | null = null;

  try {
    if (!(bytes instanceof Uint8Array)) {
      throw new PdfRenderError("PDF_RENDER_FAILED", "Renderer input must be a Uint8Array.");
    }

    document = await loadingTask.promise;
    return await renderSinglePage(document, pageIndex);
  } catch (error) {
    // Diagnostic-only: bounded, non-sensitive fields for hosted-runtime triage.
    console.error("[IQ200_RENDERER_RUNTIME_FAILURE]", {
      name: error instanceof Error ? error.name : typeof error,
      message: normalizeDiagnosticMessage(error),
      code: error instanceof PdfRenderError ? error.code : "UNKNOWN",
      stage: document === null ? "pdf_load" : "page_render",
    });

    if (error instanceof PdfRenderError) {
      throw error;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("password") || message.includes("encrypted")) {
        throw new PdfRenderError("PDF_RENDER_FAILED", "Encrypted or password-protected PDFs are not supported.");
      }
      if (message.includes("canvas") || message.includes("dommatrix") || message.includes("imageData") || message.includes("path2d")) {
        throw new PdfRenderError("PDF_RENDER_FAILED", "Canvas compatibility failed in the local renderer.");
      }
    }

    throw new PdfRenderError("PDF_RENDER_FAILED", "Failed to render PDF page.");
  } finally {
    await cleanupDocument(document);
    if (!loadingTask.destroyed) {
      await loadingTask.destroy();
    }
  }
}

export async function renderPdfPagesToPng(bytes: Uint8Array): Promise<RenderedPageResult[]> {
  const pdfBytes = new Uint8Array(bytes.byteLength);
  pdfBytes.set(bytes);
  const loadingTask = getDocument({ data: pdfBytes, useSystemFonts: true, disableFontFace: true });
  let document: PDFDocumentProxy | null = null;

  try {
    document = await loadingTask.promise;
    const results: RenderedPageResult[] = [];

    for (let pageIndex = 0; pageIndex < document.numPages; pageIndex++) {
      results.push(await renderSinglePage(document, pageIndex));
    }

    return results;
  } catch (error) {
    if (error instanceof PdfRenderError) {
      throw error;
    }
    throw new PdfRenderError("PDF_RENDER_FAILED", "Failed to render PDF pages.");
  } finally {
    await cleanupDocument(document);
    if (!loadingTask.destroyed) {
      await loadingTask.destroy();
    }
  }
}
