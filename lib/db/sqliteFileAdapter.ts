/**
 * ProdTrack Lite — Live SQLite backed by a user-chosen file (File System Access API).
 * Same table layout as Tauri / sqliteBrowser (id + data JSON per store).
 */

import { getSqlJsModule, type SqlJsDatabase } from "./sqlJsLoader";
import { DB_VERSION, METADATA_STORE, STORES } from "./schema";
import {
  applyIndexReadOptions,
  getIndexKeyPath,
  matchesIndexRange,
  planSqliteIndexQuery,
  sortByIndexOrder,
  sqliteIndexedStores,
  sqliteIndexSchemaStatements,
  type IndexKey,
  type IndexReadOptions,
} from "./indexes";
import {
  buildSchemaMetadataPayload,
  parseSchemaMetadataJson,
  planSchemaMigration,
} from "./schemaMigration";
import {
  clearStoredMainSqliteHandle,
  getStoredMainSqliteHandle,
  saveMainSqliteHandle,
  type StoredSqliteFileInfo,
} from "./sqliteFileHandleStore";

export const SQLITE_FILE_ERROR = {
  NO_FILE: "NO_SQLITE_FILE",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  READ_FAILED: "READ_FAILED",
  NOT_SUPPORTED: "FILE_SYSTEM_API_UNSUPPORTED",
} as const;

const FLUSH_MS = 400;
const SAFETY_FLUSH_MS = 30_000;

/** Satisfies FileSystemWritableFileStream (strict ArrayBuffer typing vs sql.js export). */
function toWriteChunk(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(bytes.byteLength);
  next.set(bytes);
  return next as Uint8Array<ArrayBuffer>;
}

let db: SqlJsDatabase | null = null;
let activeHandle: FileSystemFileHandle | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;
let flushChain: Promise<void> = Promise.resolve();

function filePickerTypes(): {
  description: string;
  accept: Record<string, string[]>;
}[] {
  return [
    {
      description: "SQLite database",
      accept: {
        "application/x-sqlite3": [".db", ".sqlite", ".sqlite3"],
      },
    },
  ];
}

export function isFileSystemAccessSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.showOpenFilePicker === "function";
}

async function ensureReadWritePermission(
  handle: FileSystemFileHandle
): Promise<void> {
  const opts = { mode: "readwrite" as const };
  const q = await handle.queryPermission(opts);
  if (q === "granted") return;
  const r = await handle.requestPermission(opts);
  if (r === "granted") return;
  const err = new Error(SQLITE_FILE_ERROR.PERMISSION_DENIED);
  (err as Error & { code?: string }).code = SQLITE_FILE_ERROR.PERMISSION_DENIED;
  throw err;
}

function assertDb(): SqlJsDatabase {
  if (!db) throw new Error("Database not open.");
  return db;
}

function readSchemaVersionFromDb(d: SqlJsDatabase): number {
  try {
    const metaCheck = d.exec(
      `SELECT data FROM "${METADATA_STORE}" WHERE id = '_schema'`,
    );
    if (!metaCheck.length || !metaCheck[0].values?.length) return 0;
    const raw = metaCheck[0].values[0][0];
    return parseSchemaMetadataJson(String(raw));
  } catch {
    return 0;
  }
}

function writeSchemaVersion(d: SqlJsDatabase, version: number): void {
  const payload = buildSchemaMetadataPayload(version);
  d.run(
    `INSERT OR REPLACE INTO "${METADATA_STORE}" (id, data) VALUES ('_schema', :data)`,
    { ":data": payload },
  );
}

/** Runs when bumping DB_VERSION; keep idempotent. */
function migrateSqliteFileToVersion(_d: SqlJsDatabase, toVersion: number): void {
  void _d;
  void toVersion;
}

/** Column names of `table`, including virtual generated ones (`table_info` hides those). */
function tableColumns(d: SqlJsDatabase, table: string): string[] {
  const result = d.exec(`PRAGMA table_xinfo("${table}")`);
  if (!result.length || !result[0].values) return [];
  const nameIdx = result[0].columns.indexOf("name");
  if (nameIdx < 0) return [];
  return result[0].values.map((row) => String(row[nameIdx]));
}

