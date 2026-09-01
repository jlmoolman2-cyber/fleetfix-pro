import { adminStorage } from "@/lib/firebaseAdmin";
import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { getMessageMedia } from "@/lib/whatsapp/inboxService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const context = await authenticateServerRequest(request);
    const { id, messageId } = await params;
    const media = await getMessageMedia(context, id, messageId);
    const [bytes] = await adminStorage.bucket().file(media.storagePath).download();
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, { headers: { "content-type": media.contentType, "content-disposition": `inline; filename="${media.filename.replace(/["\\]/g, "_")}"`, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
  } catch (error) { return safeErrorResponse(error); }
}
