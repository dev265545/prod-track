/**
 * ProdTrack Lite - Browser-only SQLite .db export/import via sql.js
 * Same schema as Tauri: each store = table (id TEXT PRIMARY KEY, data TEXT).
 * Only use when not in Tauri (adapter uses IndexedDB).
 */

import { getAll, STORES } from "./adapter";
import type { ExportData } from "./exportImport";
import { DB_VERSION } from "./schema";

const EXPORT_VERSION = 1;

/** sql.js exec() returns an array of { columns, values } per statement. */
type SqlJsExecRow = { columns: string[]; values: unknown[][] };

type SqlJsModule = {
  Database: new (data?: Uint8Array) => {
    run(sql: string, params?: Record<string, unknown>): void;
    exec(sql: string): SqlJsExecRow[];
    export(): Uint8Array;
    close(): void;
  };
};

async function getSqlJs(): Promise<SqlJsModule> {
  if (typeof window === "undefined") {
    throw new Error("SQLite export/import is only available in the browser.");
  }
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
  });
  return SQL as unknown as SqlJsModule;
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

  db.close();

  return {
    version: EXPORT_VERSION,
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    stores,
  };
}
