import assert from "node:assert/strict";
import test from "node:test";
import { runRendererCompatibilityProof, RENDERER_COMPATIBILITY_FAILURE_CODES } from "../src/lib/iq200/rendererCompatibilityProof.ts";
import { GET, POST } from "../src/app/api/iq200/knowledge/renderer-compatibility/route.ts";

test("1. proof returns bounded renderer metadata", async () => {
  const result = await runRendererCompatibilityProof();
  assert.equal(result.ok, true);
  assert.equal(result.pageIndex, 0);
  assert.equal(result.pageCount, 1);
  assert.equal(result.targetDpi, 300);
  assert.equal(result.scale, 300 / 72);
  assert.ok(Number.isInteger(result.width));
  assert.ok(Number.isInteger(result.height));
  assert.ok(result.pngBytes > 0 && result.pngBytes <= 10_000_000);
  assert.equal(result.pngSignatureValid, true);
  assert.equal(result.fullColourConfirmed, true);
  assert.equal(result.cleanupCompleted, true);
  assert.equal("pdfBytes" in result, false);
  assert.equal("pngData" in result, false);
  assert.equal("base64" in result, false);
});

test("2. proof source is in-memory and uses production renderer", async () => {
  const fs = await import("node:fs");
  const proofSource = fs.readFileSync("src/lib/iq200/rendererCompatibilityProof.ts", "utf8");
  assert.match(proofSource, /new jsPDF/);
  assert.match(proofSource, /renderPdfPageToPng/);
  assert.doesNotMatch(proofSource, /readFile|writeFile|Storage|Firestore|documentId|companyId|https?:/i);
});

test("3. proof result contains no paths, environment values, or stacks", async () => {
  const result = await runRendererCompatibilityProof();
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /[A-Z]:\\|\\\\|\/src\/|process\.env|stack|company|document/i);
});

test("4. failure codes are bounded", () => {
  assert.ok(RENDERER_COMPATIBILITY_FAILURE_CODES.includes("RENDERER_MODULE_LOAD_FAILED"));
  assert.ok(RENDERER_COMPATIBILITY_FAILURE_CODES.includes("NATIVE_CANVAS_IMPORT_FAILED"));
  assert.ok(RENDERER_COMPATIBILITY_FAILURE_CODES.includes("PNG_INVALID"));
  assert.ok(RENDERER_COMPATIBILITY_FAILURE_CODES.includes("CLEANUP_FAILED"));
});

test("5. route is Node.js, POST-only, and GET does not execute proof", async () => {
  const fs = await import("node:fs");
  const routeSource = fs.readFileSync("src/app/api/iq200/knowledge/renderer-compatibility/route.ts", "utf8");
  assert.match(routeSource, /runtime = "nodejs"/);
  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /await import\("@\/lib\/iq200\/rendererCompatibilityProof"\)/);
  const response = await GET();
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: { code: "PROOF_NOT_AUTHORIZED" } });
});

test("6. route rejects non-staging before authorization", async () => {
  const previous = process.env.FLEETFIX_ENVIRONMENT;
  process.env.FLEETFIX_ENVIRONMENT = "production";
  try {
    const response = await POST(new Request("http://localhost/api/iq200/knowledge/renderer-compatibility", { method: "POST" }));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, error: { code: "RUNTIME_NOT_STAGING" } });
  } finally {
    if (previous === undefined) delete process.env.FLEETFIX_ENVIRONMENT;
    else process.env.FLEETFIX_ENVIRONMENT = previous;
  }
});

test("7. route rejects missing and invalid authorization", async () => {
  const previousEnvironment = process.env.FLEETFIX_ENVIRONMENT;
  const previousSecret = process.env.IQ200_RENDERER_COMPATIBILITY_PROOF_SECRET;
  process.env.FLEETFIX_ENVIRONMENT = "staging";
  process.env.IQ200_RENDERER_COMPATIBILITY_PROOF_SECRET = "local-test-only";
  try {
    const missing = await POST(new Request("http://localhost/api/iq200/knowledge/renderer-compatibility", { method: "POST" }));
    assert.equal(missing.status, 401);
    const invalid = await POST(new Request("http://localhost/api/iq200/knowledge/renderer-compatibility", { method: "POST", headers: { authorization: "Bearer wrong" } }));
    assert.equal(invalid.status, 401);
  } finally {
    if (previousEnvironment === undefined) delete process.env.FLEETFIX_ENVIRONMENT;
    else process.env.FLEETFIX_ENVIRONMENT = previousEnvironment;
    if (previousSecret === undefined) delete process.env.IQ200_RENDERER_COMPATIBILITY_PROOF_SECRET;
    else process.env.IQ200_RENDERER_COMPATIBILITY_PROOF_SECRET = previousSecret;
  }
});

