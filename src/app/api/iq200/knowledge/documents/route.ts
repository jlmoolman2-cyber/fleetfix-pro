import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";
import { listKnowledgeDocuments, loadCompanyKnowledgeDocuments } from "@/lib/iq200/knowledgeListService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    try {
        const context = await authenticateServerRequest(request);
        return Response.json(await listKnowledgeDocuments(context, loadCompanyKnowledgeDocuments), {
            headers: { "cache-control": "no-store" },
        });
    } catch (error) {
        const response = safeServerErrorResponse(error);
        response.headers.set("cache-control", "no-store");
        return response;
    }
}
