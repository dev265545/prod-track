/**
 * ProdTrack Lite - DB adapter (runtime: IndexedDB on web, sqlite-file on USB web build, Tauri/SQLite on desktop)
 */

import * as idb from "./indexeddb";
import { STORES } from "./schema";

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as Window & { __TAURI__?: unknown }).__TAURI__;
}

export function isSqliteFileMode(): boolean {
  return process.env.NEXT_PUBLIC_DB_BACKEND === "sqlite-file";
}

function isTauriEnv(): boolean {
  return isTauri();
}

async function getBackend() {
  if (isTauriEnv()) {
    const tauri = await import("./tauriDb");
    return tauri;
  }
  if (isSqliteFileMode()) {
    const sqlFile = await import("./sqliteFileAdapter");
    return sqlFile;
  }
  return idb;
}

export async function openDB(): Promise<unknown> {
  const backend = await getBackend();
  return backend.openDB();
}

export async function getAll(
  storeName: string
): Promise<Record<string, unknown>[]> {
  const backend = await getBackend();
  return backend.getAll(storeName);
}

export async function get(
  storeName: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const backend = await getBackend();
  return backend.get(storeName, id);
}

export async function put(
  storeName: string,
  record: Record<string, unknown>
): Promise<void> {
  const backend = await getBackend();
  return backend.put(storeName, record);
}

export async function remove(storeName: string, id: string): Promise<void> {
  const backend = await getBackend();
  return backend.remove(storeName, id);
}

export async function deleteWhere(
  storeName: string,
  predicate: (row: Record<string, unknown>) => boolean
): Promise<number> {
  const backend = await getBackend();
  return backend.deleteWhere(storeName, predicate);
}

export async function clear(storeName: string): Promise<void> {
  const backend = await getBackend();
  return backend.clear(storeName);
}

export { STORES };
export { DB_NAME, DB_VERSION } from "./schema";
