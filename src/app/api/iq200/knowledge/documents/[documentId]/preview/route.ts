import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";
import { getKnowledgeDocumentPreview } from "@/lib/iq200/knowledgePreviewService";
import { ServerAccessError } from "@/lib/serverAuthCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }): Promise<Response> {
    try {
        const context = await authenticateServerRequest(request);
        const { documentId } = await params;
        const url = new URL(request.url);
        const cursors = url.searchParams.getAll("cursor");
        if (Array.from(url.searchParams.keys()).some((key) => key !== "cursor") || cursors.length > 1) {
            throw new ServerAccessError("INVALID_INPUT", "Knowledge preview input is invalid.", 400);
        }
        if (url.searchParams.has("cursor") && !cursors[0]) {
            throw new ServerAccessError("INVALID_INPUT", "Knowledge preview input is invalid.", 400);
        }
        const result = await getKnowledgeDocumentPreview(context, documentId, {
            ...(url.searchParams.has("cursor") ? { cursor: cursors[0] } : {}),
        });
        return Response.json(result, { headers: { "cache-control": "private, no-store" } });
    } catch (error) {
        const response = safeServerErrorResponse(error);
        response.headers.set("cache-control", "private, no-store");
        return response;
    }
}