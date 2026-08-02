import { describe, expect, it } from "vitest";
import { DB_VERSION } from "@/lib/db/schema";
import {
  MS_PER_DAY,
  backupStamp,
  evaluateBackupFreshness,
  inspectBackupJson,
  inspectExportPayload,
  isBackupFileName,
  planBackupRetention,
  toBackupStatus,
} from "./backupService";
import { DEFAULT_APP_SETTINGS } from "./appSettingsService";

const NOW = Date.parse("2026-08-02T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("evaluateBackupFreshness", () => {
  it("treats a factory that has never made a copy as needing one", () => {
    const f = evaluateBackupFreshness({
      lastBackupAt: "",
      nowMs: NOW,
      reminderDays: 7,
    });
    expect(f.state).toBe("never");
    expect(f.daysSince).toBeNull();
    expect(f.shouldRemind).toBe(true);
  });

  it("treats an unreadable timestamp as never", () => {
    const f = evaluateBackupFreshness({
      lastBackupAt: "not a date",
      nowMs: NOW,
      reminderDays: 7,
    });
    expect(f.state).toBe("never");
    expect(f.shouldRemind).toBe(true);
  });

  it("is quiet the day a copy is made", () => {
    const f = evaluateBackupFreshness({
      lastBackupAt: iso(NOW - 2 * 60 * 60 * 1000),
      nowMs: NOW,
      reminderDays: 7,
    });
    expect(f.state).toBe("fresh");
    expect(f.daysSince).toBe(0);
    expect(f.daysUntilDue).toBe(7);
    expect(f.shouldRemind).toBe(false);
  });

  it("counts whole days and stays quiet up to the threshold", () => {
    const f = evaluateBackupFreshness({
      lastBackupAt: iso(NOW - 6 * MS_PER_DAY - 1000),
      nowMs: NOW,
      reminderDays: 7,
    });
    expect(f.daysSince).toBe(6);
    expect(f.state).toBe("fresh");
    expect(f.shouldRemind).toBe(false);
  });

  it("asks for a copy once the threshold is reached", () => {
    const f = evaluateBackupFreshness({
      lastBackupAt: iso(NOW - 7 * MS_PER_DAY),
      nowMs: NOW,
      reminderDays: 7,
    });
    expect(f.state).toBe("due");
    expect(f.daysSince).toBe(7);
    expect(f.shouldRemind).toBe(true);
  });

  it("reports a long-forgotten copy in days, not as an error", () => {
    const f = evaluateBackupFreshness({
      lastBackupAt: iso(NOW - 400 * MS_PER_DAY),
      nowMs: NOW,
      reminderDays: 7,
    });
    expect(f.state).toBe("due");
    expect(f.daysSince).toBe(400);
  });

  it("honours a configured period other than a week", () => {
    const input = { lastBackupAt: iso(NOW - 3 * MS_PER_DAY), nowMs: NOW };
    expect(evaluateBackupFreshness({ ...input, reminderDays: 2 }).state).toBe(
      "due",
    );
    expect(evaluateBackupFreshness({ ...input, reminderDays: 30 }).state).toBe(
      "fresh",
    );
  });

  it("falls back to a week when the period is nonsense", () => {
    const f = evaluateBackupFreshness({
      lastBackupAt: iso(NOW - 8 * MS_PER_DAY),
      nowMs: NOW,
      reminderDays: Number.NaN,
    });
    expect(f.state).toBe("due");
  });

  // The machine's date is typed in by hand and does drift. A copy stamped in
  // the future must never read as "0 days ago" for ever.
  it("flags a future timestamp instead of reading it as fresh", () => {
    const f = evaluateBackupFreshness({
      lastBackupAt: iso(NOW + 5 * 365 * MS_PER_DAY),
      nowMs: NOW,
      reminderDays: 7,
    });
    expect(f.state).toBe("clockSkew");
    expect(f.daysSince).toBeNull();
    expect(f.shouldRemind).toBe(true);
  });

  it("still calls a small forward drift a fresh copy", () => {
    const f = evaluateBackupFreshness({
      lastBackupAt: iso(NOW + 60 * 1000),
      nowMs: NOW,
      reminderDays: 7,
    });
    expect(f.state).toBe("fresh");
    expect(f.daysSince).toBe(0);
  });

  it("stays silent while a 'remind me later' is running, then speaks again", () => {
    const lastBackupAt = iso(NOW - 30 * MS_PER_DAY);
    const snoozed = evaluateBackupFreshness({
      lastBackupAt,
      nowMs: NOW,
      reminderDays: 7,
      snoozedUntil: iso(NOW + MS_PER_DAY),
    });
    expect(snoozed.state).toBe("due");
    expect(snoozed.snoozed).toBe(true);
    expect(snoozed.shouldRemind).toBe(false);

    const expired = evaluateBackupFreshness({
      lastBackupAt,
      nowMs: NOW,
      reminderDays: 7,
      snoozedUntil: iso(NOW - MS_PER_DAY),
    });
    expect(expired.shouldRemind).toBe(true);
  });

  it("ignores a snooze whose date cannot be read", () => {
    const f = evaluateBackupFreshness({
      lastBackupAt: "",
      nowMs: NOW,
      reminderDays: 7,
      snoozedUntil: "later maybe",
    });
    expect(f.shouldRemind).toBe(true);
  });
});

