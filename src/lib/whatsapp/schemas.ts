import "server-only";

import { WhatsAppError } from "./errors";

export type MetaWebhookPayload = {
  object: "whatsapp_business_account";
  entry: Array<{
    id: string;
    changes: Array<{
      field: "messages" | string;
      value: {
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          image?: { id?: string; mime_type?: string; sha256?: string; caption?: string };
          video?: { id?: string; mime_type?: string; sha256?: string; caption?: string };
          audio?: { id?: string; mime_type?: string; sha256?: string; voice?: boolean };
          document?: { id?: string; mime_type?: string; sha256?: string; caption?: string; filename?: string };
          sticker?: { id?: string; mime_type?: string; sha256?: string; animated?: boolean };
          context?: { id?: string; from?: string };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
        }>;
        [key: string]: unknown;
      };
    }>;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseMetaWebhookPayload(value: unknown): MetaWebhookPayload {
  if (!isRecord(value) || value.object !== "whatsapp_business_account" || !Array.isArray(value.entry)) {
    throw new WhatsAppError("INVALID_INPUT", "Invalid WhatsApp webhook payload.", 400);
  }
  for (const entry of value.entry) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !Array.isArray(entry.changes)) {
      throw new WhatsAppError("INVALID_INPUT", "Invalid WhatsApp webhook entry.", 400);
    }
    for (const change of entry.changes) {
      if (!isRecord(change) || typeof change.field !== "string" || !isRecord(change.value)) {
        throw new WhatsAppError("INVALID_INPUT", "Invalid WhatsApp webhook change.", 400);
      }
    }
  }
  return value as MetaWebhookPayload;
}

export function webhookPhoneNumberIds(payload: MetaWebhookPayload): string[] {
  return [...new Set(payload.entry.flatMap((entry) => entry.changes)
    .map((change) => change.value.metadata?.phone_number_id)
    .filter((value): value is string => Boolean(value)))];
}

export function requireNonEmptyString(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new WhatsAppError("INVALID_INPUT", `${field} is invalid.`, 400);
  }
  return value.trim();
}
