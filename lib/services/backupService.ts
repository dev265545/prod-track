/**
 * Keeping a second copy of the factory's data.
 *
 * There is no server. Every attendance mark, every production entry and the
 * whole wage history live in one database on one machine. If that machine is
 * stolen, reimaged or simply dies, the only thing standing between the factory
 * and total loss is a copy the owner remembered to make. Until now the app
 * never mentioned backups unless you went looking for them.
 *
 * This module does three things and nothing else:
 *
 * 1. remembers when the last good copy was made, so the app can say it out
 *    loud and go from a quiet line to a warning as it ages;
 * 2. on the desktop build, writes timestamped copies into a folder the owner
 *    picks once (a USB stick, a second drive) with a keep-the-newest-N rule;
 * 3. checks that a copy is actually readable, without importing it.
 *
 * What it deliberately does NOT do: pretend the browser build has automatic
 * backups. In the portable/web build a file can only be written in response to
 * a click, so that build gets reminders and a one-press save — never an
 * unattended copy. {@link supportsAutomaticBackups} is what the UI must ask,
 * and the UI says which build the owner is on.
 *
 * The calculations here are pure and tested; the storage is one row of app
 * settings, so a backup travels with a backup.
 */

import { isTauri } from "@/lib/db/adapter";
import { validateExportData, type ExportData } from "@/lib/db/exportImport";
import { AUDIT_ACTIONS, record as auditRecord } from "./auditService";
import {
  getAppSettings,
  saveAppSettings,
  type AppSettings,
} from "./appSettingsService";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How far ahead of "now" a stored timestamp may sit before it is treated as a
 * wrong clock rather than a fresh backup.
 *
 * Not zero: machines drift, and a copy made 40 seconds ago on a slightly fast
 * clock is a real copy. Machines in factories also get their date typed in by
 * hand, and a backup dated 2031 must never read as "0 days ago" for ever —
 * that is silence again, and silence is the failure this whole module exists
 * to end.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 6 * 60 * 60 * 1000;

export type BackupFreshnessState =
  /** No copy has ever been made on this install. */
  | "never"
  /** Newer than the reminder threshold. */
  | "fresh"
  /** Older than the reminder threshold. */
  | "due"
  /** Stored in the future — the machine's date cannot be trusted. */
  | "clockSkew";

export interface BackupFreshness {
  state: BackupFreshnessState;
  /** Whole days since the last copy; null when there is no usable timestamp. */
  daysSince: number | null;
  /** Days left before the reminder appears; null once it already has. */
  daysUntilDue: number | null;
  /** Should the owner be nudged right now (threshold reached, not snoozed)? */
  shouldRemind: boolean;
  /** True while a "remind me later" is still in effect. */
  snoozed: boolean;
}

export interface FreshnessInput {
  /** ISO timestamp of the last successful copy; "" when never. */
  lastBackupAt: string;
  nowMs: number;
  reminderDays: number;
  /** ISO timestamp; the reminder stays hidden until then. */
  snoozedUntil?: string;
}

