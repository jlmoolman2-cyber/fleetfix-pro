export type DeliveryState = "pending" | "received" | "sent" | "delivered" | "read" | "failed";

const rank: Record<DeliveryState, number> = { pending: 0, received: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

export function mayApplyDeliveryStatus(current: DeliveryState, incoming: DeliveryState): boolean {
  if (current === "read" || current === "failed") return false;
  if (incoming === "failed") return rank[current] <= rank.sent;
  return rank[incoming] > rank[current];
}

export function serviceWindowExpiry(inboundAt: Date): Date {
  return new Date(inboundAt.getTime() + 24 * 60 * 60 * 1000);
}
