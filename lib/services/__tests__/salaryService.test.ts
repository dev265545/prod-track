import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterisation tests for the piece-rate pay path.
 *
 * `calculateSalary` is what decides what a production worker is actually paid:
 * gross = Σ(quantity × item rate), minus the advances taken in the period. It
 * had no test at all. These tests pin what the code does TODAY — including the
 * places where today's behaviour looks wrong (each is flagged with a BEHAVIOUR
 * comment) — so a refactor cannot move money without a test going red.
 *
 * Everything runs against the in-memory adapter, so the real services
 * underneath (productions index range, advances, items) are exercised rather
 * than stubbed.
 */
const { adapter } = await vi.hoisted(async () => {
  const { createMemoryAdapter } = await import("@/lib/db/testing/memoryAdapter");
  return { adapter: createMemoryAdapter() };
});

vi.mock("@/lib/db/adapter", () => adapter);

import {
  assertMonthIndex,
  buildPrintableAttendanceSalaryRangeHtml,
  calculateSalary,
  calculateSalaryForPeriod,
  getPrintableAttendanceSalaryRangeHtml,
  getPrintableMonthlyAttendanceSheetHtml,
  getPrintableSalaryHtml,
} from "../salaryService";
import { STORES } from "@/lib/db/schema";
import { currency } from "@/lib/utils/formatter";

const EMP = "emp_1";

/** Month numbers in this codebase are 0-based, as in `Date`. */
const APRIL = 3;

async function seed(store: string, rows: Record<string, unknown>[]) {
  for (const row of rows) await adapter.put(store, row);
}

function seedItem(id: string, name: string, rate: number | null) {
  return { id, name, ...(rate === null ? {} : { rate }) };
}

let prodSeq = 0;
function prod(
  itemId: string,
  date: string,
  quantity: number | undefined,
  shift: "day" | "night" = "day",
  employeeId = EMP,
) {
  prodSeq += 1;
  return {
    id: `p_${prodSeq}`,
    employeeId,
    itemId,
    date,
    shift,
    ...(quantity === undefined ? {} : { quantity }),
  };
}

beforeEach(() => {
  adapter.tables.clear();
  prodSeq = 0;
});

