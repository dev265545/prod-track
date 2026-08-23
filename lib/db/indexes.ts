/**
 * ProdTrack Lite — index definitions, shared by every backend.
 *
 * Every backend executes these as real index lookups. IndexedDB has B-trees of
 * its own; the SQLite backends promote each key path to a VIRTUAL generated
 * column over the JSON blob and put a real SQLite index on it (see
 * {@link sqliteIndexSchemaStatements} and {@link planSqliteIndexQuery}).
 * Keeping the key paths in one place is what lets those implementations stay in
 * agreement: a query must return the same rows, in the same order, whichever
 * backend answers it. `matchesIndexRange` / `sortByIndexOrder` remain the
 * reference semantics, and the documented fallback path for the handful of
 * bound shapes SQL cannot express.
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

// ---------------------------------------------------------------------------
// SQLite: the same indexes, as real columns and real B-trees.
//
// Both SQLite backends (Tauri via rusqlite, and the sqlite-file web build via
// sql.js) store a row as `(id TEXT PRIMARY KEY, data TEXT)` where `data` is the
// JSON blob. Until now an index read on those backends meant `SELECT data FROM
// store`, `JSON.parse` every row, and filter in JS — so a factory with two
// years of history parsed ~150k audit rows to show one screenful.
//
// The fix is to give SQLite something to index. Each key-path field becomes a
// VIRTUAL generated column (`k_<field>`) over `data`, and each declared index
// becomes a real SQLite index over those columns plus `id`. Virtual generated
// columns store nothing and are computed on read, so adding one to a table with
// years of data is an instant catalogue change — no table rewrite, no backfill,
// and nothing that can lose a row. Building the index over it reads the store
// once, at upgrade time, and never again.
//
// The generated expression must reproduce `extractKey` EXACTLY:
//   * a row whose `data` is not valid JSON contributes NULL (and `getAll`
//     already skips such rows, so it must not appear in an index read either);
//   * a field that is missing, null, a number, a boolean or an object is NOT a
//     string, so `extractKey` returns undefined and IndexedDB omits the record
//     from the index entirely — `json_type(...) = 'text'` is that same test;
//   * only a JSON string produces a key.
// NULL is how "absent from the index" is spelled here, which is why every
// generated query carries an explicit `IS NOT NULL` guard per column: SQLite's
// row-value comparison short-circuits on a decisive earlier element, so
// `('e1', NULL) >= ('e0', '9999')` is TRUE and a row missing `date` would
// otherwise sneak into a compound range.
//
// One deliberate difference, documented rather than papered over: SQLite
// compares TEXT with the BINARY collation (UTF-8 byte order) while JavaScript's
// `<` compares UTF-16 code units. The two disagree only for supplementary-plane
// characters (U+10000 and above) ordered against U+E000..U+FFFF. Every key here
// is an ISO date, an ISO timestamp, a month string or a generated id, so the
// question does not arise in practice.
// ---------------------------------------------------------------------------

/** Field names are interpolated into SQL and into a JSON path; keep them plain. */
const SAFE_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertSafeField(field: string): string {
  if (!SAFE_FIELD.test(field)) {
    throw new Error(`Index key path is not a plain field name: ${field}`);
  }
  return field;
}

/** The generated column that carries `field`'s index key. */
export function indexColumnName(field: string): string {
  return `k_${assertSafeField(field)}`;
}

/** Key-path fields of one index, in key order. */
function keyPathFields(keyPath: string | string[]): string[] {
  return (typeof keyPath === "string" ? [keyPath] : keyPath).map(assertSafeField);
}

/** Every distinct field any index of `storeName` keys on, in declaration order. */
export function sqliteIndexFields(storeName: string): string[] {
  const seen: string[] = [];
  for (const spec of Object.values(INDEXES[storeName] ?? {})) {
    for (const field of keyPathFields(spec.keyPath)) {
      if (!seen.includes(field)) seen.push(field);
    }
  }
  return seen;
}

/**
 * `ALTER TABLE`/`CREATE INDEX` statements that bring `storeName` up to date.
 *
 * `existingColumns` is what `PRAGMA table_xinfo(<store>)` reports — `table_info`
 * will not do, because it hides virtual generated columns and would make this
 * try to add the same column on every single open.
 *
 * Idempotent by construction: a column already present yields no ALTER, and
 * every index is `IF NOT EXISTS`. Safe to run on every open, which is what
 * makes it correct for a restored backup or a database file copied in from
 * another install — neither of those goes through a version-numbered migration.
 */
