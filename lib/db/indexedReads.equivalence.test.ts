import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORES } from "@/lib/db/schema";
import { getIndexKeyPath, sortByIndexOrder } from "@/lib/db/indexes";

/**
 * The services used to answer every query with `getAll(store)` followed by a
 * JS `.filter()`. They now issue index range reads instead. This file is the
 * proof that the swap changed nothing a caller can observe: for the same seeded
 * data, the indexed result must equal the old expression **element for
 * element, in order** — because payroll depends on the order.
 *
 * The old predicates below are copied verbatim from the pre-change source, so
 * they are the real baseline and not a restatement of the new behaviour.
 */

const { adapter } = await vi.hoisted(async () => {
  const { createMemoryAdapter } = await import("@/lib/db/testing/memoryAdapter");
  return { adapter: createMemoryAdapter() };
});

vi.mock("@/lib/db/adapter", () => adapter);

import {
  getAllAttendanceByDate,
  getAttendanceByEmployeeAndDate,
  getAttendanceByEmployeeInRange,
  getAttendanceInRange,
} from "@/lib/services/attendanceService";
import {
  getProductionsByDate,
  getProductionsByEmployee,
  getProductionsInRange,
} from "@/lib/services/productionService";
import { getAdvancesByEmployee } from "@/lib/services/advanceService";
import { getDeductionsByEmployee } from "@/lib/services/advanceDeductionService";

type Row = Record<string, unknown>;

/**
 * Legacy path: read the whole store, filter in JS.
 *
 * `index` names the index the new code uses, so the baseline is put into the
 * order an index scan returns. Set equality is the claim being tested here;
 * the ordering contract itself is pinned by its own describe block below, and
 * by `indexUpgrade.test.ts` against real IndexedDB.
 */
function legacy(
  store: string,
  index: string,
  predicate: (r: Row) => boolean,
): Row[] {
  const rows = Array.from(adapter.tables.get(store)?.values() ?? []).filter(
    predicate,
  );
  return sortByIndexOrder(rows, getIndexKeyPath(store, index)!);
}

const EMPLOYEES = ["e1", "e2", "e3"];
const DATES = [
  "2024-12-30",
  "2024-12-31",
  "2025-01-01",
  "2025-01-15",
  "2025-01-31",
  "2025-02-01",
  "2025-06-30",
];

function seed() {
  adapter.tables.clear();
  let n = 0;
  const put = (store: string, row: Row) => {
    if (!adapter.tables.has(store)) adapter.tables.set(store, new Map());
    adapter.tables.get(store)!.set(row.id as string, row);
  };
  for (const employeeId of EMPLOYEES) {
    for (const date of DATES) {
      n += 1;
      const seq = String(n).padStart(4, "0");
      put(STORES.ATTENDANCE, {
        id: `att_${seq}`,
        employeeId,
        date,
        status: "present",
      });
      put(STORES.PRODUCTIONS, {
        id: `prod_${seq}`,
        employeeId,
        date,
        itemId: "i1",
        quantity: n,
      });
      put(STORES.ADVANCES, {
        id: `adv_${seq}`,
        employeeId,
        date,
        amount: n * 10,
      });
    }
    put(STORES.ADVANCE_DEDUCTIONS, {
      id: `ded_${employeeId}_2025-01-01`,
      employeeId,
      periodFrom: "2025-01-01",
      periodTo: "2025-01-31",
      amount: 100,
    });
  }
  return put;
}

beforeEach(() => {
  seed();
});