describe("calculateSalary — the money", () => {
  it("returns an all-zero, empty result when there is no production at all", async () => {
    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");

    expect(result).toEqual({
      gross: 0,
      advance: 0,
      final: 0,
      productions: [],
      advances: [],
      unpricedCount: 0,
    });
  });

  it("multiplies quantity by the item rate for a single item", async () => {
    await seed(STORES.ITEMS, [seedItem("i1", "Hinge", 12.5)]);
    await seed(STORES.PRODUCTIONS, [prod("i1", "2026-04-10", 8)]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");

    expect(result.gross).toBe(100);
    expect(result.final).toBe(100);
    expect(result.productions).toEqual([
      {
        date: "2026-04-10",
        itemName: "Hinge",
        quantity: 8,
        shift: "Day",
        rate: 12.5,
        value: 100,
        unpriced: false,
      },
    ]);
  });

  it("sums several items at different rates and labels the night shift", async () => {
    await seed(STORES.ITEMS, [
      seedItem("i1", "Hinge", 12.5),
      seedItem("i2", "Bracket", 3),
      seedItem("i3", "Washer", 0.25),
    ]);
    await seed(STORES.PRODUCTIONS, [
      prod("i1", "2026-04-10", 8), // 100
      prod("i2", "2026-04-11", 10, "night"), // 30
      prod("i3", "2026-04-12", 40), // 10
    ]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");

    expect(result.gross).toBe(140);
    expect(result.productions.map((r) => r.value)).toEqual([100, 30, 10]);
    expect(result.productions.map((r) => r.shift)).toEqual([
      "Day",
      "Night",
      "Day",
    ]);
  });

  it("only counts this employee's production", async () => {
    await seed(STORES.ITEMS, [seedItem("i1", "Hinge", 10)]);
    await seed(STORES.PRODUCTIONS, [
      prod("i1", "2026-04-10", 5),
      prod("i1", "2026-04-10", 999, "day", "emp_other"),
    ]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");
    expect(result.gross).toBe(50);
    expect(result.productions).toHaveLength(1);
  });

  // A production pointing at a deleted / unknown item can no longer be priced:
  // it earns nothing (as before — gross is unchanged), but it now says so
  // (`rate: null`, `unpriced: true`, counted in `unpricedCount`) instead of
  // reading as a decision to pay ₹0, and it never prints the raw item id.
  it("cannot price an unknown item id, and names it without leaking the id", async () => {
    await seed(STORES.ITEMS, [seedItem("i1", "Hinge", 10)]);
    await seed(STORES.PRODUCTIONS, [
      prod("i1", "2026-04-10", 5),
      prod("ghost_item_id", "2026-04-11", 100),
    ]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");

    expect(result.gross).toBe(50);
    const ghost = result.productions.find((r) => r.quantity === 100);
    expect(ghost).toBeDefined();
    expect(ghost!.rate).toBeNull();
    expect(ghost!.value).toBe(0);
    expect(ghost!.unpriced).toBe(true);
    expect(ghost!.itemName).toBe("Unknown item");
    expect(ghost!.itemName).not.toContain("ghost");
    expect(result.unpricedCount).toBe(1);
  });

  it("treats a quantity of 0 and a missing quantity identically — both earn nothing", async () => {
    await seed(STORES.ITEMS, [seedItem("i1", "Hinge", 10)]);
    await seed(STORES.PRODUCTIONS, [
      prod("i1", "2026-04-10", 0),
      prod("i1", "2026-04-11", undefined),
      prod("i1", "2026-04-12", 7), // guards against a 0-vs-0 vacuous pass
    ]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");

    expect(result.gross).toBe(70);
    expect(result.productions.map((r) => r.quantity)).toEqual([0, 0, 7]);
    expect(result.productions.map((r) => r.value)).toEqual([0, 0, 70]);
  });

  // A rate of 0 and an unset rate are the same fact everywhere else in the app
  // — `productionCatalog.toRate` accepts only a rate above 0, and the Items
  // screen refuses to store 0 so that blank stays the one way to say "not
  // priced". Both are therefore *unpriced* here: still worth nothing (the pay
  // is unchanged), but flagged rather than silently paid as free work.
  it("treats a rate of 0 and an unset rate alike, as unpriced rather than free", async () => {
    await seed(STORES.ITEMS, [
      seedItem("i_zero", "Zero-rated", 0),
      seedItem("i_unset", "Unpriced", null),
      seedItem("i_paid", "Paid", 4),
    ]);
    await seed(STORES.PRODUCTIONS, [
      prod("i_zero", "2026-04-10", 10),
      prod("i_unset", "2026-04-11", 10),
      prod("i_paid", "2026-04-12", 10),
    ]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");

    expect(result.gross).toBe(40);
    const zero = result.productions.find((r) => r.itemName === "Zero-rated")!;
    const unset = result.productions.find((r) => r.itemName === "Unpriced")!;
    expect(zero.rate).toBeNull();
    expect(unset.rate).toBeNull();
    expect(zero.value).toBe(0);
    expect(unset.value).toBe(0);
    expect(zero.unpriced).toBe(true);
    expect(unset.unpriced).toBe(true);
    expect(result.unpricedCount).toBe(2);
    // and the priced one really did pay, so the two zeros above mean something
    expect(result.productions.find((r) => r.itemName === "Paid")!.value).toBe(40);
  });

  it("subtracts every advance in the period and lists them", async () => {
    await seed(STORES.ITEMS, [seedItem("i1", "Hinge", 10)]);
    await seed(STORES.PRODUCTIONS, [prod("i1", "2026-04-10", 100)]);
    await seed(STORES.ADVANCES, [
      { id: "a1", employeeId: EMP, date: "2026-04-05", amount: 200 },
      { id: "a2", employeeId: EMP, date: "2026-04-20", amount: 300 },
      { id: "a3", employeeId: "emp_other", date: "2026-04-20", amount: 999 },
    ]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");

    expect(result.gross).toBe(1000);
    expect(result.advance).toBe(500);
    expect(result.final).toBe(500);
    expect(result.advances).toEqual([
      { date: "2026-04-05", amount: 200 },
      { date: "2026-04-20", amount: 300 },
    ]);
  });

  it("treats an advance with a missing amount as 0", async () => {
    await seed(STORES.ADVANCES, [
      { id: "a1", employeeId: EMP, date: "2026-04-05" },
      { id: "a2", employeeId: EMP, date: "2026-04-06", amount: 150 },
    ]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");
    expect(result.advance).toBe(150);
    expect(result.advances[0].amount).toBe(0);
  });

  // BEHAVIOUR (salaryService.ts:161): `final` is NOT floored — an advance
  // larger than the gross yields a negative net. The printed payslip DOES floor
  // at 0 (line 199), so the number on screen and the number on paper disagree.
  it("lets `final` go negative when advances exceed gross (no floor at 0)", async () => {
    await seed(STORES.ITEMS, [seedItem("i1", "Hinge", 10)]);
    await seed(STORES.PRODUCTIONS, [prod("i1", "2026-04-10", 5)]); // gross 50
    await seed(STORES.ADVANCES, [
      { id: "a1", employeeId: EMP, date: "2026-04-05", amount: 200 },
    ]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");

    expect(result.gross).toBe(50);
    expect(result.advance).toBe(200);
    expect(result.final).toBe(-150);
  });

  // Money is rounded to 2dp at every point it is stored or totalled — the same
  // `round2` the salary-sheet engine uses — so binary error never reaches a
  // saved salary record or a printed figure, and `currency` can print the
  // stored number exactly.
  it("rounds to paise, so floating-point error never reaches gross", async () => {
    await seed(STORES.ITEMS, [
      seedItem("i1", "Penny", 0.1),
      seedItem("i2", "Twopence", 0.2),
    ]);
    await seed(STORES.PRODUCTIONS, [
      prod("i1", "2026-04-10", 1),
      prod("i2", "2026-04-11", 1),
    ]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");

    expect(result.gross).toBe(0.3);
    expect(result.final).toBe(0.3);
    // and it prints as the same value it stores, paise and all
    expect(currency(result.gross)).toBe("₹0.30");
  });

  it("includes productions exactly on fromDate and exactly on toDate, excludes just outside", async () => {
    await seed(STORES.ITEMS, [seedItem("i1", "Hinge", 1)]);
    await seed(STORES.PRODUCTIONS, [
      prod("i1", "2026-03-31", 1), // before
      prod("i1", "2026-04-01", 10), // exactly fromDate
      prod("i1", "2026-04-15", 100), // inside
      prod("i1", "2026-04-30", 1000), // exactly toDate
      prod("i1", "2026-05-01", 10000), // after
    ]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");

    expect(result.productions.map((r) => r.date)).toEqual([
      "2026-04-01",
      "2026-04-15",
      "2026-04-30",
    ]);
    expect(result.gross).toBe(1110);
  });

  it("includes advances exactly on the range boundaries", async () => {
    await seed(STORES.ADVANCES, [
      { id: "a0", employeeId: EMP, date: "2026-03-31", amount: 1 },
      { id: "a1", employeeId: EMP, date: "2026-04-01", amount: 10 },
      { id: "a2", employeeId: EMP, date: "2026-04-30", amount: 100 },
      { id: "a3", employeeId: EMP, date: "2026-05-01", amount: 1000 },
    ]);

    const result = await calculateSalary(EMP, "2026-04-01", "2026-04-30");
    expect(result.advance).toBe(110);
  });
});

describe("calculateSalaryForPeriod", () => {
  it("resolves the half-month period containing the date and pays only inside it", async () => {
    await seed(STORES.ITEMS, [seedItem("i1", "Hinge", 1)]);
    await seed(STORES.PRODUCTIONS, [
      prod("i1", "2026-04-03", 5),
      prod("i1", "2026-04-25", 7),
    ]);

    const first = await calculateSalaryForPeriod(EMP, "2026-04-05");
    const second = await calculateSalaryForPeriod(EMP, "2026-04-26");

    // The two halves partition the month: neither sees the other's work.
    expect(first.gross + second.gross).toBe(12);
    expect(first.gross).not.toBe(second.gross);
    expect(first.productions.map((r) => r.date)).toEqual(["2026-04-03"]);
    expect(second.productions.map((r) => r.date)).toEqual(["2026-04-25"]);
  });
});

// ---------------------------------------------------------------------------
// Print builders
// ---------------------------------------------------------------------------

const HOSTILE_NAME = `<script>alert('x')</script> R&D "Ram"`;
const HOSTILE_ITEM = `Nut & <b>Bolt</b> "10mm"`;

/** Everything between the single <style> tag of a printed document. */
function styleBlocks(html: string): string[] {
  return Array.from(html.matchAll(/<style>([\s\S]*?)<\/style>/g)).map(
    (m) => m[1],
  );
}

/**
 * A printed sheet that loses its styling is a wasted piece of paper: the target
 * is a system browser/native printer as old as Chrome 109, which supports none
 * of these.
 */
function expectChrome109SafeCss(html: string) {
  const blocks = styleBlocks(html);
  expect(blocks).toHaveLength(1);
  const css = blocks[0];
  expect(css.length).toBeGreaterThan(100);
  expect(css).not.toMatch(/color-mix\(/);
  expect(css).not.toMatch(/oklch\(/);
  expect(css).not.toMatch(/oklab\(/);
  // CSS nesting: a `&` or a bare nested `{` inside a rule block.
  expect(css).not.toMatch(/&/);
  expect(css).not.toMatch(/\{[^{}]*\{/);
  // the shared stylesheet, exactly once
  expect(css.split(".no-print{display:none!important}")).toHaveLength(2);
}

/** No placeholder garbage may reach paper. */
function expectNoGarbage(html: string) {
  expect(html).not.toMatch(/undefined/);
  expect(html).not.toMatch(/NaN/);
  expect(html).not.toMatch(/\[object Object\]/);
}

function expectEscaped(html: string) {
  expect(html).not.toMatch(/<script>/);
  expect(html).not.toMatch(/<b>Bolt<\/b>/);
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&amp;");
}

async function seedHostileEmployee() {
  await seed(STORES.EMPLOYEES, [
    {
      id: EMP,
      name: HOSTILE_NAME,
      monthlySalary: 15000,
      shiftId: "s1",
      isActive: true,
    },
  ]);
  await seed(STORES.SHIFTS, [
    { id: "s1", name: "General", hoursPerDay: 8 },
  ]);
}

describe("getPrintableSalaryHtml", () => {
  beforeEach(async () => {
    await seedHostileEmployee();
    await seed(STORES.ITEMS, [seedItem("i1", HOSTILE_ITEM, 12.5)]);
    await seed(STORES.PRODUCTIONS, [
      prod("i1", "2026-04-10", 8),
      prod("i1", "2026-04-11", 4, "night"),
    ]);
    await seed(STORES.ADVANCES, [
      { id: "a1", employeeId: EMP, date: "2026-04-05", amount: 200 },
    ]);
  });

  it("escapes a hostile employee and item name and emits a Chrome-109-safe sheet", async () => {
    const { html, employeeName, salary } = await getPrintableSalaryHtml(
      EMP,
      "2026-04-01",
      "2026-04-30",
    );

    expect(employeeName).toBe(HOSTILE_NAME);
    expect(salary.gross).toBe(150);
    expectEscaped(html);
    expectNoGarbage(html);
    expectChrome109SafeCss(html);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("Gross (Production):");
  });

  it("filters to one shift and totals only that shift's rows", async () => {
    const day = await getPrintableSalaryHtml(EMP, "2026-04-01", "2026-04-30", "day");
    const night = await getPrintableSalaryHtml(
      EMP,
      "2026-04-01",
      "2026-04-30",
      "night",
    );

    expect(day.html).toContain("Gross (Day):");
    expect(night.html).toContain("Gross (Night):");
    // Day = 8 × 12.5 = 100, Night = 4 × 12.5 = 50, together the full 150.
    expect(day.html).toContain("100");
    expect(night.html).toContain("50");
    // The Shift column only exists in the unfiltered document.
    expect(day.html).not.toContain(">Shift<");
    const both = await getPrintableSalaryHtml(EMP, "2026-04-01", "2026-04-30");
    expect(both.html).toContain(">Shift<");
    expectNoGarbage(day.html);
    expectNoGarbage(night.html);
  });

  // The printed net no longer floors at 0: it shows the same signed number
  // `calculateSalary().final` reports, plus a line in plain language saying
  // the advance overran the earnings and how much is still owed. Screen and
  // paper now say the same thing about the same worker.
  it("prints a negative net as owed money instead of flooring it to zero", async () => {
    await seed(STORES.ADVANCE_DEDUCTIONS, [
      {
        id: "d1",
        employeeId: EMP,
        periodFrom: "2026-04-01",
        periodTo: "2026-04-30",
        amount: 9999,
      },
    ]);

    const { html, salary } = await getPrintableSalaryHtml(
      EMP,
      "2026-04-01",
      "2026-04-30",
    );

    expect(salary.gross).toBe(150);
    // 150 earned, 9,999 cut: the shortfall is stated, not swallowed.
    expect(html).toContain("Net: -₹9,849");
    expect(html).toContain("Advances exceed earnings");
    expect(html).toContain("by ₹9,849");
    expect(html).toContain("this amount is still owed");
    expectNoGarbage(html);
  });

  // Work missing from the gross must be visible on the paper, the same rule
  // the Sunday caps and the day-pay cap already follow.
  it("says on the payslip that an unpriced row is not in the gross", async () => {
    await seed(STORES.ITEMS, [seedItem("i_unset", "Unpriced", null)]);
    await seed(STORES.PRODUCTIONS, [prod("i_unset", "2026-04-12", 25)]);

    const { html, salary } = await getPrintableSalaryHtml(
      EMP,
      "2026-04-01",
      "2026-04-30",
    );

    expect(salary.unpricedCount).toBe(1);
    expect(html).toContain("1 row is not included above");
    expect(html).toContain("could not be priced");
    // the row itself is still on the sheet, quantity and all
    expect(html).toContain("Not priced");
    expect(html).toContain("Unpriced");
    expectNoGarbage(html);
  });

  it("prints placeholder rows, not blanks, when there is nothing to show", async () => {
    adapter.tables.clear();
    await seedHostileEmployee();

    const { html, salary } = await getPrintableSalaryHtml(
      EMP,
      "2026-04-01",
      "2026-04-30",
    );

    expect(salary.gross).toBe(0);
    expect(html).toContain("No production in this period.");
    expect(html).toContain("No advances.");
    expectNoGarbage(html);
    expectChrome109SafeCss(html);
  });

  it('falls back to "Unknown" for a missing employee without leaking the id', async () => {
    const { html, employeeName } = await getPrintableSalaryHtml(
      "no_such_employee",
      "2026-04-01",
      "2026-04-30",
    );

    expect(employeeName).toBe("Unknown");
    expect(html).not.toContain("no_such_employee");
    expectNoGarbage(html);
  });
});

describe("getPrintableMonthlyAttendanceSheetHtml", () => {
  it("renders a full month with a hostile name escaped and no garbage values", async () => {
    await seedHostileEmployee();
    await seed(STORES.ATTENDANCE, [
      {
        id: "at1",
        employeeId: EMP,
        date: "2026-04-02",
        status: "present",
        hoursWorked: 8,
        hoursExtra: 2,
      },
      { id: "at2", employeeId: EMP, date: "2026-04-03", status: "absent" },
    ]);
    await seed(STORES.FACTORY_HOLIDAYS, [
      { id: "h1", date: "2026-04-14", name: "Ambedkar Jayanti" },
    ]);

    const { html, employeeName } = await getPrintableMonthlyAttendanceSheetHtml(
      EMP,
      2026,
      APRIL,
    );

    expect(employeeName).toBe(HOSTILE_NAME);
    expectEscaped(html);
    expectNoGarbage(html);
    expectChrome109SafeCss(html);
    expect(html).toContain("Monthly attendance &amp;");
    // One <tr> per calendar day of April (30), plus the header row.
    expect(html.match(/<tr>/g)?.length).toBe(31);
    expect(html).toContain("Total (attendance):");
  });

  it("returns a 'not found' document, still styled, for an unknown employee", async () => {
    const { html, employeeName } = await getPrintableMonthlyAttendanceSheetHtml(
      "no_such_employee",
      2026,
      APRIL,
    );

    expect(employeeName).toBe("Unknown");
    expect(html).toContain("Employee not found.");
    expect(html).not.toContain("no_such_employee");
    expectChrome109SafeCss(html);
    expectNoGarbage(html);
  });
});

describe("assertMonthIndex", () => {
  // The print helpers take a 0-based month. A caller who passes 4 meaning
  // April still gets May — nothing can catch that — but a caller who passes a
  // 1-based month number now fails loudly at the boundary instead of printing
  // the wrong sheet, and the parameter is named `monthIndex` at every level.
  it("accepts 0–11 and rejects anything else", () => {
    expect(() => assertMonthIndex(0)).not.toThrow();
    expect(() => assertMonthIndex(11)).not.toThrow();
    expect(() => assertMonthIndex(12)).toThrow(RangeError);
    expect(() => assertMonthIndex(-1)).toThrow(/0–11/);
    expect(() => assertMonthIndex(3.5)).toThrow(RangeError);
  });

  it("guards the printable month sheet", async () => {
    await expect(
      getPrintableMonthlyAttendanceSheetHtml(EMP, 2026, 12),
    ).rejects.toThrow(RangeError);
    await expect(
      getPrintableAttendanceSalaryRangeHtml(
        EMP,
        2026,
        12,
        "2026-04-01",
        "2026-04-15",
      ),
    ).rejects.toThrow(RangeError);
  });
});

describe("getPrintableAttendanceSalaryRangeHtml", () => {
  it("restricts the day table to the requested range, escaped and safe", async () => {
    await seedHostileEmployee();
    await seed(STORES.ATTENDANCE, [
      { id: "at1", employeeId: EMP, date: "2026-04-02", status: "present", hoursWorked: 8 },
      { id: "at2", employeeId: EMP, date: "2026-04-20", status: "present", hoursWorked: 8 },
    ]);

    const html = await getPrintableAttendanceSalaryRangeHtml(
      EMP,
      2026,
      APRIL,
      "2026-04-01",
      "2026-04-15",
    );

    expectEscaped(html);
    expectNoGarbage(html);
    expectChrome109SafeCss(html);
    // 15 day rows + the header row.
    expect(html.match(/<tr>/g)?.length).toBe(16);
    expect(html).toContain("Salary contribution:");
    expect(html).not.toContain("Includes payroll adjustment");
  });
});

describe("buildPrintableAttendanceSalaryRangeHtml", () => {
  const summary = {
    presentDays: 12,
    absentDays: 2,
    holidayPresentDays: 1,
    earnedSundayPayDays: 2,
    sundayPresentBonusDays: 1,
    hoursExtraTotal: 6,
    hoursReducedTotal: 1.5,
    totalPaidDays: 16,
    totalHoursWorked: 96,
    calculatedSalary: 8000,
  };

  it("derives the Sunday pay figures from ratePerDay, rounded to 2dp", () => {
    const html = buildPrintableAttendanceSalaryRangeHtml({
      employeeName: HOSTILE_NAME,
      monthLabel: "April 2026",
      rangeLabel: "1 Apr 2026 – 15 Apr 2026",
      fromDate: "2026-04-01",
      toDate: "2026-04-15",
      monthlySalary: 15000,
      ratePerDay: 500,
      ratePerHour: 62.5,
      summary,
      dayRows: [],
    });

    expectEscaped(html);
    expectNoGarbage(html);
    expectChrome109SafeCss(html);
    // 2 earned Sundays × ₹500 = ₹1,000; 1 marked Sunday × ₹500 = ₹500.
    expect(html).toContain("1,000");
    expect(html).toContain("No attendance rows in this range.");
  });

  it("notes a payroll adjustment only when told to", () => {
    const base = {
      employeeName: "Ram",
      monthLabel: "April 2026",
      rangeLabel: "range",
      fromDate: "2026-04-01",
      toDate: "2026-04-15",
      monthlySalary: 15000,
      ratePerDay: 500,
      ratePerHour: 62.5,
      summary,
      dayRows: [],
    };

    expect(buildPrintableAttendanceSalaryRangeHtml(base)).not.toContain(
      "Includes payroll adjustment",
    );
    expect(
      buildPrintableAttendanceSalaryRangeHtml({
        ...base,
        includesPayrollAdjustment: true,
      }),
    ).toContain("Includes payroll adjustment");
  });
});
