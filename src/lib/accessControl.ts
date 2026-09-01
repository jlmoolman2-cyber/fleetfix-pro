export function hasPrivilegedRole(role: unknown) {
  const normalizedRole = String(role || "").toLowerCase();
  return normalizedRole.includes("administrator") || normalizedRole.includes("business owner") || normalizedRole.includes("super admin");
}

export function hasPermission(permissions: Record<string, boolean> | undefined, permission: string) {
  return permissions?.[permission] === true;
}