/**
 * Bring the generated index columns and SQLite indexes up to date.
 *
 * Deliberately NOT inside `migrateSqliteFileToVersion`: a version-numbered
 * migration only runs on an upgrade, and this file's database can also arrive
 * by restore or by being copied from another machine. Every statement is
 * `IF NOT EXISTS` or gated on the column being absent, so running it on every
 * open is free after the first, and always correct.
 *
 * No backfill step exists because none is needed: the columns are VIRTUAL, so
 * they are computed from the `data` blob already on disk. Nothing is rewritten
 * and no row can be lost. Building the index reads the store once.
 */
function ensureIndexSchema(d: SqlJsDatabase): void {
  for (const store of sqliteIndexedStores()) {
    for (const sql of sqliteIndexSchemaStatements(store, tableColumns(d, store))) {
      d.run(sql);
    }
  }
}

function ensureTables(d: SqlJsDatabase): void {
  d.run(
    `CREATE TABLE IF NOT EXISTS "${METADATA_STORE}" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`,
  );
  for (const table of Object.values(STORES)) {
    d.run(
      `CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`,
    );
  }
  ensureIndexSchema(d);
  const v = readSchemaVersionFromDb(d);
  const plan = planSchemaMigration(v, DB_VERSION);
  if (plan.kind === "fresh") {
    writeSchemaVersion(d, plan.writeVersion);
    return;
  }
  if (plan.kind === "noop") {
    return;
  }
  for (const ver of plan.versionsToApply) {
    migrateSqliteFileToVersion(d, ver);
    writeSchemaVersion(d, ver);
  }
}

function scheduleFlush(): void {
  if (!activeHandle || !db) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushToDisk();
  }, FLUSH_MS);
}

function startSafetyTimer(): void {
  if (safetyTimer) clearInterval(safetyTimer as unknown as number);
  safetyTimer = setInterval(() => {
    void flushToDisk();
  }, SAFETY_FLUSH_MS) as unknown as ReturnType<typeof setTimeout>;
}

function stopSafetyTimer(): void {
  if (safetyTimer) {
    clearInterval(safetyTimer as unknown as number);
    safetyTimer = null;
  }
}

async function flushToDisk(): Promise<void> {
  if (!activeHandle || !db) return;
  flushChain = flushChain.then(async () => {
    const bytes = db!.export();
    await ensureReadWritePermission(activeHandle!);
    const writable = await activeHandle!.createWritable({ keepExistingData: false });
    await writable.write(toWriteChunk(bytes));
    await writable.close();
  });
  return flushChain;
}

function attachLifecycleHooks(): void {
  if (typeof window === "undefined") return;
  const onHidden = () => {
    void flushToDisk();
  };
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHidden();
  });
  window.addEventListener("pagehide", onHidden);
}

let lifecycleAttached = false;

function maybeAttachLifecycleOnce(): void {
  if (lifecycleAttached) return;
  lifecycleAttached = true;
  attachLifecycleHooks();
}

export async function pickAndCreateNewSqliteFile(): Promise<void> {
  if (!isFileSystemAccessSupported()) {
    const err = new Error(SQLITE_FILE_ERROR.NOT_SUPPORTED);
    (err as Error & { code?: string }).code = SQLITE_FILE_ERROR.NOT_SUPPORTED;
    throw err;
  }
  const handle = await window.showSaveFilePicker({
    suggestedName: "prodtrack.db",
    types: filePickerTypes(),
  });
  await ensureReadWritePermission(handle);
  const SQL = await getSqlJsModule();
  const fresh = new SQL.Database();
  ensureTables(fresh);
  const bytes = fresh.export();
  fresh.close();
  const writable = await handle.createWritable({ keepExistingData: false });
  await writable.write(toWriteChunk(bytes));
  await writable.close();
  await saveMainSqliteHandle(handle, { displayName: handle.name });
  await openSqliteFromStoredHandle();
}

