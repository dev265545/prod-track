/**
 * Ordering rules for the searchable item picker.
 *
 * The ranking itself is NOT re-implemented here. `inventorySearch` already
 * decides that a code that *starts with* what was typed beats a name that
 * merely contains it, and it has the tests to prove it. This module is a thin
 * adapter over it, for one reason: the production catalogue's `code` is
 * optional (`code?: string`) while `SearchableInventoryItem.code` is required,
 * so the two shapes do not line up. Widening `inventorySearch` would mean
 * editing a file the global inventory search depends on; mapping a missing
 * code to `""` at the boundary costs one line and changes nothing for its
 * existing callers. `scoreInventoryMatch` already treats an empty code as
 * "no code", so the behaviour is exactly right.
 *
 * The second rule lives here because inventory search has no use for it: with
 * an EMPTY search box the picker shows the whole list, but the items the
 * operator used most recently float to the top. Daily entry is the same
 * handful of items over and over, so this is what removes the search step
 * entirely on the common path.
 */

import { searchInventoryItems } from "./inventorySearch";

/** The least a picker row needs to be shown, ranked and validated. */
export interface PickerSearchItem {
  id: string;
  name: string;
  /** Short code printed on the physical stock (RT04, S41). May be absent. */
  code?: string;
  /** Pay rate; `null` means nothing prices this item and it cannot be saved. */
  rate?: number | null;
}

/**
 * Items matching `query`, best match first, using the shared inventory
 * ranking. An empty query returns nothing — callers use `orderPickerItems`
 * instead, which has a real answer for that case.
 */
export function rankPickerItems<T extends PickerSearchItem>(
  items: readonly T[],
  query: string,
): T[] {
  // Carry the original object alongside the adapted shape so the caller gets
  // its own items back, not copies missing their extra fields.
  const adapted = items.map((item) => ({
    code: item.code ?? "",
    name: item.name,
    original: item,
  }));
  return searchInventoryItems(adapted, query).map((entry) => entry.original);
}

/**
 * The list to draw, in the order to draw it.
 *
 * With a query: ranked matches only. Without one: every item, with the ids in
 * `recentIds` first, in the order given (most recent first), and the rest
 * following in the order the caller supplied. Unknown or duplicate ids in
 * `recentIds` are ignored rather than producing a phantom or repeated row.
 */
export function orderPickerItems<T extends PickerSearchItem>(
  items: readonly T[],
  query: string,
  recentIds: readonly string[] = [],
): T[] {
  if (query.trim()) return rankPickerItems(items, query);

  const byId = new Map<string, T>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }

  const recent: T[] = [];
  const taken = new Set<string>();
  for (const id of recentIds) {
    const item = byId.get(id);
    if (item && !taken.has(id)) {
      taken.add(id);
      recent.push(item);
    }
  }

  return [...recent, ...items.filter((item) => !taken.has(item.id))];
}

/** How many of the leading rows came from `recentIds` — used to draw a heading. */
export function countRecentShown(
  items: readonly PickerSearchItem[],
  recentIds: readonly string[] = [],
): number {
  const ids = new Set(items.map((item) => item.id));
  const seen = new Set<string>();
  for (const id of recentIds) {
    if (ids.has(id)) seen.add(id);
  }
  return seen.size;
}
