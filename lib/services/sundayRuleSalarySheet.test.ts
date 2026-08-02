import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Whole-sheet proof that making the Sunday rule configurable moved nobody's pay.
 *
 * The unit tests in `lib/utils/sundayRule.test.ts` compare the engine against a
 * verbatim copy of the old algorithm. This file goes one level up: it builds a
 * real salary sheet for a legacy `{mode: "threshold"}` / `{mode: "step"}`
 * category and asserts the *entire row* — every rupee and every day count —
 * matches the sheet built from the equivalent hand-written general rule, and
 * that the numbers are the ones the old engine produced.
 */

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
}));
vi.mock("./factoryHolidayService", () => ({
  getHolidaysInRange: mockGetHolidaysInRange,
}));
vi.mock("./operatorHolidayService", () => ({
  getOperatorHolidaysInRange: mockGetOperatorHolidaysInRange,
}));
vi.mock("./shiftService", () => ({ getShifts: mockGetShifts }));
vi.mock("./advanceDeductionService", () => ({
  getDeductionsByEmployee: mockGetDeductionsByEmployee,
}));
vi.mock("./salarySheetOverrideService", async () => {
  const actual = await vi.importActual<
    typeof import("./salarySheetOverrideService")
  >("./salarySheetOverrideService");
  return {
    ...actual,
    getSalarySheetOverridesForMonth: mockGetSalarySheetOverridesForMonth,
  };
});
// Deliberately NOT mocked: sundayCategoryService, so the real migration runs.
vi.mock("@/lib/db/adapter", () => ({
  getAll: vi.fn(async () => []),
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  getByIndex: vi.fn(async () => []),
  STORES: { SUNDAY_CATEGORIES: "sunday_categories" },
}));
vi.mock("./sundayCategoryService", async () => {
  const actual = await vi.importActual<
    typeof import("./sundayCategoryService")
  >("./sundayCategoryService");
  return { ...actual, getSundayCategories: mockGetSundayCategories };
});

import {
  getSalarySheetForRange,
  resolveOperatorSundayRule,
  type SalarySheetRow,
} from "./salarySheetService";
import { normalizeSundayRule } from "@/lib/utils/sundayRule";

const EMPLOYEE = {
  id: "emp_1",
  name: "Asha",
  employeeType: "salaried",
  monthlySalary: 9300,
  shiftId: "shift_1",
  sundayCategoryId: "cat_1",
  isActive: true,
};

/** Present on every non-Sunday of March 2026. */
function marchAttendance(): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let d = 1; d <= 31; d += 1) {
    const date = `2026-03-${String(d).padStart(2, "0")}`;
    if (new Date(2026, 2, d).getDay() === 0) continue;
    rows.push({ employeeId: "emp_1", date, status: "present", hoursWorked: 8 });
  }
  return rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEmployees.mockResolvedValue([EMPLOYEE]);
  mockGetAttendanceInRange.mockResolvedValue(marchAttendance());
  mockGetHolidaysInRange.mockResolvedValue([]);
  mockGetOperatorHolidaysInRange.mockResolvedValue([]);
  mockGetShifts.mockResolvedValue([{ id: "shift_1", hoursPerDay: 8 }]);
  mockGetSalarySheetOverridesForMonth.mockResolvedValue([]);
  mockGetDeductionsByEmployee.mockResolvedValue([]);
});

async function sheetWithCategory(
  category: Record<string, unknown>,
): Promise<SalarySheetRow> {
  mockGetSundayCategories.mockResolvedValue([category]);
  const { rows } = await getSalarySheetForRange(
    2026,
    2,
    "2026-03-01",
    "2026-03-31",
  );
  return rows[0];
}

