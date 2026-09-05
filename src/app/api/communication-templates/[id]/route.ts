import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { getCommunicationTemplate, mutateCommunicationTemplate } from "@/lib/communicationTemplates/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const context = await authenticateServerRequest(request); return Response.json(await getCommunicationTemplate(context, (await params).id), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return safeErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const context = await authenticateServerRequest(request); return Response.json(await mutateCommunicationTemplate(context, (await params).id, await request.json())); }
  catch (error) { return safeErrorResponse(error); }
}
