import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Proof that "what does a worker with no Sunday rule earn?" reaches the payslip.
 *
 * The setting was stored, resolved and described on screen before this, but no
 * payroll path passed it, so choosing it changed the words and not the rupees.
 * These tests build a real salary sheet — the real `sundayCategoryService`, the
 * real rule engine — for a worker with no Sunday category, and assert the money
 * follows the owner's choice.
 *
 * The default (`"asBefore"`) must pay exactly what every install already paid,
 * so each case is compared against the built-in rule's own row.
 */

const {
  mockGetEmployees,
  mockGetEmployee,
  mockGetAttendanceInRange,
  mockGetAttendanceByEmployeeInRange,
  mockGetHolidaysInRange,
  mockGetOperatorHolidaysInRange,
  mockGetShifts,
  mockGetSundayCategories,
  mockGetSalarySheetOverridesForMonth,
  mockGetDeductionsByEmployee,
  mockGetAppSettings,
} = vi.hoisted(() => ({
  mockGetEmployees: vi.fn(),
  mockGetEmployee: vi.fn(),
  mockGetAttendanceInRange: vi.fn(),
  mockGetAttendanceByEmployeeInRange: vi.fn(),
  mockGetHolidaysInRange: vi.fn(),
  mockGetOperatorHolidaysInRange: vi.fn(),
  mockGetShifts: vi.fn(),
  mockGetSundayCategories: vi.fn(),
  mockGetSalarySheetOverridesForMonth: vi.fn(),
  mockGetDeductionsByEmployee: vi.fn(),
  mockGetAppSettings: vi.fn(),
}));

vi.mock("./employeeService", () => ({
  getEmployees: mockGetEmployees,
  getEmployee: mockGetEmployee,
}));
vi.mock("./attendanceService", () => ({
  getAttendanceInRange: mockGetAttendanceInRange,
  getAttendanceByEmployeeInRange: mockGetAttendanceByEmployeeInRange,
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
vi.mock("./appSettingsService", async () => {
  const actual = await vi.importActual<typeof import("./appSettingsService")>(
    "./appSettingsService",
  );
  return { ...actual, getAppSettings: mockGetAppSettings };
});
// Deliberately NOT mocked: sundayCategoryService and the rule engine, so what
// is under test is the real resolution the app runs.
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

import { DEFAULT_APP_SETTINGS } from "./appSettingsService";
import { getSalarySheetForRange, type SalarySheetRow } from "./salarySheetService";

/** No `sundayCategoryId`: this is the worker the setting is about. */
const UNASSIGNED_EMPLOYEE = {
  id: "emp_1",
  name: "Asha",
  employeeType: "salaried",
  monthlySalary: 9300,
  shiftId: "shift_1",
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

/** A named rule that earns half of what the built-in one does. */
const HALF_RULE_CATEGORY = {
  id: "cat_half",
  name: "Half Sundays",
  rule: {
    kind: "table",
    brackets: [{ whenPresentDaysAtLeast: 12, give: 1 }],
    repeatEveryPresentDays: 0,
    repeatGive: 0,
    maxPerCycle: 2,
    maxPerMonth: 4,
    cycleDays: 15,
    sundayPremium: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEmployees.mockResolvedValue([UNASSIGNED_EMPLOYEE]);
  mockGetAttendanceInRange.mockResolvedValue(marchAttendance());
  mockGetHolidaysInRange.mockResolvedValue([]);
  mockGetOperatorHolidaysInRange.mockResolvedValue([]);
  mockGetShifts.mockResolvedValue([{ id: "shift_1", hoursPerDay: 8 }]);
  mockGetSalarySheetOverridesForMonth.mockResolvedValue([]);
  mockGetDeductionsByEmployee.mockResolvedValue([]);
  mockGetSundayCategories.mockResolvedValue([]);
  mockGetAppSettings.mockResolvedValue(DEFAULT_APP_SETTINGS);
});

async function sheetRow(
  settings: Partial<typeof DEFAULT_APP_SETTINGS> = {},
  categories: Record<string, unknown>[] = [],
): Promise<SalarySheetRow> {
  mockGetSundayCategories.mockResolvedValue(categories);
  mockGetAppSettings.mockResolvedValue({ ...DEFAULT_APP_SETTINGS, ...settings });
  const { rows } = await getSalarySheetForRange(
    2026,
    2,
    "2026-03-01",
    "2026-03-31",
  );
  return rows[0];
}

describe("the no-category Sunday rule reaches the payslip", () => {
  it("defaults to exactly what every install already paid", async () => {
    const row = await sheetRow();
    // The built-in rule: both half-month windows qualify, 4 earned days.
    expect(row.earnedSundayPayDays).toBe(4);
    expect(row.presentDays).toBe(26);
    expect(row.totalPaidDays).toBe(30);
    expect(row.calculatedSalary).toBe(9000);
    // And the setting being absent altogether — an install written before it
    // existed — is the same row.
    const legacyInstall = await sheetRow({
      noCategorySundayRule: undefined as never,
      noCategorySundayCategoryId: undefined as never,
    });
    expect(legacyInstall).toEqual(row);
  });

  it("earns nothing when the owner chose 'they earn no extra days'", async () => {
    const row = await sheetRow({ noCategorySundayRule: "nothing" });
    expect(row.earnedSundayPayDays).toBe(0);
    // Only the earned pool moved; the days actually worked are untouched.
    expect(row.presentDays).toBe(26);
    expect(row.totalPaidDays).toBe(26);
    expect(row.calculatedSalary).toBeLessThan(9000);
  });

  it("follows the rule the owner named", async () => {
    const row = await sheetRow(
      {
        noCategorySundayRule: "category",
        noCategorySundayCategoryId: "cat_half",
      },
      [HALF_RULE_CATEGORY],
    );
    // One earned day per qualifying window instead of two.
    expect(row.earnedSundayPayDays).toBe(2);
    expect(row.totalPaidDays).toBe(28);
  });

  it("falls back to the built-in rule when the named rule has been deleted", async () => {
    // The owner named a rule and then deleted it. Paying by a rule that no
    // longer exists is not an option, and neither is throwing mid-payroll.
    const row = await sheetRow(
      {
        noCategorySundayRule: "category",
        noCategorySundayCategoryId: "cat_gone",
      },
      [],
    );
    const asBefore = await sheetRow();
    expect(row).toEqual(asBefore);
    expect(row.earnedSundayPayDays).toBe(4);
  });

  it("leaves a worker who has their own Sunday rule alone", async () => {
    // The setting is about workers with no category; someone assigned to one
    // must not be moved by it.
    const assigned = { ...UNASSIGNED_EMPLOYEE, sundayCategoryId: "cat_half" };
    mockGetEmployees.mockResolvedValue([assigned]);
    const withSettingOff = await sheetRow({}, [HALF_RULE_CATEGORY]);
    mockGetEmployees.mockResolvedValue([assigned]);
    const withSettingOn = await sheetRow(
      { noCategorySundayRule: "nothing" },
      [HALF_RULE_CATEGORY],
    );
    expect(withSettingOn).toEqual(withSettingOff);
    expect(withSettingOn.earnedSundayPayDays).toBe(2);
  });
});
