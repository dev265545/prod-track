/**
 * The rules behind the Items screen — the one place an item's *rate* is set.
 *
 * Rate is the number pay is built from: `salaryService` multiplies a
 * production row's quantity by `items[itemId].rate`. Everything here therefore
 * treats "no rate" and "a rate of zero" as genuinely different facts:
 *
 *  - `rate: null` — nobody has said what this item is worth yet. The picker
 *    keys off exactly this (`item.rate == null` draws the "No rate" chip) and
 *    production refuses to save the row, so an unset rate is a to-do item, not
 *    a value.
 *  - `rate: 0` — someone typed zero. `productionCatalog.toRate` only accepts a
 *    rate greater than zero, so a stored 0 would come back through the picker
 *    as "No rate" anyway: the owner would see a rate on this screen and no
 *    rate on the entry screen. That mismatch is why `validateRate` rejects 0
 *    outright and tells the owner to leave the box empty instead — blank is
 *    the app's honest way of saying "not priced".
 *
 * Pure module: no DB, no React, so every rule below is unit-testable.
 */

/** An item as this screen works with it, whatever shape the row was stored in. */
export interface ItemRow {
  id: string;
  name: string;
  /** Short code printed on the physical item (RT04). Absent for most items. */
  code?: string;
  /** Money for one piece. `null` means nothing has priced this item yet. */
  rate: number | null;
}

/** Read a stored rate, keeping "unset" and "zero" apart. */
export function readStoredRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Normalise raw `items` rows into the shape this screen draws. */
export function normalizeItemRows(
  rows: readonly Record<string, unknown>[],
): ItemRow[] {
  const out: ItemRow[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : String(row.id ?? "");
    if (!id) continue;
    const code = typeof row.code === "string" ? row.code.trim() : "";
    out.push({
      id,
      name: typeof row.name === "string" ? row.name : String(row.name ?? ""),
      code: code || undefined,
      rate: readStoredRate(row.rate),
    });
  }
  return out;
}

/**
 * Unpriced items first, then by name.
 *
 * An item with no rate cannot be paid, and fixing that is the only reason this
 * screen is ever urgent — so those rows sit where the eye lands, instead of
 * being hidden somewhere down an alphabetical list.
 */
export function sortItemRows(rows: readonly ItemRow[]): ItemRow[] {
  return [...rows].sort((a, b) => {
    const aUnset = a.rate === null;
    const bUnset = b.rate === null;
    if (aUnset !== bUnset) return aUnset ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/** Fold case, spaces and punctuation so "Round Tin" matches "round-tin". */
function foldForSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/gi, "");
}

/** True when `query` appears in the item's name or its code. */
export function itemMatchesQuery(item: ItemRow, query: string): boolean {
  const needle = foldForSearch(query);
  if (!needle) return true;
  return (
    foldForSearch(item.name).includes(needle) ||
    foldForSearch(item.code ?? "").includes(needle)
  );
}

/** The rows to draw for `query`, in display order. */
export function filterItemRows(
  rows: readonly ItemRow[],
  query: string,
): ItemRow[] {
  return sortItemRows(rows).filter((row) => itemMatchesQuery(row, query));
}

/** How many items still have no rate, i.e. how much work is outstanding. */
export function countUnpricedItems(rows: readonly ItemRow[]): number {
  return rows.reduce((n, row) => (row.rate === null ? n + 1 : n), 0);
}

export type RateProblem = "invalid" | "negative" | "zero";

export type RateValidation =
  | { ok: true; rate: number | null }
  | { ok: false; problem: RateProblem };

/**
 * Turn what was typed into the rate box into a value to store.
 *
 * Blank is deliberately allowed and means `null` — an item can exist before
 * anyone knows what it pays, and the screen shouts about it until it does.
 * Zero is not allowed: see the module comment.
 */
export function validateRate(input: string): RateValidation {
  const text = input.trim();
  if (text === "" || text === ".") return { ok: true, rate: null };
  const n = Number(text);
  if (!Number.isFinite(n)) return { ok: false, problem: "invalid" };
  if (n < 0) return { ok: false, problem: "negative" };
  if (n === 0) return { ok: false, problem: "zero" };
  return { ok: true, rate: n };
}

/** What the rate box should show when an existing item is opened for editing. */
export function rateToInput(rate: number | null): string {
  return rate === null ? "" : String(rate);
}
