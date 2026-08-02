/**
 * ProdTrack Lite - Tauri/SQLite backend (invoke commands)
 * Only used when window.__TAURI__ is defined.
 * Data auto-syncs to SQLite on every change.
 */

import { invoke } from "@/lib/tauriBridge";
import { STORES } from "./schema";
import {
  getIndexKeyPath,
  matchesIndexRange,
  sortByIndexOrder,
  type IndexKey,
} from "./indexes";

export function openDB(): Promise<void> {
  return invoke("init_db");
}

export function getAll(storeName: string): Promise<Record<string, unknown>[]> {
  return invoke<Record<string, unknown>[]>("db_get_all", { store: storeName });
}

/**
 * Emulates `IDBIndex.getAll(IDBKeyRange.bound(...))`. Rows are JSON blobs in a
 * `(id, data)` table on this backend too, so this is a scan; it exists so the
 * services can speak one query language and get identical rows everywhere.
 */
export async function getByIndex(
  storeName: string,
  indexName: string,
  lower: IndexKey,
  upper: IndexKey
): Promise<Record<string, unknown>[]> {
  const keyPath = getIndexKeyPath(storeName, indexName);
  if (!keyPath) throw new Error(`Unknown index ${storeName}.${indexName}`);
  const rows = await getAll(storeName);
  return sortByIndexOrder(
    rows.filter((row) => matchesIndexRange(row, keyPath, lower, upper)),
    keyPath
  );
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