export async function pickAndOpenExistingSqliteFile(): Promise<void> {
  if (!isFileSystemAccessSupported()) {
    const err = new Error(SQLITE_FILE_ERROR.NOT_SUPPORTED);
    (err as Error & { code?: string }).code = SQLITE_FILE_ERROR.NOT_SUPPORTED;
    throw err;
  }
  const [handle] = await window.showOpenFilePicker({
    types: filePickerTypes(),
    multiple: false,
  });
  await ensureReadWritePermission(handle);
  await saveMainSqliteHandle(handle, { displayName: handle.name });
  await openSqliteFromStoredHandle();
}

export async function bindMainSqliteFileHandle(
  handle: FileSystemFileHandle,
  info?: Partial<StoredSqliteFileInfo>
): Promise<void> {
  await ensureReadWritePermission(handle);
  await saveMainSqliteHandle(handle, {
    displayName: info?.displayName ?? handle.name,
  });
  await openSqliteFromStoredHandle();
}

/** Close sql.js + timers without clearing the saved File System Access handle (e.g. reconnect after USB replug). */
async function resetInMemorySqliteConnection(): Promise<void> {
  stopSafetyTimer();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushChain.catch(() => {});
  flushChain = Promise.resolve();
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
  }
  activeHandle = null;
}

async function openSqliteFromStoredHandle(): Promise<void> {
  stopSafetyTimer();
  const stored = await getStoredMainSqliteHandle();
  if (!stored) {
    const err = new Error(SQLITE_FILE_ERROR.NO_FILE);
    (err as Error & { code?: string }).code = SQLITE_FILE_ERROR.NO_FILE;
    throw err;
  }
  const { handle } = stored;
  await ensureReadWritePermission(handle);
  let file: File;
  try {
    file = await handle.getFile();
  } catch {
    const err = new Error(
      "Could not read the database file. It may have been moved, renamed, or deleted.",
    );
    (err as Error & { code?: string }).code = SQLITE_FILE_ERROR.READ_FAILED;
    throw err;
  }
  const buf = await file.arrayBuffer();
  const SQL = await getSqlJsModule();
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
  }
  try {
    const u8 =
      buf.byteLength === 0 ? undefined : new Uint8Array(buf);
    db = u8 ? new SQL.Database(u8) : new SQL.Database();
  } catch {
    const err = new Error(SQLITE_FILE_ERROR.READ_FAILED);
    (err as Error & { code?: string }).code = SQLITE_FILE_ERROR.READ_FAILED;
    throw err;
  }
  ensureTables(assertDb());
  activeHandle = handle;
  maybeAttachLifecycleOnce();
  startSafetyTimer();
  await flushToDisk();
}

export async function forgetSqliteFileAndClose(): Promise<void> {
  await resetInMemorySqliteConnection();
  await clearStoredMainSqliteHandle();
}

export async function openDB(): Promise<void> {
  if (db && activeHandle) {
    try {
      await ensureReadWritePermission(activeHandle);
      await activeHandle.getFile();
      return;
    } catch {
      await resetInMemorySqliteConnection();
    }
  }
  await openSqliteFromStoredHandle();
}

export function getActiveSqliteDisplayName(): string | null {
  return activeHandle?.name ?? null;
}

export async function getStoredSqliteDisplayName(): Promise<string | null> {
  const s = await getStoredMainSqliteHandle();
  return s?.info.displayName ?? s?.handle.name ?? null;
}

export async function getAll(
  storeName: string
): Promise<Record<string, unknown>[]> {
  const d = assertDb();
  const out: Record<string, unknown>[] = [];
  const result = d.exec(`SELECT id, data FROM "${storeName}"`);
  if (!result.length || !result[0].values) return out;
  const cols = result[0].columns;
  const idIdx = cols.indexOf("id");
  const dataIdx = cols.indexOf("data");
  if (idIdx < 0 || dataIdx < 0) return out;
  for (const row of result[0].values) {
    const id = row[idIdx];
    const dataStr = row[dataIdx];
    if (id == null || dataStr == null) continue;
    try {
      const record = JSON.parse(String(dataStr)) as Record<string, unknown>;
      if (record && typeof record === "object") {
        record.id = typeof id === "string" ? id : String(id);
        out.push(record);
      }
    } catch {
      // skip
    }
  }
  return out;
}

