import { describe, expect, it, vi, beforeEach } from "vitest";
import { STORES } from "@/lib/db/schema";
import {
  getIndexKeyPath,
  matchesIndexRange,
  sortByIndexOrder,
} from "@/lib/db/indexes";
import {
  applySalarySheetOverrides,
  getSalarySheetForRange,
  getSalarySheetRowForEmployee,
  salarySheetRowHasAdjustment,
  type SalarySheetRow,
} from "./salarySheetService";
import type { SalarySheetOverrideRecord } from "./salarySheetOverrideService";
import {
  DEFAULT_SUNDAY_CATEGORY_RULE,
  type SundayCategoryRule,
} from "@/lib/utils/attendanceStats";
import { DEFAULT_SUNDAY_MULTIPLIER } from "./salarySheetService";

let mockMaxDayPayFraction: number | null | undefined;

const {
  mockGetEmployees,
  mockGetEmployee,
  mockGetAttendanceInRange,
  mockGetHolidaysInRange,
  mockGetOperatorHolidaysInRange,
  mockGetShifts,
  mockGetSundayCategories,
  mockGetSalarySheetOverridesForMonth,
  mockGetDeductionsByEmployee,
} = vi.hoisted(() => ({
  mockGetEmployees: vi.fn(),
  mockGetEmployee: vi.fn(),
  mockGetAttendanceInRange: vi.fn(),
  mockGetHolidaysInRange: vi.fn(),
  mockGetOperatorHolidaysInRange: vi.fn(),
  mockGetShifts: vi.fn(),
  mockGetSundayCategories: vi.fn(),
  mockGetSalarySheetOverridesForMonth: vi.fn(),
  mockGetDeductionsByEmployee: vi.fn(),
}));

vi.mock("./employeeService", () => ({
  getEmployees: mockGetEmployees,
  getEmployee: mockGetEmployee,
}));
vi.mock("./attendanceService", () => ({
  getAttendanceInRange: mockGetAttendanceInRange,
  // The per-employee read the single-row path uses. Derived from the same
  // stubbed rows as the whole-sheet read, through the real index key matching
  // and ordering, so the two paths can never be fed different data — that is
  // the whole point of the identity tests below.
  getAttendanceByEmployeeInRange: async (
    employeeId: string,
    fromDate: string,
    toDate: string,
  ) => {
    const keyPath = getIndexKeyPath(STORES.ATTENDANCE, "employee_date")!;
    const rows = (await mockGetAttendanceInRange(
      fromDate,
      toDate,
    )) as Record<string, unknown>[];
    return sortByIndexOrder(
      rows.filter((row) =>
        matchesIndexRange(
          row,
          keyPath,
          [employeeId, fromDate],
          [employeeId, toDate],
        ),
      ),
      keyPath,
    );
  },
}));
// The per-day pay limit lives in app settings now. Stubbed so a test can move
// it; `undefined` means "not configured", which is how every existing install
// looks and must keep paying what it paid.
vi.mock("./appSettingsService", async () => {
  const actual = await vi.importActual<
    typeof import("./appSettingsService")
  >("./appSettingsService");
  return {
    ...actual,
    getAppSettings: async () =>
      actual.normalizeAppSettings({ maxDayPayFraction: mockMaxDayPayFraction }),
  };
});

vi.mock("./factoryHolidayService", () => ({
  getHolidaysInRange: mockGetHolidaysInRange,
}));
vi.mock("./operatorHolidayService", () => ({
  getOperatorHolidaysInRange: mockGetOperatorHolidaysInRange,
}));
vi.mock("./shiftService", () => ({
  getShifts: mockGetShifts,
}));
/**
 * The Sunday rule every employee resolves to. A `let` so a test can hand the
 * engine a category that configures extra Sunday pay; the default is the rule
 * every existing install has, which configures none.
 */
let mockSundayRule: SundayCategoryRule = DEFAULT_SUNDAY_CATEGORY_RULE;
vi.mock("./sundayCategoryService", () => ({
  getSundayCategories: mockGetSundayCategories,
  resolveSundayCategoryRule: () => mockSundayRule,
  // Nobody in this file's fixtures has a Sunday category, so the sheet reaches
  // for the unassigned rule; it is the same injected rule, which is what
  // `resolveSundayCategoryRule` above already stands for. What the *setting*
  // does to the money is proved against the real resolver in
  // `unassignedSundayRuleWiring.test.ts`.
  resolveUnassignedSundayRule: () => ({
    rule: mockSundayRule,
    source: "asBefore" as const,
    categoryName: "",
  }),
}));
vi.mock("./advanceDeductionService", () => ({
  getDeductionsByEmployee: mockGetDeductionsByEmployee,
}));

// Note: getSalarySheetOverridesForMonth is imported by both salarySheetService.ts
// and salarySheetOverrideService.ts (re-exported type-only elsewhere); mock only
// the function actually used by salarySheetService.ts's runtime code.
vi.mock("./salarySheetOverrideService", async () => {
  const actual = await vi.importActual<
    typeof import("./salarySheetOverrideService")
  >("./salarySheetOverrideService");
  return {
    ...actual,
    getSalarySheetOverridesForMonth: mockGetSalarySheetOverridesForMonth,
  };
});

function attRow(
  employeeId: string,
  date: string,
  overrides: Partial<{ status: string; hoursWorked: number }> = {},
): Record<string, unknown> {
  return {
    employeeId,
    date,
    status: overrides.status ?? "present",
    hoursWorked: overrides.hoursWorked ?? 8,
  };
}

