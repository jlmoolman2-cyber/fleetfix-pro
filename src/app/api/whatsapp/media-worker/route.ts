import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { requireMediaWorker } from "@/lib/whatsapp/internalAuth";
import { processNextMediaJob } from "@/lib/whatsapp/mediaQueueService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireMediaWorker(request);
    return Response.json(await processNextMediaJob(), { headers: { "cache-control": "no-store" } });
  } catch (error) { return safeErrorResponse(error); }
}
