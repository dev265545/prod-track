import { describe, expect, it } from "vitest";
import {
  getCompositeCorrectionSlices,
  mergeSalarySheetRows,
  resolveEffectiveSalarySheetRow,
} from "./salarySheetComposite";
import type { SalarySheetRow } from "./salarySheetService";
import type { SalarySheetOverrideRecord } from "./salarySheetOverrideService";

function buildRow(overrides: Partial<SalarySheetRow> = {}): SalarySheetRow {
  return {
    id: "emp_1",
    name: "Asha",
    presentDays: 10,
    absentDays: 2,
    holidayPresentDays: 0,
    earnedSundayPayDays: 1,
    sundayPresentBonusDays: 1,
    totalPaidDays: 12,
    monthlySalary: 9000,
    ratePerDay: 300,
    ratePerHour: 37.5,
    hoursExtraTotal: 1,
    hoursReducedTotal: 0.5,
    baseCalculatedSalary: 3600,
    calculatedSalary: 3600,
    hasOverrides: false,
    overrideNotes: "",
    overrideUpdatedAt: "",
    overrideValues: {},
    calculatedValues: {
      presentDays: 10,
      absentDays: 2,
      holidayPresentDays: 0,
      earnedSundayPayDays: 1,
      sundayPresentBonusDays: 1,
      totalPaidDays: 12,
      hoursExtraTotal: 1,
      hoursReducedTotal: 0.5,
      calculatedSalary: 3600,
    },
    ...overrides,
  };
}

function buildOverrideRecord(
  fromDate: string,
  toDate: string,
  overrides: SalarySheetOverrideRecord["overrides"],
): SalarySheetOverrideRecord {
  return {
    id: `override:${fromDate}:${toDate}`,
    employeeId: "emp_1",
    year: 2026,
    month: 3,
    fromDate,
    toDate,
    notes: "",
    updatedAt: "2026-05-03T00:00:00.000Z",
    overrides,
  };
}

describe("getCompositeCorrectionSlices", () => {
  it("returns both halves for a full April 2026 month", () => {
    expect(
      getCompositeCorrectionSlices(2026, 3, "2026-04-01", "2026-04-30"),
    ).toEqual([
      expect.objectContaining({ fromDate: "2026-04-01", toDate: "2026-04-15" }),
      expect.objectContaining({ fromDate: "2026-04-16", toDate: "2026-04-30" }),
    ]);
  });

  it("returns a single slice for an exact half-month range", () => {
    expect(
      getCompositeCorrectionSlices(2026, 3, "2026-04-01", "2026-04-15"),
    ).toHaveLength(1);
  });
});

describe("resolveEffectiveSalarySheetRow", () => {
  it("merges first-half adjustment with calculated second half for full month", () => {
    const fullMonthBase = buildRow({
      presentDays: 22,
      absentDays: 4,
      earnedSundayPayDays: 3,
      sundayPresentBonusDays: 2,
      totalPaidDays: 27,
      calculatedSalary: 8100,
      calculatedValues: {
        presentDays: 22,
        absentDays: 4,
        holidayPresentDays: 0,
        earnedSundayPayDays: 3,
        sundayPresentBonusDays: 2,
        totalPaidDays: 27,
        hoursExtraTotal: 2,
        hoursReducedTotal: 1,
        calculatedSalary: 8100,
      },
    });

    const employeeOverrides = [
      buildOverrideRecord("2026-04-01", "2026-04-15", {
        presentDays: 8,
        earnedSundayPayDays: 2,
        sundayPresentBonusDays: 2,
      }),
    ];

    const effective = resolveEffectiveSalarySheetRow(
      fullMonthBase,
      employeeOverrides,
      2026,
      3,
      "2026-04-01",
      "2026-04-30",
      (fromDate, toDate) => {
        if (fromDate === "2026-04-01" && toDate === "2026-04-15") {
          return buildRow({
            presentDays: 11,
            absentDays: 2,
            earnedSundayPayDays: 1,
            sundayPresentBonusDays: 1,
            totalPaidDays: 13,
            calculatedSalary: 3900,
            calculatedValues: {
              presentDays: 11,
              absentDays: 2,
              holidayPresentDays: 0,
              earnedSundayPayDays: 1,
              sundayPresentBonusDays: 1,
              totalPaidDays: 13,
              hoursExtraTotal: 1,
              hoursReducedTotal: 0.5,
              calculatedSalary: 3900,
            },
          });
        }
        return buildRow({
          presentDays: 11,
          absentDays: 2,
          earnedSundayPayDays: 2,
          sundayPresentBonusDays: 1,
          totalPaidDays: 14,
          calculatedSalary: 4200,
          calculatedValues: {
            presentDays: 11,
            absentDays: 2,
            holidayPresentDays: 0,
            earnedSundayPayDays: 2,
            sundayPresentBonusDays: 1,
            totalPaidDays: 14,
            hoursExtraTotal: 1,
            hoursReducedTotal: 0.5,
            calculatedSalary: 4200,
          },
        });
      },
    );

    expect(effective.presentDays).toBe(19);
    expect(effective.earnedSundayPayDays).toBe(4);
    expect(effective.sundayPresentBonusDays).toBe(3);
    expect(effective.totalPaidDays).toBe(26);
    expect(effective.calculatedSalary).toBe(7800);
    expect(effective.hasOverrides).toBe(true);
  });

  it("prefers an exact full-month override over half-month records", () => {
    const fullMonthBase = buildRow();
    const employeeOverrides = [
      buildOverrideRecord("2026-04-01", "2026-04-15", { presentDays: 8 }),
      buildOverrideRecord("2026-04-01", "2026-04-30", { presentDays: 20 }),
    ];

    const effective = resolveEffectiveSalarySheetRow(
      fullMonthBase,
      employeeOverrides,
      2026,
      3,
      "2026-04-01",
      "2026-04-30",
      () => fullMonthBase,
    );

    expect(effective.presentDays).toBe(20);
  });
});

describe("mergeSalarySheetRows", () => {
  it("sums payroll fields across slices", () => {
    const merged = mergeSalarySheetRows([
      buildRow({ presentDays: 8, calculatedSalary: 2400, hasOverrides: true }),
      buildRow({ presentDays: 10, calculatedSalary: 3000 }),
    ]);

    expect(merged.presentDays).toBe(18);
    expect(merged.calculatedSalary).toBe(5400);
    expect(merged.hasOverrides).toBe(true);
  });
});