function buildBaseRow(): SalarySheetRow {
  return {
    dayPayCap: { limit: 2, clippedDays: 0, clippedDates: 0 },
    id: "emp_1",
    name: "Asha",
    employeeType: "salaried",
    presentDays: 11.86,
    absentDays: 1,
    holidayPresentDays: 0,
    earnedSundayPayDays: 0,
    sundayPresentBonusDays: 1,
    totalPaidDays: 12.86,
    monthlySalary: 9000,
    ratePerDay: 300,
    ratePerHour: 37.5,
    hoursExtraTotal: 2,
    hoursReducedTotal: 1,
    baseCalculatedSalary: 3858,
    calculatedSalary: 3858,
    advanceDeduction: 0,
    netCalculatedSalary: 3858,
    hasOverrides: false,
    overrideNotes: "",
    overrideUpdatedAt: "",
    overrideValues: {},
    calculatedValues: {
      presentDays: 11.86,
      absentDays: 1,
      holidayPresentDays: 0,
      earnedSundayPayDays: 0,
      sundayPresentBonusDays: 1,
      totalPaidDays: 12.86,
      hoursExtraTotal: 2,
      hoursReducedTotal: 1,
      calculatedSalary: 3858,
      advanceDeduction: 0,
      netCalculatedSalary: 3858,
    },
  };
}

function buildOverride(
  overrides: SalarySheetOverrideRecord["overrides"],
  notes = "",
): SalarySheetOverrideRecord {
  return {
    id: "override_1",
    employeeId: "emp_1",
    year: 2026,
    month: 3,
    fromDate: "2026-04-01",
    toDate: "2026-04-15",
    notes,
    updatedAt: "2026-05-03T00:00:00.000Z",
    overrides,
  };
}

describe("applySalarySheetOverrides", () => {
  it("recomputes total paid days and salary from overridden component fields", () => {
    const row = applySalarySheetOverrides(
      buildBaseRow(),
      buildOverride({
        presentDays: 12,
        earnedSundayPayDays: 2,
        sundayPresentBonusDays: 0,
      }),
    );

    expect(row.presentDays).toBe(12);
    expect(row.earnedSundayPayDays).toBe(2);
    expect(row.totalPaidDays).toBe(14);
    expect(row.calculatedSalary).toBe(4200);
    expect(row.baseCalculatedSalary).toBe(3858);
    expect(row.hasOverrides).toBe(true);
  });

  it("respects direct total-paid and salary overrides when supplied", () => {
    const row = applySalarySheetOverrides(
      buildBaseRow(),
      buildOverride({
        totalPaidDays: 15,
        calculatedSalary: 5000,
      }),
    );

    expect(row.totalPaidDays).toBe(15);
    expect(row.calculatedSalary).toBe(5000);
  });

  it("treats notes-only records as persisted overrides", () => {
    const row = applySalarySheetOverrides(
      buildBaseRow(),
      buildOverride({}, "Manual correction approved"),
    );

    expect(row.hasOverrides).toBe(true);
    expect(row.overrideNotes).toBe("Manual correction approved");
  });

  it("recomputes netCalculatedSalary from an overridden advanceDeduction", () => {
    const row = applySalarySheetOverrides(
      buildBaseRow(),
      buildOverride({ advanceDeduction: 500 }),
    );

    expect(row.advanceDeduction).toBe(500);
    expect(row.calculatedSalary).toBe(3858);
    expect(row.netCalculatedSalary).toBe(3358);
  });

  it("floors netCalculatedSalary at 0 when advanceDeduction exceeds calculatedSalary", () => {
    const row = applySalarySheetOverrides(
      buildBaseRow(),
      buildOverride({ advanceDeduction: 10000 }),
    );

    expect(row.netCalculatedSalary).toBe(0);
  });
});

describe("salarySheetRowHasAdjustment", () => {
  it("is true when totals differ from calculated attendance", () => {
    const row = buildBaseRow();
    row.presentDays = 14;
    expect(salarySheetRowHasAdjustment(row)).toBe(true);
  });

  it("is false for a plain calculated row", () => {
    expect(salarySheetRowHasAdjustment(buildBaseRow())).toBe(false);
  });
});

