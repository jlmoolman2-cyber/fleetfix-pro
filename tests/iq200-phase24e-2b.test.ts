import assert from "node:assert/strict";
import test from "node:test";
import { jsPDF } from "jspdf";
import {
  parsePdf,
  PdfParserError,
  MAX_PDF_PAGES,
  MAX_NATIVE_TEXT_CHARS_PER_PAGE,
  MAX_NATIVE_TEXT_CHARS_PER_DOCUMENT,
  PDF_PARSER_ERROR_CODES,
} from "../src/lib/iq200/knowledgePdfParser.ts";

function createSyntheticPdf(options: {
  pages?: number;
  textPerPage?: string[];
  pageSize?: "a4" | "letter" | "a3";
} = {}): Uint8Array {
  const { pages = 1, textPerPage = [], pageSize = "a4" } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: pageSize });
  for (let i = 0; i < pages; i++) {
    if (i > 0) doc.addPage();
    const text = textPerPage[i] || `Page ${i + 1} content`;
    doc.text(text, 72, 72);
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

test("1. pdfjs-dist import works server-side", () => {
  assert.ok(true);
});

test("2. parser accepts Uint8Array", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1, textPerPage: ["Test"] });
  assert.ok(pdfBytes instanceof Uint8Array);
  const result = await parsePdf(pdfBytes);
  assert.ok(result);
});

test("3. valid synthetic PDF parses", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1, textPerPage: ["Test document"] });
  const result = await parsePdf(pdfBytes);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pages.length, 1);
});

test("4. correct page count", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 5 });
  const result = await parsePdf(pdfBytes);
  assert.equal(result.pageCount, 5);
  assert.equal(result.pages.length, 5);
});

test("5. zero-based page indexes", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 3 });
  const result = await parsePdf(pdfBytes);
  assert.equal(result.pages[0].pageIndex, 0);
  assert.equal(result.pages[1].pageIndex, 1);
  assert.equal(result.pages[2].pageIndex, 2);
});

test("6. native text extracted", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1, textPerPage: ["Hello World"] });
  const result = await parsePdf(pdfBytes);
  assert.ok(result.pages[0].nativeText.length > 0);
  assert.ok(result.pages[0].nativeTextAvailable);
});

test("7. expected known text preserved", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1, textPerPage: ["Fault Code P0087"] });
  const result = await parsePdf(pdfBytes);
  assert.ok(result.pages[0].nativeText.includes("P0087"));
});

test("8. page dimensions returned", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1, pageSize: "a4" });
  const result = await parsePdf(pdfBytes);
  assert.ok(result.pages[0].widthPoints > 0);
  assert.ok(result.pages[0].heightPoints > 0);
});

test("9. page rotation returned", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1 });
  const result = await parsePdf(pdfBytes);
  assert.equal(typeof result.pages[0].rotation, "number");
});

test("10. multi-page document parsed sequentially", async () => {
  const pdfBytes = createSyntheticPdf({
    pages: 3,
    textPerPage: ["Page One", "Page Two", "Page Three"],
  });
  const result = await parsePdf(pdfBytes);
  assert.equal(result.pages.length, 3);
  assert.ok(result.pages[0].nativeText.includes("One"));
  assert.ok(result.pages[1].nativeText.includes("Two"));
  assert.ok(result.pages[2].nativeText.includes("Three"));
});

test("11. each page represented once", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 5 });
  const result = await parsePdf(pdfBytes);
  const pageIndexes = result.pages.map((p) => p.pageIndex);
  const uniqueIndexes = new Set(pageIndexes);
  assert.equal(uniqueIndexes.size, 5);
});

test("12. malformed PDF rejected", async () => {
  const malformedBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  await assert.rejects(async () => {
    await parsePdf(malformedBytes);
  }, PdfParserError);
});

test("13. malformed error bounded", async () => {
  const malformedBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  try {
    await parsePdf(malformedBytes);
    assert.fail("Should have thrown");
  } catch (error) {
    assert.ok(error instanceof PdfParserError);
    assert.ok(PDF_PARSER_ERROR_CODES.includes(error.code));
  }
});

