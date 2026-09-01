import { WhatsAppError } from "./errors.ts";

export function normalizeE164(value: string, defaultCountryCode = "+27"): string {
  const raw = String(value || "").trim();
  if (!raw) throw new WhatsAppError("INVALID_INPUT", "A phone number is required.", 400);
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  const countryDigits = String(defaultCountryCode || "").replace(/\D/g, "");
  let normalized: string;
  if (hasPlus) normalized = `+${digits}`;
  else if (digits.startsWith("00")) normalized = `+${digits.slice(2)}`;
  else if (digits.startsWith("0")) normalized = `+${countryDigits}${digits.slice(1)}`;
  else if (countryDigits && digits.startsWith(countryDigits)) normalized = `+${digits}`;
  else normalized = `+${countryDigits}${digits}`;

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new WhatsAppError("INVALID_INPUT", "The phone number is not a valid international number.", 400);
  }
  return normalized;
}
