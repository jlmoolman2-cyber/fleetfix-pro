import { getIQ200SessionAssessment } from "@/lib/iq200/service";
import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string; sessionId: string }> }) {
  try {
    const context = await authenticateServerRequest(request);
    const { jobId, sessionId } = await params;
    return Response.json(await getIQ200SessionAssessment(context, jobId, sessionId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return safeServerErrorResponse(error);
  }
}