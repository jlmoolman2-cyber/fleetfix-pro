import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type { ServerUserContext } from "./auth";
import { localConfigurationChecks } from "./diagnosticsCore";
import { MetaWhatsAppClient } from "./metaClient";
import { requireWhatsAppPermission } from "./permissions";
import { getWhatsAppSecret, whatsappSecretPresence } from "./secrets";

export async function whatsappDiagnostics(context: ServerUserContext, liveProbe: boolean) {
  requireWhatsAppPermission(context.companyUser, "Manage WhatsApp settings");
  const settingsSnapshot = await adminDb.doc(`companies/${context.companyId}/whatsappSettings/config`).get();
  const data = settingsSnapshot.data() || {};
  const secrets = whatsappSecretPresence();
  const checks = localConfigurationChecks({
    enabled: data.enabled === true, businessId: String(data.metaBusinessAccountId || ""), wabaId: String(data.whatsappBusinessAccountId || ""),
    phoneNumberId: String(data.phoneNumberId || ""), displayPhoneNumber: String(data.displayPhoneNumber || ""), graphVersion: String(data.graphApiVersion || process.env.META_GRAPH_API_VERSION || ""),
    appSecret: secrets.metaAppSecret, accessToken: secrets.metaWhatsappAccessToken, verifyToken: secrets.metaWebhookVerifyToken,
    webhookUrl: String(process.env.WHATSAPP_WEBHOOK_PUBLIC_URL || ""),
  });
  const since = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
  const [audit, lastWebhook, messagesProcessed, messagesFailed, mediaPending, mediaFailed, retryableEvents] = await Promise.all([
    adminDb.collection(`companies/${context.companyId}/whatsappAuditLog`).where("createdAt", ">=", since).limit(200).get(),
    adminDb.collection(`companies/${context.companyId}/whatsappWebhookEvents`).orderBy("updatedAt", "desc").limit(1).get(),
    adminDb.collection(`companies/${context.companyId}/whatsappMessages`).where("createdAt", ">=", since).count().get(),
    adminDb.collection(`companies/${context.companyId}/whatsappMessages`).where("status", "==", "failed").count().get(),
    adminDb.collection(`companies/${context.companyId}/whatsappMediaJobs`).where("status", "in", ["pending", "processing", "retryable"]).count().get(),
    adminDb.collection(`companies/${context.companyId}/whatsappMediaJobs`).where("status", "==", "failed").count().get(),
    adminDb.collection(`companies/${context.companyId}/whatsappWebhookEvents`).where("state", "==", "retryable").count().get(),
  ]);
  const lastWebhookAt = lastWebhook.docs[0]?.data().updatedAt?.toDate?.().toISOString() || null;
  const monitoring = {
    webhookHealthy: Boolean(lastWebhookAt) && Date.now() - new Date(lastWebhookAt).getTime() < 24 * 60 * 60 * 1000,
    lastWebhookReceived: lastWebhookAt,
    events24h: audit.size,
    messagesProcessed24h: messagesProcessed.data().count,
    messagesFailed: messagesFailed.data().count,
    mediaPending: mediaPending.data().count,
    mediaFailed: mediaFailed.data().count,
    retryableEvents: retryableEvents.data().count,
    failures24h: audit.docs.filter((entry) => entry.data().result === "failure").length,
    lastFailure: audit.docs.filter((entry) => entry.data().result === "failure").map((entry) => ({ action: String(entry.data().action || ""), at: entry.data().createdAt?.toDate?.().toISOString() || null })).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null,
    retentionDays: Math.max(0, Number(process.env.WHATSAPP_MEDIA_RETENTION_DAYS || 0)),
  };
  let meta: Record<string, unknown> | null = null;
  if (liveProbe) {
    if (process.env.WHATSAPP_ALLOW_META_READ_PROBE !== "true") throw new Error("Meta read probe is locked. Set WHATSAPP_ALLOW_META_READ_PROBE=true for controlled commissioning only.");
    const client = new MetaWhatsAppClient({ accessToken: getWhatsAppSecret(String(data.accessTokenSecretName || "metaWhatsappAccessToken")), phoneNumberId: String(data.phoneNumberId || ""), graphApiVersion: String(data.graphApiVersion || process.env.META_GRAPH_API_VERSION || "") });
    const phone = await client.request<Record<string, unknown>>(`${data.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,is_on_biz_app`, { method: "GET" });
    const waba = await client.request<Record<string, unknown>>(`${data.whatsappBusinessAccountId}?fields=id,name,timezone_id`, { method: "GET" });
    meta = { phone, waba, idsMatch: phone.id === data.phoneNumberId && waba.id === data.whatsappBusinessAccountId, coexistence: phone.is_on_biz_app === true ? "reported-active" : "not-confirmed" };
  }
  return { ready: checks.every((check) => check.passed), checks, monitoring, meta, coexistenceEligibility: liveProbe ? meta?.coexistence : "unconfirmed-requires-supported-meta-onboarding-check", outboundEnabled: false };
}
