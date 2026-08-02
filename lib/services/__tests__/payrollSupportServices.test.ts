import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterisation tests for the small services around the payroll engine that
 * no test imported: the persisted payroll record, shifts, the audit-log name
 * resolver, the retention-purge log entry, and the legacy→stock item map.
 *
 * All of them run against the in-memory adapter, so the audit rows they write
 * are asserted as rows, not as spy calls.
 */
const { adapter } = await vi.hoisted(async () => {
  const { createMemoryAdapter } = await import("@/lib/db/testing/memoryAdapter");
  return { adapter: createMemoryAdapter() };
});

vi.mock("@/lib/db/adapter", () => adapter);

import {
  getSalaryRecords,
  getSalaryRecordsByEmpNameAndMonth,
  getSalaryRecordsByEmployee,
  saveSalaryRecord,
  saveSalaryRecords,
} from "../salaryRecordService";
import { deleteShift, getShift, getShifts, saveShift } from "../shiftService";
import {
  employeeName,
  inventoryItemName,
  itemName,
  nameOnRow,
  plural,
} from "../auditNames";
import { recordPurge } from "../purgeAudit";
import { migrateLegacyItems } from "../inventoryMigration";
import { STORES, METADATA_STORE } from "@/lib/db/schema";

/** Audit entries are written fire-and-forget; let the microtask queue drain. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

async function auditRows() {
  await flush();
  return adapter.getAll(STORES.AUDIT_LOG);
}

async function seed(store: string, rows: Record<string, unknown>[]) {
  for (const row of rows) await adapter.put(store, row);
}

beforeEach(() => {
  adapter.tables.clear();
});

describe("salaryRecordService", () => {
  const record = () => ({
    empName: "Ram",
    designation: "Operator",
    month: "2026-04",
    shiftType: "General",
    salary: 15000,
    dailyWage: 500,
    ratePerHour: 62.5,
    totalDaysWorking: 26,
    paidSundays: 4,
    holidays: 1,
    advancePaid: 2000,
    amount: 13000,
    employeeId: "emp_1",
  });

  it("mints an id, persists every payroll field, and audits the save", async () => {
    const saved = await saveSalaryRecord(record());

    expect(String(saved.id)).toMatch(/^sal_/);
    const all = await getSalaryRecords();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      empName: "Ram",
      month: "2026-04",
      amount: 13000,
      advancePaid: 2000,
      dailyWage: 500,
      paidSundays: 4,
    });

    const entries = await auditRows();
    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toBe(
      "Salary for Ram for 2026-04 was saved as 13000",
    );
  });

  it("overwrites in place when the id is supplied and diffs the changed fields", async () => {
    await saveSalaryRecord({ ...record(), id: "sal_fixed" });
    await saveSalaryRecord({ ...record(), id: "sal_fixed", amount: 12000 });

    const all = await getSalaryRecords();
    expect(all).toHaveLength(1);
    expect(all[0].amount).toBe(12000);

    const entries = await auditRows();
    expect(entries).toHaveLength(2);
    const update = entries.find((e) => (e.summary as string).includes("12000"))!;
    expect(update.diff).toEqual([
      { field: "amount", before: 13000, after: 12000 },
    ]);
  });

  it("filters by employee id and by (empName, month)", async () => {
    await saveSalaryRecord({ ...record(), id: "s1" });
    await saveSalaryRecord({
      ...record(),
      id: "s2",
      employeeId: "emp_2",
      empName: "Shyam",
    });
    await saveSalaryRecord({ ...record(), id: "s3", month: "2026-05" });

    expect((await getSalaryRecordsByEmployee("emp_1")).map((r) => r.id)).toEqual([
      "s1",
      "s3",
    ]);
    expect(
      (await getSalaryRecordsByEmpNameAndMonth("Ram", "2026-04")).map((r) => r.id),
    ).toEqual(["s1"]);
    expect(await getSalaryRecordsByEmpNameAndMonth("Ram", "2026-12")).toEqual([]);
  });

  it("writes one audit entry with a count for a whole month, not one per employee", async () => {
    await saveSalaryRecords([
      { ...record(), empName: "A" },
      { ...record(), empName: "B" },
      { ...record(), empName: "C" },
    ]);

    expect(await getSalaryRecords()).toHaveLength(3);
    const entries = await auditRows();
    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toBe(
      "Salary was saved for 3 employees for 2026-04",
    );
    expect(entries[0].diff).toEqual({ count: 3, month: "2026-04" });
  });

  it("writes nothing at all for an empty batch", async () => {
    await saveSalaryRecords([]);
    expect(await getSalaryRecords()).toEqual([]);
    expect(await auditRows()).toEqual([]);
  });

  // BEHAVIOUR (salaryRecordService.ts:100): the batch entry takes the month
  // from the FIRST record only. A batch spanning two months is logged under
  // one of them.
  it("labels a mixed-month batch with the first record's month", async () => {
    await saveSalaryRecords([
      { ...record(), month: "2026-04" },
      { ...record(), month: "2026-05" },
    ]);

    const entries = await auditRows();
    expect(entries[0].summary).toContain("2026-04");
    expect(entries[0].summary).not.toContain("2026-05");
  });
});

describe("shiftService", () => {
  it("creates a shift with a generated id and a create audit entry", async () => {
    const saved = await saveShift({
      name: "Night",
      startTime: "20:00",
      endTime: "04:00",
      hoursPerDay: 8,
    });

    expect(String(saved.id)).toMatch(/^shift_/);
    expect(await getShift(saved.id as string)).toMatchObject({ name: "Night" });
    expect(await getShifts()).toHaveLength(1);

    const entries = await auditRows();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("shift.create");
    expect(entries[0].summary).toBe("Timing Night was created");
  });

  it("audits an edit as an update and diffs only the changed fields", async () => {
    await saveShift({ id: "s1", name: "General", hoursPerDay: 8 });
    await saveShift({ id: "s1", name: "General", hoursPerDay: 9 });

    const entries = await auditRows();
    const update = entries.find((e) => e.action === "shift.update")!;
    expect(update.summary).toBe("Timing General was changed");
    expect(update.diff).toEqual([
      { field: "hoursPerDay", before: 8, after: 9 },
    ]);
    expect(await getShifts()).toHaveLength(1);
  });

  it("deletes a shift and names it in the log from the row it just removed", async () => {
    await saveShift({ id: "s1", name: "General", hoursPerDay: 8 });
    await deleteShift("s1");

    expect(await getShifts()).toEqual([]);
    expect(await getShift("s1")).toBeNull();
    const entries = await auditRows();
    const del = entries.find((e) => e.action === "shift.delete")!;
    expect(del.summary).toBe("Timing General was deleted");
  });

  it("falls back to a generic phrase rather than an id for an unnamed shift", async () => {
    await saveShift({ id: "s1", hoursPerDay: 8 });
    await deleteShift("no_such_shift");

    const summaries = (await auditRows()).map((e) => e.summary as string);
    expect(summaries).toContain("Timing with no name was created");
    expect(summaries).toContain("Timing with no name was deleted");
    expect(summaries.join(" ")).not.toContain("no_such_shift");
    expect(summaries.join(" ")).not.toContain("s1");
  });
});

describe("auditNames", () => {
  it("resolves an employee, a production item and a stock item by id", async () => {
    await seed(STORES.EMPLOYEES, [{ id: "emp_1", name: "Rakesh" }]);
    await seed(STORES.ITEMS, [{ id: "i1", name: "Hinge" }]);
    await seed(STORES.INVENTORY_ITEMS, [{ id: "inv1", name: "M8 Bolt", code: "B8" }]);

    expect(await employeeName("emp_1")).toBe("Rakesh");
    expect(await itemName("i1")).toBe("Hinge");
    expect(await inventoryItemName("inv1")).toBe("M8 Bolt");
  });

  it("prefers the stock item's name but falls back to its code", async () => {
    await seed(STORES.INVENTORY_ITEMS, [{ id: "inv1", code: "B8" }]);
    expect(await inventoryItemName("inv1")).toBe("B8");
  });

  it("trims a padded name and never returns a whitespace-only one", async () => {
    await seed(STORES.EMPLOYEES, [
      { id: "emp_1", name: "  Rakesh  " },
      { id: "emp_2", name: "   " },
    ]);

    expect(await employeeName("emp_1")).toBe("Rakesh");
    expect(await employeeName("emp_2")).toBe("an employee");
  });

  it("never leaks a raw id — an unresolvable row yields a generic word", async () => {
    expect(await employeeName("emp_deleted")).toBe("an employee");
    expect(await itemName("i_deleted")).toBe("an item");
    expect(await inventoryItemName("inv_deleted")).toBe("a stock item");
    expect(await employeeName(null)).toBe("an employee");
    expect(await employeeName(undefined)).toBe("an employee");
    expect(await employeeName("")).toBe("an employee");
  });

  it("ignores a non-string name rather than stringifying it", async () => {
    await seed(STORES.EMPLOYEES, [{ id: "emp_1", name: { first: "Ram" } }]);
    expect(await employeeName("emp_1")).toBe("an employee");
  });

  it("never throws when the read itself fails", async () => {
    const boom = vi.spyOn(adapter, "get").mockRejectedValueOnce(new Error("db down"));
    await expect(employeeName("emp_1")).resolves.toBe("an employee");
    boom.mockRestore();
  });

  it("nameOnRow reads name, then empName, then code, and never an id", () => {
    expect(nameOnRow({ name: "Hinge" }, "fallback")).toBe("Hinge");
    expect(nameOnRow({ id: "x", empName: "Ram" }, "fallback")).toBe("Ram");
    expect(nameOnRow({ id: "x", code: "B8" }, "fallback")).toBe("B8");
    expect(nameOnRow({ name: "  Ram  " }, "fallback")).toBe("Ram");
    expect(nameOnRow({ id: "emp_1a2b" }, "fallback")).toBe("fallback");
    expect(nameOnRow({ name: "   " }, "fallback")).toBe("fallback");
    expect(nameOnRow(null, "fallback")).toBe("fallback");
    expect(nameOnRow(undefined, "fallback")).toBe("fallback");
  });

  it("plural switches only on exactly one", () => {
    expect(plural(0, "entry", "entries")).toBe("0 entries");
    expect(plural(1, "entry", "entries")).toBe("1 entry");
    expect(plural(2, "entry", "entries")).toBe("2 entries");
  });
});

describe("purgeAudit", () => {
  it("logs the already-rendered summary and the full outcome as the diff", async () => {
    const outcome = {
      cutoff: "2026-01-01",
      workEntriesRemoved: 12,
      advancesRemoved: 0,
      workEntriesChosen: true,
      advancesChosen: false,
    };

    recordPurge("12 work entries before 1 Jan 2026 were deleted", outcome);

    const entries = await auditRows();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("data.purge");
    expect(entries[0].entity).toBe("database");
    expect(entries[0].entityId).toBeNull();
    expect(entries[0].summary).toBe(
      "12 work entries before 1 Jan 2026 were deleted",
    );
    expect(entries[0].diff).toEqual(outcome);
  });

  it("copies the outcome, so a later mutation cannot rewrite the log entry", async () => {
    const outcome = {
      cutoff: "2026-01-01",
      workEntriesRemoved: 1,
      advancesRemoved: 1,
      workEntriesChosen: true,
      advancesChosen: true,
    };
    recordPurge("1 work entry and 1 advance were deleted", outcome);
    await flush();
    outcome.workEntriesRemoved = 999;

    const entries = await auditRows();
    expect(
      (entries[0].diff as { workEntriesRemoved: number }).workEntriesRemoved,
    ).toBe(1);
  });
});

describe("inventoryMigration", () => {
  async function readMap(): Promise<Record<string, string>> {
    const row = await adapter.get(METADATA_STORE, "legacy_inventory_item_map");
    return (row?.map ?? {}) as Record<string, string>;
  }

  it("maps a legacy item to the stock item with the same code", async () => {
    await seed(STORES.ITEMS, [{ id: "L1", code: "B-8", name: "Bolt", rate: 12 }]);
    await seed(STORES.INVENTORY_ITEMS, [
      { id: "INV1", code: "b8", name: "Something else" },
      { id: "INV2", code: "Z9", name: "Bolt" },
    ]);

    const report = await migrateLegacyItems();

    // Code wins over name: normalising "B-8" and "b8" makes them the same key.
    expect(report).toEqual({
      migrated: 1,
      alreadyMapped: 0,
      unmatched: [],
      ambiguous: [],
    });
    expect(await readMap()).toEqual({ L1: "INV1" });
  });

  it("falls back to the name when the legacy row has no code", async () => {
    await seed(STORES.ITEMS, [{ id: "L1", name: "Hex Nut" }]);
    await seed(STORES.INVENTORY_ITEMS, [
      { id: "INV1", code: "N1", name: "hex-nut" },
    ]);

    expect((await migrateLegacyItems()).migrated).toBe(1);
    expect(await readMap()).toEqual({ L1: "INV1" });
  });

  it("refuses to guess: two stock items sharing a code are reported ambiguous, not mapped", async () => {
    await seed(STORES.ITEMS, [{ id: "L1", code: "B8", name: "Bolt" }]);
    await seed(STORES.INVENTORY_ITEMS, [
      { id: "INV1", code: "B8", name: "Bolt A" },
      { id: "INV2", code: "b-8", name: "Bolt B" },
    ]);

    const report = await migrateLegacyItems();

    expect(report.ambiguous).toEqual(["L1"]);
    expect(report.migrated).toBe(0);
    expect(await readMap()).toEqual({});
  });

  it("reports a legacy item with no counterpart as unmatched and maps nothing", async () => {
    await seed(STORES.ITEMS, [
      { id: "L1", code: "B8", name: "Bolt" },
      { id: "L2", code: "ZZ", name: "Ghost" },
    ]);
    await seed(STORES.INVENTORY_ITEMS, [{ id: "INV1", code: "B8", name: "Bolt" }]);

    const report = await migrateLegacyItems();

    expect(report.migrated).toBe(1);
    expect(report.unmatched).toEqual(["L2"]);
    expect(await readMap()).toEqual({ L1: "INV1" });
  });

  it("is idempotent: a second run re-counts the pair as already mapped", async () => {
    await seed(STORES.ITEMS, [{ id: "L1", code: "B8", name: "Bolt", rate: 12 }]);
    await seed(STORES.INVENTORY_ITEMS, [{ id: "INV1", code: "B8", name: "Bolt" }]);

    await migrateLegacyItems();
    const second = await migrateLegacyItems();

    expect(second.migrated).toBe(0);
    expect(second.alreadyMapped).toBe(1);
    expect(await readMap()).toEqual({ L1: "INV1" });
  });

  it("carries the legacy rate onto an unpriced stock item but never overwrites one", async () => {
    await seed(STORES.ITEMS, [
      { id: "L1", code: "A", name: "Unpriced target", rate: 12 },
      { id: "L2", code: "B", name: "Priced target", rate: 99 },
    ]);
    await seed(STORES.INVENTORY_ITEMS, [
      { id: "INV1", code: "A", name: "Unpriced target" },
      { id: "INV2", code: "B", name: "Priced target", rate: 7 },
    ]);

    await migrateLegacyItems();

    const rows = await adapter.getAll(STORES.INVENTORY_ITEMS);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.INV1.rate).toBe(12);
    expect(byId.INV2.rate).toBe(7);
  });

  it("writes one audit entry with counts, and none at all when there was nothing to do", async () => {
    await migrateLegacyItems();
    expect(await auditRows()).toEqual([]);

    await seed(STORES.ITEMS, [
      { id: "L1", code: "B8", name: "Bolt" },
      { id: "L2", code: "ZZ", name: "Ghost" },
    ]);
    await seed(STORES.INVENTORY_ITEMS, [{ id: "INV1", code: "B8", name: "Bolt" }]);
    await migrateLegacyItems();

    const entries = await auditRows();
    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toBe(
      "Old items were matched to the stock list: 1 item was linked, 1 had no match and 0 were unclear",
    );
    expect(entries[0].diff).toEqual({
      migrated: 1,
      alreadyMapped: 0,
      unmatched: 1,
      ambiguous: 0,
    });
  });

  it("skips a legacy row with no id instead of writing an empty map key", async () => {
    await seed(STORES.ITEMS, [{ id: "", code: "B8", name: "Bolt" }]);
    await seed(STORES.INVENTORY_ITEMS, [{ id: "INV1", code: "B8", name: "Bolt" }]);

    const report = await migrateLegacyItems();

    expect(report.migrated).toBe(0);
    expect(await readMap()).toEqual({});
  });
});
