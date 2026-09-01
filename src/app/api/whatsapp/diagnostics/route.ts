import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { whatsappDiagnostics } from "@/lib/whatsapp/diagnosticsService";
import { safeErrorResponse } from "@/lib/whatsapp/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await authenticateServerRequest(request);
    const liveProbe = new URL(request.url).searchParams.get("liveProbe") === "true";
    return Response.json(await whatsappDiagnostics(context, liveProbe), { headers: { "cache-control": "no-store" } });
  } catch (error) { return safeErrorResponse(error); }
}
