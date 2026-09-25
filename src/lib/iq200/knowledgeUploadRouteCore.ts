import "server-only";

import type { ServerUserContext } from "../serverAuth.ts";
import { KnowledgeUploadError, validateIdempotencyKey, type KnowledgeUploadResult } from "./knowledgeUploadCore.ts";

type UploadDocument = (
  context: ServerUserContext,
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
  idempotencyKey: string,
  title?: string,
  description?: string,
) => Promise<KnowledgeUploadResult & { processingEnqueueGeneration: number }>;

export type KnowledgeUploadRouteDependencies = {
  authenticate(request: Request): Promise<ServerUserContext>;
  upload: UploadDocument;
  enqueue(identity: { companyId: string; documentId: string; enqueueGeneration: number }): Promise<unknown>;
  safeError(error: unknown): Response;
  logEnqueueFailure(error: unknown): void;
};

export function createKnowledgeUploadPost(dependencies: KnowledgeUploadRouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const context = await dependencies.authenticate(request);
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
      const result = await dependencies.upload(
        context,
        bytes,
        blob.name,
        blob.type,
        idempotencyKey,
        typeof titleField === "string" ? titleField : undefined,
        typeof descriptionField === "string" ? descriptionField : undefined,
      );

      try {
        await dependencies.enqueue({
          companyId: context.companyId,
          documentId: result.documentId,
          enqueueGeneration: result.processingEnqueueGeneration,
        });
      } catch (error) {
        dependencies.logEnqueueFailure(error);
      }

      const { processingEnqueueGeneration: _processingEnqueueGeneration, ...responseResult } = result;
      return Response.json(responseResult, {
        status: result.idempotentRetry ? 200 : 201,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      if (error instanceof KnowledgeUploadError) {
        return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
      }
      const response = dependencies.safeError(error);
      response.headers.set("cache-control", "no-store");
      return response;
    }
  };
}
