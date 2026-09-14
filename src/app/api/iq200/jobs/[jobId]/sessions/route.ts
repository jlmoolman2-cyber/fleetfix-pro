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
    const result = await createIQ200Session(context, (await params).jobId, await request.json());
    return Response.json({ session: result.session }, { status: result.created ? 201 : 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return safeServerErrorResponse(error);
  }
}