export function sqliteIndexSchemaStatements(
  storeName: string,
  existingColumns: readonly string[]
): string[] {
  const statements: string[] = [];
  const have = new Set(existingColumns);
  for (const field of sqliteIndexFields(storeName)) {
    const column = indexColumnName(field);
    if (have.has(column)) continue;
    statements.push(
      `ALTER TABLE "${storeName}" ADD COLUMN "${column}" TEXT ` +
        `GENERATED ALWAYS AS (CASE WHEN json_valid(data) ` +
        `AND json_type(data, '$.${field}') = 'text' ` +
        `THEN json_extract(data, '$.${field}') END) VIRTUAL`
    );
  }
  for (const [indexName, spec] of Object.entries(INDEXES[storeName] ?? {})) {
    const cols = keyPathFields(spec.keyPath).map(indexColumnName);
    // `id` is part of the index, not just the sort: it makes the tie-break in
    // `sortByIndexOrder` an index-order read rather than a sort of the result.
    statements.push(
      `CREATE INDEX IF NOT EXISTS "idx_${storeName}_${indexName}" ` +
        `ON "${storeName}" (${[...cols, "id"].map((c) => `"${c}"`).join(", ")})`
    );
  }
  return statements;
}

/** The stores that declare an index, i.e. the ones with SQL columns to keep. */
export function sqliteIndexedStores(): string[] {
  return Object.keys(INDEXES);
}

/**
 * A translated index range read. `null` from {@link planSqliteIndexQuery} means
 * "this bound shape has no SQL equivalent — use the JS path".
 */
export interface SqliteIndexQueryPlan {
  /** `WHERE` body, already parameterised. */
  where: string;
  whereParams: string[];
  /** `ORDER BY` body honouring `direction`. */
  orderBy: string;
  /** `LIMIT`/`OFFSET` body, or `""`. Only meaningful for row reads. */
  limit: string;
  limitParams: number[];
}

function boundParts(
  keyPath: string | string[],
  key: IndexKey
): string[] | null {
  const fields = keyPathFields(keyPath);
  if (typeof keyPath === "string") {
    // An array bound against a string key path: in IndexedDB's type ordering
    // arrays sort after every string, which SQL has no notion of.
    return typeof key === "string" ? [key] : null;
  }
  if (!Array.isArray(key)) return null;
  // A shorter or longer bound is compared by length after the common prefix
  // (see `compareIndexKeys`); SQL row values require equal arity.
  if (key.length !== fields.length) return null;
  return key.every((p) => typeof p === "string") ? [...key] : null;
}

/**
 * Translate `index.getAll(IDBKeyRange.bound(lower, upper))` — inclusive at both
 * ends — into SQL over the generated columns.
 *
 * Returns `null` when the bounds cannot be expressed: a bound whose arity does
 * not match the compound key path, or one that mixes the string and array key
 * types. Those are cross-type comparisons in IndexedDB's key ordering and have
 * no SQL spelling; callers fall back to the scan, which is correct and, since
 * nothing in the app issues such a query, never hot. Making that explicit is the
 * point — a silently slow path is the bug this whole change exists to remove.
 */
export function planSqliteIndexQuery(
  storeName: string,
  indexName: string,
  lower: IndexKey,
  upper: IndexKey,
  options?: IndexReadOptions
): SqliteIndexQueryPlan | null {
  const keyPath = getIndexKeyPath(storeName, indexName);
  if (!keyPath) throw new Error(`Unknown index ${storeName}.${indexName}`);
  const lowerParts = boundParts(keyPath, lower);
  const upperParts = boundParts(keyPath, upper);
  if (!lowerParts || !upperParts) return null;

  const cols = keyPathFields(keyPath).map((f) => `"${indexColumnName(f)}"`);
  const tuple = `(${cols.join(", ")})`;
  const placeholders = `(${cols.map(() => "?").join(", ")})`;

  const clauses = cols.map((c) => `${c} IS NOT NULL`);
  clauses.push(`${tuple} >= ${placeholders}`, `${tuple} <= ${placeholders}`);
  const whereParams = [...lowerParts, ...upperParts];
  if (cols.length > 1) {
    // Redundant but implied by the row-value bounds, and it is what lets SQLite
    // seek on the leading column instead of walking the whole index.
    clauses.push(`${cols[0]} >= ?`, `${cols[0]} <= ?`);
    whereParams.push(lowerParts[0], upperParts[0]);
  }

  const desc = options?.direction === "prev";
  const orderCols = [...cols, `"id"`];
  const orderBy = orderCols
    .map((c) => (desc ? `${c} DESC` : c))
    .join(", ");

  // Mirrors `applyIndexReadOptions` exactly, including its clamping.
  const offset = Math.max(0, Math.floor(options?.offset ?? 0));
  const hasLimit = options?.limit !== undefined;
  const count = hasLimit ? Math.max(0, Math.floor(options!.limit!)) : -1;
  const limit =
    !hasLimit && offset === 0 ? "" : "LIMIT ? OFFSET ?";
  const limitParams = limit ? [count, offset] : [];

  return { where: clauses.join(" AND "), whereParams, orderBy, limit, limitParams };
}
