import { searchIQ200History } from "@/lib/iq200/historyService";
import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const context = await authenticateServerRequest(request);
    return Response.json(await searchIQ200History(context, (await params).jobId, request.url), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return safeServerErrorResponse(error);
  }
}
