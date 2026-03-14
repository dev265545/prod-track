/**
 * ProdTrack Lite - Export / Import database
 */

import { getAll, clear, put, STORES } from "./adapter";
import { DB_VERSION } from "./schema";

const EXPORT_VERSION = 1;
export const AUTO_IMPORT_PATH = "data/prodtrack-export.json";

export interface ExportData {
  version: number;
  schemaVersion: number;
  exportedAt: string;
  stores: Record<string, Record<string, unknown>[]>;
}

export async function exportDatabase(): Promise<ExportData> {
  const stores: Record<string, Record<string, unknown>[]> = {};
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

export function validateExportData(data: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Invalid export: not an object" };
  }
  const d = data as Record<string, unknown>;
  if (d.version !== EXPORT_VERSION) {
    return { valid: false, error: "Unsupported export version" };
  }
  if (!d.stores || typeof d.stores !== "object") {
    return { valid: false, error: "Missing or invalid stores" };
  }
  const storeNames = new Set<string>(Object.values(STORES));
  const storesObj = d.stores as Record<string, unknown>;
  for (const name of Object.keys(storesObj)) {
    if (!storeNames.has(name)) continue;
    const arr = storesObj[name];
    if (!Array.isArray(arr)) {
      return { valid: false, error: `Store "${name}" is not an array` };
    }
    for (let i = 0; i < arr.length; i++) {
      const row = arr[i];
      if (!row || typeof row !== "object" || !("id" in row)) {
        return {
          valid: false,
          error: `Store "${name}" has invalid record at index ${i}`,
        };
      }
    }
  }
  return { valid: true };
}

export async function importDatabase(data: ExportData): Promise<void> {
  const storeNames = Object.values(STORES);
  for (const name of storeNames) {
    const rows = data.stores[name];
    if (!Array.isArray(rows)) continue;
    await clear(name);
    for (const record of rows) {
      if (record && typeof record === "object" && "id" in record) {
        await put(name, record as Record<string, unknown>);
      }
    }
  }
}

export async function clearAllData(): Promise<void> {
  for (const name of Object.values(STORES)) {
    await clear(name);
  }
}

declare global {
  interface Window {
    __PRODTRACK_BUNDLED_DATA__?: unknown;
  }
}

export function getBundledData():
  | { success: true; data: ExportData }
  | { success: false; error: string }
  | null {
  if (typeof window === "undefined") return null;
  const raw = window.__PRODTRACK_BUNDLED_DATA__;
  if (!raw || typeof raw !== "object") return null;
  const { valid, error } = validateExportData(raw);
  if (!valid) return { success: false, error: error || "Invalid export format." };
  return { success: true, data: raw as ExportData };
}

export async function fetchAutoImportData(): Promise<
  { success: true; data: ExportData } | { success: false; error: string }
> {
  if (typeof window === "undefined" || !window.location) {
    return { success: false, error: "Not in a browser." };
  }
  const bundled = getBundledData();
  if (bundled !== null) return bundled;

  if (window.location.protocol === "file:") {
    return {
      success: false,
      error:
        "No data bundled. Use Import from file or place export in data/prodtrack-export.json and rebuild.",
    };
  }

  const url = new URL(AUTO_IMPORT_PATH, window.location.href);
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) {
      return {
        success: false,
        error: res.status === 404 ? "No data file found." : `HTTP ${res.status}`,
      };
    }
    const raw = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return { success: false, error: "Invalid JSON in data file." };
    }
    const { valid, error } = validateExportData(data);
    if (!valid) {
      return { success: false, error: error || "Invalid export format." };
    }
    return { success: true, data: data as ExportData };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isCorsOrNetwork = /cors|failed|network|fetch/i.test(msg);
    return {
      success: false,
      error: isCorsOrNetwork
        ? "Request failed. Use Import from file."
        : msg,
    };
  }
}
