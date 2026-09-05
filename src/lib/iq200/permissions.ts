import { effectivePermissions } from "../permissions.ts";

export const IQ200_PERMISSION = "Use IQ200 Technician Assist";

export function canUseIQ200(companyUser: unknown) {
  const permissions = effectivePermissions(companyUser);
  return permissions["View jobs"] === true && permissions[IQ200_PERMISSION] === true;
}
