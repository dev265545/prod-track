/**
 * ProdTrack Lite — index definitions, shared by every backend.
 *
 * IndexedDB is the only backend that can execute these as real B-tree lookups.
 * The SQLite backends store rows as `id TEXT, data TEXT` JSON blobs, so they
 * emulate the same query with a scan + `matchesIndexRange`. Keeping the key
 * paths in one place is what lets those two implementations stay in agreement:
 * a query must return the same rows whichever backend answers it.
 */

import { STORES } from "./schema";

export type IndexSpec = { keyPath: string | string[]; unique?: boolean };
/** `indexName -> spec`, exactly as passed to `createIndex`. */
export type StoreIndexes = Record<string, IndexSpec>;

/**
 * Non-unique unless noted. Real databases already contain duplicate attendance
 * rows for the same `(employeeId, date)`; a unique index there would make the
 * IndexedDB upgrade transaction abort and lock the user out of their own data.
 * De-duplication is a read-time rule ("last row wins"), not a constraint.
 */
export const INDEXES: Record<string, StoreIndexes> = {
  [STORES.PRODUCTIONS]: {
    by_date: { keyPath: "date" },
    by_employee: { keyPath: "employeeId" },
    by_item: { keyPath: "itemId" },
    employee_date: { keyPath: ["employeeId", "date"] },
  },
  [STORES.ADVANCES]: {
    by_employee: { keyPath: "employeeId" },
    by_date: { keyPath: "date" },
    employee_date: { keyPath: ["employeeId", "date"] },
  },
  [STORES.ADVANCE_DEDUCTIONS]: {
    by_employee: { keyPath: "employeeId" },
    employee_period: { keyPath: ["employeeId", "periodFrom"], unique: true },
  },
  [STORES.SALARY_RECORDS]: {
    by_employee: { keyPath: "employeeId" },
    by_month: { keyPath: "month" },
  },
  [STORES.ATTENDANCE]: {
    by_date: { keyPath: "date" },
    employee_date: { keyPath: ["employeeId", "date"] },
  },
  [STORES.INVENTORY_MOVEMENTS]: {
    by_item: { keyPath: "itemId" },
  },
  /**
   * The audit log is append-only and never queried by anything but time: the
   * viewer wants "the newest page" or "this month", and the retention sweep
   * wants "everything before this instant". One index on the ISO timestamp
   * answers all three, and because ISO-8601 UTC sorts lexicographically it is
   * also chronological order for free.
   */
  [STORES.AUDIT_LOG]: {
    by_timestamp: { keyPath: "timestamp" },
  },
};

/** An inclusive bound key, mirroring what `IDBKeyRange.bound` accepts here. */
export type IndexKey = string | string[];

function extractKey(
  row: Record<string, unknown>,
  keyPath: string | string[]
): IndexKey | undefined {
  if (typeof keyPath === "string") {
    const v = row[keyPath];
    return typeof v === "string" ? v : undefined;
  }
  const parts: string[] = [];
  for (const p of keyPath) {
    const v = row[p];
    // IndexedDB skips a record entirely when any part of a compound key is
    // absent. Emulating that is what keeps the backends returning the same rows.
    if (typeof v !== "string") return undefined;
    parts.push(v);
  }
  return parts;
}

/** IndexedDB key ordering, restricted to the string / string[] keys we use. */
export function compareIndexKeys(a: IndexKey, b: IndexKey): number {
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  // In IndexedDB's type ordering, arrays sort after all other key types.
  if (aArr !== bArr) return aArr ? 1 : -1;
  if (!aArr || !bArr) {
    const x = a as string;
    const y = b as string;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a.length - b.length;
}

/**
 * True when `row` would be returned by
 * `index.getAll(IDBKeyRange.bound(lower, upper))`.
 */
export function matchesIndexRange(
  row: Record<string, unknown>,
  keyPath: string | string[],
  lower: IndexKey,
  upper: IndexKey
): boolean {
  const key = extractKey(row, keyPath);
  if (key === undefined) return false;
  return compareIndexKeys(key, lower) >= 0 && compareIndexKeys(key, upper) <= 0;
}

/**
 * How much of a range to read, and from which end.
 *
 * `getByIndex` without options reads the whole range ascending, which is what
 * every date-keyed query wants. The audit log is the exception: it is read
 * newest-first, one screenful at a time, out of a store that grows without
 * bound. Expressing that here rather than slicing in the caller is the whole
 * point — a slice still deserialises every row first.
 */
export interface IndexReadOptions {
  /** "next" = ascending index order (default); "prev" = descending. */
  direction?: "next" | "prev";
  /** Stop after this many rows. Omitted = no limit. */
  limit?: number;
  /** Skip this many matching rows first, in `direction` order. */
  offset?: number;
}

/**
 * Apply {@link IndexReadOptions} to a fully-materialised ascending result.
 *
 * Only for the SQLite backends, which hold rows as JSON blobs and have no
 * index to seek with: they must scan regardless, so windowing afterwards costs
 * them nothing extra and keeps every backend returning the same rows in the
 * same order. IndexedDB must NOT go through here — it uses a real cursor, and
 * reading the range first is exactly the cost this exists to avoid.
 */
export function applyIndexReadOptions(
  ascending: Record<string, unknown>[],
  options?: IndexReadOptions
): Record<string, unknown>[] {
  if (!options) return ascending;
  const ordered =
    options.direction === "prev" ? [...ascending].reverse() : ascending;
  const start = Math.max(0, Math.floor(options.offset ?? 0));
  const end =
    options.limit === undefined
      ? ordered.length
      : start + Math.max(0, Math.floor(options.limit));
  return start === 0 && end >= ordered.length
    ? ordered
    : ordered.slice(start, end);
}

export function getIndexKeyPath(
  storeName: string,
  indexName: string
): string | string[] | null {
  return INDEXES[storeName]?.[indexName]?.keyPath ?? null;
}

/**
 * Backend-independent result order: ascending by index key, ties broken by
 * primary key. This is exactly what `IDBIndex.getAll` returns, and the SQLite
 * backends sort into it so a query answers the same everywhere.
 *
 * The tie-break is the part that matters for payroll. Duplicate attendance rows
 * for one `(employeeId, date)` share an index key, so they come back in
 * primary-key order — the same order a full store scan gave them. That keeps
 * `attendanceService`'s "last match wins" and `salarySheetService`'s
 * last-write-wins `Map` fold resolving to the *same* row, which is what stops a
 * corrected day displaying one value and being paid another.
 *
 * Sorting the whole result by primary key instead would have been wrong: ids
 * carry a millisecond timestamp plus a random suffix, so two rows written in
 * the same millisecond order arbitrarily. Index order is both meaningful
 * (chronological, for the date-keyed indexes) and stable.
 */
export function sortByIndexOrder(
  rows: Record<string, unknown>[],
  keyPath: string | string[]
): Record<string, unknown>[] {
  return rows.sort((a, b) => {
    const ka = extractKey(a, keyPath);
    const kb = extractKey(b, keyPath);
    const byKey =
      ka === undefined || kb === undefined ? 0 : compareIndexKeys(ka, kb);
    if (byKey !== 0) return byKey;
    const x = a.id as string;
    const y = b.id as string;
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
