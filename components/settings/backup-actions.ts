"use client";

import { isTauri } from "@/lib/db/adapter";
import { exportDatabase } from "@/lib/db/exportImport";
import { exportDatabaseToSqlite } from "@/lib/db/sqliteBrowser";

export type BackupOutcome =
  { ok: true; downloaded: boolean } | { ok: false; error: string };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * "Save a copy" in the owner's words. Shared by the backup card and by the
 * "back up before you overwrite" escape hatch inside the restore dialog, so
 * there is exactly one code path that can produce a good copy.
 */
export async function saveFullCopy(): Promise<BackupOutcome> {
  try {
    if (isTauri()) {
      const { exportDbToFile } = await import("@/lib/db/tauriDb");
      const result = await exportDbToFile();
      if (!result.success) {
        return { ok: false, error: result.error ?? "" };
      }
      return { ok: true, downloaded: false };
    }
    const bytes = await exportDatabaseToSqlite();
    downloadBlob(
      new Blob([new Uint8Array(bytes)], { type: "application/x-sqlite3" }),
      `prodtrack-${today()}.db`,
    );
    return { ok: true, downloaded: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Older text-based copy, kept for moving data between app versions. */
export async function savePlainCopy(): Promise<BackupOutcome> {
  try {
    const data = await exportDatabase();
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      `prodtrack-export-${today()}.json`,
    );
    return { ok: true, downloaded: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
