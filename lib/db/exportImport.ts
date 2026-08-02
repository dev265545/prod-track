/**
 * ProdTrack Lite - Export / Import database
 */

import { getAll, clear, put, STORES } from "./adapter";
import { DB_VERSION } from "./schema";
import { record as auditRecord } from "../services/auditService";
import {
  exportAppSettings,
  importAppSettings,
  type AppSettings,
} from "../services/appSettingsService";

const EXPORT_VERSION = 1;
export const AUTO_IMPORT_PATH = "data/prodtrack-export.json";

export interface ExportData {
  version: number;
  schemaVersion: number;
  exportedAt: string;
  stores: Record<string, Record<string, unknown>[]>;
  /**
   * The `app_settings` row from `_metadata`, carried as its own field because
   * the store loop below covers `STORES` only.
   *
   * Configuration travels with the backup on purpose: a restored workspace
   * that quietly lost, say, the production/stock connection would behave
   * differently from the one that was backed up, and nobody would know why.
   * Credentials are a different matter and are still never exported.
   */
  appSettings?: AppSettings;
}

export async function exportDatabase(): Promise<ExportData> {
  const stores: Record<string, Record<string, unknown>[]> = {};
  for (const name of Object.values(STORES)) {
    stores[name] = await getAll(name);
  }
  const rowCount = Object.values(stores).reduce((n, r) => n + r.length, 0);
  void auditRecord(
    "data.export",
    "database",
    null,
    `Exported ${rowCount} rows across ${Object.keys(stores).length} stores`,
  );
  return {
    version: EXPORT_VERSION,
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    stores,
    appSettings: await exportAppSettings(),
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
  const schemaVersion = typeof d.schemaVersion === "number" ? d.schemaVersion : 0;
  if (schemaVersion > DB_VERSION) {
    return {
      valid: false,
      error: "This file was created by a newer version. Please update ProdTrack.",
    };
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

async function writeRows(
  name: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  await clear(name);
  for (const record of rows) {
    if (record && typeof record === "object" && "id" in record) {
      await put(name, record);
    }
  }
}

/**
 * Replace the contents of every store present in `data`.
 *
 * The backends expose no cross-store transaction, so this snapshots the
 * affected stores first and restores them if any write throws: a failed import
 * leaves the database exactly as it was rather than half-wiped.
 *
 * The `_app` row in `_metadata` — admin password hash and session nonce — is
 * never touched: importing a backup must not reset or downgrade this install's
 * credentials. The `app_settings` row in the same store IS restored, by id, so
 * neither row can overwrite the other.
 */
export async function importDatabase(data: ExportData): Promise<void> {
  const { valid, error } = validateExportData(data);
  if (!valid) {
    throw new Error(error || "Invalid export format");
  }

  const targets = Object.values(STORES).filter((name) =>
    Array.isArray(data.stores[name]),
  );

  const snapshot = new Map<string, Record<string, unknown>[]>();
  for (const name of targets) {
    snapshot.set(name, await getAll(name));
  }

  try {
    for (const name of targets) {
      await writeRows(name, data.stores[name]);
    }
  } catch (e) {
    // Restore every target, not just the ones that completed: the store that
    // threw was already cleared before the failing write.
    for (const name of targets) {
      try {
        await writeRows(name, snapshot.get(name) ?? []);
      } catch {
        /* best effort: keep restoring the remaining stores */
      }
    }
    void auditRecord(
      "data.import",
      "database",
      null,
      `Import failed and was rolled back: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    throw e;
  }

  // After the stores, and by id: a settings write cannot disturb `_app`.
  // A backup made before settings existed has no field here and is skipped,
  // leaving this install's configuration alone.
  try {
    await importAppSettings(data.appSettings);
  } catch (e) {
    // Business data is already in. Losing one configuration row is not worth
    // rolling all of it back.
    console.error("[import] app settings could not be restored", e);
  }

  const rowCount = targets.reduce((n, name) => n + data.stores[name].length, 0);
  void auditRecord(
    "data.import",
    "database",
    null,
    `Imported ${rowCount} rows across ${targets.length} stores`,
    { exportedAt: data.exportedAt, schemaVersion: data.schemaVersion },
  );
}

/**
 * Wipe all business data. The `audit_log` store is deliberately excluded —
 * otherwise the record of the wipe dies with the data — and `_metadata` is
 * left alone so the admin password survives.
 */
export async function clearAllData(): Promise<void> {
  void auditRecord(
    "data.clear",
    "database",
    null,
    "All business data deleted (audit log and credentials preserved)",
  );
  for (const name of Object.values(STORES)) {
    if (name === STORES.AUDIT_LOG) continue;
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
