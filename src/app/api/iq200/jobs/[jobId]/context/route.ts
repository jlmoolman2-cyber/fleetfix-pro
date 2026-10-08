import { getIQ200JobContext } from "@/lib/iq200/service";
import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const context = await authenticateServerRequest(request);
    const jobContext = await getIQ200JobContext(context, (await params).jobId);
    return Response.json(jobContext, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return safeServerErrorResponse(error);
  }
}
