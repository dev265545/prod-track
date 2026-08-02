/**
 * ProdTrack Lite - Browser-only SQLite .db export/import via sql.js
 * Same schema as Tauri: each store = table (id TEXT PRIMARY KEY, data TEXT).
 * Only use when not in Tauri (adapter uses IndexedDB).
 */

import { getAll, STORES } from "./adapter";
import type { ExportData } from "./exportImport";
import { DB_VERSION, METADATA_STORE } from "./schema";
import {
  APP_SETTINGS_ID,
  exportAppSettings,
  normalizeAppSettings,
} from "../services/appSettingsService";
import { getSqlJsModule, type SqlJsExecRow, type SqlJsModule } from "./sqlJsLoader";

const EXPORT_VERSION = 1;

async function getSqlJs(): Promise<SqlJsModule> {
  return getSqlJsModule();
}

/** Build a SQLite .db in memory from current DB and return as Uint8Array (for download). */
export async function exportDatabaseToSqlite(): Promise<Uint8Array> {
  const SQL = await getSqlJs();
  const db = new SQL.Database();

  for (const table of Object.values(STORES)) {
    db.run(
      `CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`
    );
    const rows = await getAll(table);
    for (const record of rows) {
      const id = (record?.id as string) ?? "";
      const data = JSON.stringify(record ?? {});
      db.run(
        `INSERT OR REPLACE INTO "${table}" (id, data) VALUES (:id, :data)`,
        { ":id": id, ":data": data }
      );
    }
  }

  // `_metadata` is not a business store, so the loop above skips it — but the
  // .db backup must still carry the schema version and the app configuration,
  // exactly like the JSON backup does. The `_app` row (admin password hash,
  // session nonce) is deliberately NOT written: credentials never leave the
  // install they were set on.
  db.run(
    `CREATE TABLE IF NOT EXISTS "${METADATA_STORE}" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`
  );
  const metaRows: Record<string, unknown>[] = [
    { id: "_schema", schemaVersion: DB_VERSION },
    (await exportAppSettings()) as unknown as Record<string, unknown>,
  ];
  for (const record of metaRows) {
    db.run(
      `INSERT OR REPLACE INTO "${METADATA_STORE}" (id, data) VALUES (:id, :data)`,
      { ":id": String(record.id), ":data": JSON.stringify(record) }
    );
  }

  const out = db.export();
  db.close();
  return out;
}

/** Read a SQLite .db file (ArrayBuffer) and return ExportData for importDatabase(). */
export async function importDatabaseFromSqliteBuffer(
  buffer: ArrayBuffer
): Promise<ExportData> {
  const SQL = await getSqlJs();
  const db = new SQL.Database(new Uint8Array(buffer));

  const stores: Record<string, Record<string, unknown>[]> = {};
  const storeNames = new Set<string>(Object.values(STORES));

  for (const table of Object.values(STORES)) {
    stores[table] = [];
    try {
      const result: SqlJsExecRow[] = db.exec(`SELECT id, data FROM "${table}"`);
      if (result.length > 0 && result[0].values) {
        const columns = result[0].columns;
        const idIdx = columns.indexOf("id");
        const dataIdx = columns.indexOf("data");
        if (idIdx >= 0 && dataIdx >= 0) {
          for (const row of result[0].values) {
            const id = row[idIdx];
            const dataStr = row[dataIdx];
            if (id != null && dataStr != null) {
              try {
                const record = JSON.parse(String(dataStr)) as Record<string, unknown>;
                if (record && typeof record === "object") {
                  record.id = typeof id === "string" ? id : String(id);
                  stores[table].push(record);
                }
              } catch {
                // skip invalid JSON row
              }
            }
          }
        }
      }
    } catch {
      // table may not exist in older exports
    }
  }

  // ensure all known stores exist in result
  for (const name of Array.from(storeNames)) {
    if (!stores[name]) stores[name] = [];
  }

  // Read schemaVersion from _metadata if present (Tauri exports include it)
  let schemaVersion = 0;
  try {
    const metaResult: SqlJsExecRow[] = db.exec(
      `SELECT data FROM _metadata WHERE id = '_schema'`
    );
    if (metaResult.length > 0 && metaResult[0].values?.[0]?.[0]) {
      const meta = JSON.parse(String(metaResult[0].values[0][0])) as {
        schemaVersion?: number;
      };
      if (typeof meta?.schemaVersion === "number") {
        schemaVersion = meta.schemaVersion;
      }
    }
  } catch {
    // _metadata may not exist in older .db files
  }

  // App configuration, if this .db was written by a build that carries it.
  // A file without the row leaves `appSettings` undefined, which importDatabase
  // reads as "keep this install's settings".
  let appSettings: ExportData["appSettings"];
  try {
    const settingsResult: SqlJsExecRow[] = db.exec(
      `SELECT data FROM "${METADATA_STORE}" WHERE id = '${APP_SETTINGS_ID}'`
    );
    const cell = settingsResult[0]?.values?.[0]?.[0];
    if (cell != null) {
      appSettings = normalizeAppSettings(JSON.parse(String(cell)));
    }
  } catch {
    // no `_metadata` table, or an unreadable row: settings simply don't travel
  }

  db.close();

  return {
    version: EXPORT_VERSION,
    schemaVersion: schemaVersion || DB_VERSION,
    exportedAt: new Date().toISOString(),
    stores,
    appSettings,
  };
}
