import "server-only";

import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import type { ServerUserContext } from "./auth";
import { WhatsAppError } from "./errors";
import { requireWhatsAppPermission } from "./permissions";
import type { LiveUpdateEvent } from "./liveUpdatesCore";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export async function authorizeLiveInbox(context: ServerUserContext, conversationId: string | null): Promise<string | null> {
  requireWhatsAppPermission(context.companyUser, "View WhatsApp");
  if (!conversationId) return null;
  requireWhatsAppPermission(context.companyUser, "View WhatsApp conversations");
  if (!ID_PATTERN.test(conversationId)) throw new WhatsAppError("INVALID_INPUT", "Conversation ID is invalid.", 400);
  const conversation = await adminDb.doc(`companies/${context.companyId}/whatsappConversations/${conversationId}`).get();
  if (!conversation.exists) throw new WhatsAppError("NOT_FOUND", "This WhatsApp conversation no longer exists.", 404);
  return conversationId;
}

export function subscribeToLiveInbox(
  context: ServerUserContext,
  conversationId: string | null,
  onEvent: (event: LiveUpdateEvent) => void,
  onError: (error: Error) => void,
): () => void {
  const unsubscribers = [
    adminDb.collection(`companies/${context.companyId}/whatsappConversations`)
      .orderBy("lastMessageAt", "desc").limit(100)
      .onSnapshot(() => onEvent("conversations"), onError),
  ];
  if (conversationId) {
    unsubscribers.push(adminDb.collection(`companies/${context.companyId}/whatsappMessages`)
      .where("conversationId", "==", conversationId)
      .orderBy("metaTimestamp", "desc").orderBy(FieldPath.documentId(), "desc").limit(50)
      .onSnapshot(() => onEvent("messages"), onError));
  }
  return () => { for (const unsubscribe of unsubscribers) unsubscribe(); };
}