/**
 * The scan `getByIndex`/`countByIndex` fall back to when the bounds have no SQL
 * spelling (see `planSqliteIndexQuery`). Nothing in the app issues such a query;
 * it exists so a caller that does gets the right answer rather than an error.
 */
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

/**
 * `IDBIndex.getAll(IDBKeyRange.bound(...))`, answered by a real SQLite index.
 *
 * The range becomes `WHERE (k_a, k_b) BETWEEN (?, ?) AND (?, ?)` over the
 * generated key columns, ordered by those columns then `id` — the exact order
 * `sortByIndexOrder` defines — and windowed with `LIMIT`/`OFFSET`. Only the rows
 * that match are read off disk and parsed, which is the whole point: the audit
 * viewer's one screenful no longer costs a JSON parse of the entire log.
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
  const plan = planSqliteIndexQuery(storeName, indexName, lower, upper, options);
  if (!plan) {
    return applyIndexReadOptions(
      await scanByIndex(storeName, keyPath, lower, upper),
      options
    );
  }
  const d = assertDb();
  const stmt = d.prepare(
    `SELECT id, data FROM "${storeName}" WHERE ${plan.where} ` +
      `ORDER BY ${plan.orderBy} ${plan.limit}`
  );
  stmt.bind([...plan.whereParams, ...plan.limitParams]);
  const out: Record<string, unknown>[] = [];
  while (stmt.step()) {
    const [id, dataStr] = stmt.get();
    if (id == null || dataStr == null) continue;
    try {
      const record = JSON.parse(String(dataStr)) as Record<string, unknown>;
      if (record && typeof record === "object") {
        record.id = typeof id === "string" ? id : String(id);
        out.push(record);
      }
    } catch {
      // Unreachable: the generated key column is NULL for a row whose `data` is
      // not valid JSON, and every plan excludes NULL keys. Kept so a corrupt
      // row can never turn a read into a thrown error.
    }
  }
  stmt.free();
  return out;
}

/**
 * Rows in range, counted — `SELECT COUNT(*)` over the same index, so nothing is
 * read off disk or parsed at all.
 */
export async function countByIndex(
  storeName: string,
  indexName: string,
  lower: IndexKey,
  upper: IndexKey
): Promise<number> {
  const keyPath = getIndexKeyPath(storeName, indexName);
  if (!keyPath) throw new Error(`Unknown index ${storeName}.${indexName}`);
  const plan = planSqliteIndexQuery(storeName, indexName, lower, upper);
  if (!plan) return (await scanByIndex(storeName, keyPath, lower, upper)).length;
  const d = assertDb();
  const stmt = d.prepare(
    `SELECT COUNT(*) FROM "${storeName}" WHERE ${plan.where}`
  );
  stmt.bind(plan.whereParams);
  const n = stmt.step() ? Number(stmt.get()[0]) : 0;
  stmt.free();
  return n;
}

export async function get(
  storeName: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const d = assertDb();
  const stmt = d.prepare(`SELECT data FROM "${storeName}" WHERE id = ?`);
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.get();
  stmt.free();
  const dataStr = row[0];
  if (dataStr == null) return null;
  const record = JSON.parse(String(dataStr)) as Record<string, unknown>;
  record.id = id;
  return record;
}

export async function put(
  storeName: string,
  record: Record<string, unknown>
): Promise<void> {
  const d = assertDb();
  const id = (record?.id as string) ?? "";
  const data = JSON.stringify(record ?? {});
  d.run(`INSERT OR REPLACE INTO "${storeName}" (id, data) VALUES (?, ?)`, [
    id,
    data,
  ]);
  scheduleFlush();
}

export async function remove(storeName: string, id: string): Promise<void> {
  const d = assertDb();
  d.run(`DELETE FROM "${storeName}" WHERE id = ?`, [id]);
  scheduleFlush();
}

export async function clear(storeName: string): Promise<void> {
  const d = assertDb();
  d.run(`DELETE FROM "${storeName}"`);
  scheduleFlush();
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
