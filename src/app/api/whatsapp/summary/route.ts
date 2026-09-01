import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { unreadSummary } from "@/lib/whatsapp/inboxService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await authenticateServerRequest(request);
    return Response.json(await unreadSummary(context));
  } catch (error) { return safeErrorResponse(error); }
}
