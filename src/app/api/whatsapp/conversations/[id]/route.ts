import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { getConversation, updateConversation } from "@/lib/whatsapp/inboxService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authenticateServerRequest(request);
    const { id } = await params;
    return Response.json(await getConversation(context, id, new URL(request.url).searchParams.get("jobSearch") || ""));
  } catch (error) { return safeErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authenticateServerRequest(request);
    const { id } = await params;
    return Response.json(await updateConversation(context, id, await request.json()));
  } catch (error) { return safeErrorResponse(error); }
}
