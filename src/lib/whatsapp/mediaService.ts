import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminStorage } from "@/lib/firebaseAdmin";
import { MetaWhatsAppClient } from "./metaClient";
import type { WhatsAppSettings } from "./models";
import { getWhatsAppSecret } from "./secrets";
import type { MetaWebhookPayload } from "./schemas";

type MetaMessage = NonNullable<MetaWebhookPayload["entry"][number]["changes"][number]["value"]["messages"]>[number];
const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"] as const;
const ALLOWED_MIME = ["image/", "video/", "audio/", "application/pdf", "text/plain"];

export function mediaDescriptor(message: MetaMessage) {
  const type = MEDIA_TYPES.find((candidate) => candidate === message.type);
  if (!type) return null;
  const media = message[type];
  if (!media?.id) return null;
  return { type, id: media.id, declaredMimeType: media.mime_type || "", sha256: media.sha256 || "", caption: "caption" in media ? media.caption || "" : "", filename: "filename" in media ? media.filename || "" : "" };
}

export type MediaDescriptor = NonNullable<ReturnType<typeof mediaDescriptor>>;

export async function ingestMediaDescriptor(input: { companyId: string; messageId: string; phoneNumberId: string; settings: WhatsAppSettings; descriptor: MediaDescriptor }) {
  const descriptor = input.descriptor;
  const client = new MetaWhatsAppClient({ accessToken: getWhatsAppSecret(input.settings.accessTokenSecretName), phoneNumberId: input.phoneNumberId, graphApiVersion: input.settings.graphApiVersion });
  const metadata = await client.request<{ url: string; mime_type?: string; sha256?: string; file_size?: number }>(`${encodeURIComponent(descriptor.id)}?phone_number_id=${encodeURIComponent(input.phoneNumberId)}`, { method: "GET" });
  if (Number(metadata.file_size || 0) > 20 * 1024 * 1024) throw new Error("WhatsApp media exceeds the 20 MB ingestion limit.");
  const downloaded = await client.download(metadata.url);
  const contentType = String(metadata.mime_type || downloaded.contentType).split(";")[0].toLowerCase();
  if (!ALLOWED_MIME.some((allowed) => contentType === allowed || contentType.startsWith(allowed))) throw new Error("WhatsApp media type is not allowed.");
  const hash = createHash("sha256").update(downloaded.bytes).digest("base64");
  const expectedHash = metadata.sha256 || descriptor.sha256;
  if (expectedHash && hash !== expectedHash) throw new Error("WhatsApp media integrity validation failed.");
  const safeName = descriptor.filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || `${descriptor.type}-${descriptor.id}`;
  const storagePath = `companies/${input.companyId}/whatsapp-media/${input.messageId}/${safeName}`;
  await adminStorage.bucket().file(storagePath).save(downloaded.bytes, { resumable: false, contentType, metadata: { metadata: { companyId: input.companyId, metaMediaId: descriptor.id, sha256: hash } } });
  return { mediaId: descriptor.id, mediaType: descriptor.type, mediaMimeType: contentType, mediaSize: downloaded.bytes.byteLength, mediaSha256: hash, mediaStoragePath: storagePath, mediaFilename: safeName, mediaCaption: descriptor.caption, mediaIngestionStatus: "stored", mediaStoredAt: FieldValue.serverTimestamp() };
}

export async function ingestInboundMedia(input: { companyId: string; messageId: string; phoneNumberId: string; settings: WhatsAppSettings; message: MetaMessage }) {
  const descriptor = mediaDescriptor(input.message);
  return descriptor ? ingestMediaDescriptor({ ...input, descriptor }) : null;
}
