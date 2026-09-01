import "server-only";

import { timingSafeEqual } from "node:crypto";
import { WhatsAppError } from "./errors";

export function requireMediaWorker(request: Request): void {
  const expected = process.env.WHATSAPP_MEDIA_WORKER_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || expected.length !== supplied.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    throw new WhatsAppError("AUTH_REQUIRED", "Media worker authentication failed.", 401);
  }
}
