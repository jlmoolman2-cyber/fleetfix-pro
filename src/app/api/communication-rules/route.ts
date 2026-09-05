import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { createCommunicationRule, listCommunicationRules } from "@/lib/communicationRules/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { const context = await authenticateServerRequest(request); return Response.json(await listCommunicationRules(context, new URL(request.url)), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return safeErrorResponse(error); }
}
export async function POST(request: Request) {
  try { const context = await authenticateServerRequest(request); return Response.json(await createCommunicationRule(context, await request.json()), { status: 201 }); }
  catch (error) { return safeErrorResponse(error); }
}
