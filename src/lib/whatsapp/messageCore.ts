export function safeIncomingMessageText(message: { type?: string; text?: { body?: string } }): string {
  if (message.type === "text") return String(message.text?.body || "").slice(0, 4096);
  return `[Unsupported WhatsApp message type: ${String(message.type || "unknown").slice(0, 50)}]`;
}

export function incrementUnreadOnce(messageAlreadyExists: boolean, currentUnread: number): number {
  return messageAlreadyExists ? currentUnread : currentUnread + 1;
}

type OrderedMessage = { id: string; timestamp: string | null };

export function sortMessagePageNewestFirst<T extends OrderedMessage>(messages: T[]): T[] {
  return [...messages].sort((left, right) => {
    const timestampDifference = Date.parse(right.timestamp || "") - Date.parse(left.timestamp || "");
    if (Number.isFinite(timestampDifference) && timestampDifference !== 0) return timestampDifference;
    if (left.id === right.id) return 0;
    return left.id > right.id ? -1 : 1;
  });
}

export function appendOlderMessagePage<T extends { id: string }>(current: T[], older: T[]): T[] {
  const existingIds = new Set(current.map((message) => message.id));
  return [...current, ...older.filter((message) => !existingIds.has(message.id))];
}
