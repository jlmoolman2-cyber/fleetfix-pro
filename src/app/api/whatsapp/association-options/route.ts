import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { findAssociationOptions } from "@/lib/whatsapp/inboxService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await authenticateServerRequest(request);
    return Response.json(await findAssociationOptions(context, new URL(request.url).searchParams.get("search") || ""));
  } catch (error) { return safeErrorResponse(error); }
}
