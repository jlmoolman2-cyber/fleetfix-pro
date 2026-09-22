// IQ200 Knowledge Document PDF Parser — Structural parsing & native text extraction
// Phase 24E-2B: PDF parsing using pdfjs-dist. No rendering, no canvas, no Storage.

import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

// ─── Resource Limits ──────────────────────────────────────────────────────────

export const MAX_PDF_PAGES = 2000;
export const MAX_NATIVE_TEXT_CHARS_PER_PAGE = 500_000;
export const MAX_NATIVE_TEXT_CHARS_PER_DOCUMENT = 10_000_000;

// ─── Parser Error Codes ───────────────────────────────────────────────────────

export const PDF_PARSER_ERROR_CODES = [
  "PDF_PARSE_FAILED",
  "PDF_PASSWORD_REQUIRED",
  "PDF_PAGE_LIMIT_EXCEEDED",
  "PDF_TEXT_LIMIT_EXCEEDED",
  "PDF_PAGE_READ_FAILED",
] as const;

export type PdfParserErrorCode = typeof PDF_PARSER_ERROR_CODES[number];

export class PdfParserError extends Error {
  code: PdfParserErrorCode;
  constructor(code: PdfParserErrorCode, message: string) {
    super(message);
    this.name = "PdfParserError";
    this.code = code;
  }
}

// ─── Parser Result Types ──────────────────────────────────────────────────────

export interface ParsedPage {
  pageIndex: number;
  widthPoints: number;
  heightPoints: number;
  rotation: number;
  nativeText: string;
  nativeTextAvailable: boolean;
}

export interface PdfParseResult {
  pageCount: number;
  pages: ParsedPage[];
}

// ─── Text Normalization ───────────────────────────────────────────────────────

function normalizeExtractedText(text: string): string {
  let normalized = text;
  normalized = normalized.replace(/[ \t]+/g, " ");
  normalized = normalized.replace(/\n{3,}/g, "\n\n");
  normalized = normalized.split("\n").map((line) => line.trim()).join("\n");
  return normalized.trim();
}

// ─── PDF Parsing ──────────────────────────────────────────────────────────────

export async function parsePdf(bytes: Uint8Array): Promise<PdfParseResult> {
  let pdfDocument: PDFDocumentProxy | null = null;

  try {
    pdfDocument = await getDocument({
      data: bytes,
      disableFontFace: true,
      useSystemFonts: true,
      standardFontDataUrl: undefined,
    }).promise;

    const pageCount = pdfDocument.numPages;

    if (pageCount === 0) {
      throw new PdfParserError("PDF_PARSE_FAILED", "PDF has zero pages.");
    }

    if (pageCount > MAX_PDF_PAGES) {
      throw new PdfParserError(
        "PDF_PAGE_LIMIT_EXCEEDED",
        `PDF has ${pageCount} pages, exceeding limit of ${MAX_PDF_PAGES}.`,
      );
    }

    const pages: ParsedPage[] = [];
    let totalTextChars = 0;

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      let page: PDFPageProxy | null = null;

      try {
        page = await pdfDocument.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: 1.0 });
        const widthPoints = viewport.width;
        const heightPoints = viewport.height;
        const rotation = page.rotate;

        const textContent = await page.getTextContent();
        const rawText = textContent.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .join(" ");

        const normalizedText = normalizeExtractedText(rawText);
        const nativeTextAvailable = normalizedText.length > 0;

        if (normalizedText.length > MAX_NATIVE_TEXT_CHARS_PER_PAGE) {
          throw new PdfParserError(
            "PDF_TEXT_LIMIT_EXCEEDED",
            `Page ${pageIndex} has ${normalizedText.length} characters, exceeding limit of ${MAX_NATIVE_TEXT_CHARS_PER_PAGE}.`,
          );
        }

        totalTextChars += normalizedText.length;
        if (totalTextChars > MAX_NATIVE_TEXT_CHARS_PER_DOCUMENT) {
          throw new PdfParserError(
            "PDF_TEXT_LIMIT_EXCEEDED",
            `Document text exceeds limit of ${MAX_NATIVE_TEXT_CHARS_PER_DOCUMENT} characters.`,
          );
        }

        pages.push({
          pageIndex,
          widthPoints,
          heightPoints,
          rotation,
          nativeText: normalizedText,
          nativeTextAvailable,
        });
      } finally {
        if (page) {
          page.cleanup();
        }
      }
    }

    return { pageCount, pages };
  } catch (error) {
    if (error instanceof PdfParserError) throw error;
    if (error instanceof Error && error.message.includes("password")) {
      throw new PdfParserError("PDF_PASSWORD_REQUIRED", "PDF is password-protected.");
    }
    throw new PdfParserError("PDF_PARSE_FAILED", "Failed to parse PDF document.");
  }
}