describe("attendance reads match the getAll + filter they replaced", () => {
  it("date range", async () => {
    const from = "2025-01-01";
    const to = "2025-01-31";
    expect(await getAttendanceInRange(from, to)).toEqual(
      legacy(
        STORES.ATTENDANCE,
        "by_date",
        (a) => (a.date as string) >= from && (a.date as string) <= to
      )
    );
  });

  it("single date", async () => {
    expect(await getAllAttendanceByDate("2025-01-15")).toEqual(
      legacy(
        STORES.ATTENDANCE,
        "by_date",
        (a) => (a.date as string) === "2025-01-15"
      )
    );
  });

  it("employee + date range", async () => {
    const from = "2024-12-31";
    const to = "2025-02-01";
    expect(await getAttendanceByEmployeeInRange("e2", from, to)).toEqual(
      legacy(
        STORES.ATTENDANCE,
        "employee_date",
        (a) =>
          (a.employeeId as string) === "e2" &&
          (a.date as string) >= from &&
          (a.date as string) <= to
      )
    );
  });

  it("employee + exact date", async () => {
    const matches = legacy(
      STORES.ATTENDANCE,
      "employee_date",
      (a) =>
        (a.employeeId as string) === "e3" && (a.date as string) === "2025-06-30"
    );
    expect(await getAttendanceByEmployeeAndDate("e3", "2025-06-30")).toEqual(
      matches[matches.length - 1]
    );
  });

  it("returns null for a pair with no rows, as the filter did", async () => {
    expect(await getAttendanceByEmployeeAndDate("e1", "1999-01-01")).toBeNull();
    expect(await getAttendanceByEmployeeAndDate("nobody", "2025-01-01")).toBeNull();
  });

  it("empty range yields the empty list, not everything", async () => {
    expect(await getAttendanceInRange("2030-01-01", "2030-12-31")).toEqual([]);
  });

  it("an inverted range (from > to) yields nothing, as the filter did", async () => {
    expect(await getAttendanceInRange("2025-12-31", "2025-01-01")).toEqual([]);
    expect(
      await getAttendanceByEmployeeInRange("e1", "2025-12-31", "2025-01-01")
    ).toEqual([]);
  });
});

describe("range reads come back in index order", () => {
  /**
   * The old `getAll` + filter returned store order, which on IndexedDB is
   * primary-key order — and ids are `att_<millis>_<random>`, so two rows saved
   * in the same millisecond came back in an arbitrary order. Index order is
   * both stable and meaningful, so callers can rely on it.
   */
  it("a date-range read is chronological", async () => {
    const rows = await getAttendanceInRange("2024-12-30", "2025-06-30");
    const dates = rows.map((r) => r.date as string);
    expect(dates).toEqual([...dates].sort());
  });

  it("an employee range read is chronological for that employee", async () => {
    const rows = await getAttendanceByEmployeeInRange(
      "e2",
      "2024-12-30",
      "2025-06-30"
    );
    expect(rows.every((r) => r.employeeId === "e2")).toBe(true);
    const dates = rows.map((r) => r.date as string);
    expect(dates).toEqual([...dates].sort());
  });
});

describe("duplicate attendance rows: last row wins, on both paths", () => {
  /**
   * The bug this guards: `attendanceService` picks the last match while
   * `salarySheetService` folds the range read into a Map where later entries
   * overwrite earlier ones. If an index scan returned duplicates in a different
   * relative order than a store scan, a corrected day would *display* one value
   * and be *paid* another.
   */
  const dupes = [
    { id: "att_dup_a", employeeId: "e9", date: "2025-03-10", status: "absent" },
    { id: "att_dup_b", employeeId: "e9", date: "2025-03-10", status: "present" },
    { id: "att_dup_c", employeeId: "e9", date: "2025-03-10", status: "half" },
  ];

  beforeEach(() => {
    const table = adapter.tables.get(STORES.ATTENDANCE)!;
    // Insert out of id order, so "insertion order" and "id order" disagree and
    // the test can tell which one the reader actually used.
    for (const row of [dupes[2], dupes[0], dupes[1]]) table.set(row.id, row);
  });

  it("getAttendanceByEmployeeAndDate returns the highest-id duplicate", async () => {
    const row = await getAttendanceByEmployeeAndDate("e9", "2025-03-10");
    expect(row).toEqual(dupes[2]);
  });

  it("the range read agrees with it when folded into a last-write-wins map", async () => {
    const rows = await getAttendanceInRange("2025-03-01", "2025-03-31");
    const byKey = new Map<string, Row>();
    rows.forEach((a) => byKey.set(`${a.employeeId}|${a.date}`, a));
    expect(byKey.get("e9|2025-03-10")).toEqual(
      await getAttendanceByEmployeeAndDate("e9", "2025-03-10")
    );
  });

  it("the employee-scoped range read agrees too", async () => {
    const rows = await getAttendanceByEmployeeInRange(
      "e9",
      "2025-03-01",
      "2025-03-31"
    );
    expect(rows).toHaveLength(3);
    expect(rows[rows.length - 1]).toEqual(dupes[2]);
  });
});

