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

/**
 * Where a row on this screen came from.
 *
 *  - `"items"` — a real `items` row. Everything about it is editable here.
 *  - `"stock"` — a finished-goods stock item that has no `items` row yet.
 *    It was added on the Stock screen, which has no money box, so until it is
 *    priced it can be picked in Production and then refused at save time
 *    ("no rate") with nowhere to fix it. Listing it here is that nowhere.
 *    Pricing it creates the `items` row; from the next load it is an `"items"`
 *    row like any other, so a price still lives in exactly one place.
 */
export type ItemOrigin = "items" | "stock";

/** An item as this screen works with it, whatever shape the row was stored in. */
export interface ItemRow {
  id: string;
  name: string;
  /** Short code printed on the physical item (RT04). Absent for most items. */
  code?: string;
  /** Money for one piece. `null` means nothing has priced this item yet. */
  rate: number | null;
  /** Defaults to `"items"`; see {@link ItemOrigin}. */
  origin?: ItemOrigin;
  /** The stock row this stands for. Only set when `origin === "stock"`. */
  stockItemId?: string;
}

/** True for a row that has no `items` row behind it yet. */
export function isStockRow(row: ItemRow): boolean {
  return row.origin === "stock";
}

/**
 * Draw an unpriced stock item as a row on this screen.
 *
 * Its id is namespaced so it can never collide with a real `items` id — the
 * two lists have separate id spaces and both end up in one React list.
 *
 * `rate` is read exactly as an `items` rate is: a stock row can carry a rate
 * put there by the legacy migration or the spreadsheet import, and that seed
 * is what production would pay today, so it must be what this screen shows.
 * Editing the row writes the number to the `items` row, which then wins — see
 * `productionCatalog.resolveEntryRate`.
 */
export function stockItemRow(item: {
  id: string;
  name: string;
  code?: string;
  rate?: number;
}): ItemRow {
  return {
    id: `stock:${item.id}`,
    name: item.name || item.code || "",
    code: item.code?.trim() || undefined,
    rate: readStoredRate(item.rate),
    origin: "stock",
    stockItemId: item.id,
  };
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
      origin: "items",
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

export type RateProblem = "invalid" | "negative" | "zero" | "missing";

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

/**
 * The same check for a row that came from the stock list.
 *
 * Blank is allowed for an `items` row — it already exists, and the screen
 * nags until it is priced. A stock row has nothing behind it yet: saving it
 * blank would create an `items` row worth nothing, which production would
 * refuse all over again. So here, and only here, blank is an error.
 */
export function validateStockRate(input: string): RateValidation {
  const checked = validateRate(input);
  if (checked.ok && checked.rate === null) {
    return { ok: false, problem: "missing" };
  }
  return checked;
}
