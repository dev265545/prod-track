/**
 * ProdTrack Lite - Tauri/SQLite backend (invoke commands)
 * Only used when window.__TAURI__ is defined.
 * Data auto-syncs to SQLite on every change.
 */

import { invoke } from "@/lib/tauriBridge";
import { STORES } from "./schema";
import {
  applyIndexReadOptions,
  getIndexKeyPath,
  matchesIndexRange,
  sortByIndexOrder,
  type IndexKey,
  type IndexReadOptions,
} from "./indexes";

/**
 * Bounds Rust can execute: a flat list of strings whose length matches the key
 * path. Anything else (an array bound against a single-field key path, or a
 * compound bound of the wrong arity) is a cross-type comparison in IndexedDB's
 * key ordering with no SQL spelling, and stays on the scan below. Kept in step
 * with `planSqliteIndexQuery`, which makes the same judgement for sql.js.
 */
function sqlBounds(
  keyPath: string | string[],
  key: IndexKey
): string[] | null {
  if (typeof keyPath === "string") {
    return typeof key === "string" ? [key] : null;
  }
  if (!Array.isArray(key) || key.length !== keyPath.length) return null;
  return key.every((p) => typeof p === "string") ? [...key] : null;
}

/** The scan this backend used for every index read before `db_get_by_index` existed. */
async function scanByIndex(
  storeName: string,
  keyPath: string | string[],
  lower: IndexKey,
  upper: IndexKey
): Promise<Record<string, unknown>[]> {
  const rows = await getAll(storeName);
  return sortByIndexOrder(
    rows.filter((row) => matchesIndexRange(row, keyPath, lower, upper)),
    keyPath
  );
}

export function openDB(): Promise<void> {
  return invoke("init_db");
}

export function getAll(storeName: string): Promise<Record<string, unknown>[]> {
  return invoke<Record<string, unknown>[]>("db_get_all", { store: storeName });
}

/**
 * `IDBIndex.getAll(IDBKeyRange.bound(...))`, executed as a real SQLite index
 * lookup in `src-tauri/src/db.rs`.
 *
 * Rust owns the SQL here rather than receiving it, so the store, the index and
 * the bound arity are all validated against its own copy of `indexes.ts` before
 * anything is interpolated. It returns only the matching rows, already in
 * `sortByIndexOrder`'s order and already windowed — so a screenful of the audit
 * log costs a screenful of JSON, not the whole store.
 */
export async function getByIndex(
  storeName: string,
  indexName: string,
  lower: IndexKey,
  upper: IndexKey,
  options?: IndexReadOptions
): Promise<Record<string, unknown>[]> {
  const keyPath = getIndexKeyPath(storeName, indexName);
  if (!keyPath) throw new Error(`Unknown index ${storeName}.${indexName}`);
  const lo = sqlBounds(keyPath, lower);
  const hi = sqlBounds(keyPath, upper);
  if (!lo || !hi) {
    return applyIndexReadOptions(
      await scanByIndex(storeName, keyPath, lower, upper),
      options
    );
  }
  return invoke<Record<string, unknown>[]>("db_get_by_index", {
    store: storeName,
    index: indexName,
    lower: lo,
    upper: hi,
    descending: options?.direction === "prev",
    // Mirrors `applyIndexReadOptions`' clamping; -1 is SQLite's "no limit".
    limit:
      options?.limit === undefined ? -1 : Math.max(0, Math.floor(options.limit)),
    offset: Math.max(0, Math.floor(options?.offset ?? 0)),
  });
}

/** Rows in range, counted by `SELECT COUNT(*)` over the same index. */
export async function countByIndex(
  storeName: string,
  indexName: string,
  lower: IndexKey,
  upper: IndexKey
): Promise<number> {
  const keyPath = getIndexKeyPath(storeName, indexName);
  if (!keyPath) throw new Error(`Unknown index ${storeName}.${indexName}`);
  const lo = sqlBounds(keyPath, lower);
  const hi = sqlBounds(keyPath, upper);
  if (!lo || !hi) {
    return (await scanByIndex(storeName, keyPath, lower, upper)).length;
  }
  return invoke<number>("db_count_by_index", {
    store: storeName,
    index: indexName,
    lower: lo,
    upper: hi,
  });
}

export function get(
  storeName: string,
  id: string
): Promise<Record<string, unknown> | null> {
  return invoke<Record<string, unknown> | null>("db_get", {
    store: storeName,
    id,
  });
}

export function put(
  storeName: string,
  record: Record<string, unknown>
): Promise<void> {
  return invoke("db_put", { store: storeName, record });
}

export function remove(storeName: string, id: string): Promise<void> {
  return invoke("db_remove", { store: storeName, id });
}

export function clear(storeName: string): Promise<void> {
  return invoke("db_clear", { store: storeName });
}

export async function deleteWhere(
  storeName: string,
  predicate: (row: Record<string, unknown>) => boolean
): Promise<number> {
  const rows = await getAll(storeName);
  const toDelete = rows.filter(predicate);
  for (const r of toDelete) {
    await remove(storeName, r.id as string);
  }
  return toDelete.length;
}

/** Export SQLite DB to a .db file (Tauri only). Uses Rust dialog, no npm dialog package needed. */
export async function exportDbToFile(): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await invoke("db_export_with_dialog");
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("cancelled")) return { success: false, error: "Save cancelled." };
    return { success: false, error: msg };
  }
}

/** Import SQLite DB from a .db file (Tauri only). Uses Rust dialog, re-opens DB after import. */
export async function importDbFromFile(): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await invoke("db_import_with_dialog");
    await openDB();
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("cancelled")) return { success: false, error: "Import cancelled." };
    return { success: false, error: msg };
  }
}

/** Path to the SQLite database file (Tauri only). */
export async function getDbPath(): Promise<string> {
  return invoke<string>("db_path");
}

export { STORES };
