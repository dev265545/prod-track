import { describe, expect, it } from "vitest";
import { applySalarySheetOverrides, type SalarySheetRow } from "./salarySheetService";
import type { SalarySheetOverrideRecord } from "./salarySheetOverrideService";

function buildBaseRow(): SalarySheetRow {
  return {
    id: "emp_1",
    name: "Asha",
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
});
