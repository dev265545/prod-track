import { describe, expect, it, vi, beforeEach } from "vitest";
import { STORES } from "@/lib/db/schema";
import {
  getIndexKeyPath,
  matchesIndexRange,
  sortByIndexOrder,
} from "@/lib/db/indexes";

const exportOverride = {
  id: "salary_sheet_override:emp_1776958564147_mjandby:2026:5:2026-06-01:2026-06-15",
  employeeId: "emp_1776958564147_mjandby",
  year: 2026,
  month: 5,
  fromDate: "2026-06-01",
  toDate: "2026-06-15",
  notes: "",
  updatedAt: "2026-06-03T23:27:56.030Z",
  overrides: { presentDays: 8, sundayPresentBonusDays: 2 },
};

const exportEmployee = {
  id: "emp_1776958564147_mjandby",
  name: "dev",
  isActive: true,
  monthlySalary: 10000,
  shiftId: "shift_default",
};

const exportAttendance = [
  { date: "2026-06-01", status: "present" },
  { date: "2026-06-02", status: "present" },
  { date: "2026-06-03", status: "present" },
  { date: "2026-06-04", status: "present" },
  { date: "2026-06-05", status: "present" },
  { date: "2026-06-06", status: "present" },
  { date: "2026-06-08", status: "present" },
  { date: "2026-06-09", status: "present" },
  { date: "2026-06-10", status: "present" },
  { date: "2026-06-11", status: "present" },
  { date: "2026-06-12", status: "present" },
  { date: "2026-06-13", status: "present" },
  { date: "2026-06-15", status: "present" },
].map((row, i) => ({
  id: `att_${i}`,
  employeeId: exportEmployee.id,
  hoursWorked: 8,
  ...row,
}));

const exportHolidays = [
  { id: "h1", date: "2026-06-04" },
  { id: "h2", date: "2026-06-05" },
];

const { mockGetAll, mockGetEmployees, mockGetAttendanceInRange, mockGetHolidaysInRange, mockGetShifts, mockGetSundayCategories } =
  vi.hoisted(() => ({
    mockGetAll: vi.fn(),
    mockGetEmployees: vi.fn(),
    mockGetAttendanceInRange: vi.fn(),
    mockGetHolidaysInRange: vi.fn(),
    mockGetShifts: vi.fn(),
    mockGetSundayCategories: vi.fn(),
  }));

vi.mock("@/lib/db/adapter", () => ({
  STORES,
  getAll: mockGetAll,
  // Range reads run through the real key-matching logic over whatever
  // `getAll` is stubbed to return, so this mock cannot drift from the
  // semantics the actual backends implement.
  getByIndex: async (
    store: string,
    indexName: string,
    lower: string | string[],
    upper: string | string[],
  ) => {
    const keyPath = getIndexKeyPath(store, indexName);
    if (!keyPath) throw new Error(`Unknown index ${store}.${indexName}`);
    const rows = (await mockGetAll(store)) as Record<string, unknown>[];
    return sortByIndexOrder(
      rows.filter((row) => matchesIndexRange(row, keyPath, lower, upper)),
      keyPath,
    );
  },
}));

vi.mock("./employeeService", () => ({
  getEmployees: mockGetEmployees,
  getEmployee: vi.fn(),
}));

vi.mock("./attendanceService", () => ({
  getAttendanceInRange: mockGetAttendanceInRange,
  // The single-row path reads one employee's attendance through the
  // employee_date index instead of the whole period — same stubbed rows,
  // narrowed by the real index key matching.
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

vi.mock("./factoryHolidayService", () => ({
  getHolidaysInRange: mockGetHolidaysInRange,
}));

vi.mock("./shiftService", () => ({
  getShifts: mockGetShifts,
}));

vi.mock("./sundayCategoryService", async () => {
  const { DEFAULT_SUNDAY_CATEGORY_RULE } = await import(
    "@/lib/utils/attendanceStats"
  );
  return {
    getSundayCategories: mockGetSundayCategories,
    resolveSundayCategoryRule: () => undefined,
    // The sheet also resolves what a worker with no Sunday category falls on.
    // This export has no categories and default settings, so the answer is the
    // built-in rule — the same money this fixture has always asserted.
    resolveUnassignedSundayRule: () => ({
      rule: DEFAULT_SUNDAY_CATEGORY_RULE,
      source: "asBefore" as const,
      categoryName: "",
    }),
  };
});

import { getSalarySheetForRange, getSalarySheetRowForEmployee, salarySheetRowHasAdjustment } from "./salarySheetService";

describe("salary sheet with prodtrack-2026-06-03 export override", () => {
  beforeEach(() => {
    mockGetAll.mockResolvedValue([exportOverride]);
    mockGetEmployees.mockResolvedValue([exportEmployee]);
    mockGetHolidaysInRange.mockResolvedValue(exportHolidays);
    mockGetShifts.mockResolvedValue([
      { id: "shift_default", hoursPerDay: 8, name: "Default" },
    ]);
    mockGetSundayCategories.mockResolvedValue([]);
    mockGetAttendanceInRange.mockResolvedValue(
      exportAttendance.map((row) => ({ ...row, employeeId: exportEmployee.id })),
    );
  });

  it("applies first-half override for June 2026 (month index 5)", async () => {
    const { rows } = await getSalarySheetForRange(
      2026,
      5,
      "2026-06-01",
      "2026-06-15",
    );
    const row = rows.find((r) => r.id === exportEmployee.id);
    expect(row).toBeDefined();
    expect(salarySheetRowHasAdjustment(row)).toBe(true);
    expect(row!.presentDays).toBe(8);
    expect(row!.sundayPresentBonusDays).toBe(2);
    expect(row!.hasOverrides).toBe(true);
    expect(row!.presentDays).not.toBe(row!.calculatedValues.presentDays);
  });

  it("merges override into full-month row", async () => {
    const row = await getSalarySheetRowForEmployee(
      exportEmployee.id,
      2026,
      5,
      "2026-06-01",
      "2026-06-30",
    );
    expect(row).not.toBeNull();
    expect(salarySheetRowHasAdjustment(row)).toBe(true);
    expect(row!.presentDays).not.toBe(row!.calculatedValues.presentDays);
  });

  it("still applies when stored month is a string (sqlite/json)", async () => {
    mockGetAll.mockResolvedValue([
      {
        ...exportOverride,
        year: "2026",
        month: "5",
      },
    ]);
    const { rows } = await getSalarySheetForRange(
      2026,
      5,
      "2026-06-01",
      "2026-06-15",
    );
    const row = rows.find((r) => r.id === exportEmployee.id);
    expect(row?.presentDays).toBe(8);
  });
});
