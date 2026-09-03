import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { listMessages, updateMessageJobContext } from "@/lib/whatsapp/inboxService";
import { sendManualText } from "@/lib/whatsapp/outboundService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authenticateServerRequest(request);
    const { id } = await params;
    return Response.json(await listMessages(context, id, new URL(request.url)));
  } catch (error) { return safeErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authenticateServerRequest(request);
    const { id } = await params;
    return Response.json(await updateMessageJobContext(context, id, await request.json()));
  } catch (error) { return safeErrorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authenticateServerRequest(request);
    const { id } = await params;
    return Response.json(await sendManualText(context, id, await request.json()));
  } catch (error) { return safeErrorResponse(error); }
}