/** Milliseconds for an ISO string, or null when it is missing or nonsense. */
export function parseTimestamp(value: string | undefined | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * How stale the last copy is, and whether to say something about it.
 *
 * Pure on purpose: this is the one calculation the whole feature rests on, so
 * it takes "now" as an argument and can be tested at any date, including dates
 * the machine's clock has invented.
 */
export function evaluateBackupFreshness(input: FreshnessInput): BackupFreshness {
  const { nowMs } = input;
  const reminderDays = Number.isFinite(input.reminderDays)
    ? Math.max(1, Math.floor(input.reminderDays))
    : 7;
  const snoozeMs = parseTimestamp(input.snoozedUntil);
  const snoozed = snoozeMs !== null && snoozeMs > nowMs;
  const lastMs = parseTimestamp(input.lastBackupAt);

  const nudge = (state: BackupFreshnessState, daysSince: number | null) => ({
    state,
    daysSince,
    daysUntilDue: null,
    shouldRemind: !snoozed,
    snoozed,
  });

  if (lastMs === null) return nudge("never", null);
  if (lastMs > nowMs + CLOCK_SKEW_TOLERANCE_MS) return nudge("clockSkew", null);

  // A small forward drift is still "today", not a negative age.
  const elapsed = Math.max(0, nowMs - lastMs);
  const daysSince = Math.floor(elapsed / MS_PER_DAY);
  if (daysSince >= reminderDays) return nudge("due", daysSince);
  return {
    state: "fresh",
    daysSince,
    daysUntilDue: reminderDays - daysSince,
    shouldRemind: false,
    snoozed,
  };
}

const BACKUP_PREFIX = "prodtrack-backup-";
const BACKUP_SUFFIX = ".db";

/**
 * `prodtrack-backup-YYYYMMDD-HHMMSS` in the machine's own time.
 *
 * Local time, not UTC: the owner reads this file name off a USB stick and has
 * to recognise "yesterday evening". The format sorts oldest-first as plain
 * text, which is what the retention rule relies on.
 */
export function backupStamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function isBackupFileName(name: string): boolean {
  return name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX);
}

export interface RetentionPlan {
  /** Newest first. */
  keep: string[];
  /** Oldest first — the order they should be deleted in. */
  prune: string[];
  /** Files in the folder that are not ProdTrack copies; never touched. */
  ignored: string[];
}

/**
 * Which copies survive and which get deleted.
 *
 * Deleting other people's files would be unforgivable, so anything that does
 * not carry the app's own backup name is put in `ignored` and left alone —
 * the owner is likely pointing this at a USB stick with his own documents on
 * it. `keep` is never empty for a non-empty input: a retention rule that can
 * delete the last remaining copy is worse than no rule at all.
 */
export function planBackupRetention(
  fileNames: readonly string[],
  keepCount: number,
): RetentionPlan {
  const keepN = Number.isFinite(keepCount)
    ? Math.max(1, Math.floor(keepCount))
    : 1;
  const ignored = fileNames.filter((name) => !isBackupFileName(name));
  // Name order is time order (see backupStamp); newest first.
  const backups = fileNames.filter(isBackupFileName).sort().reverse();
  return {
    keep: backups.slice(0, keepN),
    prune: backups.slice(keepN).reverse(),
    ignored,
  };
}

export interface BackupInspection {
  ok: boolean;
  error?: string;
  /** When the copy was made, as recorded inside the file. */
  exportedAt?: string;
  schemaVersion?: number;
  /** Total rows across every section — "is there anything in here?". */
  rowCount?: number;
}

/**
 * Read a copy and say whether it could be restored — without restoring it.
 *
 * A backup nobody has ever opened is a guess. This runs the exact check the
 * restore path runs ({@link validateExportData}) and then stops, so the owner
 * can confirm a copy is good while the live data is still fine.
 */
export function inspectExportPayload(data: unknown): BackupInspection {
  const { valid, error } = validateExportData(data);
  if (!valid) return { ok: false, error };
  const parsed = data as ExportData;
  const rowCount = Object.values(parsed.stores).reduce(
    (n, rows) => n + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
  return {
    ok: true,
    exportedAt: parsed.exportedAt,
    schemaVersion: parsed.schemaVersion,
    rowCount,
  };
}

/** The same check for a copy in the older text format, straight off disk. */
export function inspectBackupJson(text: string): BackupInspection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not a ProdTrack copy." };
  }
  return inspectExportPayload(parsed);
}

// ---------------------------------------------------------------------------
// Storage — one row of app settings, so freshness survives a restore
// ---------------------------------------------------------------------------

export interface BackupStatus extends BackupFreshness {
  lastBackupAt: string;
  lastBackupVerifiedAt: string;
  reminderDays: number;
  autoBackupEnabled: boolean;
  autoBackupFolder: string;
  autoBackupKeepCount: number;
  /** False in the browser build: no unattended file write is possible there. */
  automaticSupported: boolean;
}

/** Only the desktop build can write a file with nobody watching. */
export function supportsAutomaticBackups(): boolean {
  return isTauri();
}

