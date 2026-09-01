export const NOTIFICATION_PREFERENCE_OPTIONS = [
  { key: "job_booked", group: "Jobs", label: "Job Booked" },
  { key: "job_status", group: "Jobs", label: "Job Status Changes" },
  { key: "job_assignment", group: "Jobs", label: "Job Assignment Changes" },
  { key: "job_comments", group: "Jobs", label: "Job Comments and Communications" },
  { key: "parts_requisitions", group: "Stock Forms", label: "Parts Requisitions" },
  { key: "parts_derequisitions", group: "Stock Forms", label: "Parts Derequisitions" },
  { key: "rav_replenishments", group: "Stock Forms", label: "RAV Replenishments" },
  { key: "inventory", group: "Inventory", label: "Inventory and Low Stock" },
  { key: "grv", group: "Inventory", label: "GRV and Stock Received" },
  { key: "stocktake", group: "Inventory", label: "Stocktakes and Adjustments" },
  { key: "purchase_orders", group: "Purchasing and Sales", label: "Purchase Orders" },
  { key: "quotes", group: "Purchasing and Sales", label: "Quotes and Quote Approvals" },
  { key: "queries", group: "Purchasing and Sales", label: "Queries and Follow-ups" },
  { key: "invoices", group: "Purchasing and Sales", label: "Invoices" },
  { key: "customers", group: "Accounts", label: "Customer Activity" },
  { key: "suppliers", group: "Accounts", label: "Supplier Activity" },
  { key: "messages", group: "Communication", label: "Messages and General Communications" },
] as const;

export type NotificationPreferenceKey = typeof NOTIFICATION_PREFERENCE_OPTIONS[number]["key"];
export type NotificationPreferences = Partial<Record<NotificationPreferenceKey, boolean>>;

export const defaultNotificationPreferences = (): Record<NotificationPreferenceKey, boolean> =>
  Object.fromEntries(NOTIFICATION_PREFERENCE_OPTIONS.map(({ key }) => [key, true])) as Record<NotificationPreferenceKey, boolean>;

export function notificationPreferenceKey(notification: any): NotificationPreferenceKey | null {
  const type = String(notification?.type || notification?.notificationType || "").trim().toLowerCase();
  const source = String(notification?.module || notification?.sourceModule || notification?.sourcePath || "").trim().toLowerCase();
  const text = `${type} ${source} ${notification?.title || ""}`.toLowerCase();
  if (type === "parts-request" || /parts?[-_ ]?(request|requisition)/.test(text)) return "parts_requisitions";
  if (type === "parts-derequisition" || /dereq|parts?[-_ ]?return/.test(text)) return "parts_derequisitions";
  if (type === "rav-replenishment" || /rav.*replenish/.test(text)) return "rav_replenishments";
  if (/job.*book|booked.*job/.test(text)) return "job_booked";
  if (/job.*status|status.*job/.test(text)) return "job_status";
  if (/job.*assign|assign.*job/.test(text)) return "job_assignment";
  if (["user_job_comment", "customer_job_comment"].includes(type) || /job.*comment/.test(text)) return "job_comments";
  if (/purchase|\bpo\b/.test(text)) return "purchase_orders";
  if (/quote/.test(text)) return "quotes";
  if (/quer(y|ies)|follow[_ -]?up/.test(text)) return "queries";
  if (/invoice/.test(text)) return "invoices";
  if (/stocktake|stock.*adjust|adjustment/.test(text)) return "stocktake";
  if (/\bgrv\b|goods.*receiv|stock.*receiv/.test(text)) return "grv";
  if (/inventory|low.*stock/.test(text)) return "inventory";
  if (/customer/.test(text)) return "customers";
  if (/supplier/.test(text)) return "suppliers";
  if (/message|communication/.test(text)) return "messages";
  return null;
}

export function canReceiveNotification(notification: any, preferences?: NotificationPreferences | null) {
  const key = notificationPreferenceKey(notification);
  return !key || preferences?.[key] !== false;
}