test("8. route accepts no proof selectors or payload contract", async () => {
  const fs = await import("node:fs");
  const routeSource = fs.readFileSync("src/app/api/iq200/knowledge/renderer-compatibility/route.ts", "utf8");
  assert.doesNotMatch(routeSource, /request\.json|searchParams|documentId|companyId|filePath|url|storage/i);
  assert.match(routeSource, /IQ200_RENDERER_COMPATIBILITY_PROOF_SECRET/);
  assert.match(routeSource, /timingSafeEqual/);
});

test("9. route response never exposes underlying message/stack, only bounded code", async () => {
  const fs = await import("node:fs");
  const routeSource = fs.readFileSync("src/app/api/iq200/knowledge/renderer-compatibility/route.ts", "utf8");
  assert.doesNotMatch(routeSource, /error\.message|error\.stack|error\.toString/);
  assert.match(routeSource, /error:\s*\{\s*code\s*\}/);
});

test("10. renderer logs a bounded [IQ200_RENDERER_RUNTIME_FAILURE] diagnostic on underlying failure", async () => {
  const { renderPdfPageToPng, PdfRenderError } = await import("../src/lib/iq200/knowledgePdfRenderer.ts");
  const originalConsoleError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  process.env.SOME_TEST_SECRET_PROBE = "should-never-appear-in-logs";
  try {
    await assert.rejects(() => renderPdfPageToPng(new Uint8Array([1, 2, 3, 4]), 0), (error: unknown) => error instanceof PdfRenderError);
  } finally {
    console.error = originalConsoleError;
    delete process.env.SOME_TEST_SECRET_PROBE;
  }

  const diagnosticCalls = calls.filter((args) => args[0] === "[IQ200_RENDERER_RUNTIME_FAILURE]");
  assert.ok(diagnosticCalls.length >= 1, "expected at least one [IQ200_RENDERER_RUNTIME_FAILURE] log");

  const [prefix, payload] = diagnosticCalls[0] as [string, Record<string, unknown>];
  assert.equal(prefix, "[IQ200_RENDERER_RUNTIME_FAILURE]");
  assert.deepEqual(Object.keys(payload).sort(), ["code", "message", "name", "stage"]);
  assert.equal(typeof payload.name, "string");
  assert.equal(typeof payload.message, "string");
  assert.equal(typeof payload.code, "string");
  assert.equal(typeof payload.stage, "string");

  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /should-never-appear-in-logs|SOME_TEST_SECRET_PROBE|Authorization|Bearer|process\.env/i);
  assert.doesNotMatch(serialized, /[A-Z]:\\|\/src\//);
});

test("11. mapRendererError no longer contains a dead ternary; PNG_ENCODING_FAILED retains its own mapping", async () => {
  const fs = await import("node:fs");
  const proofSource = fs.readFileSync("src/lib/iq200/rendererCompatibilityProof.ts", "utf8");
  assert.doesNotMatch(proofSource, /"PAGE_RENDER_FAILED"\s*:\s*"PAGE_RENDER_FAILED"/);
  assert.match(proofSource, /case "PNG_ENCODING_FAILED":\s*\n\s*return "PNG_ENCODE_FAILED";/);
  assert.match(proofSource, /case "PDF_RENDER_FAILED":/);
});

