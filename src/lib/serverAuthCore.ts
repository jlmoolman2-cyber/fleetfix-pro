export class ServerAccessError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ServerAccessError";
    this.code = code;
    this.status = status;
  }
}

export function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new ServerAccessError("AUTH_REQUIRED", "Authentication is required.", 401);
  }
  const token = authorization.slice(7).trim();
  if (!token) throw new ServerAccessError("AUTH_REQUIRED", "Authentication is required.", 401);
  return token;
}

export function selectActiveMembership<T extends { companyId: string; active?: boolean }>(memberships: T[], claimedCompanyId?: string) {
  const active = memberships.filter((membership) => membership.active !== false);
  if (!active.length) throw new ServerAccessError("FORBIDDEN", "No active FleetFix company membership was found.", 403);
  if (claimedCompanyId) {
    const selected = active.find((membership) => membership.companyId === claimedCompanyId);
    if (!selected) throw new ServerAccessError("FORBIDDEN", "The selected company membership is not valid.", 403);
    return selected;
  }
  if (active.length > 1) throw new ServerAccessError("FORBIDDEN", "An active company must be selected.", 403);
  return active[0];
}

export async function authenticateRequestWith<TToken, TContext>(
  request: Request,
  verifyToken: (token: string) => Promise<TToken>,
  resolveUser: (token: TToken) => Promise<TContext>,
) {
  try {
    return await resolveUser(await verifyToken(readBearerToken(request)));
  } catch (error) {
    if (error instanceof ServerAccessError) throw error;
    throw new ServerAccessError("AUTH_REQUIRED", "Authentication is invalid or expired.", 401);
  }
}
