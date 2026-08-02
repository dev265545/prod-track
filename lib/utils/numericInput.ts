/**
 * Digits-only filtering for the shared `NumberInput`.
 *
 * `<input type="number">` was the wrong primitive for this app: browsers
 * deliberately accept `e`, `E`, `+` and `-` (scientific notation), and when the
 * content is invalid `e.target.value` reads back as `""` — the operator sees
 * characters on screen while React state holds an empty string, so a quantity
 * silently becomes blank. Autofill can inject anything at all.
 *
 * So we keep a text input and filter here instead. The rule is deliberately
 * *forgiving of work in progress*: we never throw the entry away, we only drop
 * the characters that can never be part of a number. "12." and "007" survive,
 * because both are things a person is midway through typing.
 */

export interface SanitizeNumericOptions {
  /** Allow a single decimal separator. Integer-only fields leave this off. */
  decimal?: boolean;
}

/**
 * Strip everything that cannot appear in a plain positive number.
 *
 * - Rejects letters (including `e`/`E`), signs, spaces and punctuation.
 * - Keeps at most one decimal point, and only when `decimal` is set.
 * - Returns `""` unchanged: clearing a field has to stay possible.
 * - Preserves leading zeros and a trailing "." so the caret never jumps.
 *
 * A comma is treated as a decimal separator (some keypads emit one) rather
 * than dropped, so "1,5" becomes "1.5" instead of a hundred-fold "15".
 */
export function sanitizeNumericInput(
  raw: string,
  options: SanitizeNumericOptions = {},
): string {
  if (raw === "") return "";
  const { decimal = false } = options;
  let out = "";
  let seenPoint = false;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if (decimal && (ch === "." || ch === ",") && !seenPoint) {
      seenPoint = true;
      out += ".";
    }
    // Everything else — letters, e/E, +, -, spaces, a second point — is dropped.
  }
  return out;
}

/**
 * Parse a sanitized field into a number, or `null` when there is nothing usable
 * yet ("", "." or "12." are all mid-entry, not values).
 */
export function parseNumericInput(value: string): number | null {
  if (value === "" || value === ".") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Filter a value *arriving* at the field, not just one being typed.
 *
 * Browser autofill, password managers and programmatic writes can all put text
 * into a field without going through the keystroke path — a client screenshot
 * showed Chrome filling the machine's username, `dev`, into "How many". So the
 * incoming value gets the same treatment as a keystroke.
 *
 * Numbers are passed through untouched: they cannot carry letters, and running
 * an integer-only filter over `1.2` would silently turn it into `12`.
 */
export function resolveIncomingNumericValue(
  value: string | number | readonly string[] | undefined | null,
  options: SanitizeNumericOptions = {},
): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (Array.isArray(value)) return sanitizeNumericInput(String(value[0] ?? ""), options);
  return sanitizeNumericInput(String(value), options);
}

/**
 * Clamp a finished entry into the caller's `min`/`max` range.
 *
 * `type="text"` no longer enforces `min`/`max` for free, so fields that relied
 * on the browser get this applied on blur instead. Mid-entry values (`null`)
 * are left alone — clamping while someone types is what made the old shift-hours
 * box snap to 8 the moment it was cleared.
 */
export function clampNumericInput(
  value: string,
  bounds: { min?: number; max?: number },
): string {
  const n = parseNumericInput(value);
  if (n === null) return value;
  const { min, max } = bounds;
  let next = n;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return next === n ? value : String(next);
}

/**
 * Read a text field back as a number at submit time, applying the bounds the
 * browser used to enforce through `min`/`max`.
 *
 * `fallback` covers the empty and mid-entry cases, so an operator who clears a
 * box and submits gets the sensible default rather than 0 or NaN.
 */
export function readNumericInput(
  value: string,
  fallback: number,
  bounds: { min?: number; max?: number } = {},
): number {
  const n = parseNumericInput(value);
  if (n === null) return fallback;
  const { min, max } = bounds;
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}