test("12. successful compatibility proof is unchanged by diagnostic hardening", async () => {
  const result = await runRendererCompatibilityProof();
  assert.equal(result.ok, true);
  assert.equal(result.cleanupCompleted, true);
  assert.equal("stack" in result, false);
  assert.equal("code" in result, false);
});
test("13. renderer diagnostic message is normalized and runtime-bounded to 500 characters", async () => {
  const { normalizeDiagnosticMessage, MAX_DIAGNOSTIC_MESSAGE_LENGTH } = await import("../src/lib/iq200/knowledgePdfRenderer.ts");
  assert.equal(MAX_DIAGNOSTIC_MESSAGE_LENGTH, 500);

  assert.equal(normalizeDiagnosticMessage(new Error("short failure")), "short failure");
  assert.equal(normalizeDiagnosticMessage("plain thrown string"), "plain thrown string");
  assert.equal(normalizeDiagnosticMessage(123), "123");
  assert.equal(normalizeDiagnosticMessage(null), "null");
  assert.equal(normalizeDiagnosticMessage(void 0), "undefined");
  assert.equal(normalizeDiagnosticMessage({ a: 1 }), "[object Object]");

  const bounded = normalizeDiagnosticMessage(new Error("x".repeat(2000)));
  assert.equal(typeof bounded, "string");
  assert.ok(bounded.length <= MAX_DIAGNOSTIC_MESSAGE_LENGTH);
  assert.equal(bounded.length, MAX_DIAGNOSTIC_MESSAGE_LENGTH);

  const atLimit = normalizeDiagnosticMessage(new Error("y".repeat(MAX_DIAGNOSTIC_MESSAGE_LENGTH)));
  assert.equal(atLimit.length, MAX_DIAGNOSTIC_MESSAGE_LENGTH);

  const longNonError = normalizeDiagnosticMessage("z".repeat(1000));
  assert.equal(typeof longNonError, "string");
  assert.ok(longNonError.length <= MAX_DIAGNOSTIC_MESSAGE_LENGTH);

  // Defense-in-depth: the production log wiring routes the message through the helper.
  const fs = await import("node:fs");
  const rendererSource = fs.readFileSync("src/lib/iq200/knowledgePdfRenderer.ts", "utf8");
  assert.match(rendererSource, /message:\s*normalizeDiagnosticMessage\(error\)/);
});

test("14. mapRendererError runtime mappings cover every PdfRenderErrorCode", async () => {
  const { mapRendererError } = await import("../src/lib/iq200/rendererCompatibilityProof.ts");
  assert.equal(mapRendererError("PDF_RENDER_FAILED"), "PAGE_RENDER_FAILED");
  assert.equal(mapRendererError("PDF_RENDER_WIDTH_LIMIT_EXCEEDED"), "PAGE_RENDER_FAILED");
  assert.equal(mapRendererError("PDF_RENDER_HEIGHT_LIMIT_EXCEEDED"), "PAGE_RENDER_FAILED");
  assert.equal(mapRendererError("PDF_RENDER_PIXEL_LIMIT_EXCEEDED"), "PAGE_RENDER_FAILED");
  assert.equal(mapRendererError("PNG_ENCODING_FAILED"), "PNG_ENCODE_FAILED");
});

test("15. POST returns a bounded HTTP 500 when the proof layer fails internally", async () => {
  const previousEnvironment = process.env.FLEETFIX_ENVIRONMENT;
  const previousSecret = process.env.IQ200_RENDERER_COMPATIBILITY_PROOF_SECRET;
  process.env.FLEETFIX_ENVIRONMENT = "staging";
  process.env.IQ200_RENDERER_COMPATIBILITY_PROOF_SECRET = "local-test-only";
  try {
    const request = new Request("http://localhost/api/iq200/knowledge/renderer-compatibility", {
      method: "POST",
      headers: { authorization: "Bearer local-test-only" },
    });

    const response = await POST(request);

    assert.equal(response.status, 500);
    const body = JSON.parse(await response.text()) as { ok: boolean; error: { code: string } };
    assert.deepEqual(Object.keys(body).sort(), ["error", "ok"]);
    assert.equal(body.ok, false);
    assert.deepEqual(Object.keys(body.error), ["code"]);
    assert.equal(typeof body.error.code, "string");
    assert.ok(body.error.code.length > 0);

    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /simulated|stack|Authorization|Bearer|process\.env|local-test-only|SOME_TEST_SECRET_PROBE/i);
  } finally {
    if (previousEnvironment === undefined) delete process.env.FLEETFIX_ENVIRONMENT;
    else process.env.FLEETFIX_ENVIRONMENT = previousEnvironment;
    if (previousSecret === undefined) delete process.env.IQ200_RENDERER_COMPATIBILITY_PROOF_SECRET;
    else process.env.IQ200_RENDERER_COMPATIBILITY_PROOF_SECRET = previousSecret;
  }
});