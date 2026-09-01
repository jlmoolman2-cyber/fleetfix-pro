import "server-only";

import { WhatsAppError } from "./errors";

export type MetaClientConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
};

export function getMetaClientConfig(): MetaClientConfig {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN || "";
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID || "";
  const graphApiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  if (!accessToken || !phoneNumberId) {
    throw new WhatsAppError("CONFIGURATION_ERROR", "WhatsApp sending is not configured.", 503);
  }
  return { accessToken, phoneNumberId, graphApiVersion };
}

export class MetaWhatsAppClient {
  constructor(private readonly config = getMetaClientConfig()) {}

  async request<T>(path: string, init: RequestInit): Promise<T> {
    const method = String(init.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      throw new WhatsAppError("FORBIDDEN", "Meta write operations are disabled during WhatsApp Phase 4.", 403);
    }
    const response = await fetch(
      `https://graph.facebook.com/${this.config.graphApiVersion}/${path.replace(/^\//, "")}`,
      {
        ...init,
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          "content-type": "application/json",
          ...init.headers,
        },
        signal: init.signal ?? AbortSignal.timeout(10_000),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Meta WhatsApp API request failed", {
        status: response.status,
        metaCode: body?.error?.code,
        metaType: body?.error?.type,
      });
      throw new WhatsAppError("META_ERROR", "Meta could not complete the WhatsApp request.", 502);
    }
    return body as T;
  }

  async download(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.hostname !== "lookaside.fbsbx.com") {
      throw new WhatsAppError("META_ERROR", "Meta returned an untrusted media URL.", 502);
    }
    const response = await fetch(target, {
      headers: { authorization: `Bearer ${this.config.accessToken}` },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!response.ok) throw new WhatsAppError("META_ERROR", "WhatsApp media could not be downloaded.", 502);
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 20 * 1024 * 1024) throw new WhatsAppError("INVALID_INPUT", "WhatsApp media exceeds the 20 MB ingestion limit.", 413);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 20 * 1024 * 1024) throw new WhatsAppError("INVALID_INPUT", "WhatsApp media exceeds the 20 MB ingestion limit.", 413);
    return { bytes, contentType: response.headers.get("content-type") || "application/octet-stream" };
  }
}
