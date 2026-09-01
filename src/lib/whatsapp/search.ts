export function normalizeSearchValue(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildSearchTokens(values: unknown[]): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    const normalized = normalizeSearchValue(value);
    if (!normalized) continue;
    tokens.add(normalized.slice(0, 80));
    for (const word of normalized.split(/[^a-z0-9+]+/).filter(Boolean)) {
      for (let length = 2; length <= Math.min(word.length, 20); length += 1) tokens.add(word.slice(0, length));
    }
    const digits = normalized.replace(/\D/g, "");
    if (digits) {
      tokens.add(digits);
      if (digits.length > 6) tokens.add(digits.slice(-9));
    }
  }
  return [...tokens].slice(0, 120);
}

export function searchToken(value: string): string {
  const normalized = normalizeSearchValue(value).slice(0, 80);
  return normalized.replace(/\D/g, "").length >= 7 ? normalized.replace(/\D/g, "") : normalized;
}
