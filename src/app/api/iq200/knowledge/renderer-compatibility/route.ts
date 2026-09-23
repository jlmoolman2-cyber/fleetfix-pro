import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROOF_SECRET_NAME = "IQ200_RENDERER_COMPATIBILITY_PROOF_SECRET";

function isStagingRuntime(): boolean {
  return process.env.FLEETFIX_ENVIRONMENT === "staging";
}

function isAuthorized(request: Request): boolean {
  const expected = process.env[PROOF_SECRET_NAME] || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return Boolean(expected) && expected.length === supplied.length && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function boundedError(code: "RUNTIME_NOT_STAGING" | "PROOF_NOT_AUTHORIZED" | "INTERNAL") {
  const status = code === "RUNTIME_NOT_STAGING" ? 404 : code === "PROOF_NOT_AUTHORIZED" ? 401 : 500;
  return Response.json({ ok: false, error: { code } }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(): Promise<Response> {
  return boundedError("PROOF_NOT_AUTHORIZED");
}

export async function POST(request: Request): Promise<Response> {
  if (!isStagingRuntime()) return boundedError("RUNTIME_NOT_STAGING");
  if (!isAuthorized(request)) return boundedError("PROOF_NOT_AUTHORIZED");

  try {
    const { runRendererCompatibilityProof, RendererCompatibilityProofError } = await import("@/lib/iq200/rendererCompatibilityProof");
    return Response.json(await runRendererCompatibilityProof(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && "code" in error && typeof error.code === "string") {
      return Response.json({ ok: false, error: { code: error.code } }, { status: 500, headers: { "cache-control": "no-store" } });
    }
    return boundedError("INTERNAL");
  }
}