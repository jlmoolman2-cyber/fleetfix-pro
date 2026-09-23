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