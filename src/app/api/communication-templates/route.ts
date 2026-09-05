import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { createCommunicationTemplate, listCommunicationTemplates } from "@/lib/communicationTemplates/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { const context = await authenticateServerRequest(request); return Response.json(await listCommunicationTemplates(context, new URL(request.url)), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return safeErrorResponse(error); }
}

export async function POST(request: Request) {
  try { const context = await authenticateServerRequest(request); return Response.json(await createCommunicationTemplate(context, await request.json()), { status: 201 }); }
  catch (error) { return safeErrorResponse(error); }
}
