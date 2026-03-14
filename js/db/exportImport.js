/**
 * ProdTrack Lite - Export / Import database
 * Export all stores to JSON; import from JSON (replaces current data).
 * Auto-import fetches from data/prodtrack-export.json if present (e.g. in dist/data).
 */

import { getAll, clear, put, STORES } from "./indexeddb.js";
import { DB_VERSION } from "./schema.js";

const EXPORT_VERSION = 1;
/** Path (relative to app origin) checked by Auto import. Place export file here to use it. */
export const AUTO_IMPORT_PATH = "data/prodtrack-export.json";

/**
 * Export all store data to a plain object (JSON-serializable).
 * @returns {Promise<{ version: number, schemaVersion: number, exportedAt: string, stores: Object }>}
 */
export async function exportDatabase() {
  const stores = {};
  for (const name of Object.values(STORES)) {
    stores[name] = await getAll(name);
  }
  return {
    version: EXPORT_VERSION,
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    stores,
  };
}

/**
 * Validate export payload shape.
 * @param {unknown} data
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateExportData(data) {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Invalid export: not an object" };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.version !== EXPORT_VERSION) {
    return { valid: false, error: "Unsupported export version" };
  }
  if (!d.stores || typeof d.stores !== "object") {
    return { valid: false, error: "Missing or invalid stores" };
  }
  const storeNames = new Set(Object.values(STORES));
  for (const name of Object.keys(d.stores)) {
    if (!storeNames.has(name)) continue;
    const arr = d.stores[name];
    if (!Array.isArray(arr)) {
      return { valid: false, error: `Store "${name}" is not an array` };
    }
    for (let i = 0; i < arr.length; i++) {
      const row = arr[i];
      if (!row || typeof row !== "object" || !("id" in row)) {
        return { valid: false, error: `Store "${name}" has invalid record at index ${i}` };
      }
    }
  }
  return { valid: true };
}

/**
 * Import export data into the database. Replaces all data in each store present in the export.
 * @param {{ version: number, stores: Record<string, Array<Record<string, unknown>> }} data - Valid export object
 */
export async function importDatabase(data) {
  const storeNames = Object.values(STORES);
  for (const name of storeNames) {
    const rows = data.stores[name];
    if (!Array.isArray(rows)) continue;
    await clear(name);
    for (const record of rows) {
      if (record && typeof record === "object" && "id" in record) {
        await put(name, record);
      }
    }
  }
}

/**
 * Permanently delete all data from every store. Use only after master password confirmation.
 */
export async function clearAllData() {
  for (const name of Object.values(STORES)) {
    await clear(name);
  }
}

/**
 * Get bundled export data if the build injected it (so Auto import works when opening index.html from disk).
 * @returns {{ success: true, data: object } | { success: false, error: string } | null} null = no bundled data
 */
export function getBundledData() {
  if (typeof window === "undefined") return null;
  const raw = window.__PRODTRACK_BUNDLED_DATA__;
  if (!raw || typeof raw !== "object") return null;
  const { valid, error } = validateExportData(raw);
  if (!valid) return { success: false, error: error || "Invalid export format." };
  return { success: true, data: raw };
}

/**
 * Try to get auto-import data: first from bundled data (injected at build from dist/data/prodtrack-export.json),
 * then from fetch when served over HTTP. Works when opening index.html from disk if the build bundled the file.
 * @returns {Promise<{ success: true, data: object } | { success: false, error: string }>}
 */
export async function fetchAutoImportData() {
  if (typeof window === "undefined" || !window.location) {
    return { success: false, error: "Not in a browser." };
  }
  // 1. Use data bundled into index.html at build time (works from file://)
  const bundled = getBundledData();
  if (bundled !== null) return bundled;

  // 2. From file:// with no bundled data – fetch is blocked (CORS); suggest Import from file
  if (window.location.protocol === "file:") {
    return {
      success: false,
      error: "No data bundled in this build. Place export in dist/data/prodtrack-export.json and run npm run build again, or use Import from file.",
    };
  }

  // 3. Over HTTP: fetch from data/prodtrack-export.json
  const url = new URL(AUTO_IMPORT_PATH, window.location.href);
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) {
      return { success: false, error: res.status === 404 ? "No data file found." : `HTTP ${res.status}` };
    }
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { success: false, error: "Invalid JSON in data file." };
    }
    const { valid, error } = validateExportData(data);
    if (!valid) {
      return { success: false, error: error || "Invalid export format." };
    }
    return { success: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isCorsOrNetwork = /cors|failed|network|fetch/i.test(msg);
    return {
      success: false,
      error: isCorsOrNetwork
        ? "Request failed (network/CORS). Use Import from file or run build with data in dist/data/."
        : msg,
    };
  }
}
