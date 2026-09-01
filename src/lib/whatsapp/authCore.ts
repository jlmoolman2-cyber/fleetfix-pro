import { WhatsAppError } from "./errors.ts";

export function readBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new WhatsAppError("AUTH_REQUIRED", "Authentication is required.", 401);
  }
  const token = authorization.slice(7).trim();
  if (!token) throw new WhatsAppError("AUTH_REQUIRED", "Authentication is required.", 401);
  return token;
}

export function selectActiveCompany<T extends { companyId: string; active?: boolean }>(
  memberships: T[],
  claimedCompanyId?: string,
): T {
  const active = memberships.filter((membership) => membership.active !== false);
  if (!active.length) throw new WhatsAppError("FORBIDDEN", "No active FleetFix company membership was found.", 403);
  if (claimedCompanyId) {
    const selected = active.find((membership) => membership.companyId === claimedCompanyId);
    if (!selected) throw new WhatsAppError("FORBIDDEN", "The selected company membership is not valid.", 403);
    return selected;
  }
  if (active.length > 1) throw new WhatsAppError("FORBIDDEN", "An active company must be selected before using WhatsApp.", 403);
  return active[0];
}
