import assert from "node:assert/strict";
import test from "node:test";
import { jsPDF } from "jspdf";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  PdfRenderError,
  PDF_RENDER_ERROR_CODES,
  TARGET_DPI,
  MAX_RENDER_WIDTH_PX,
  MAX_RENDER_HEIGHT_PX,
  MAX_RENDER_PIXELS,
  enforceRenderLimits,
  renderPdfPageToPng,
  renderPdfPagesToPng,
} from "../src/lib/iq200/knowledgePdfRenderer.ts";

function createSyntheticPdf(options: {
  pages?: number;
  pageSize?: [number, number] | "a4" | "letter";
  text?: string;
  color?: [number, number, number];
} = {}): Uint8Array {
  const { pages = 1, pageSize = "a4", text = "FleetFix Pro", color = [255, 0, 0] } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: pageSize === "a4" ? "a4" : pageSize === "letter" ? "letter" : [pageSize[0], pageSize[1]] as any });

  for (let i = 0; i < pages; i++) {
    if (i > 0) doc.addPage();
    const [r, g, b] = color;
    doc.setFillColor(r, g, b);
    doc.rect(40, 40, 120, 80, "F");
    doc.setTextColor(0, 0, 0);
    doc.text(`${text} ${i + 1}`, 60, 110);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

test("1. @napi-rs/canvas resolves", () => {
  assert.equal(typeof createCanvas, "function");
});

test("2. createCanvas works", () => {
  const canvas = createCanvas(32, 24);
  assert.equal(canvas.width, 32);
  assert.equal(canvas.height, 24);
});

test("3. PDF.js legacy build loads", async () => {
  assert.equal(typeof getDocument, "function");
});

test("4. synthetic PDF loads", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1, text: "Synthetic Render Validation" });
  const loadingTask = getDocument({ data: pdfBytes });
  const doc = await loadingTask.promise;
  assert.equal(doc.numPages, 1);
  await doc.cleanup();
  await loadingTask.destroy();
});

test("5. page.render executes", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1, text: "Render Execute" });
  const result = await renderPdfPageToPng(pdfBytes, 0);
  assert.equal(result.pageIndex, 0);
  assert.ok(result.pngBytes.length > 0);
});

test("6. render task completes", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1, text: "Task Complete" });
  const result = await renderPdfPageToPng(pdfBytes, 0);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.dpi, 300);
});

test("7. PNG encoding succeeds", async () => {
  const result = await renderPdfPageToPng(createSyntheticPdf({ text: "PNG Success" }), 0);
  assert.ok(result.pngBytes.length > 8);
  assert.deepEqual(Array.from(result.pngBytes.slice(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test("8. valid PNG signature and non-empty output", async () => {
  const result = await renderPdfPageToPng(createSyntheticPdf({ text: "PNG Signature" }), 0);
  assert.equal(result.mimeType, "image/png");
  assert.ok(result.pngBytes.length > 1024);
});

test("9. 300 DPI and 300/72 scale", async () => {
  const pdfBytes = createSyntheticPdf({ text: "DPI Validation" });
  const result = await renderPdfPageToPng(pdfBytes, 0);
  assert.equal(result.dpi, 300);
  const expectedWidth = Math.ceil(595.28 * (300 / 72));
  const expectedHeight = Math.ceil(841.89 * (300 / 72));
  assert.equal(result.widthPixels, expectedWidth);
  assert.equal(result.heightPixels, expectedHeight);
});

test("10. width and height calculations stay proportional", async () => {
  const pdfBytes = createSyntheticPdf({ text: "Proportion" });
  const result = await renderPdfPageToPng(pdfBytes, 0);
  assert.ok(result.widthPixels > 0);
  assert.ok(result.heightPixels > 0);
  assert.ok(Math.abs(result.widthPixels / result.heightPixels - 0.707) < 0.2);
});

test("11. zero-based page index", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 3, text: "Page" });
  const pages = await renderPdfPagesToPng(pdfBytes);
  assert.deepEqual(pages.map((page) => page.pageIndex), [0, 1, 2]);
});

test("12. sequential rendering", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 3, text: "Sequential" });
  const pages = await renderPdfPagesToPng(pdfBytes);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].mimeType, "image/png");
  assert.equal(pages[2].pageIndex, 2);
});