export async function getBackupStatus(
  now: Date = new Date(),
): Promise<BackupStatus> {
  const settings = await getAppSettings();
  return toBackupStatus(settings, now.getTime());
}

/** Pure view of a settings row, so the UI and the tests agree on the shape. */
export function toBackupStatus(
  settings: AppSettings,
  nowMs: number,
  automaticSupported = supportsAutomaticBackups(),
): BackupStatus {
  const freshness = evaluateBackupFreshness({
    lastBackupAt: settings.lastBackupAt,
    nowMs,
    reminderDays: settings.backupReminderDays,
    snoozedUntil: settings.backupReminderSnoozedUntil,
  });
  return {
    ...freshness,
    lastBackupAt: settings.lastBackupAt,
    lastBackupVerifiedAt: settings.lastBackupVerifiedAt,
    reminderDays: settings.backupReminderDays,
    autoBackupEnabled: settings.autoBackupEnabled,
    autoBackupFolder: settings.autoBackupFolder,
    autoBackupKeepCount: settings.autoBackupKeepCount,
    automaticSupported,
  };
}

/**
 * Remember that a copy was made. Clears any "remind me later" — the reminder
 * has served its purpose and should start counting again from here.
 */
export async function recordBackupTaken(when: Date = new Date()): Promise<void> {
  await saveAppSettings({
    lastBackupAt: when.toISOString(),
    backupReminderSnoozedUntil: "",
  });
}

export async function recordBackupVerified(
  when: Date = new Date(),
): Promise<void> {
  await saveAppSettings({ lastBackupVerifiedAt: when.toISOString() });
}

/** Hide the reminder for a few days. Never longer than the reminder period. */
export async function snoozeBackupReminder(
  days = 1,
  now: Date = new Date(),
): Promise<void> {
  const until = new Date(now.getTime() + Math.max(1, days) * MS_PER_DAY);
  await saveAppSettings({ backupReminderSnoozedUntil: until.toISOString() });
}

export async function setBackupReminderDays(days: number): Promise<void> {
  await saveAppSettings({ backupReminderDays: days });
}

// ---------------------------------------------------------------------------
// Making a copy
// ---------------------------------------------------------------------------

export type SaveCopyResult =
  | { ok: true; downloaded: boolean }
  | { ok: false; error: string };

/**
 * One press, one copy — the same code path the Data tab uses.
 *
 * Loaded on demand so this module stays importable outside a browser, and so
 * there is no second way to write a backup file that could drift from the
 * first.
 */
export async function saveCopyNow(): Promise<SaveCopyResult> {
  const { saveFullCopy } = await import("@/components/settings/backup-actions");
  const result = await saveFullCopy();
  if (result.ok) await recordBackupTaken();
  return result;
}

// ---------------------------------------------------------------------------
// Desktop: unattended copies into a folder the owner picked once
// ---------------------------------------------------------------------------

export interface AutoBackupWriteResult {
  path: string;
  fileName: string;
  bytes: number;
  pruned: string[];
  kept: number;
}

export interface BackupVerifyResult {
  ok: boolean;
  error?: string;
  schemaVersion?: number;
  rows?: number;
  bytes?: number;
}

type RustWriteResult = {
  path: string;
  file_name: string;
  bytes: number;
  pruned: string[];
  kept: number;
};

type RustVerifyResult = {
  ok: boolean;
  error: string | null;
  schema_version: number;
  rows: number;
  tables: number;
  bytes: number;
};

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@/lib/tauriBridge");
  return invoke<T>(cmd, args);
}

/** Ask for the backup folder once; every later copy needs no dialog. */
export async function chooseAutoBackupFolder(): Promise<string | null> {
  if (!supportsAutomaticBackups()) return null;
  const folder = await tauriInvoke<string | null>("backup_pick_folder");
  if (!folder) return null;
  await saveAppSettings({ autoBackupFolder: folder, autoBackupEnabled: true });
  void auditRecord(
    AUDIT_ACTIONS.dataExport,
    "backup",
    null,
    `Automatic copies will be saved into ${folder}`,
  );
  return folder;
}

