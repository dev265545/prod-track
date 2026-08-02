/**
 * Pure matching logic for the global inventory search.
 *
 * The operator knows the item's name, or the short code printed on the
 * physical stock (RT04, S41, B1) — not which of the six categories it lives
 * in. So the matching itself must never depend on category, and it must be
 * forgiving: surrounding whitespace ignored, case-insensitive, substring
 * anywhere in either field. Codes are typed, so a code that *starts with*
 * what was typed outranks one that merely contains it.
 *
 * Kept free of React, i18n and the database on purpose: this is the part most
 * likely to regress, so it is the part that is unit-tested.
 */

export interface SearchableInventoryItem {
  code: string;
  name: string;
}

/** Match strength. Higher wins; the exact numbers are an implementation detail. */
const SCORE_CODE_EXACT = 100;
const SCORE_CODE_PREFIX = 90;
const SCORE_NAME_EXACT = 80;
const SCORE_NAME_PREFIX = 70;
const SCORE_CODE_SUBSTRING = 60;
const SCORE_NAME_SUBSTRING = 50;

/** Trim and lower-case, so "  rt04 " and "RT04" are the same query. */
export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

/**
 * How well one item matches the query. Returns `null` when it does not match
 * at all, so callers can filter and rank in one pass.
 */
export function scoreInventoryMatch(
  item: SearchableInventoryItem,
  query: string,
): number | null {
  const q = normalizeSearchText(query);
  if (!q) return null;

  const code = normalizeSearchText(item.code);
  const name = normalizeSearchText(item.name);

  if (code && code === q) return SCORE_CODE_EXACT;
  if (code && code.startsWith(q)) return SCORE_CODE_PREFIX;
  if (name && name === q) return SCORE_NAME_EXACT;
  if (name && name.startsWith(q)) return SCORE_NAME_PREFIX;
  if (code && code.includes(q)) return SCORE_CODE_SUBSTRING;
  if (name && name.includes(q)) return SCORE_NAME_SUBSTRING;
  return null;
}

export interface SearchInventoryOptions {
  /** Cap the result list. Omit for "all matches". */
  limit?: number;
}

/**
 * All items matching `query`, best match first. An empty or whitespace-only
 * query returns no results — the caller shows a "start typing" prompt rather
 * than dumping every item in the factory.
 */
export function searchInventoryItems<T extends SearchableInventoryItem>(
  items: readonly T[],
  query: string,
  options: SearchInventoryOptions = {},
): T[] {
  const q = normalizeSearchText(query);
  if (!q) return [];

  const scored: Array<{ item: T; score: number; index: number }> = [];
  items.forEach((item, index) => {
    const score = scoreInventoryMatch(item, q);
    if (score !== null) scored.push({ item, score, index });
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const byName = normalizeSearchText(a.item.name).localeCompare(
      normalizeSearchText(b.item.name),
    );
    if (byName !== 0) return byName;
    return a.index - b.index;
  });

  const ordered = scored.map((entry) => entry.item);
  return options.limit != null ? ordered.slice(0, options.limit) : ordered;
}
