import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORES } from "@/lib/db/schema";

/**
 * In-memory stand-in for the IndexedDB/SQLite adapter, so the thin payroll data
 * services (attendance, advances, advance deductions, Sunday categories,
 * factory holidays) can be exercised for real instead of against call spies.
 */
const { store } = vi.hoisted(() => ({
  store: new Map<string, Map<string, Record<string, unknown>>>(),
}));

function tableFor(name: string): Map<string, Record<string, unknown>> {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name)!;
}

vi.mock("@/lib/db/adapter", () => ({
  STORES,
  getAll: async (name: string) => Array.from(tableFor(name).values()),
  get: async (name: string, id: string) => tableFor(name).get(id) ?? null,
  put: async (name: string, row: Record<string, unknown>) => {
    tableFor(name).set(row.id as string, { ...row });
    return row;
  },
  remove: async (name: string, id: string) => {
    tableFor(name).delete(id);
  },
  deleteWhere: async (
    name: string,
    predicate: (row: Record<string, unknown>) => boolean,
  ) => {
    const table = tableFor(name);
    let n = 0;
    for (const [id, row] of Array.from(table.entries())) {
      if (predicate(row)) {
        table.delete(id);
        n += 1;
      }
    }
    return n;
  },
}));

import {
  deleteAttendance,
  getAllAttendanceByDate,
  getAttendanceByEmployeeAndDate,
  getAttendanceByEmployeeInRange,
  getAttendanceInRange,
  saveAttendance,
} from "../attendanceService";
import {
  deleteAdvance,
  deleteAdvancesBefore,
  getAdvance,
  getAdvances,
  getAdvancesByEmployee,
  saveAdvance,
} from "../advanceService";
import {
  getDeductionForPeriod,
  getDeductionsByEmployee,
  saveDeduction,
} from "../advanceDeductionService";
import {
  deleteSundayCategory,
  getSundayCategories,
  getSundayCategory,
  resolveSundayCategoryRule,
  saveSundayCategory,
} from "../sundayCategoryService";
import {
  deleteHoliday,
  getAllHolidays,
  getHolidayByDate,
  getHolidaysInRange,
  saveHoliday,
} from "../factoryHolidayService";
import { DEFAULT_SUNDAY_CATEGORY_RULE } from "@/lib/utils/attendanceStats";

beforeEach(() => {
  store.clear();
});

describe("attendanceService", () => {
  it("saves a record, assigning an id, and reads it back by employee + date", async () => {
    const saved = await saveAttendance({
      employeeId: "e1",
      date: "2026-04-02",
      status: "present",
    });

    expect(saved.id).toBeTruthy();
    expect(await getAttendanceByEmployeeAndDate("e1", "2026-04-02")).toMatchObject(
      { employeeId: "e1", date: "2026-04-02", status: "present" },
    );
  });

  // Bug 9: every save minted a fresh id, so re-marking a day left two rows for
  // the same (employeeId, date) — and the salary engine and the lookup helper
  // then disagreed about which one counted.
  it("upserts on (employeeId, date) instead of creating a duplicate row", async () => {
    await saveAttendance({
      employeeId: "e1",
      date: "2026-04-02",
      status: "present",
      hoursExtra: 2,
    });
    await saveAttendance({
      employeeId: "e1",
      date: "2026-04-02",
      status: "absent",
    });

    const rows = await getAttendanceInRange("2026-04-01", "2026-04-30");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("absent");
    // Replaced wholesale, not merged — the stale hours must not linger.
    expect(rows[0].hoursExtra).toBeUndefined();
  });

  it("keeps an explicit id stable across an update", async () => {
    const first = await saveAttendance({
      id: "att_fixed",
      employeeId: "e1",
      date: "2026-04-02",
      status: "present",
    });
    const second = await saveAttendance({
      id: "att_fixed",
      employeeId: "e1",
      date: "2026-04-02",
      status: "absent",
    });

    expect(second.id).toBe(first.id);
    expect(await getAllAttendanceByDate("2026-04-02")).toHaveLength(1);
  });

  it("does not merge records for different employees on the same date", async () => {
    await saveAttendance({ employeeId: "e1", date: "2026-04-02", status: "present" });
    await saveAttendance({ employeeId: "e2", date: "2026-04-02", status: "absent" });

    expect(await getAllAttendanceByDate("2026-04-02")).toHaveLength(2);
  });

  // Bug 9b: getAttendanceByEmployeeAndDate used .find() (first match) while the
  // salary sheet builds a Map (last match wins). They must agree.
  it("resolves the same record as a last-write-wins map when duplicates already exist", async () => {
    // Simulate legacy duplicates written before the upsert fix.
    await saveAttendance({
      id: "att_old",
      employeeId: "e1",
      date: "2026-04-02",
      status: "present",
    });
    await saveAttendance({
      id: "att_new",
      employeeId: "e1",
      date: "2026-04-02",
      status: "absent",
    });

    const all = await getAttendanceInRange("2026-04-01", "2026-04-30");
    const lastWins = new Map(all.map((a) => [a.date as string, a])).get(
      "2026-04-02",
    );
    const looked = await getAttendanceByEmployeeAndDate("e1", "2026-04-02");

    expect(looked?.id).toBe(lastWins?.id);
  });

  it("filters by employee and inclusive date range", async () => {
    await saveAttendance({ employeeId: "e1", date: "2026-04-01", status: "present" });
    await saveAttendance({ employeeId: "e1", date: "2026-04-10", status: "present" });
    await saveAttendance({ employeeId: "e1", date: "2026-05-01", status: "present" });
    await saveAttendance({ employeeId: "e2", date: "2026-04-05", status: "present" });

    const rows = await getAttendanceByEmployeeInRange("e1", "2026-04-01", "2026-04-30");
    expect(rows.map((r) => r.date)).toEqual(["2026-04-01", "2026-04-10"]);
  });

  it("deletes by id", async () => {
    const saved = await saveAttendance({
      employeeId: "e1",
      date: "2026-04-02",
      status: "present",
    });
    await deleteAttendance(saved.id as string);
    expect(await getAttendanceByEmployeeAndDate("e1", "2026-04-02")).toBeNull();
  });

  it("returns null for an unknown employee/date pair", async () => {
    expect(await getAttendanceByEmployeeAndDate("nobody", "2026-04-02")).toBeNull();
  });
});