export async function setAutoBackupEnabled(enabled: boolean): Promise<void> {
  await saveAppSettings({ autoBackupEnabled: enabled });
}

export async function setAutoBackupKeepCount(count: number): Promise<void> {
  await saveAppSettings({ autoBackupKeepCount: count });
}

/**
 * Write one timestamped copy into the chosen folder, prune the old ones, then
 * open the new file and confirm it is readable.
 *
 * The verify step is not decoration: a copy that lands on a full USB stick, or
 * on a stick pulled out mid-write, is a file that exists and restores nothing.
 * Only a copy that passed the check updates "last saved", so the reminder
 * keeps nagging when the copies are bad.
 */
export async function runAutoBackup(
  now: Date = new Date(),
): Promise<
  | { ok: true; result: AutoBackupWriteResult; verified: BackupVerifyResult }
  | { ok: false; error: string }
> {
  if (!supportsAutomaticBackups()) {
    return { ok: false, error: "not-supported" };
  }
  const settings = await getAppSettings();
  if (!settings.autoBackupFolder) return { ok: false, error: "no-folder" };

  try {
    const raw = await tauriInvoke<RustWriteResult>("backup_write", {
      folder: settings.autoBackupFolder,
      keep: settings.autoBackupKeepCount,
      stamp: backupStamp(now),
    });
    const result: AutoBackupWriteResult = {
      path: raw.path,
      fileName: raw.file_name,
      bytes: raw.bytes,
      pruned: raw.pruned ?? [],
      kept: raw.kept,
    };
    const verified = await verifyBackupFile(result.path);
    if (!verified.ok) {
      void auditRecord(
        AUDIT_ACTIONS.dataExport,
        "backup",
        null,
        `A copy was written to ${result.fileName} but could not be read back: ${
          verified.error ?? ""
        }`,
      );
      return { ok: false, error: verified.error ?? "unreadable" };
    }

    await recordBackupTaken(now);
    await recordBackupVerified(now);
    void auditRecord(
      AUDIT_ACTIONS.dataExport,
      "backup",
      null,
      `Copy saved as ${result.fileName} (${verified.rows ?? 0} rows), ${
        result.kept
      } copies kept`,
    );
    if (result.pruned.length > 0) {
      void auditRecord(
        AUDIT_ACTIONS.dataPurge,
        "backup",
        null,
        `Old copies deleted: ${result.pruned.join(", ")}`,
      );
    }
    return { ok: true, result, verified };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    void auditRecord(
      AUDIT_ACTIONS.dataExport,
      "backup",
      null,
      `Automatic copy failed: ${error}`,
    );
    return { ok: false, error };
  }
}

/** Desktop: open a copy read-only and report what is in it. */
export async function verifyBackupFile(
  path: string,
): Promise<BackupVerifyResult> {
  try {
    const raw = await tauriInvoke<RustVerifyResult>("backup_verify", { path });
    return {
      ok: raw.ok,
      error: raw.error ?? undefined,
      schemaVersion: raw.schema_version,
      rows: raw.rows,
      bytes: raw.bytes,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Desktop: choose a copy to check. Choosing here can never start a restore. */
export async function pickBackupFileToVerify(): Promise<string | null> {
  if (!supportsAutomaticBackups()) return null;
  return tauriInvoke<string | null>("backup_pick_file");
}

/**
 * Browser: check a copy the owner picked with the file input.
 *
 * Both formats are read the same way the restore screen reads them, and then
 * thrown away — nothing is written to the database.
 */
export async function inspectBackupFile(
  file: File,
): Promise<BackupInspection> {
  const isJson = /\.json$/i.test(file.name);
  try {
    if (isJson) {
      return inspectBackupJson(await file.text());
    }
    const { importDatabaseFromSqliteBuffer } = await import(
      "@/lib/db/sqliteBrowser"
    );
    const data = await importDatabaseFromSqliteBuffer(await file.arrayBuffer());
    return inspectExportPayload(data);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
