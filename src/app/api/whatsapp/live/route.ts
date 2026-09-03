import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { createCleanupBag, type LiveUpdateEvent } from "@/lib/whatsapp/liveUpdatesCore";
import { authorizeLiveInbox, subscribeToLiveInbox } from "@/lib/whatsapp/liveUpdatesService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const context = await authenticateServerRequest(request);
    const conversationId = await authorizeLiveInbox(context, new URL(request.url).searchParams.get("conversationId"));
    const encoder = new TextEncoder();
    const cleanups = createCleanupBag();
    let closeStream = () => cleanups.close();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const send = (event: LiveUpdateEvent | "connected") => {
          if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`));
        };
        const close = () => {
          if (closed) return;
          closed = true;
          cleanups.close();
          try { controller.close(); } catch { /* stream already closed */ }
        };
        closeStream = close;
        send("connected");
        cleanups.add(subscribeToLiveInbox(context, conversationId, send, close));
        const heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
        }, 25_000);
        cleanups.add(() => clearInterval(heartbeat));
        request.signal.addEventListener("abort", close, { once: true });
        cleanups.add(() => request.signal.removeEventListener("abort", close));
      },
      cancel() { closeStream(); },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (error) { return safeErrorResponse(error); }
}