describe("legacy Sunday categories still pay exactly what they paid", () => {
  it("threshold: legacy row and hand-written general rule produce identical sheets", async () => {
    const legacy = await sheetWithCategory({
      id: "cat_1",
      name: "12 => 2",
      mode: "threshold",
      requiredPresent: 12,
      earnedSundays: 2,
    });
    const configured = await sheetWithCategory({
      id: "cat_1",
      name: "12 => 2",
      rule: {
        kind: "table",
        brackets: [{ whenPresentDaysAtLeast: 12, give: 2 }],
        repeatEveryPresentDays: 0,
        repeatGive: 0,
        maxPerCycle: 2,
        maxPerMonth: 4,
        cycleDays: 15,
        sundayPremium: null,
      },
    });

    expect(legacy).toEqual(configured);
    // The figures the old engine produced for this month: both half-month
    // windows qualify, so 4 earned days, capped at the monthly maximum.
    expect(legacy.earnedSundayPayDays).toBe(4);
    expect(legacy.presentDays).toBe(26);
    expect(legacy.totalPaidDays).toBe(30);
    expect(legacy.calculatedSalary).toBe(9000);
  });

  it("step: legacy row and hand-written general rule produce identical sheets", async () => {
    const legacy = await sheetWithCategory({
      id: "cat_1",
      name: "every 6 => 1",
      mode: "step",
      everyPresentDays: 6,
      earnedPerStep: 1,
    });
    const configured = await sheetWithCategory({
      id: "cat_1",
      name: "every 6 => 1",
      rule: {
        kind: "repeat",
        brackets: [],
        repeatEveryPresentDays: 6,
        repeatGive: 1,
        maxPerCycle: 2,
        maxPerMonth: 4,
        cycleDays: 15,
        sundayPremium: null,
      },
    });

    expect(legacy).toEqual(configured);
    // 12 and 14 present days per window → 2 steps each, exactly at the cap.
    expect(legacy.earnedSundayPayDays).toBe(4);
  });

  it("a category earning nothing keeps earning nothing, not the default", async () => {
    const row = await sheetWithCategory({
      id: "cat_1",
      name: "no Sundays",
      mode: "threshold",
      requiredPresent: 12,
      earnedSundays: 0,
    });
    expect(row.earnedSundayPayDays).toBe(0);
  });

  it("an employee with no category falls back to the same default as before", async () => {
    mockGetEmployees.mockResolvedValue([
      { ...EMPLOYEE, sundayCategoryId: undefined },
    ]);
    const row = await sheetWithCategory({ id: "other", name: "unused" });
    expect(row.earnedSundayPayDays).toBe(4);
  });
});

describe("configuration the old model could not express", () => {
  it("pays a multi-step bracket table the old threshold mode could not hold", async () => {
    const row = await sheetWithCategory({
      id: "cat_1",
      name: "tiered",
      rule: {
        kind: "table",
        brackets: [
          { whenPresentDaysAtLeast: 8, give: 1 },
          { whenPresentDaysAtLeast: 14, give: 5 },
        ],
        repeatEveryPresentDays: 0,
        repeatGive: 0,
        maxPerCycle: null,
        maxPerMonth: null,
        cycleDays: 15,
        sundayPremium: null,
      },
    });
    // 12 present in the first window (→ 1) and 14 in the second (→ 5). With the
    // caps removed nothing silently trims the 5 down to 2 the way it used to.
    expect(row.earnedSundayPayDays).toBe(6);
  });

  it("honours a configured cycle length", async () => {
    const row = await sheetWithCategory({
      id: "cat_1",
      name: "weekly-ish",
      rule: {
        kind: "table",
        brackets: [{ whenPresentDaysAtLeast: 6, give: 1 }],
        repeatEveryPresentDays: 0,
        repeatGive: 0,
        maxPerCycle: null,
        maxPerMonth: null,
        cycleDays: 10,
        sundayPremium: null,
      },
    });
    // March 2026 splits into 1–10, 11–20, 21–31; each holds at least 6 working days.
    expect(row.earnedSundayPayDays).toBe(3);
  });
});

describe("resolveOperatorSundayRule precedence", () => {
  const factoryDefaults = {
    defaultSundayPremiumRequiredDays: 26,
    defaultSundayPremiumMultiplier: 1.2,
  };

  it("uses the factory default when neither employee nor category says anything", () => {
    expect(
      resolveOperatorSundayRule({}, normalizeSundayRule(null), factoryDefaults),
    ).toEqual({ requiredPresentDays: 26, sundayMultiplier: 1.2 });
  });

  it("prefers the category premium over the factory default", () => {
    const rule = normalizeSundayRule({
      kind: "table",
      sundayPremium: { requiredPresentDays: 20, multiplier: 1.5 },
    });
    expect(resolveOperatorSundayRule({}, rule, factoryDefaults)).toEqual({
      requiredPresentDays: 20,
      sundayMultiplier: 1.5,
    });
  });

  it("lets the employee override the category, field by field", () => {
    const rule = normalizeSundayRule({
      kind: "table",
      sundayPremium: { requiredPresentDays: 20, multiplier: 1.5 },
    });
    expect(
      resolveOperatorSundayRule({ sundayMultiplier: 2 }, rule, factoryDefaults),
    ).toEqual({ requiredPresentDays: 20, sundayMultiplier: 2 });
  });

  it("ignores an employee field that is not a usable number", () => {
    expect(
      resolveOperatorSundayRule(
        { requiredPresentDays: null, sundayMultiplier: NaN },
        normalizeSundayRule(null),
        factoryDefaults,
      ),
    ).toEqual({ requiredPresentDays: 26, sundayMultiplier: 1.2 });
  });
});
