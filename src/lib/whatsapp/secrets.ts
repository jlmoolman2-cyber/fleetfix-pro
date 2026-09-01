import "server-only";

import { WhatsAppError } from "./errors";

const SECRET_ENVIRONMENT_NAMES = {
  metaAppSecret: "META_APP_SECRET",
  metaWhatsappAccessToken: "META_WHATSAPP_ACCESS_TOKEN",
  metaWebhookVerifyToken: "META_WEBHOOK_VERIFY_TOKEN",
} as const;

export type WhatsAppSecretName = keyof typeof SECRET_ENVIRONMENT_NAMES;

export function secretEnvironmentName(name: string): string | null {
  return SECRET_ENVIRONMENT_NAMES[name as WhatsAppSecretName] || null;
}

export function getWhatsAppSecret(name: string): string {
  const environmentName = secretEnvironmentName(name);
  if (!environmentName) throw new WhatsAppError("CONFIGURATION_ERROR", "WhatsApp secret reference is not allowed.", 500);
  const value = process.env[environmentName];
  if (!value) throw new WhatsAppError("CONFIGURATION_ERROR", `Required WhatsApp secret ${environmentName} is unavailable.`, 503);
  return value;
}

export function whatsappSecretPresence() {
  return Object.fromEntries(Object.entries(SECRET_ENVIRONMENT_NAMES).map(([name, environmentName]) => [name, Boolean(process.env[environmentName])])) as Record<WhatsAppSecretName, boolean>;
}
