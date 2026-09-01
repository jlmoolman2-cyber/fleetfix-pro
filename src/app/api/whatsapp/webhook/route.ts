import { safeErrorResponse, WhatsAppError } from "@/lib/whatsapp/errors";
import { beginWebhookEvent, completeWebhookEvent, failWebhookEvent } from "@/lib/whatsapp/idempotency";
import { validateWebhookEnvelope } from "@/lib/whatsapp/webhook";
import { verifyWebhookChallenge, verifyWebhookSignature } from "@/lib/whatsapp/webhookSecurity";
import { processMetaWebhook, writeWebhookLifecycleAudit } from "@/lib/whatsapp/webhookProcessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredSecret(name: "META_APP_SECRET" | "META_WEBHOOK_VERIFY_TOKEN"): string {
  const value = process.env[name];
  if (!value) throw new WhatsAppError("CONFIGURATION_ERROR", "WhatsApp webhook is not configured.", 503);
  return value;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const challenge = verifyWebhookChallenge(request.url, requiredSecret("META_WEBHOOK_VERIFY_TOKEN"));
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (error) {
    return safeErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  let claimed: { companyId: string; eventId: string } | null = null;
  try {
    const rawBody = await request.text();
    if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), requiredSecret("META_APP_SECRET"))) {
      throw new WhatsAppError("FORBIDDEN", "Invalid WhatsApp webhook signature.", 401);
    }
    const envelope = await validateWebhookEnvelope(rawBody);
    const claim = await beginWebhookEvent(envelope.companyId, envelope.eventKey, envelope.payloadHash);
    if (!claim.shouldProcess) return Response.json({ received: true, duplicate: true }, { status: 200 });
    claimed = { companyId: envelope.companyId, eventId: claim.eventId };
    if (claim.recovered) await writeWebhookLifecycleAudit(envelope.companyId, claim.eventId, "WEBHOOK_RETRY_RECOVERED", "success");
    await processMetaWebhook(envelope.companyId, claim.eventId, envelope.payload);
    await completeWebhookEvent(envelope.companyId, claim.eventId);
    return Response.json({ received: true, duplicate: false }, { status: 200 });
  } catch (error) {
    if (claimed) {
      await failWebhookEvent(claimed.companyId, claimed.eventId, error instanceof WhatsAppError ? error.code : "PROCESSING_ERROR").catch(console.error);
      await writeWebhookLifecycleAudit(claimed.companyId, claimed.eventId, "MESSAGE_PROCESSING_FAILED", "failure").catch(console.error);
    }
    return safeErrorResponse(error);
  }
}