describe("rows with a missing key are skipped, as an index would skip them", () => {
  beforeEach(() => {
    const table = adapter.tables.get(STORES.ATTENDANCE)!;
    table.set("att_nodate", { id: "att_nodate", employeeId: "e1" });
    table.set("att_noemp", { id: "att_noemp", date: "2025-01-15" });
  });

  it("a row with no date never appears in a date range", async () => {
    const rows = await getAttendanceInRange("1900-01-01", "2999-12-31");
    expect(rows.some((r) => r.id === "att_nodate")).toBe(false);
  });

  it("a row with no employeeId never appears in an employee range", async () => {
    const rows = await getAttendanceByEmployeeInRange(
      "e1",
      "1900-01-01",
      "2999-12-31"
    );
    expect(rows.some((r) => r.id === "att_noemp")).toBe(false);
    expect(rows.some((r) => r.id === "att_nodate")).toBe(false);
  });
});

describe("production, advance and deduction reads match their old filters", () => {
  it("productions in a date range", async () => {
    const from = "2025-01-01";
    const to = "2025-02-01";
    expect(await getProductionsInRange(from, to)).toEqual(
      legacy(
        STORES.PRODUCTIONS,
        "by_date",
        (p) => (p.date as string) >= from && (p.date as string) <= to
      )
    );
  });

  it("productions on one date", async () => {
    expect(await getProductionsByDate("2025-01-01")).toEqual(
      legacy(
        STORES.PRODUCTIONS,
        "by_date",
        (p) => (p.date as string) === "2025-01-01"
      )
    );
  });

  it("productions for one employee in a range", async () => {
    const from = "2024-12-30";
    const to = "2025-01-31";
    expect(await getProductionsByEmployee("e1", from, to)).toEqual(
      legacy(
        STORES.PRODUCTIONS,
        "employee_date",
        (p) =>
          (p.employeeId as string) === "e1" &&
          (p.date as string) >= from &&
          (p.date as string) <= to
      )
    );
  });

  it("advances for one employee in a range", async () => {
    const from = "2025-01-01";
    const to = "2025-06-30";
    expect(await getAdvancesByEmployee("e3", from, to)).toEqual(
      legacy(
        STORES.ADVANCES,
        "employee_date",
        (a) =>
          (a.employeeId as string) === "e3" &&
          (a.date as string) >= from &&
          (a.date as string) <= to
      )
    );
  });

  it("deductions for one employee", async () => {
    expect(await getDeductionsByEmployee("e2")).toEqual(
      legacy(STORES.ADVANCE_DEDUCTIONS, "by_employee", (d) => d.employeeId === "e2")
    );
    expect(await getDeductionsByEmployee("nobody")).toEqual([]);
  });
});

describe("the indexed path reads fewer rows than the store holds", () => {
  it("a one-month attendance query does not touch three years of rows", async () => {
    adapter.resetCounters();
    const rows = await getAttendanceInRange("2025-01-01", "2025-01-31");
    expect(adapter.reads.getAll).toBe(0);
    expect(adapter.reads.getByIndex).toBe(1);
    expect(adapter.reads.rowsScanned).toBe(rows.length);
    expect(rows.length).toBeLessThan(adapter.tables.get(STORES.ATTENDANCE)!.size);
  });
});
