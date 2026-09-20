import { reconcileAllCanonicalStatuses } from "@/lib/jobStatusReconciliationService";
import { StatusReconciliationError } from "@/lib/jobStatusReconciliation";
import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";
import { resolveFleetFixEnvironment } from "@/lib/firebaseEnvironment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const environment = resolveFleetFixEnvironment(process.env.FLEETFIX_ENVIRONMENT);
    if (environment !== "staging") {
      return Response.json(
        { error: { code: "ENVIRONMENT_NOT_ALLOWED", message: "Complete reconciliation is only available in staging." } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const context = await authenticateServerRequest(request);
    const result = await reconcileAllCanonicalStatuses(context);
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