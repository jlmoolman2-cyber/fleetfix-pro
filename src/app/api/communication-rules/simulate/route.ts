import { simulateCommunicationEvent } from "@/lib/communicationRules/service";
import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try { const context = await authenticateServerRequest(request); return Response.json(await simulateCommunicationEvent(context, await request.json())); }
  catch (error) { return safeErrorResponse(error); }
}
