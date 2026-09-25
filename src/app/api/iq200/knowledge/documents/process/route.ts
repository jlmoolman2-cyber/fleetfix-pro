import { parseProcessingTaskDescriptor, KnowledgeProcessingError } from "@/lib/iq200/knowledgeProcessingCore";
import { requireProcessingOidc } from "@/lib/iq200/knowledgeProcessingOidc";
import { claimProcessingDocument } from "@/lib/iq200/knowledgeProcessingService";
import { processClaimedKnowledgeDocument } from "@/lib/iq200/knowledgeDocumentProcessor";
import { ProcessingApplicationFailureError } from "@/lib/iq200/knowledgePageProcessingCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Legacy global claim/auth symbols are intentionally not executed by this targeted OIDC route: requireProcessingWorker(request), claimNextPendingDocument.

export async function POST(request: Request) {
  try {
    await requireProcessingOidc(request);
    const descriptor = parseProcessingTaskDescriptor(JSON.parse(await request.text()));
    const outcome = await claimProcessingDocument(descriptor);
    if (outcome.kind === "handled") {
      return Response.json({ processed: false, handled: true, reason: outcome.reason }, { headers: { "cache-control": "no-store" } });
    }
    const claim = outcome.claim;
    const result = await processClaimedKnowledgeDocument(claim);
    return Response.json({ processed: true, claimed: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ProcessingApplicationFailureError) {
      return Response.json({ processed: false, handled: true, reason: "APPLICATION_FAILURE", code: error.code }, { headers: { "cache-control": "no-store" } });
    }
    if (error instanceof KnowledgeProcessingError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error("IQ200 processing worker error", error);
    return Response.json({ error: { code: "INTERNAL", message: "Processing could not be completed." } }, { status: 500 });
  }
}
