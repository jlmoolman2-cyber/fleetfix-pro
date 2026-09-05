import { createIQ200Session, listIQ200Sessions } from "@/lib/iq200/service";
import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    return Response.json(await listIQ200Sessions(await authenticateServerRequest(request), (await params).jobId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return safeServerErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const context = await authenticateServerRequest(request);
    return Response.json(await createIQ200Session(context, (await params).jobId, await request.json()), { status: 201 });
  } catch (error) {
    return safeServerErrorResponse(error);
  }
}
