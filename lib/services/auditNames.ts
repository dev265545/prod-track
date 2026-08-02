/**
 * Names for the audit log.
 *
 * The log only works if an owner can read it: "Rakesh was marked present on
 * 3 August" is useful, "Employee emp_1a2b was marked present" is not. Services
 * hold ids, so every summary needs a display name from somewhere.
 *
 * These helpers resolve one id to a name with a single extra read, so the call
 * site does not have to carry the name down through its signature and no page
 * can forget to pass it. When the row is gone or unnamed they return a neutral
 * phrase ("an employee") rather than the id — a vague sentence still reads as
 * a sentence, a raw id never does.
 *
 * Deliberately never throws: a name lookup failing must not break the mutation
 * being audited.
 */

import { get, STORES } from "@/lib/db/adapter";

async function nameFrom(
  store: string,
  id: string | null | undefined,
  fallback: string,
  fields: readonly string[] = ["name"],
): Promise<string> {
  if (!id) return fallback;
  try {
    const row = await get(store, id);
    if (!row) return fallback;
    for (const field of fields) {
      const value = row[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/** Display name of an employee, or "an employee". */
export function employeeName(id: string | null | undefined): Promise<string> {
  return nameFrom(STORES.EMPLOYEES, id, "an employee");
}

/** Display name of a production item (the pay catalogue), or "an item". */
export function itemName(id: string | null | undefined): Promise<string> {
  return nameFrom(STORES.ITEMS, id, "an item");
}

/** Display name of a stock item, preferring its name over its code. */
export function inventoryItemName(
  id: string | null | undefined,
): Promise<string> {
  return nameFrom(STORES.INVENTORY_ITEMS, id, "a stock item", ["name", "code"]);
}

/**
 * Name held on a row we already have in hand, for summaries written after the
 * row is deleted (when a lookup would find nothing).
 */
export function nameOnRow(
  row: Record<string, unknown> | null | undefined,
  fallback: string,
): string {
  const value = row?.name ?? row?.empName ?? row?.code;
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** "1 entry" / "4 entries" — keeps counts out of awkward plural-less prose. */
export function plural(count: number, singular: string, pluralWord: string): string {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}
