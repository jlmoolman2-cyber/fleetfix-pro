import { normalizeE164 } from "./phoneNumbers.ts";

export function normalizedPhoneValues(values: unknown[], defaultCountryCode = "+27"): string[] {
  const normalized = values.flatMap((value) => {
    if (!value) return [];
    try { return [normalizeE164(String(value), defaultCountryCode)]; }
    catch { return []; }
  });
  return [...new Set(normalized)];
}
