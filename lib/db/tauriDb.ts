/**
 * ProdTrack Lite - Tauri/SQLite backend (invoke commands)
 * Only used when window.__TAURI__ is defined.
 * Data auto-syncs to SQLite on every change.
 */

import { invoke } from "@tauri-apps/api/core";
import { STORES } from "./schema";

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

export function openDB(): Promise<void> {
  return invoke("init_db");
}

export function getAll(storeName: string): Promise<Record<string, unknown>[]> {
  return invoke<Record<string, unknown>[]>("db_get_all", { store: storeName });
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
