import { WhatsAppError } from "./errors.ts";

export const WHATSAPP_PERMISSIONS = [
  "View inbox",
  "View conversations",
  "Send messages",
  "Send templates",
  "Manage conversations",
  "Assign conversations",
  "Close conversations",
  "Manage WhatsApp settings",
  "Manage templates",
  "Manage automation rules",
] as const;

export type WhatsAppPermission = typeof WHATSAPP_PERMISSIONS[number];

export function userHasPermission(user: Record<string, unknown>, permission: WhatsAppPermission): boolean {
  const role = String(user.primaryRole ?? user.role ?? "").toLowerCase();
  if (role.includes("administrator") || role.includes("business owner") || role.includes("super admin")) return true;
  const permissions = user.permissions;
  return typeof permissions === "object" && permissions !== null &&
    (permissions as Record<string, unknown>)[permission] === true;
}

export function requireWhatsAppPermission(user: Record<string, unknown>, permission: WhatsAppPermission): void {
  if (!userHasPermission(user, permission)) {
    throw new WhatsAppError("FORBIDDEN", "You do not have permission to perform this WhatsApp action.", 403);
  }
}
