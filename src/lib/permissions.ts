export type PermissionItem = { name: string; sub?: string[] };
export type PermissionSection = { title: string; items: PermissionItem[] };

export const PRIMARY_ROLES = [
  "Business Owner",
  "Administrator",
  "Technician/Artisan/Tradesman",
  "Accounts",
  "Sales Rep",
  "Driver",
  "Contractor",
  "Other",
] as const;

export const PERMISSION_SECTIONS: PermissionSection[] = [
  { title: "Dashboard & Jobs", items: [
    { name: "Dashboard", sub: ["View dashboard"] },
    { name: "Jobs", sub: ["View jobs", "Create jobs", "Edit jobs", "Assign jobs", "Change job status", "Close jobs", "Archive jobs", "Open closed jobs"] },
    { name: "Job Cards", sub: ["View job pricing", "Edit job forms", "Manage job tasks", "Manage job timers", "Manage job attachments", "Manage job photos", "Manage job materials", "Allocate serial numbers", "Mark job materials used", "Correct used job materials"] },
  ] },
  { title: "Customers & Suppliers", items: [
    { name: "Customers", sub: ["View customers", "Create customers", "Edit customer", "Delete customers", "Manage customer contacts", "Manage customer vehicles", "Manage recurring jobs"] },
    { name: "Suppliers", sub: ["View suppliers", "Create suppliers", "Edit suppliers", "Delete suppliers"] },
    { name: "Queries", sub: ["View queries", "Create queries", "Edit queries", "Close queries", "Delete queries"] },
  ] },
  { title: "Sales & Financials", items: [
    { name: "Quotes", sub: ["View quotes", "Create quotes", "Edit quotes", "Approve quotes", "Close quotes", "Send quotes", "View quote item cost", "View quote item markup", "Delete quotes"] },
    { name: "Invoices", sub: ["View invoices", "Create invoices", "Edit invoices", "Approve invoices", "Revert invoices to draft", "Send invoices", "View invoice item cost", "View invoice item markup", "Record invoice payments", "Delete invoices"] },
    { name: "Reports", sub: ["View reports", "Export reports"] },
  ] },
  { title: "Purchasing", items: [
    { name: "Purchase Orders", sub: ["View purchase orders", "Create purchase orders", "Edit purchase orders", "Approve purchase orders", "Send purchase orders", "Receive purchase orders", "Close purchase orders", "Delete purchase orders"] },
    { name: "GRV", sub: ["View GRV", "Process GRV", "Edit GRVs", "Edit GRV costs", "Capture serial numbers"] },
  ] },
  { title: "Inventory", items: [
    { name: "Inventory", sub: ["View inventory", "Create inventory", "Edit inventory", "Deactivate inventory", "Manage serial tracking"] },
    { name: "Stock Control", sub: ["Pick and issue requested stock", "Perform stock adjustments", "Perform stock transfers", "Perform stock takes", "View stock movements", "Manage stock locations"] },
  ] },
  { title: "Communication", items: [
    { name: "Messages", sub: ["View messages", "Send messages", "Manage message templates", "Manage automated communication"] },
    { name: "Notifications", sub: ["View notifications", "Finalize notifications"] },
    { name: "WhatsApp", sub: ["View inbox", "View conversations", "Send messages", "Send templates", "Manage conversations", "Assign conversations", "Close conversations", "Manage WhatsApp settings", "Manage templates", "Manage automation rules"] },
  ] },
  { title: "Administration", items: [
    { name: "Company Administration", sub: ["Manage company details", "Manage job settings", "Manage quote settings", "Manage invoice settings", "Manage purchase order settings", "Manage query settings"] },
    { name: "User Administration", sub: ["View users", "Create users", "Edit users", "Deactivate users", "Assign primary roles", "Manage user permissions"] },
    { name: "Audit & Security", sub: ["View audit log", "Export audit log", "Manage security settings"] },
  ] },
];

export const ALL_PERMISSIONS = PERMISSION_SECTIONS.flatMap((section) => section.items.flatMap((item) => [item.name, ...(item.sub || [])]));

const roleGrants: Record<string, string[]> = {
  "Business Owner": ALL_PERMISSIONS,
  Administrator: ALL_PERMISSIONS,
  "Technician/Artisan/Tradesman": ["Dashboard", "View dashboard", "Jobs", "View jobs", "Edit jobs", "Change job status", "Job Cards", "Edit job forms", "Manage job tasks", "Manage job timers", "Manage job attachments", "Manage job photos", "Manage job materials", "Allocate serial numbers", "Mark job materials used", "Inventory", "View inventory"],
  Accounts: ["Dashboard", "View dashboard", "Customers", "View customers", "Edit customer", "Suppliers", "View suppliers", "Quotes", "View quotes", "Approve quotes", "Invoices", "View invoices", "Create invoices", "Edit invoices", "Approve invoices", "Send invoices", "Record invoice payments", "Reports", "View reports", "Export reports", "Purchase Orders", "View purchase orders"],
  "Sales Rep": ["Dashboard", "View dashboard", "Jobs", "View jobs", "Create jobs", "Edit jobs", "Customers", "View customers", "Create customers", "Edit customer", "Manage customer contacts", "Queries", "View queries", "Create queries", "Edit queries", "Quotes", "View quotes", "Create quotes", "Edit quotes", "Send quotes", "Invoices", "View invoices"],
  Driver: ["Dashboard", "View dashboard", "Jobs", "View jobs", "Change job status", "Job Cards", "Manage job attachments", "Manage job photos", "Inventory", "View inventory", "Stock Control", "Perform stock transfers"],
  Contractor: ["Dashboard", "View dashboard", "Jobs", "View jobs", "Job Cards", "Edit job forms", "Manage job tasks", "Manage job timers", "Manage job attachments", "Manage job photos"],
  Other: ["Dashboard", "View dashboard"],
};

export function permissionsForRole(role: string): Record<string, boolean> {
  const enabled = new Set(roleGrants[role] || []);
  return Object.fromEntries(ALL_PERMISSIONS.map((permission) => [permission, enabled.has(permission)]));
}

export function effectivePermissions(user: any): Record<string, boolean> {
  const saved = user?.permissions && typeof user.permissions === "object" ? user.permissions : {};
  const defaults = permissionsForRole(String(user?.primaryRole || user?.role || ""));
  return Object.fromEntries(ALL_PERMISSIONS.map((permission) => [
    permission,
    Object.prototype.hasOwnProperty.call(saved, permission)
      ? saved[permission] === true
      : defaults[permission] === true,
  ]));
}