describe("advanceService", () => {
  it("assigns an id and defaults the date to today when omitted", async () => {
    const saved = await saveAdvance({ employeeId: "e1", amount: 500 });

    expect(saved.id).toBeTruthy();
    expect(saved.date).toBe(new Date().toISOString().slice(0, 10));
    expect(await getAdvance(saved.id as string)).toMatchObject({ amount: 500 });
  });

  it("filters advances by employee and inclusive period", async () => {
    await saveAdvance({ employeeId: "e1", amount: 100, date: "2026-04-01" });
    await saveAdvance({ employeeId: "e1", amount: 200, date: "2026-04-15" });
    await saveAdvance({ employeeId: "e1", amount: 400, date: "2026-04-16" });
    await saveAdvance({ employeeId: "e2", amount: 800, date: "2026-04-10" });

    const rows = await getAdvancesByEmployee("e1", "2026-04-01", "2026-04-15");
    expect(rows.reduce((s, r) => s + (r.amount as number), 0)).toBe(300);
  });

  it("deletes a single advance and purges advances before a cutoff date", async () => {
    const keep = await saveAdvance({ employeeId: "e1", amount: 100, date: "2026-04-10" });
    await saveAdvance({ employeeId: "e1", amount: 200, date: "2026-03-10" });
    await saveAdvance({ employeeId: "e2", amount: 300, date: "2026-01-01" });

    expect(await deleteAdvancesBefore("2026-04-01")).toBe(2);
    expect((await getAdvances()).map((a) => a.id)).toEqual([keep.id]);

    await deleteAdvance(keep.id as string);
    expect(await getAdvances()).toHaveLength(0);
  });
});

describe("advanceDeductionService", () => {
  it("saves one deduction per employee+period and overwrites on re-save", async () => {
    await saveDeduction({
      employeeId: "e1",
      periodFrom: "2026-04-01",
      periodTo: "2026-04-30",
      amount: 300,
    });
    await saveDeduction({
      employeeId: "e1",
      periodFrom: "2026-04-01",
      periodTo: "2026-04-30",
      amount: 450,
    });

    const rows = await getDeductionsByEmployee("e1");
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(450);
  });

  it("coerces a non-numeric amount to 0", async () => {
    const saved = await saveDeduction({
      employeeId: "e1",
      periodFrom: "2026-04-01",
      periodTo: "2026-04-30",
      amount: Number.NaN,
    });
    expect(saved.amount).toBe(0);
  });

  it("matches a period exactly — a half-month lookup does not see a full-month record", async () => {
    await saveDeduction({
      employeeId: "e1",
      periodFrom: "2026-04-01",
      periodTo: "2026-04-30",
      amount: 300,
    });

    expect(
      await getDeductionForPeriod("e1", "2026-04-01", "2026-04-30"),
    ).toMatchObject({ amount: 300 });
    expect(
      await getDeductionForPeriod("e1", "2026-04-01", "2026-04-15"),
    ).toBeNull();
  });

  it("scopes deductions to one employee", async () => {
    await saveDeduction({
      employeeId: "e1",
      periodFrom: "2026-04-01",
      periodTo: "2026-04-30",
      amount: 300,
    });
    await saveDeduction({
      employeeId: "e2",
      periodFrom: "2026-04-01",
      periodTo: "2026-04-30",
      amount: 700,
    });

    expect(await getDeductionsByEmployee("e1")).toHaveLength(1);
  });
});

