import { createHash } from "node:crypto";

export const EXECUTION_STATUSES = ["PLANNED", "BLOCKED", "SKIPPED", "READY", "QUEUED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "CANCELLED"] as const;
export type ExecutionStatus = typeof EXECUTION_STATUSES[number];
export type ExecutionChannel = "whatsapp" | "email";
export type ExecutionActor = { type: "USER"; id: string } | { type: "SYSTEM_AUTOMATION"; id: "SYSTEM_AUTOMATION" };

export type PreparedExecution = {
  companyId: string; ruleId: string; templateId: string; sourceEntityType: string; sourceEntityId: string;
  trigger: string; occurrence: string; recipientType: string; recipientId: string; recipientDisplay: string;
  destination: string; channel: ExecutionChannel; renderedSubject: string; renderedBody: string;
  timingType: "immediate" | "delayed"; plannedAt: string; status: "BLOCKED" | "SKIPPED" | "READY";
  reason: string | null; idempotencyKey: string; actor: ExecutionActor; sent: false;
};

const safeText = (value: unknown, maximum: number) => String(value ?? "").trim().slice(0, maximum);

export function normalizeExecutionDestination(channel: ExecutionChannel, value: unknown, recipientType = "") {
  const raw = safeText(value, 320);
  if (!raw) return { destination: "", reason: "NO_RECIPIENT" as const };
  if (channel === "email") {
    const normalized = raw.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)
      ? { destination: normalized, reason: null }
      : { destination: "", reason: "INVALID_EMAIL_DESTINATION" as const };
  }
  if (recipientType === "internal-whatsapp-group") return { destination: "", reason: "WHATSAPP_GROUP_UNSUPPORTED" as const };
  const hasPlus = raw.startsWith("+"); const digits = raw.replace(/\D/g, "");
  const normalized = hasPlus ? `+${digits}` : digits.startsWith("00") ? `+${digits.slice(2)}` : digits.startsWith("0") ? `+27${digits.slice(1)}` : digits.startsWith("27") ? `+${digits}` : "";
  return /^\+[1-9]\d{7,14}$/.test(normalized)
    ? { destination: normalized, reason: null }
    : { destination: "", reason: "INVALID_WHATSAPP_DESTINATION" as const };
}

export function communicationExecutionKey(input: { companyId: string; sourceEntityType: string; sourceEntityId: string; ruleId: string; trigger: string; recipientId: string; channel: string; occurrence: string }) {
  const canonical = [input.companyId, input.sourceEntityType, input.sourceEntityId, input.ruleId, input.trigger, input.recipientId, input.channel, input.occurrence].map((value) => safeText(value, 256)).join("\u001f");
  return createHash("sha256").update(canonical).digest("hex");
}

export function executionTransportEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return env.COMMUNICATION_EXECUTION_ENABLED === "true";
}

export type AdapterPayload = Readonly<{ executionId: string; companyId: string; destination: string; channel: ExecutionChannel; subject: string; body: string }>;
export type AdapterResult = { accepted: boolean; transportReference?: string };
export interface CommunicationAdapter { readonly channel: ExecutionChannel; deliver(payload: AdapterPayload): Promise<AdapterResult>; }

export class DisabledWhatsAppAdapter implements CommunicationAdapter {
  readonly channel = "whatsapp" as const;
  async deliver(...args: [AdapterPayload]): Promise<AdapterResult> { void args; throw new Error("Automated WhatsApp execution is disabled."); }
}
export class DisabledEmailAdapter implements CommunicationAdapter {
  readonly channel = "email" as const;
  async deliver(...args: [AdapterPayload]): Promise<AdapterResult> { void args; throw new Error("Automated Email execution is disabled."); }
}

export async function handoffPreparedExecution(payload: AdapterPayload, status: ExecutionStatus, adapter: CommunicationAdapter, env: Readonly<Record<string, string | undefined>> = process.env) {
  if (!executionTransportEnabled(env)) return { accepted: false, reason: "EXECUTION_DISABLED" as const };
  if (status !== "READY" || payload.channel !== adapter.channel) return { accepted: false, reason: "EXECUTION_NOT_READY" as const };
  return adapter.deliver(Object.freeze({ ...payload }));
}

export function stopConditionSatisfied(stopCondition: string, source: Record<string, unknown>) {
  const status = safeText(source.status ?? source.jobStatus, 100).toLowerCase().replace(/[ _-]/g, "");
  if (stopCondition === "job-completed-or-cancelled") return status.includes("complete") || status.includes("cancel");
  if (stopCondition === "job-onroute") return status.includes("onroute");
  if (stopCondition === "job-no-longer-pending") return Boolean(status) && !status.includes("pending") && !status.includes("booked");
  if (stopCondition === "eta-supplied") return Boolean(source.estimatedDispatchTime ?? source.eta ?? source.estimatedArrivalTime);
  return false;
}
