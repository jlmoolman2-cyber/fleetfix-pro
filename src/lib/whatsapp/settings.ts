import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import { WhatsAppError } from "./errors";
import type { WhatsAppSettings } from "./models";
import { requireEnabledWhatsAppConfig } from "./settingsCore";

const ALLOWED_SECRET_NAMES = new Set([
  "metaAppSecret",
  "metaWhatsappAccessToken",
  "metaWebhookVerifyToken",
]);

export async function getWhatsAppSettings(companyId: string): Promise<WhatsAppSettings> {
  const snapshot = await adminDb.doc(`companies/${companyId}/whatsappSettings/config`).get();
  requireEnabledWhatsAppConfig(snapshot.exists, snapshot.data()?.enabled);
  const data = snapshot.data() || {};
  for (const field of ["accessTokenSecretName", "webhookVerificationSecretName", "appSecretSecretName"] as const) {
    if (data[field] && !ALLOWED_SECRET_NAMES.has(String(data[field]))) {
      throw new WhatsAppError("CONFIGURATION_ERROR", "WhatsApp secret configuration is invalid.", 500);
    }
  }
  return {
    enabled: true,
    metaBusinessAccountId: String(data.metaBusinessAccountId || ""),
    whatsappBusinessAccountId: String(data.whatsappBusinessAccountId || ""),
    phoneNumberId: String(data.phoneNumberId || ""),
    displayPhoneNumber: String(data.displayPhoneNumber || ""),
    accessTokenSecretName: String(data.accessTokenSecretName || "metaWhatsappAccessToken"),
    webhookVerificationSecretName: String(data.webhookVerificationSecretName || "metaWebhookVerifyToken"),
    appSecretSecretName: String(data.appSecretSecretName || "metaAppSecret"),
    defaultCountryCode: String(data.defaultCountryCode || "+27"),
    defaultNotificationMethod: ["email", "whatsapp", "both", "none"].includes(data.defaultNotificationMethod)
      ? data.defaultNotificationMethod : "email",
    graphApiVersion: String(data.graphApiVersion || process.env.META_GRAPH_API_VERSION || "v23.0"),
  };
}
