import { createHmac, timingSafeEqual } from "node:crypto";
import { WhatsAppError } from "./errors.ts";

export function verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret) return false;
  const suppliedHex = signatureHeader.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function verifyWebhookChallenge(url: string, verifyToken: string): string {
  const params = new URL(url).searchParams;
  if (params.get("hub.mode") !== "subscribe" || params.get("hub.verify_token") !== verifyToken) {
    throw new WhatsAppError("FORBIDDEN", "Webhook verification failed.", 403);
  }
  const challenge = params.get("hub.challenge");
  if (!challenge) throw new WhatsAppError("INVALID_INPUT", "Webhook challenge is missing.", 400);
  return challenge;
}
