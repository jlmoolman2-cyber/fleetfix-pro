import { WhatsAppError } from "./errors.ts";

export function isServiceWindowOpen(expiresAt: Date | null, now = new Date()): boolean {
  return Boolean(expiresAt && expiresAt.getTime() > now.getTime());
}

export function assertServiceWindowOpen(expiresAt: Date | null, now = new Date()): void {
  if (!isServiceWindowOpen(expiresAt, now)) throw new WhatsAppError("SERVICE_WINDOW_CLOSED", "The 24-hour WhatsApp customer-service window is closed.", 409);
}

export const OUTBOUND_WHATSAPP_ENABLED = false;
