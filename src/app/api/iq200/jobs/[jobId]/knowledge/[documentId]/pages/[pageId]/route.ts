import { technicalKnowledgeRequest } from "@/lib/iq200/knowledgeRetrievalService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string; documentId: string; pageId: string }> }) {
  return technicalKnowledgeRequest(request, await params, "page");
}