describe("getSalarySheetForRange — advanceDeduction & Operator Sunday multiplier", () => {
  // First-half of April 2026 (an exact correction-period preset), so
  // resolveEffectiveSalarySheetRow takes the single-slice pass-through path
  // instead of merging two halves.
  const YEAR = 2026;
  const MONTH = 3; // 0-indexed => April
  const FROM = "2026-04-01";
  const TO = "2026-04-15";

  beforeEach(() => {
    mockGetEmployees.mockReset();
    mockGetEmployee.mockReset();
    mockGetAttendanceInRange.mockReset();
    mockGetHolidaysInRange.mockReset().mockResolvedValue([]);
    mockGetOperatorHolidaysInRange.mockReset().mockResolvedValue([]);
    mockGetShifts.mockReset().mockResolvedValue([]);
    mockGetSundayCategories.mockReset().mockResolvedValue([]);
    mockGetSalarySheetOverridesForMonth.mockReset().mockResolvedValue([]);
    mockGetDeductionsByEmployee.mockReset().mockResolvedValue([]);
    mockSundayRule = DEFAULT_SUNDAY_CATEGORY_RULE;
  });

  it("subtracts an advance for a Salaried employee, leaving calculatedSalary untouched", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e1", name: "Asha", monthlySalary: 30000, employeeType: "salaried" },
    ]);
    mockGetAttendanceInRange.mockResolvedValue([attRow("e1", "2026-04-01")]);
    mockGetDeductionsByEmployee.mockResolvedValue([
      { employeeId: "e1", periodFrom: FROM, periodTo: TO, amount: 300 },
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const row = rows.find((r) => r.id === "e1")!;

    expect(row.calculatedSalary).toBe(1000);
    expect(row.advanceDeduction).toBe(300);
    expect(row.netCalculatedSalary).toBe(700);
  });

  // Production workers are paid for what they make; this sheet is attendance
  // pay only. They used to render here as all-zero rows (monthlySalary 0).
  it("leaves Production employees off the sheet entirely", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e2", name: "Ravi", monthlySalary: 0, employeeType: "production" },
    ]);
    mockGetAttendanceInRange.mockResolvedValue([attRow("e2", "2026-04-01")]);
    mockGetDeductionsByEmployee.mockResolvedValue([
      { employeeId: "e2", periodFrom: FROM, periodTo: TO, amount: 300 },
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);

    expect(rows.find((r) => r.id === "e2")).toBeUndefined();
    expect(rows).toHaveLength(0);
  });

  it("does not change Salaried or Operator pay when a Production employee is on the roster", async () => {
    const salariedAndOperator = [
      { id: "e1", name: "Asha", monthlySalary: 30000, employeeType: "salaried" },
      {
        id: "e3",
        name: "Om",
        monthlySalary: 30000,
        employeeType: "operator",
        requiredPresentDays: 5,
        sundayMultiplier: 1.5,
      },
    ];
    const attendance = [
      attRow("e1", "2026-04-01"),
      ...["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04"].map((d) =>
        attRow("e3", d),
      ),
      ...[
        "2026-04-06",
        "2026-04-07",
        "2026-04-08",
        "2026-04-09",
        "2026-04-10",
        "2026-04-11",
      ].map((d) => attRow("e3", d)),
      attRow("e3", "2026-04-12"),
    ];

    mockGetEmployees.mockResolvedValue(salariedAndOperator);
    mockGetAttendanceInRange.mockResolvedValue(attendance);
    const withoutProduction = (
      await getSalarySheetForRange(YEAR, MONTH, FROM, TO)
    ).rows;

    mockGetEmployees.mockResolvedValue([
      salariedAndOperator[0],
      { id: "e2", name: "Ravi", monthlySalary: 0, employeeType: "production" },
      salariedAndOperator[1],
    ]);
    mockGetAttendanceInRange.mockResolvedValue([
      ...attendance,
      attRow("e2", "2026-04-01"),
    ]);
    const withProduction = (await getSalarySheetForRange(YEAR, MONTH, FROM, TO))
      .rows;

    expect(withProduction).toEqual(withoutProduction);
    // And the printed total is the same number either way.
    const total = (rows: SalarySheetRow[]) =>
      rows.reduce((sum, r) => sum + r.calculatedSalary, 0);
    expect(total(withProduction)).toBe(total(withoutProduction));
  });

  it("pays a multiplied rate for Sundays worked after an Operator crosses requiredPresentDays", async () => {
    mockGetEmployees.mockResolvedValue([
      {
        id: "e3",
        name: "Om",
        monthlySalary: 30000,
        employeeType: "operator",
        requiredPresentDays: 5,
        sundayMultiplier: 1.5,
      },
    ]);
    mockGetAttendanceInRange.mockResolvedValue([
      // 10 present working days before the second Sunday (04-12)
      ...["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04"].map((d) =>
        attRow("e3", d),
      ),
      ...[
        "2026-04-06",
        "2026-04-07",
        "2026-04-08",
        "2026-04-09",
        "2026-04-10",
        "2026-04-11",
      ].map((d) => attRow("e3", d)),
      attRow("e3", "2026-04-12"), // Sunday, present, after crossing threshold
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const row = rows.find((r) => r.id === "e3")!;

    // 10 working days * 1000 + 1 multiplied Sunday (1000 * 1.5) = 11500.
    // Without the multiplier this would be 11000.
    expect(row.calculatedSalary).toBe(11500);
    expect(row.sundayPresentBonusDays).toBe(1);
    expect(row.netCalculatedSalary).toBe(11500);
  });

  it("subtracts an advance on top of the Operator's multiplied Sunday pay", async () => {
    mockGetEmployees.mockResolvedValue([
      {
        id: "e4",
        name: "Priya",
        monthlySalary: 30000,
        employeeType: "operator",
        requiredPresentDays: 5,
        sundayMultiplier: 1.5,
      },
    ]);
    mockGetAttendanceInRange.mockResolvedValue([
      ...["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04"].map((d) =>
        attRow("e4", d),
      ),
      ...[
        "2026-04-06",
        "2026-04-07",
        "2026-04-08",
        "2026-04-09",
        "2026-04-10",
        "2026-04-11",
      ].map((d) => attRow("e4", d)),
      attRow("e4", "2026-04-12"),
    ]);
    mockGetDeductionsByEmployee.mockResolvedValue([
      { employeeId: "e4", periodFrom: FROM, periodTo: TO, amount: 1500 },
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const row = rows.find((r) => r.id === "e4")!;

    expect(row.calculatedSalary).toBe(11500);
    expect(row.advanceDeduction).toBe(1500);
    expect(row.netCalculatedSalary).toBe(10000);
  });

  it("unions factory holidays with operator national holidays in the day-by-day breakdown", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e5", name: "Deep", monthlySalary: 30000, employeeType: "operator" },
    ]);
    mockGetHolidaysInRange.mockResolvedValue([{ id: "h1", date: "2026-04-03" }]);
    mockGetOperatorHolidaysInRange.mockResolvedValue([
      { id: "oh1", name: "Republic-ish Day", date: "2026-04-09" },
    ]);
    mockGetAttendanceInRange.mockResolvedValue([
      attRow("e5", "2026-04-03"), // factory holiday, present
      attRow("e5", "2026-04-09"), // operator national holiday, present
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const row = rows.find((r) => r.id === "e5")!;

    expect(row.holidayPresentDays).toBe(2);
  });
});

describe("getSalarySheetForRange — full calendar month (no overrides)", () => {
  const YEAR = 2026;
  const MONTH = 3; // April 2026
  const FROM = "2026-04-01";
  const TO = "2026-04-30";

  beforeEach(() => {
    mockGetEmployees.mockReset();
    mockGetEmployee.mockReset();
    mockGetAttendanceInRange.mockReset().mockResolvedValue([]);
    mockGetHolidaysInRange.mockReset().mockResolvedValue([]);
    mockGetOperatorHolidaysInRange.mockReset().mockResolvedValue([]);
    mockGetShifts.mockReset().mockResolvedValue([]);
    mockGetSundayCategories.mockReset().mockResolvedValue([]);
    mockGetSalarySheetOverridesForMonth.mockReset().mockResolvedValue([]);
    mockGetDeductionsByEmployee.mockReset().mockResolvedValue([]);
    mockSundayRule = DEFAULT_SUNDAY_CATEGORY_RULE;
  });

  // Bug 1: a deduction saved against the whole month matched neither half-month
  // slice, so the merged row reported 0.
  it("applies an advance deduction saved for the whole month", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e1", name: "Asha", monthlySalary: 30000, employeeType: "salaried" },
    ]);
    mockGetAttendanceInRange.mockResolvedValue([attRow("e1", "2026-04-01")]);
    mockGetDeductionsByEmployee.mockResolvedValue([
      { employeeId: "e1", periodFrom: FROM, periodTo: TO, amount: 300 },
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const row = rows.find((r) => r.id === "e1")!;

    expect(row.calculatedSalary).toBe(1000);
    expect(row.advanceDeduction).toBe(300);
    expect(row.netCalculatedSalary).toBe(700);
  });

  // Bug 2: the operator Sunday multiplier never fired on a full-month sheet
  // because each half-month slice restarted the running present-day count.
  it("applies the operator Sunday multiplier to a late-month Sunday", async () => {
    mockGetEmployees.mockResolvedValue([
      {
        id: "e3",
        name: "Om",
        monthlySalary: 30000,
        employeeType: "operator",
        requiredPresentDays: 12,
        sundayMultiplier: 1.5,
      },
    ]);
    // Present every non-Sunday from Apr 1 to Apr 18 (15 working days), then
    // present on Sunday Apr 19 — by then the running count is well past 12.
    const dates: string[] = [];
    for (let d = 1; d <= 18; d++) {
      const iso = `2026-04-${String(d).padStart(2, "0")}`;
      if (new Date(2026, 3, d).getDay() === 0) continue;
      dates.push(iso);
    }
    mockGetAttendanceInRange.mockResolvedValue([
      ...dates.map((d) => attRow("e3", d)),
      attRow("e3", "2026-04-19"), // Sunday
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const row = rows.find((r) => r.id === "e3")!;

    // Apr 1–18 minus Sundays 5 and 12 = 16 present working days.
    // 16 * 1000 + Sunday Apr 19 at 1.5 * 1000 + earned pool (2 * 1000).
    // Before the fix the second-half slice restarted the counter and the
    // Sunday was paid flat: 18500.
    expect(row.calculatedSalary).toBe(16 * 1000 + 1500 + 2000);
    expect(row.sundayPresentBonusDays).toBe(1);
  });

  // Bug 3: engine default for sundayMultiplier must match the UI default (1.2).
  it("defaults an operator's sundayMultiplier to DEFAULT_SUNDAY_MULTIPLIER", async () => {
    mockGetEmployees.mockResolvedValue([
      {
        id: "e6",
        name: "Nina",
        monthlySalary: 30000,
        employeeType: "operator",
        requiredPresentDays: 1,
      },
    ]);
    mockGetAttendanceInRange.mockResolvedValue([
      attRow("e6", "2026-04-01"),
      attRow("e6", "2026-04-02"),
      attRow("e6", "2026-04-05"), // Sunday, after crossing requiredPresentDays
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const row = rows.find((r) => r.id === "e6")!;

    expect(DEFAULT_SUNDAY_MULTIPLIER).toBe(1.2);
    expect(row.calculatedSalary).toBe(2000 + 1000 * DEFAULT_SUNDAY_MULTIPLIER);
  });
});

describe("applySalarySheetOverrides — honest override semantics", () => {
  // Bug 4: overriding hours totals set hasOverrides but never moved pay.
  it("adjusts pay by the overridden extra-hours delta at ratePerHour", () => {
    const base = buildBaseRow(); // hoursExtraTotal 2, ratePerHour 37.5
    const row = applySalarySheetOverrides(base, buildOverride({ hoursExtraTotal: 6 }));

    expect(row.hoursExtraTotal).toBe(6);
    expect(row.calculatedSalary).toBe(3858 + 4 * 37.5);
    expect(row.hasOverrides).toBe(true);
  });

  it("adjusts pay downward by the overridden reduced-hours delta", () => {
    const base = buildBaseRow(); // hoursReducedTotal 1
    const row = applySalarySheetOverrides(base, buildOverride({ hoursReducedTotal: 3 }));

    expect(row.calculatedSalary).toBe(3858 - 2 * 37.5);
  });

  // Bug 4b: counters that cannot move pay must not claim to be overrides.
  it("does not flag hasOverrides for counter-only fields that cannot change pay", () => {
    const row = applySalarySheetOverrides(
      buildBaseRow(),
      buildOverride({ holidayPresentDays: 3, absentDays: 5 }),
    );

    expect(row.holidayPresentDays).toBe(3);
    expect(row.absentDays).toBe(5);
    expect(row.calculatedSalary).toBe(3858);
    expect(row.hasOverrides).toBe(false);
  });

  // Bug 5: an operator's Sunday premium was discarded on any driver override.
  it("preserves an operator's Sunday premium when a driver field is overridden", () => {
    // Operator row: 12 paid days but 3900 pay (one Sunday paid at 1.5x).
    const base = buildBaseRow();
    base.employeeType = "operator";
    base.presentDays = 11;
    base.sundayPresentBonusDays = 1;
    base.earnedSundayPayDays = 0;
    base.totalPaidDays = 12;
    base.calculatedSalary = 3750; // 11*300 + 450
    base.baseCalculatedSalary = 3750;
    base.calculatedValues = {
      ...base.calculatedValues,
      presentDays: 11,
      sundayPresentBonusDays: 1,
      earnedSundayPayDays: 0,
      totalPaidDays: 12,
      calculatedSalary: 3750,
    };

    const row = applySalarySheetOverrides(base, buildOverride({ presentDays: 12 }));

    expect(row.totalPaidDays).toBe(13);
    // One extra ordinary day on top of the operator's own pay — the 150 Sunday
    // premium survives instead of being flattened to 13 * 300 = 3900.
    expect(row.calculatedSalary).toBe(4050);
  });
});

/**
 * `getSalarySheetRowForEmployee` used to build the whole sheet and pick one row
 * out of it. It now builds that one row from that one employee's data, which is
 * only safe if the two can never disagree — so every case below asserts the
 * WHOLE row, field for field, against the row the sheet produces.
 *
 * (Production employees are deliberately off the sheet roster — they are paid
 * on their own production record — so their case asserts that invariant plus
 * the row the single-employee path must still return for the employee page.)
 */
describe("getSalarySheetRowForEmployee — identical to the whole-sheet row", () => {
  const YEAR = 2026;
  const MONTH = 3; // April 2026
  const FULL_MONTH: [string, string] = ["2026-04-01", "2026-04-30"];
  const FIRST_HALF: [string, string] = ["2026-04-01", "2026-04-15"];
  const SECOND_HALF: [string, string] = ["2026-04-16", "2026-04-30"];

  const salaried = {
    id: "e1",
    name: "Asha",
    monthlySalary: 30000,
    employeeType: "salaried",
    shiftId: "s1",
  };
  const operator = {
    id: "e3",
    name: "Om",
    monthlySalary: 30000,
    employeeType: "operator",
    requiredPresentDays: 5,
    sundayMultiplier: 1.5,
    shiftId: "s1",
  };
  const production = {
    id: "e2",
    name: "Ravi",
    monthlySalary: 24000,
    employeeType: "production",
    shiftId: "s1",
  };
  /** A second employee whose data must not leak into anyone else's row. */
  const bystander = {
    id: "e9",
    name: "Meera",
    monthlySalary: 60000,
    employeeType: "salaried",
    shiftId: "s1",
  };

  const workedDates = [
    "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04",
    "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09",
    "2026-04-10", "2026-04-11",
    "2026-04-12", // Sunday, present
    "2026-04-16", "2026-04-17", "2026-04-18",
    "2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23",
    "2026-04-24", "2026-04-25",
    "2026-04-26", // Sunday, present
  ];

  function attendanceFor(employeeIds: string[]): Record<string, unknown>[] {
    return employeeIds.flatMap((employeeId, empIndex) =>
      workedDates.map((date, i) => ({
        id: `att_${empIndex}_${String(i).padStart(3, "0")}`,
        ...attRow(employeeId, date, { hoursWorked: 8 }),
        hoursExtra: i % 5 === 0 ? 2 : undefined,
        hoursReduced: i % 7 === 0 ? 1 : undefined,
      })),
    );
  }

  const roster = [salaried, operator, production, bystander];

  beforeEach(() => {
    mockGetEmployees.mockReset().mockImplementation(async (activeOnly = false) =>
      activeOnly ? roster.filter((e) => (e as { isActive?: boolean }).isActive !== false) : roster,
    );
    mockGetEmployee
      .mockReset()
      .mockImplementation(async (id: string) => roster.find((e) => e.id === id) ?? null);
    mockGetAttendanceInRange
      .mockReset()
      .mockResolvedValue(attendanceFor(roster.map((e) => e.id)));
    mockGetHolidaysInRange
      .mockReset()
      .mockResolvedValue([{ id: "h1", date: "2026-04-03" }]);
    mockGetOperatorHolidaysInRange
      .mockReset()
      .mockResolvedValue([{ id: "oh1", date: "2026-04-21" }]);
    mockGetShifts
      .mockReset()
      .mockResolvedValue([{ id: "s1", hoursPerDay: 8, name: "Day" }]);
    mockGetSundayCategories.mockReset().mockResolvedValue([]);
    mockGetSalarySheetOverridesForMonth.mockReset().mockResolvedValue([]);
    mockGetDeductionsByEmployee.mockReset().mockResolvedValue([]);
    mockSundayRule = DEFAULT_SUNDAY_CATEGORY_RULE;
  });

  const override = (
    employeeId: string,
    fromDate: string,
    toDate: string,
  ): SalarySheetOverrideRecord => ({
    id: `ov_${employeeId}_${fromDate}`,
    employeeId,
    year: YEAR,
    month: MONTH,
    fromDate,
    toDate,
    notes: "Corrected after review",
    updatedAt: "2026-05-01T00:00:00.000Z",
    overrides: { presentDays: 9, hoursExtraTotal: 4 },
  });

  const ranges: [string, [string, string]][] = [
    ["full month", FULL_MONTH],
    ["first half", FIRST_HALF],
    ["second half", SECOND_HALF],
  ];

  for (const employee of [salaried, operator]) {
    for (const [rangeLabel, [from, to]] of ranges) {
      for (const withOverrides of [false, true]) {
        const label =
          `${employee.employeeType}, ${rangeLabel}, ` +
          `${withOverrides ? "with" : "without"} overrides`;

        it(`${label} — single-employee row equals the sheet row`, async () => {
          if (withOverrides) {
            // A correction on the first half, so both the exact-match path and
            // the half-month composition path get exercised across the ranges.
            mockGetSalarySheetOverridesForMonth.mockResolvedValue([
              override(employee.id, FIRST_HALF[0], FIRST_HALF[1]),
              override(bystander.id, FIRST_HALF[0], FIRST_HALF[1]),
            ]);
          }
          mockGetDeductionsByEmployee.mockImplementation(async (id: string) => [
            { employeeId: id, periodFrom: from, periodTo: to, amount: 400 },
            {
              employeeId: id,
              periodFrom: FIRST_HALF[0],
              periodTo: FIRST_HALF[1],
              amount: 150,
            },
          ]);

          const sheetRow = (
            await getSalarySheetForRange(YEAR, MONTH, from, to)
          ).rows.find((r) => r.id === employee.id);
          const singleRow = await getSalarySheetRowForEmployee(
            employee.id,
            YEAR,
            MONTH,
            from,
            to,
          );

          expect(sheetRow).toBeDefined();
          expect(singleRow).toEqual(sheetRow);
          // Guard against a vacuous pass: the rows compared must be real pay.
          expect(sheetRow!.calculatedSalary).toBeGreaterThan(0);
          // The correction sits on the first half, so it shows up on the
          // ranges that contain it and — correctly — not on the second half.
          expect(salarySheetRowHasAdjustment(singleRow)).toBe(
            withOverrides && from === FIRST_HALF[0],
          );
        });
      }
    }
  }

  it("keeps Production employees off the sheet but still answers for them", async () => {
    const from = FULL_MONTH[0];
    const to = FULL_MONTH[1];
    mockGetDeductionsByEmployee.mockResolvedValue([
      { employeeId: production.id, periodFrom: from, periodTo: to, amount: 500 },
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, from, to);
    expect(rows.find((r) => r.id === production.id)).toBeUndefined();

    const row = await getSalarySheetRowForEmployee(
      production.id,
      YEAR,
      MONTH,
      from,
      to,
    );
    expect(row).not.toBeNull();
    expect(row!.employeeType).toBe("production");
    // Production pay is not attendance pay: no advance is netted off here.
    expect(row!.advanceDeduction).toBe(0);
    expect(row!.netCalculatedSalary).toBe(row!.calculatedSalary);
  });

  it("returns null for an unknown employee", async () => {
    mockGetEmployee.mockResolvedValue(null);
    const row = await getSalarySheetRowForEmployee(
      "nobody",
      YEAR,
      MONTH,
      ...FULL_MONTH,
    );
    expect(row).toBeNull();
  });

  it("still answers for an inactive employee, who is off the active roster", async () => {
    const inactive = { ...salaried, id: "e_off", isActive: false };
    mockGetEmployees.mockImplementation(async (activeOnly = false) =>
      activeOnly ? roster : [...roster, inactive],
    );
    mockGetEmployee.mockResolvedValue(inactive);
    mockGetAttendanceInRange.mockResolvedValue(attendanceFor([inactive.id]));

    const row = await getSalarySheetRowForEmployee(
      inactive.id,
      YEAR,
      MONTH,
      ...FULL_MONTH,
    );
    expect(row).not.toBeNull();
    expect(row!.id).toBe(inactive.id);
    expect(row!.presentDays).toBeGreaterThan(0);
  });

  // Duplicate rows predate saveAttendance's upsert. Last write wins, in both
  // readers — see foldAttendanceByDate and getAttendanceByEmployeeAndDate.
  it("resolves duplicate attendance rows last-write-wins, identically in both paths", async () => {
    const [from, to] = FULL_MONTH;
    mockGetAttendanceInRange.mockResolvedValue([
      ...attendanceFor([salaried.id]),
      // Same employee+date as att_0_000 (2026-04-01), written later.
      {
        id: "att_0_999",
        ...attRow(salaried.id, "2026-04-01", { status: "absent" }),
      },
    ]);
    mockGetEmployees.mockResolvedValue([salaried]);

    const sheetRow = (
      await getSalarySheetForRange(YEAR, MONTH, from, to)
    ).rows.find((r) => r.id === salaried.id)!;
    const singleRow = await getSalarySheetRowForEmployee(
      salaried.id,
      YEAR,
      MONTH,
      from,
      to,
    );

    expect(singleRow).toEqual(sheetRow);
    // The later "absent" row is the one that counts.
    expect(sheetRow.absentDays).toBeGreaterThan(0);
  });

  it("reads one employee's attendance and one employee's deductions, not everyone's", async () => {
    mockGetDeductionsByEmployee.mockClear();
    await getSalarySheetRowForEmployee(salaried.id, YEAR, MONTH, ...FULL_MONTH);

    // One deduction read total — not one per employee on the roster.
    expect(mockGetDeductionsByEmployee).toHaveBeenCalledTimes(1);
    expect(mockGetDeductionsByEmployee).toHaveBeenCalledWith(salaried.id);
    // And the whole-store attendance read is only reached via the per-employee
    // index range, never as an unfiltered sheet-wide scan.
    expect(mockGetAttendanceInRange).toHaveBeenCalledTimes(1);
  });
});

/**
 * The per-day pay limit, on a real sheet.
 *
 * The limit was `MAX_DAY_PAY_FRACTION = 2` hardcoded in `date.ts`. Making it
 * configurable is only safe if the default reproduces the old numbers exactly,
 * so this compares whole rows rather than a couple of fields: any drift
 * anywhere in the row fails the test.
 */
describe("getSalarySheetForRange — the per-day pay limit", () => {
  const YEAR = 2026;
  const MONTH = 3; // April 2026
  const FROM = "2026-04-01";
  const TO = "2026-04-30";

  /** Two long days: 10 hours extra (2.25 days) and 20 hours worked (2.5 days). */
  const LONG_DAYS = [
    { date: "2026-04-01", hoursExtra: 10 },
    { date: "2026-04-02", hoursWorked: 20 },
    { date: "2026-04-03", hoursExtra: 4 },
    { date: "2026-04-06" },
  ];

  beforeEach(() => {
    mockMaxDayPayFraction = undefined;
    mockGetEmployees.mockReset();
    mockGetEmployee.mockReset();
    mockGetAttendanceInRange.mockReset().mockResolvedValue([]);
    mockGetHolidaysInRange.mockReset().mockResolvedValue([]);
    mockGetOperatorHolidaysInRange.mockReset().mockResolvedValue([]);
    mockGetShifts.mockReset().mockResolvedValue([]);
    mockGetSundayCategories.mockReset().mockResolvedValue([]);
    mockGetSalarySheetOverridesForMonth.mockReset().mockResolvedValue([]);
    mockGetDeductionsByEmployee.mockReset().mockResolvedValue([]);
    mockSundayRule = DEFAULT_SUNDAY_CATEGORY_RULE;
  });

  function seed() {
    mockGetEmployees.mockResolvedValue([
      { id: "e1", name: "Asha", monthlySalary: 30000, employeeType: "salaried" },
      {
        id: "e2",
        name: "Om",
        monthlySalary: 30000,
        employeeType: "operator",
        requiredPresentDays: 1,
        sundayMultiplier: 1.5,
      },
    ]);
    mockGetAttendanceInRange.mockResolvedValue(
      ["e1", "e2"].flatMap((employeeId) =>
        LONG_DAYS.map((d) => ({
          employeeId,
          status: "present",
          ...d,
        })),
      ),
    );
  }

  it("an unconfigured install and an explicit limit of 2 produce identical rows", async () => {
    seed();
    mockMaxDayPayFraction = undefined;
    const before = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    mockMaxDayPayFraction = 2;
    const after = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    expect(after).toEqual(before);
  });

  it("pays exactly what the hardcoded limit paid, and says what it withheld", async () => {
    seed();
    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const asha = rows.find((r) => r.id === "e1")!;

    // 2 + 2 + 1.5 + 1 = 6.5 paid days at ₹1000, which is the figure the
    // hardcoded 2 produced. Uncapped it would have been 2.25 + 2.5 + 1.5 + 1.
    expect(asha.presentDays).toBe(6.5);
    expect(asha.calculatedSalary).toBe(6500);
    expect(asha.dayPayCap).toEqual({
      limit: 2,
      clippedDays: 0.75,
      clippedDates: 2,
    });

    // The Operator path builds its totals a different way and must report the
    // same withholding for the same days.
    const om = rows.find((r) => r.id === "e2")!;
    expect(om.dayPayCap).toEqual({
      limit: 2,
      clippedDays: 0.75,
      clippedDates: 2,
    });
    expect(om.presentDays).toBe(6.5);
  });

  it("turning the limit off pays the withheld days and reports nothing withheld", async () => {
    seed();
    mockMaxDayPayFraction = null;
    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const asha = rows.find((r) => r.id === "e1")!;

    expect(asha.presentDays).toBe(7.25);
    expect(asha.calculatedSalary).toBe(7250);
    expect(asha.dayPayCap).toEqual({
      limit: null,
      clippedDays: 0,
      clippedDates: 0,
    });
  });

  it("only the day figures move when the limit moves — everything else is the same row", async () => {
    seed();
    const { rows: capped } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    mockMaxDayPayFraction = null;
    const { rows: uncapped } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);

    const a = capped.find((r) => r.id === "e1")!;
    const b = uncapped.find((r) => r.id === "e1")!;
    const changed = (Object.keys(a) as (keyof typeof a)[]).filter(
      (key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]),
    );
    expect(changed.sort()).toEqual(
      [
        "baseCalculatedSalary",
        "calculatedSalary",
        "calculatedValues",
        "dayPayCap",
        "netCalculatedSalary",
        "presentDays",
        "totalPaidDays",
      ].sort(),
    );
  });
});

/**
 * The Sunday premium on a category applied to nobody but Operators: the sheet
 * resolved it inside the Operator branch and the branch everyone else takes had
 * no parameter for it at all. So an owner could configure "a Sunday pays 1.5×
 * after 22 days", read that sentence back in the category list, and pay every
 * salaried worker flat.
 */
describe("a Sunday premium set on a category reaches everyone in it", () => {
  const YEAR = 2026;
  const MONTH = 3;
  const FROM = "2026-04-01";
  const TO = "2026-04-30";

  /** April 2026 Sundays: 5, 12, 19, 26. */
  const wholeMonth = (employeeId: string) => {
    const rows: Record<string, unknown>[] = [];
    for (let d = 1; d <= 30; d += 1) {
      rows.push(attRow(employeeId, `2026-04-${String(d).padStart(2, "0")}`));
    }
    return rows;
  };

  const withPremium = (
    requiredPresentDays: number,
    multiplier: number,
  ): SundayCategoryRule => ({
    ...DEFAULT_SUNDAY_CATEGORY_RULE,
    sundayPremium: { requiredPresentDays, multiplier },
  });

  beforeEach(() => {
    mockGetEmployees.mockReset();
    mockGetEmployee.mockReset();
    mockGetAttendanceInRange.mockReset().mockResolvedValue([]);
    mockGetHolidaysInRange.mockReset().mockResolvedValue([]);
    mockGetOperatorHolidaysInRange.mockReset().mockResolvedValue([]);
    mockGetShifts.mockReset().mockResolvedValue([]);
    mockGetSundayCategories.mockReset().mockResolvedValue([]);
    mockGetSalarySheetOverridesForMonth.mockReset().mockResolvedValue([]);
    mockGetDeductionsByEmployee.mockReset().mockResolvedValue([]);
    mockSundayRule = DEFAULT_SUNDAY_CATEGORY_RULE;
  });

  const salariedPayFor = async (rule: SundayCategoryRule) => {
    mockSundayRule = rule;
    mockGetEmployees.mockResolvedValue([
      { id: "s1", name: "Asha", monthlySalary: 30000, employeeType: "salaried" },
    ]);
    mockGetAttendanceInRange.mockResolvedValue(wholeMonth("s1"));
    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    return rows.find((r) => r.id === "s1")!;
  };

  it("pays a salaried worker the extra Sunday pay their category configures", async () => {
    const flat = await salariedPayFor(DEFAULT_SUNDAY_CATEGORY_RULE);
    // Present every day of April: the 20th present working day is reached
    // before the last Sunday (26 April) and after the 19th, so one Sunday is
    // paid at one and a half days instead of one — half a day's pay, ₹500.
    const premium = await salariedPayFor(withPremium(20, 1.5));

    expect(premium.calculatedSalary).toBe(flat.calculatedSalary + 500);
    // Nothing but the money moves: the day counts are the same facts as before.
    expect(premium.totalPaidDays).toBe(flat.totalPaidDays);
    expect(premium.presentDays).toBe(flat.presentDays);
    expect(premium.sundayPresentBonusDays).toBe(flat.sundayPresentBonusDays);
  });

  it("changes nothing at all when no category configures a premium", async () => {
    const before = await salariedPayFor(DEFAULT_SUNDAY_CATEGORY_RULE);
    expect(before.calculatedSalary).toBe(
      before.totalPaidDays * (30000 / 30),
    );
  });

  it("changes nothing when the premium pays a Sunday at one day's pay", async () => {
    const flat = await salariedPayFor(DEFAULT_SUNDAY_CATEGORY_RULE);
    const neutral = await salariedPayFor(withPremium(0, 1));
    expect(neutral.calculatedSalary).toBe(flat.calculatedSalary);
  });

  it("carries the premium into the second half of the month, where the count already stands", async () => {
    mockSundayRule = withPremium(20, 1.5);
    mockGetEmployees.mockResolvedValue([
      { id: "s1", name: "Asha", monthlySalary: 30000, employeeType: "salaried" },
    ]);
    mockGetAttendanceInRange.mockResolvedValue(wholeMonth("s1"));

    const { rows } = await getSalarySheetForRange(
      YEAR,
      MONTH,
      "2026-04-16",
      "2026-04-30",
    );
    const row = rows.find((r) => r.id === "s1")!;

    mockSundayRule = DEFAULT_SUNDAY_CATEGORY_RULE;
    const { rows: flatRows } = await getSalarySheetForRange(
      YEAR,
      MONTH,
      "2026-04-16",
      "2026-04-30",
    );
    const flatRow = flatRows.find((r) => r.id === "s1")!;

    expect(row.calculatedSalary).toBe(flatRow.calculatedSalary + 500);
  });

  it("still pays an Operator through their own numbers first", async () => {
    // The category says 1.5× after 20 days; this Operator's own record says
    // 2× after 1 day, and the worker's own page has always won.
    mockSundayRule = withPremium(20, 1.5);
    mockGetEmployees.mockResolvedValue([
      {
        id: "o1",
        name: "Om",
        monthlySalary: 30000,
        employeeType: "operator",
        requiredPresentDays: 1,
        sundayMultiplier: 2,
      },
    ]);
    mockGetAttendanceInRange.mockResolvedValue([
      attRow("o1", "2026-04-01"),
      attRow("o1", "2026-04-02"),
      attRow("o1", "2026-04-05"), // Sunday
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const row = rows.find((r) => r.id === "o1")!;

    // Two working days at ₹1000, plus a Sunday paid at twice a day's pay.
    expect(row.calculatedSalary).toBe(2000 + 2000);
  });

  it("lets an Operator with no numbers of their own follow the category", async () => {
    // This is what visiting an employee page used to make impossible: 26 and
    // 1.2 were written onto the worker, and the category could never apply.
    mockSundayRule = withPremium(1, 2);
    mockGetEmployees.mockResolvedValue([
      { id: "o2", name: "Nita", monthlySalary: 30000, employeeType: "operator" },
    ]);
    mockGetAttendanceInRange.mockResolvedValue([
      attRow("o2", "2026-04-01"),
      attRow("o2", "2026-04-02"),
      attRow("o2", "2026-04-05"), // Sunday
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const row = rows.find((r) => r.id === "o2")!;

    expect(row.calculatedSalary).toBe(2000 + 2000);
  });
});
