import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { WhatsAppError } from "./errors";

export type RateLimitOptions = { limit: number; windowSeconds: number };

export async function enforceRateLimit(
  companyId: string,
  scope: string,
  subject: string,
  options: RateLimitOptions,
): Promise<void> {
  const now = Date.now();
  const bucket = Math.floor(now / (options.windowSeconds * 1000));
  const safeKey = Buffer.from(`${scope}:${subject}:${bucket}`).toString("base64url");
  const ref = adminDb.doc(`companies/${companyId}/whatsappRateLimits/${safeKey}`);
  const allowed = await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const count = Number(snapshot.data()?.count || 0);
    if (count >= options.limit) return false;
    transaction.set(ref, {
      scope,
      subjectHash: Buffer.from(subject).toString("base64url"),
      count: count + 1,
      bucket,
      expiresAt: new Date((bucket + 2) * options.windowSeconds * 1000),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (!allowed) throw new WhatsAppError("RATE_LIMITED", "Too many WhatsApp requests. Try again later.", 429);
}
