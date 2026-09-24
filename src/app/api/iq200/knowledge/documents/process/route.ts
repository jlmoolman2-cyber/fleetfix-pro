import { requireProcessingWorker, KnowledgeProcessingError } from "@/lib/iq200/knowledgeProcessingCore";
import { claimNextPendingDocument } from "@/lib/iq200/knowledgeProcessingService";
import { processClaimedKnowledgeDocument } from "@/lib/iq200/knowledgeDocumentProcessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireProcessingWorker(request);
    const claim = await claimNextPendingDocument();
    if (!claim) {
      return Response.json({ processed: false }, { headers: { "cache-control": "no-store" } });
    }
    const result = await processClaimedKnowledgeDocument(claim);
    return Response.json({ processed: true, claimed: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof KnowledgeProcessingError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error("IQ200 processing worker error", error);
    return Response.json({ error: { code: "INTERNAL", message: "Processing could not be completed." } }, { status: 500 });
  }
}
