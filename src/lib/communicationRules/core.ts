import type { CommunicationChannel, CommunicationTemplateInput } from "../communicationTemplates/core.ts";
import { renderCommunicationTemplate } from "../communicationTemplates/core.ts";

export const RULE_CATEGORIES = ["customer-job", "internal-job", "external-service-provider", "supplier", "accounts", "general"] as const;
export const RULE_TRIGGERS = [
  "job-booked", "queue-edt-updated", "onroute", "arrived-on-site", "start-work", "job-on-hold", "job-complete", "job-closed", "job-reopened", "job-cancelled",
  "job-booked-internal-notification", "job-still-pending", "technician-reminder", "escalation-reminder",
  "provider-eta-request", "provider-job-update-request", "provider-repair-report-request", "provider-job-completion-confirmation",
  "supplier-purchase-order", "supplier-order-update", "supplier-remittance", "general-manual",
] as const;
export const RULE_RECIPIENT_TYPES = ["customer", "customer-contact", "assigned-technician", "assigned-users", "job-manager", "dispatcher", "external-service-provider", "supplier", "accounts-contact", "internal-whatsapp-group", "general-recipient"] as const;
export const DELAY_UNITS = ["minutes", "hours", "days"] as const;
export const STOP_CONDITIONS = ["none", "job-no-longer-pending", "eta-supplied", "job-completed-or-cancelled", "job-onroute", "job-status-changed"] as const;
export const COMMUNICATION_PREFERENCES = ["inherit", "email", "whatsapp", "both", "do-not-contact"] as const;

export type RuleChannel = CommunicationChannel;
export type CommunicationRuleInput = {
  name: string;
  description: string;
  category: string;
  trigger: string;
  recipientType: string;
  recipientConfiguration: { destinationId: string; preference: string };
  channel: RuleChannel;
  templateId: string;
  active: boolean;
  timing: {
    type: "immediate" | "delayed";
    delayAmount: number;
    delayUnit: string;
    repeat: { enabled: boolean; intervalAmount: number; intervalUnit: string; maximumRepeats: number };
    stopCondition: string;
  };
};

export type PlanningRecipient = { display: string; destination: string; preference?: unknown } | null;
export type PlanningTemplate = (CommunicationTemplateInput & { id: string }) | null;

