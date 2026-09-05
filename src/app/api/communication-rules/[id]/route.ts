import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { getCommunicationRule, mutateCommunicationRule } from "@/lib/communicationRules/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const context = await authenticateServerRequest(request); return Response.json(await getCommunicationRule(context, (await params).id), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return safeErrorResponse(error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const context = await authenticateServerRequest(request); return Response.json(await mutateCommunicationRule(context, (await params).id, await request.json())); }
  catch (error) { return safeErrorResponse(error); }
}