describe("toBackupStatus", () => {
  it("reads a settings row that has never been backed up", () => {
    const status = toBackupStatus(DEFAULT_APP_SETTINGS, NOW, false);
    expect(status.state).toBe("never");
    expect(status.reminderDays).toBe(7);
    expect(status.automaticSupported).toBe(false);
  });

  it("carries the folder settings through for the desktop card", () => {
    const status = toBackupStatus(
      {
        ...DEFAULT_APP_SETTINGS,
        lastBackupAt: iso(NOW - MS_PER_DAY),
        autoBackupEnabled: true,
        autoBackupFolder: "E:/prodtrack-copies",
        autoBackupKeepCount: 5,
      },
      NOW,
      true,
    );
    expect(status.state).toBe("fresh");
    expect(status.daysSince).toBe(1);
    expect(status.autoBackupFolder).toBe("E:/prodtrack-copies");
    expect(status.autoBackupKeepCount).toBe(5);
  });
});

describe("backupStamp", () => {
  it("builds a sortable name from local time", () => {
    const stamp = backupStamp(new Date(2026, 7, 2, 9, 5, 4));
    expect(stamp).toBe("20260802-090504");
    expect(isBackupFileName(`prodtrack-backup-${stamp}.db`)).toBe(true);
    expect(isBackupFileName("holiday-photos.jpg")).toBe(false);
  });

  it("orders as text in the same order as in time", () => {
    const older = backupStamp(new Date(2026, 0, 9, 23, 59, 59));
    const newer = backupStamp(new Date(2026, 0, 10, 0, 0, 0));
    expect(older < newer).toBe(true);
  });
});

describe("planBackupRetention", () => {
  const names = [
    "prodtrack-backup-20260701-090000.db",
    "prodtrack-backup-20260715-090000.db",
    "prodtrack-backup-20260801-090000.db",
    "prodtrack-backup-20260802-093000.db",
  ];

  it("keeps the newest N and deletes the rest oldest first", () => {
    const plan = planBackupRetention(names, 2);
    expect(plan.keep).toEqual([
      "prodtrack-backup-20260802-093000.db",
      "prodtrack-backup-20260801-090000.db",
    ]);
    expect(plan.prune).toEqual([
      "prodtrack-backup-20260701-090000.db",
      "prodtrack-backup-20260715-090000.db",
    ]);
  });

  it("deletes nothing when there are fewer copies than the limit", () => {
    expect(planBackupRetention(names, 10).prune).toEqual([]);
    expect(planBackupRetention([], 5)).toEqual({
      keep: [],
      prune: [],
      ignored: [],
    });
  });

  it("never deletes the last remaining copy, whatever the limit says", () => {
    const plan = planBackupRetention(names, 0);
    expect(plan.keep).toHaveLength(1);
    expect(plan.prune).toHaveLength(3);
    expect(planBackupRetention(names, Number.NaN).keep).toHaveLength(1);
  });

  it("leaves the owner's own files on the drive alone", () => {
    const plan = planBackupRetention(
      [...names, "wages.xlsx", "photo.jpg", "prodtrack-export-2026-07-01.json"],
      1,
    );
    expect(plan.ignored).toEqual([
      "wages.xlsx",
      "photo.jpg",
      "prodtrack-export-2026-07-01.json",
    ]);
    expect(plan.prune.every((n) => n.startsWith("prodtrack-backup-"))).toBe(true);
  });
});

describe("checking a copy without restoring it", () => {
  const good = {
    version: 1,
    schemaVersion: DB_VERSION,
    exportedAt: "2026-08-01T04:00:00.000Z",
    stores: {
      employees: [{ id: "e1" }, { id: "e2" }],
      attendance: [{ id: "a1" }],
    },
  };

  it("accepts a copy that could be restored and says what is inside", () => {
    const result = inspectExportPayload(good);
    expect(result.ok).toBe(true);
    expect(result.rowCount).toBe(3);
    expect(result.exportedAt).toBe("2026-08-01T04:00:00.000Z");
  });

  it("rejects a copy written by a newer version", () => {
    const result = inspectExportPayload({
      ...good,
      schemaVersion: DB_VERSION + 1,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/newer version/i);
  });

  it("rejects a damaged row rather than calling the copy good", () => {
    const result = inspectExportPayload({
      ...good,
      stores: { employees: [{ name: "no id" }] },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a file that is not a copy at all", () => {
    expect(inspectBackupJson("this is not json").ok).toBe(false);
    expect(inspectBackupJson("null").ok).toBe(false);
  });

  it("reads a good text copy off disk", () => {
    const result = inspectBackupJson(JSON.stringify(good));
    expect(result.ok).toBe(true);
    expect(result.rowCount).toBe(3);
  });
});
