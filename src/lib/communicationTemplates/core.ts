export const COMMUNICATION_CHANNELS = ["whatsapp", "email"] as const;
export const COMMUNICATION_CATEGORIES = ["jobs", "customers", "internal-staff", "external-service-providers", "suppliers", "accounts", "general"] as const;
export const COMMUNICATION_RECIPIENT_TYPES = ["customer", "customer-contact", "assigned-user", "internal-whatsapp-group", "external-service-provider", "supplier", "accounts-contact", "general-recipient"] as const;
export const COMMUNICATION_PURPOSES = [
  "job-booked", "job-eta-queue-update", "onroute", "arrived-on-site", "start-work", "job-on-hold", "job-complete", "job-closed", "job-reopened", "job-cancelled",
  "job-booked-internal-notification", "pending-job-reminder", "technician-reminder", "job-escalation",
  "eta-request", "job-update-request", "repair-report-request", "job-completion-confirmation",
  "purchase-order", "order-update", "remittance", "general-supplier-message",
  "manual-customer-message", "manual-internal-message", "manual-supplier-message",
] as const;

export type CommunicationChannel = typeof COMMUNICATION_CHANNELS[number];
export type CommunicationTemplateInput = {
  name: string; description: string; category: string; recipientType: string; channel: CommunicationChannel;
  purpose: string; active: boolean; subject: string; body: string;
};

export const COMMUNICATION_VARIABLES = [
  ["jobNumber", "Job number", "FleetFix job number", "NJ00001"], ["customerName", "Customer name", "Customer or company name", "ABC Logistics"],
  ["contactName", "Contact name", "Customer contact name", "John Smith"], ["vehicleRegistration", "Vehicle registration", "Vehicle registration number", "ABC1234"],
  ["vehicleFleetNumber", "Vehicle fleet number", "Customer fleet number", "H10"], ["jobStatus", "Job status", "Current job status", "Work Started"],
  ["queueNumber", "Queue number", "Current queue position", "3"], ["estimatedDispatchTime", "Estimated dispatch", "Estimated dispatch time", "14:30"],
  ["technicianName", "Technician name", "Assigned technician", "Jane Technician"], ["companyName", "Company name", "FleetFix company name", "FleetFix Pro"],
  ["companyPhone", "Company phone", "FleetFix company phone", "+27 11 555 0100"], ["trackingLink", "Tracking link", "Safe customer tracking URL", "https://example.test/track/NJ00001"],
  ["jobLocation", "Job location", "Job or breakdown location", "Johannesburg"], ["serviceProviderName", "Service provider", "External service provider name", "Roadside Services"],
  ["supplierName", "Supplier name", "Supplier business name", "Parts Supplier"],
].map(([key, label, description, example]) => ({ key, label, description, example })) as ReadonlyArray<{ key: string; label: string; description: string; example: string }>;

const VARIABLE_PATTERN = /\{\{([^{}]+)\}\}/g;
const allowedVariables = new Map(COMMUNICATION_VARIABLES.map((variable) => [variable.key, variable]));

export function validateCommunicationTemplate(value: unknown): CommunicationTemplateInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Template details are required.");
  const input = value as Record<string, unknown>;
  const text = (key: string, max: number) => String(input[key] || "").trim().slice(0, max);
  const channel = text("channel", 20) as CommunicationChannel;
  if (!COMMUNICATION_CHANNELS.includes(channel)) throw new Error("Template channel is invalid.");
  const name = text("name", 120); const body = text("body", 10000); const subject = text("subject", 300);
  if (!name) throw new Error("Template name is required.");
  if (!body) throw new Error("Template body is required.");
  if (channel === "email" && !subject) throw new Error("Email templates require a subject.");
  const category = text("category", 80); const recipientType = text("recipientType", 80); const purpose = text("purpose", 120);
  if (!COMMUNICATION_CATEGORIES.includes(category as never)) throw new Error("Template category is invalid.");
  if (!COMMUNICATION_RECIPIENT_TYPES.includes(recipientType as never)) throw new Error("Template recipient type is invalid.");
  if (!COMMUNICATION_PURPOSES.includes(purpose as never)) throw new Error("Template purpose is invalid.");
  return { name, description: text("description", 500), category, recipientType, channel, purpose, active: input.active !== false, subject: channel === "email" ? subject : "", body };
}

export function renderCommunicationTemplate(text: string, values: Record<string, string> = {}) {
  const unresolved = new Set<string>();
  const rendered = String(text || "").replace(VARIABLE_PATTERN, (_match, rawKey: string) => {
    const key = rawKey.trim();
    if (!allowedVariables.has(key) || !Object.prototype.hasOwnProperty.call(values, key)) { unresolved.add(key); return `[Unresolved: ${key}]`; }
    return String(values[key]);
  });
  return { rendered, unresolved: [...unresolved] };
}

export function exampleVariableValues() {
  return Object.fromEntries(COMMUNICATION_VARIABLES.map(({ key, example }) => [key, example]));
}

export function variablesUsed(input: Pick<CommunicationTemplateInput, "subject" | "body">) {
  const found = new Set<string>();
  for (const text of [input.subject, input.body]) for (const match of text.matchAll(VARIABLE_PATTERN)) if (allowedVariables.has(match[1].trim())) found.add(match[1].trim());
  return [...found];
}
