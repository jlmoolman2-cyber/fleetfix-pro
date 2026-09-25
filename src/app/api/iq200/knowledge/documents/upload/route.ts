import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";
import { uploadKnowledgeDocument } from "@/lib/iq200/knowledgeUploadService";
import { enqueueKnowledgeProcessingTask, processingEnqueueDiagnostic } from "@/lib/iq200/knowledgeProcessingOrchestrator";
import { createKnowledgeUploadPost } from "@/lib/iq200/knowledgeUploadRouteCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createKnowledgeUploadPost({
  authenticate: authenticateServerRequest,
  upload: uploadKnowledgeDocument,
  enqueue: enqueueKnowledgeProcessingTask,
  safeError: safeServerErrorResponse,
  logEnqueueFailure(error) {
    console.error(processingEnqueueDiagnostic(error));
  },
});
