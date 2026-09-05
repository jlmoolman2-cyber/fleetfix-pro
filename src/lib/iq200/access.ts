import "server-only";

import { ServerAccessError, type ServerUserContext } from "@/lib/serverAuth";
import { canUseIQ200 } from "./permissions";

export function requireIQ200Access(context: ServerUserContext) {
  if (!canUseIQ200(context.companyUser)) {
    throw new ServerAccessError("FORBIDDEN", "IQ200 Technician Assist permission is required.", 403);
  }
}
