import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";
import { uploadKnowledgeDocument } from "@/lib/iq200/knowledgeUploadService";
import { KnowledgeUploadError, validateIdempotencyKey } from "@/lib/iq200/knowledgeUploadCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await authenticateServerRequest(request);
    const idempotencyKey = validateIdempotencyKey(request.headers.get("Idempotency-Key"));
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      throw new KnowledgeUploadError("MISSING_FILE", "A PDF file is required.", 400);
    }
    const blob = file as { arrayBuffer: () => Promise<ArrayBuffer>; name: string; type: string; size: number };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const titleField = formData.get("title");
    const descriptionField = formData.get("description");
    const result = await uploadKnowledgeDocument(
      context, bytes, blob.name, blob.type, idempotencyKey,
      typeof titleField === "string" ? titleField : undefined,
      typeof descriptionField === "string" ? descriptionField : undefined,
    );
    return Response.json(result, {
      status: result.idempotentRetry ? 200 : 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof KnowledgeUploadError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    const response = safeServerErrorResponse(error);
    response.headers.set("cache-control", "no-store");
    return response;
  }
}
