/**
 * ProdTrack Lite — Live SQLite backed by a user-chosen file (File System Access API).
 * Same table layout as Tauri / sqliteBrowser (id + data JSON per store).
 */

import { getSqlJsModule, type SqlJsDatabase } from "./sqlJsLoader";
import { DB_VERSION, METADATA_STORE, STORES } from "./schema";
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

function ensureTables(d: SqlJsDatabase): void {
  d.run(
    `CREATE TABLE IF NOT EXISTS "${METADATA_STORE}" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`,
  );
  for (const table of Object.values(STORES)) {
    d.run(
      `CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`,
    );
  }
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
  const file = await handle.getFile();
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
  stopSafetyTimer();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  await flushChain.catch(() => {});
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
  }
  activeHandle = null;
  await clearStoredMainSqliteHandle();
}

export async function openDB(): Promise<void> {
  if (db && activeHandle) return;
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
