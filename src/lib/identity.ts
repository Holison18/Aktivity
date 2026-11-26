// Index number and name normalisation (SRS section 4, FR-02, FR-03).

/** Index numbers are stored trimmed and uppercase. Inner spaces are removed. */
export function normalizeIndex(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, "").toUpperCase();
}

/** The name in lowercase without extra spaces, used to spot a different person claiming a number. */
export function nameKey(raw: string): string {
  return String(raw ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Display form of a name: trimmed, single spaces. */
export function cleanName(raw: string): string {
  return String(raw ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export const DEFAULT_INDEX_PATTERN = "^\\d{7}$";

export function indexPattern(): RegExp {
  const src = process.env.INDEX_NUMBER_PATTERN || DEFAULT_INDEX_PATTERN;
  return new RegExp(src);
}

export function isValidIndex(normalized: string, pattern: RegExp = indexPattern()): boolean {
  return normalized.length > 0 && normalized.length <= 32 && pattern.test(normalized);
}

/** Class codes compare ignoring case and spaces, since students copy them from the board. */
export function sameClassCode(a: string, b: string): boolean {
  const n = (s: string) => String(s ?? "").replace(/\s+/g, "").toUpperCase();
  return n(a).length > 0 && n(a) === n(b);
}