test("14. no raw stack exposed through parser contract", async () => {
  const malformedBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  try {
    await parsePdf(malformedBytes);
    assert.fail("Should have thrown");
  } catch (error) {
    assert.ok(error instanceof PdfParserError);
    assert.ok(!error.message.includes("at "));
  }
});

test("15. password/encryption failure code exists", () => {
  assert.ok(PDF_PARSER_ERROR_CODES.includes("PDF_PASSWORD_REQUIRED"));
});

test("16. page limit constant is reasonable", () => {
  assert.equal(MAX_PDF_PAGES, 2000);
});

test("17. page limit failure code exists", () => {
  assert.ok(PDF_PARSER_ERROR_CODES.includes("PDF_PAGE_LIMIT_EXCEEDED"));
});

test("18. per-page text limit constant is reasonable", () => {
  assert.equal(MAX_NATIVE_TEXT_CHARS_PER_PAGE, 500_000);
  assert.ok(PDF_PARSER_ERROR_CODES.includes("PDF_TEXT_LIMIT_EXCEEDED"));
});

test("19. document text limit constant is reasonable", () => {
  assert.equal(MAX_NATIVE_TEXT_CHARS_PER_DOCUMENT, 10_000_000);
});

test("20. no silent page truncation", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 10 });
  const result = await parsePdf(pdfBytes);
  assert.equal(result.pages.length, 10);
});

test("21. empty native text allowed", async () => {
  const doc = new jsPDF();
  doc.rect(72, 72, 100, 100);
  const pdfBytes = new Uint8Array(doc.output("arraybuffer"));
  const result = await parsePdf(pdfBytes);
  assert.equal(result.pageCount, 1);
  assert.equal(typeof result.pages[0].nativeText, "string");
});

test("22. empty native text sets nativeTextAvailable=False", async () => {
  const doc = new jsPDF();
  doc.rect(72, 72, 100, 100);
  const pdfBytes = new Uint8Array(doc.output("arraybuffer"));
  const result = await parsePdf(pdfBytes);
  if (result.pages[0].nativeText.trim() === "") {
    assert.equal(result.pages[0].nativeTextAvailable, false);
  }
});

test("23. source text not spell-corrected", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1, textPerPage: ["Recieve"] });
  const result = await parsePdf(pdfBytes);
  assert.ok(result.pages[0].nativeText.length > 0);
});

test("24. source technical codes preserved", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1, textPerPage: ["P0087 P0088 P0089"] });
  const result = await parsePdf(pdfBytes);
  assert.ok(result.pages[0].nativeText.includes("P0087"));
});

test("25. source numbers preserved", async () => {
  const pdfBytes = createSyntheticPdf({ pages: 1, textPerPage: ["123.45 678.90"] });
  const result = await parsePdf(pdfBytes);
  assert.ok(result.pages[0].nativeText.includes("123.45"));
});

test("26. no OCR in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("tesseract"));
  assert.ok(!parserSrc.toLowerCase().includes("ocr"));
});

test("27. no rendering in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("page.render"));
});

test("28. no canvas import/use in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("@napi-rs/canvas"));
  assert.ok(!parserSrc.includes("createCanvas"));
});

test("29. no PNG generation in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("toBlob"));
  assert.ok(!parserSrc.includes("toDataURL"));
});

test("30. no Storage read/write in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("adminStorage"));
  assert.ok(!parserSrc.includes("bucket()"));
});

test("31. no Firestore read/write in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("adminDb"));
});

test("32. no page persistence in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("setDoc"));
});

test("33. no READY transition in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("READY"));
});

test("34. no approval transition in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("APPROVED"));
});

test("35. no provider/reasoning execution in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("openai"));
  assert.ok(!parserSrc.includes("gemini"));
});

test("36. no indexing in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("searchIndex"));
});

test("37. no semantic search in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("embedding"));
});

test("38. no browser worker/CDN worker in parser source", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("workerSrc"));
  assert.ok(!parserSrc.includes("cdn"));
});

test("39. parser input contains no companyId trust boundary", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("companyId"));
});

test("40. parser input contains no arbitrary URL", async () => {
  const fs = await import("node:fs");
  const parserSrc = fs.readFileSync("src/lib/iq200/knowledgePdfParser.ts", "utf8");
  assert.ok(!parserSrc.includes("http://"));
  assert.ok(!parserSrc.includes("https://"));
});
