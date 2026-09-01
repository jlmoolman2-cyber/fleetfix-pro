export function safeIncomingMessageText(message: { type?: string; text?: { body?: string } }): string {
  if (message.type === "text") return String(message.text?.body || "").slice(0, 4096);
  return `[Unsupported WhatsApp message type: ${String(message.type || "unknown").slice(0, 50)}]`;
}

export function incrementUnreadOnce(messageAlreadyExists: boolean, currentUnread: number): number {
  return messageAlreadyExists ? currentUnread : currentUnread + 1;
}
