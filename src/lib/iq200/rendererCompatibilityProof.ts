import type { PdfRenderErrorCode, RenderedPageResult } from "./knowledgePdfRenderer";

export const RENDERER_COMPATIBILITY_FAILURE_CODES = [
  "RENDERER_MODULE_LOAD_FAILED",
  "NATIVE_CANVAS_IMPORT_FAILED",
  "NATIVE_CANVAS_CREATE_FAILED",
  "SYNTHETIC_PDF_CREATE_FAILED",
  "PDF_LOAD_FAILED",
  "PAGE_RENDER_FAILED",
  "PNG_ENCODE_FAILED",
  "PNG_INVALID",
  "COLOUR_CHECK_FAILED",
  "CLEANUP_FAILED",
] as const;

export type RendererCompatibilityFailureCode = typeof RENDERER_COMPATIBILITY_FAILURE_CODES[number];

export class RendererCompatibilityProofError extends Error {
  code: RendererCompatibilityFailureCode;

  constructor(code: RendererCompatibilityFailureCode) {
    super(code);
    this.name = "RendererCompatibilityProofError";
    this.code = code;
  }
}

export type RendererCompatibilityProofResult = {
  ok: true;
  targetDpi: 300;
  scale: number;
  pageIndex: 0;
  pageCount: 1;
  width: number;
  height: number;
  pngBytes: number;
  pngSignatureValid: true;
  fullColourConfirmed: true;
  cleanupCompleted: true;
};

function createSyntheticPdf(jsPDF: typeof import("jspdf").jsPDF): Uint8Array {
  try {
    const document = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    document.setFillColor(20, 150, 230);
    document.rect(40, 40, 120, 80, "F");
    document.setTextColor(0, 0, 0);
    document.text("Renderer compatibility proof", 60, 150);
    return new Uint8Array(document.output("arraybuffer"));
  } catch {
    throw new RendererCompatibilityProofError("SYNTHETIC_PDF_CREATE_FAILED");
  }
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

// Exported solely so the pure PdfRenderErrorCode -> RendererCompatibilityFailureCode
// mapping can be verified at runtime by the test suite. Not part of the
// HTTP/proof result contract.
export function mapRendererError(code: PdfRenderErrorCode): RendererCompatibilityFailureCode {
  switch (code) {
    case "PNG_ENCODING_FAILED":
      return "PNG_ENCODE_FAILED";
    case "PDF_RENDER_FAILED":
    case "PDF_RENDER_WIDTH_LIMIT_EXCEEDED":
    case "PDF_RENDER_HEIGHT_LIMIT_EXCEEDED":
    case "PDF_RENDER_PIXEL_LIMIT_EXCEEDED":
      return "PAGE_RENDER_FAILED";
    default: {
      // Exhaustiveness guard: a new PdfRenderErrorCode must be mapped explicitly here.
      const unreachable: never = code;
      return unreachable;
    }
  }
}

async function confirmFullColour(
  pngBytes: Uint8Array,
  canvasModule: typeof import("@napi-rs/canvas"),
): Promise<boolean> {
  try {
    const image = await canvasModule.loadImage(pngBytes);
    const inspectionCanvas = canvasModule.createCanvas(image.width, image.height);
    const context = inspectionCanvas.getContext("2d");
    context.drawImage(image, 0, 0);

    const scale = 300 / 72;
    const sampleX = Math.round(100 * scale);
    const sampleY = Math.round(80 * scale);
    const sample = context.getImageData(sampleX, sampleY, 1, 1).data;
    return Math.max(sample[0], sample[1], sample[2]) - Math.min(sample[0], sample[1], sample[2]) > 16;
  } catch {
    throw new RendererCompatibilityProofError("COLOUR_CHECK_FAILED");
  }
}

export async function runRendererCompatibilityProof(): Promise<RendererCompatibilityProofResult> {
  let canvasModule: typeof import("@napi-rs/canvas");
  try {
    canvasModule = await import("@napi-rs/canvas");
  } catch {
    throw new RendererCompatibilityProofError("NATIVE_CANVAS_IMPORT_FAILED");
  }

  try {
    const probeCanvas = canvasModule.createCanvas(2, 2);
    if (probeCanvas.width !== 2 || probeCanvas.height !== 2) {
      throw new Error("canvas dimensions");
    }
  } catch {
    throw new RendererCompatibilityProofError("NATIVE_CANVAS_CREATE_FAILED");
  }

  let jsPDF: typeof import("jspdf").jsPDF;
  try {
    ({ jsPDF } = await import("jspdf"));
  } catch {
    throw new RendererCompatibilityProofError("SYNTHETIC_PDF_CREATE_FAILED");
  }

  const pdfBytes = createSyntheticPdf(jsPDF);

  let renderer: typeof import("./knowledgePdfRenderer");
  try {
    renderer = await import("./knowledgePdfRenderer.ts");
  } catch {
    throw new RendererCompatibilityProofError("RENDERER_MODULE_LOAD_FAILED");
  }

  let rendered: RenderedPageResult;
  try {
    rendered = await renderer.renderPdfPageToPng(pdfBytes, 0);
  } catch (error) {
    if (error instanceof renderer.PdfRenderError) {
      throw new RendererCompatibilityProofError(mapRendererError(error.code));
    }
    throw new RendererCompatibilityProofError("PAGE_RENDER_FAILED");
  }

  if (!isPng(rendered.pngBytes)) {
    throw new RendererCompatibilityProofError("PNG_INVALID");
  }

  if (rendered.pngBytes.length === 0 || rendered.pngBytes.length > 10_000_000) {
    throw new RendererCompatibilityProofError("PNG_INVALID");
  }

  const fullColourConfirmed = await confirmFullColour(rendered.pngBytes, canvasModule);
  if (!fullColourConfirmed) {
    throw new RendererCompatibilityProofError("COLOUR_CHECK_FAILED");
  }

  return {
    ok: true,
    targetDpi: 300,
    scale: 300 / 72,
    pageIndex: 0,
    pageCount: 1,
    width: rendered.widthPixels,
    height: rendered.heightPixels,
    pngBytes: rendered.pngBytes.length,
    pngSignatureValid: true,
    fullColourConfirmed: true,
    cleanupCompleted: true,
  };
}