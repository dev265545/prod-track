import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  applySalarySheetOverrides,
  getSalarySheetForRange,
  salarySheetRowHasAdjustment,
  type SalarySheetRow,
} from "./salarySheetService";
import type { SalarySheetOverrideRecord } from "./salarySheetOverrideService";
import { DEFAULT_SUNDAY_CATEGORY_RULE } from "@/lib/utils/attendanceStats";

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
vi.mock("./shiftService", () => ({
  getShifts: mockGetShifts,
}));
vi.mock("./sundayCategoryService", () => ({
  getSundayCategories: mockGetSundayCategories,
  resolveSundayCategoryRule: () => DEFAULT_SUNDAY_CATEGORY_RULE,
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

  it("ignores advances for a Production employee (own deduction flow is untouched)", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e2", name: "Ravi", monthlySalary: 0, employeeType: "production" },
    ]);
    mockGetAttendanceInRange.mockResolvedValue([attRow("e2", "2026-04-01")]);
    mockGetDeductionsByEmployee.mockResolvedValue([
      { employeeId: "e2", periodFrom: FROM, periodTo: TO, amount: 300 },
    ]);

    const { rows } = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
    const row = rows.find((r) => r.id === "e2")!;

    expect(row.advanceDeduction).toBe(0);
    expect(row.netCalculatedSalary).toBe(row.calculatedSalary);
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
