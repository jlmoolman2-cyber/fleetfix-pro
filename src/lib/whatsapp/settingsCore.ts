import { WhatsAppError } from "./errors.ts";

export function requireEnabledWhatsAppConfig(exists: boolean, enabled: unknown): void {
  if (!exists || enabled !== true) {
    throw new WhatsAppError("CONFIGURATION_ERROR", "WhatsApp is not enabled for this company.", 503);
  }
}
