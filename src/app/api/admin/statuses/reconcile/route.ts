import { reconcileJobStatus } from "@/lib/jobStatusReconciliationService";
import { StatusReconciliationError } from "@/lib/jobStatusReconciliation";
import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await authenticateServerRequest(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new StatusReconciliationError("INVALID_REQUEST", 400, "The request body must be valid JSON.");
    }
    const result = await reconcileJobStatus(context, body);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StatusReconciliationError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return safeServerErrorResponse(error);
  }
}
