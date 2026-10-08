import { commissioningKnowledgeRequest } from "@/lib/iq200/knowledgeRetrievalService";
import { stagingCommissioningAvailableFor, stagingCommissioningUnavailableResponse } from "@/lib/iq200/stagingCommissioningGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string; pageId: string }> }): Promise<Response> {
    if (!stagingCommissioningAvailableFor()) return stagingCommissioningUnavailableResponse();
    return commissioningKnowledgeRequest(request, await params, "image");
}