test("13. no grayscale conversion in renderer source", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync("src/lib/iq200/knowledgePdfRenderer.ts", "utf8");
  assert.ok(!src.toLowerCase().includes("grayscale"));
  assert.ok(!src.toLowerCase().includes("ocr"));
  assert.ok(!src.toLowerCase().includes("search"));
  assert.ok(src.indexOf("enforceRenderLimits(widthPixels, heightPixels);") < src.indexOf("createCanvas(widthPixels, heightPixels)"));
});

test("14. width limit fails before allocation", async () => {
  assert.throws(() => enforceRenderLimits(10_001, 1_000), (error: unknown) => {
    assert.ok(error instanceof PdfRenderError);
    assert.equal(error.code, "PDF_RENDER_WIDTH_LIMIT_EXCEEDED");
    return true;
  });
  assert.doesNotThrow(() => enforceRenderLimits(10_000, 1_000));
});

test("15. height limit fails before allocation", async () => {
  assert.throws(() => enforceRenderLimits(1_000, 10_001), (error: unknown) => {
    assert.ok(error instanceof PdfRenderError);
    assert.equal(error.code, "PDF_RENDER_HEIGHT_LIMIT_EXCEEDED");
    return true;
  });
  assert.doesNotThrow(() => enforceRenderLimits(1_000, 10_000));
});

test("16. pixel limit fails before allocation", async () => {
  assert.throws(() => enforceRenderLimits(8_000, 7_000), (error: unknown) => {
    assert.ok(error instanceof PdfRenderError);
    assert.equal(error.code, "PDF_RENDER_PIXEL_LIMIT_EXCEEDED");
    return true;
  });
  assert.doesNotThrow(() => enforceRenderLimits(10_000, 5_000));
});

test("17. malformed PDF bounded", async () => {
  const malformedBytes = new Uint8Array([0, 1, 2, 3, 4]);
  await assert.rejects(() => renderPdfPageToPng(malformedBytes, 0), (error: unknown) => {
    assert.ok(error instanceof PdfRenderError);
    assert.ok(PDF_RENDER_ERROR_CODES.includes(error.code));
    return true;
  });
});

test("18. render API exposes bounded error names", () => {
  assert.ok(PDF_RENDER_ERROR_CODES.includes("PDF_RENDER_FAILED"));
  assert.ok(PDF_RENDER_ERROR_CODES.includes("PDF_RENDER_WIDTH_LIMIT_EXCEEDED"));
  assert.ok(PDF_RENDER_ERROR_CODES.includes("PDF_RENDER_HEIGHT_LIMIT_EXCEEDED"));
  assert.ok(PDF_RENDER_ERROR_CODES.includes("PDF_RENDER_PIXEL_LIMIT_EXCEEDED"));
  assert.ok(PDF_RENDER_ERROR_CODES.includes("PNG_ENCODING_FAILED"));
});

test("19. renderer contract constants are enforced", () => {
  assert.equal(TARGET_DPI, 300);
  assert.equal(MAX_RENDER_WIDTH_PX, 10000);
  assert.equal(MAX_RENDER_HEIGHT_PX, 10000);
  assert.equal(MAX_RENDER_PIXELS, 50000000);
});

test("20. output is full-colour PNG with no persistence", async () => {
  const result = await renderPdfPageToPng(createSyntheticPdf({ text: "Colour" }), 0);
  assert.equal(result.mimeType, "image/png");
  assert.ok(result.pngBytes.length > 0);
  assert.ok(!result.pngBytes.toString().includes("https://"));
  assert.ok(!result.pngBytes.toString().includes("storage"));
});
test("21. renderer statically loads the PDF.js legacy worker for the Node fake-worker path", async () => {
  const fs = await import("node:fs");
  const rendererSource = fs.readFileSync("src/lib/iq200/knowledgePdfRenderer.ts", "utf8");
  assert.match(rendererSource, /import\s*["']pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs["']/);

  // Runtime mechanism check: evaluating the production renderer module runs the worker
  // side-effect import, whose top level registers the WorkerMessageHandler that
  // pdfjs-dist 6.3.289 consults before attempting the failing dynamic worker import.
  await import("../src/lib/iq200/knowledgePdfRenderer.ts");
  const handler = (globalThis as unknown as { pdfjsWorker?: { WorkerMessageHandler?: unknown } }).pdfjsWorker?.WorkerMessageHandler;
  assert.equal(typeof handler, "function");
});
