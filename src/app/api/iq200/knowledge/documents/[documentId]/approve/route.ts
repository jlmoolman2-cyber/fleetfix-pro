import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";
import { approveKnowledgeDocument } from "@/lib/iq200/knowledgeApprovalService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ documentId: string }> }): Promise<Response> {
  try {
    const context = await authenticateServerRequest(_request);
    const { documentId } = await params;
    const result = await approveKnowledgeDocument(context, documentId);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response = safeServerErrorResponse(error);
    response.headers.set("cache-control", "no-store");
    return response;
  }
}