describe("sundayCategoryService", () => {
  it("assigns an id and createdAt, then lists categories sorted by name", async () => {
    await saveSundayCategory({ name: "Zeta", mode: "threshold", requiredPresent: 12, earnedSundays: 2 });
    const alpha = await saveSundayCategory({
      name: "Alpha",
      mode: "step",
      everyPresentDays: 6,
      earnedPerStep: 1,
    });

    expect(alpha.id).toBeTruthy();
    expect(alpha.createdAt).toBe(new Date().toISOString().slice(0, 10));
    expect((await getSundayCategories()).map((c) => c.name)).toEqual(["Alpha", "Zeta"]);
    expect(await getSundayCategory(alpha.id)).toMatchObject({ name: "Alpha" });

    await deleteSundayCategory(alpha.id);
    expect(await getSundayCategories()).toHaveLength(1);
  });

  it("falls back to the default rule when no category is assigned", () => {
    expect(resolveSundayCategoryRule(undefined)).toEqual(DEFAULT_SUNDAY_CATEGORY_RULE);
    expect(resolveSundayCategoryRule(null)).toEqual(DEFAULT_SUNDAY_CATEGORY_RULE);
  });

  it("uses a fully configured threshold or step category as-is", () => {
    expect(
      resolveSundayCategoryRule({ mode: "threshold", requiredPresent: 10, earnedSundays: 1 }),
    ).toEqual({ mode: "threshold", requiredPresent: 10, earnedSundays: 1 });
    expect(
      resolveSundayCategoryRule({ mode: "step", everyPresentDays: 6, earnedPerStep: 0.5 }),
    ).toEqual({ mode: "step", everyPresentDays: 6, earnedPerStep: 0.5 });
  });

  // Bug 8: an explicit 0 was indistinguishable from "not configured", so a
  // category meaning "this group earns no Sundays" silently paid the default.
  it("honours an explicit zero instead of substituting the default rule", () => {
    expect(
      resolveSundayCategoryRule({ mode: "threshold", requiredPresent: 12, earnedSundays: 0 }),
    ).toEqual({ mode: "threshold", requiredPresent: 12, earnedSundays: 0 });
    expect(
      resolveSundayCategoryRule({ mode: "step", everyPresentDays: 6, earnedPerStep: 0 }),
    ).toEqual({ mode: "step", everyPresentDays: 6, earnedPerStep: 0 });
  });

  it("still falls back to the default when a field is genuinely unset", () => {
    expect(resolveSundayCategoryRule({ mode: "threshold", requiredPresent: 12 })).toEqual(
      DEFAULT_SUNDAY_CATEGORY_RULE,
    );
    expect(resolveSundayCategoryRule({ mode: "step", earnedPerStep: 1 })).toEqual(
      DEFAULT_SUNDAY_CATEGORY_RULE,
    );
  });

  it("clamps negative configured values to zero rather than defaulting", () => {
    expect(
      resolveSundayCategoryRule({ mode: "threshold", requiredPresent: 12, earnedSundays: -3 }),
    ).toEqual({ mode: "threshold", requiredPresent: 12, earnedSundays: 0 });
  });
});

describe("factoryHolidayService", () => {
  it("assigns an id, finds by date, and deletes", async () => {
    const saved = await saveHoliday({ date: "2026-04-14", name: "Ambedkar Jayanti" });

    expect(saved.id).toBeTruthy();
    expect(await getHolidayByDate("2026-04-14")).toMatchObject({ name: "Ambedkar Jayanti" });
    expect(await getAllHolidays()).toHaveLength(1);

    await deleteHoliday(saved.id as string);
    expect(await getHolidayByDate("2026-04-14")).toBeNull();
  });

  it("returns holidays inside an inclusive range only", async () => {
    await saveHoliday({ date: "2026-03-31", name: "before" });
    await saveHoliday({ date: "2026-04-01", name: "edge-from" });
    await saveHoliday({ date: "2026-04-30", name: "edge-to" });
    await saveHoliday({ date: "2026-05-01", name: "after" });

    const rows = await getHolidaysInRange("2026-04-01", "2026-04-30");
    expect(rows.map((h) => h.name).sort()).toEqual(["edge-from", "edge-to"]);
  });
});