const text = (value: unknown, maximum: number) => String(value ?? "").trim().slice(0, maximum);
const number = (value: unknown, minimum: number, maximum: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Value must be between ${minimum} and ${maximum}.`);
  return parsed;
};

export function validateCommunicationRule(value: unknown): CommunicationRuleInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Communication rule details are required.");
  const input = value as Record<string, unknown>;
  const configuration = input.recipientConfiguration && typeof input.recipientConfiguration === "object" ? input.recipientConfiguration as Record<string, unknown> : {};
  const timing = input.timing && typeof input.timing === "object" ? input.timing as Record<string, unknown> : {};
  const repeat = timing.repeat && typeof timing.repeat === "object" ? timing.repeat as Record<string, unknown> : {};
  const channel = text(input.channel, 20) as RuleChannel;
  const timingType = text(timing.type, 20) as "immediate" | "delayed";
  const delayUnit = text(timing.delayUnit, 20);
  const repeatUnit = text(repeat.intervalUnit, 20);
  const stopCondition = text(timing.stopCondition, 80) || "none";
  const category = text(input.category, 80);
  const trigger = text(input.trigger, 120);
  const recipientType = text(input.recipientType, 80);
  const preference = text(configuration.preference, 30) || "inherit";
  if (!(["email", "whatsapp"] as string[]).includes(channel)) throw new Error("Rule channel is invalid.");
  if (!(RULE_CATEGORIES as readonly string[]).includes(category)) throw new Error("Rule category is invalid.");
  if (!(RULE_TRIGGERS as readonly string[]).includes(trigger)) throw new Error("Rule trigger is invalid.");
  if (!(RULE_RECIPIENT_TYPES as readonly string[]).includes(recipientType)) throw new Error("Rule recipient type is invalid.");
  if (!(COMMUNICATION_PREFERENCES as readonly string[]).includes(preference)) throw new Error("Recipient preference is invalid.");
  if (!(["immediate", "delayed"] as string[]).includes(timingType)) throw new Error("Timing type is invalid.");
  if (!(DELAY_UNITS as readonly string[]).includes(delayUnit)) throw new Error("Delay unit is invalid.");
  if (!(DELAY_UNITS as readonly string[]).includes(repeatUnit)) throw new Error("Repeat interval unit is invalid.");
  if (!(STOP_CONDITIONS as readonly string[]).includes(stopCondition)) throw new Error("Stop condition is invalid.");
  const name = text(input.name, 120);
  const templateId = text(input.templateId, 128);
  if (!name) throw new Error("Rule name is required.");
  if (!templateId) throw new Error("A template is required.");
  const enabled = repeat.enabled === true;
  return {
    name,
    description: text(input.description, 500),
    category,
    trigger,
    recipientType,
    recipientConfiguration: { destinationId: text(configuration.destinationId, 160), preference },
    channel,
    templateId,
    active: input.active !== false,
    timing: {
      type: timingType,
      delayAmount: timingType === "delayed" ? number(timing.delayAmount, 1, 365) : 0,
      delayUnit,
      repeat: {
        enabled,
        intervalAmount: enabled ? number(repeat.intervalAmount, 1, 365) : 0,
        intervalUnit: repeatUnit,
        maximumRepeats: enabled ? number(repeat.maximumRepeats, 1, 100) : 0,
      },
      stopCondition,
    },
  };
}

export function normalizeCommunicationPreference(value: unknown) {
  if (value === false) return "do-not-contact";
  const normalized = text(value, 30).toLowerCase().replace(/[_ ]/g, "-");
  if (["none", "opt-out", "opted-out", "do-not-contact", "disabled"].includes(normalized)) return "do-not-contact";
  if (["email", "whatsapp", "both"].includes(normalized)) return normalized;
  return "inherit";
}

function offsetMilliseconds(amount: number, unit: string) {
  const multiplier = unit === "days" ? 86_400_000 : unit === "hours" ? 3_600_000 : 60_000;
  return amount * multiplier;
}

export function planCommunication(input: {
  rule: CommunicationRuleInput | null;
  template: PlanningTemplate;
  recipient: PlanningRecipient;
  variables: Record<string, string>;
  now?: Date;
}) {
  const sent = false as const;
  if (!input.rule) return { status: "SKIPPED" as const, reason: "NO_RULE", sent };
  if (!input.rule.active) return { status: "SKIPPED" as const, reason: "RULE_INACTIVE", sent };
  if (!input.recipient?.display || !input.recipient.destination) return { status: "BLOCKED" as const, reason: "NO_RECIPIENT", sent };
  const preference = normalizeCommunicationPreference(input.recipient.preference ?? input.rule.recipientConfiguration.preference);
  if (preference === "do-not-contact" || (preference !== "inherit" && preference !== "both" && preference !== input.rule.channel)) {
    return { status: "SKIPPED" as const, reason: "RECIPIENT_OPTED_OUT", recipient: input.recipient.display, sent };
  }
  if (!input.template) return { status: "BLOCKED" as const, reason: "MISSING_TEMPLATE", sent };
  if (!input.template.active) return { status: "BLOCKED" as const, reason: "TEMPLATE_INACTIVE", sent };
  if (input.template.channel !== input.rule.channel) return { status: "BLOCKED" as const, reason: "WRONG_TEMPLATE_CHANNEL", sent };
  const subject = renderCommunicationTemplate(input.template.subject, input.variables);
  const body = renderCommunicationTemplate(input.template.body, input.variables);
  const unresolved = [...new Set([...subject.unresolved, ...body.unresolved])];
  if (unresolved.length) return { status: "BLOCKED" as const, reason: "UNRESOLVED_VARIABLE", unresolved, sent };
  const now = input.now ?? new Date();
  const scheduledAt = new Date(now.getTime() + (input.rule.timing.type === "delayed" ? offsetMilliseconds(input.rule.timing.delayAmount, input.rule.timing.delayUnit) : 0)).toISOString();
  return {
    status: "READY" as const,
    reason: null,
    trigger: input.rule.trigger,
    recipientType: input.rule.recipientType,
    recipient: input.recipient.display,
    destination: input.recipient.destination,
    channel: input.rule.channel,
    template: { id: input.template.id, name: input.template.name },
    rendered: { subject: subject.rendered, body: body.rendered },
    timing: input.rule.timing,
    scheduledAt,
    stopCondition: input.rule.timing.stopCondition,
    sent,
  };
}
