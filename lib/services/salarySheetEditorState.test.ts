import { describe, expect, it } from "vitest";
import type { SalarySheetRow } from "./salarySheetService";
import {
  buildSalarySheetDraftState,
  buildSalarySheetOverrideValuesFromDraft,
  getSalarySheetDriverDefaults,
  stepSalarySheetDriverValue,
} from "./salarySheetEditorState";

function buildRow(): SalarySheetRow {
  return {
    dayPayCap: { limit: 2, clippedDays: 0, clippedDates: 0 },
    id: "emp_1",
    name: "Asha",
    employeeType: "salaried",
    presentDays: 12,
    absentDays: 14,
    holidayPresentDays: 1,
    earnedSundayPayDays: 0,
    sundayPresentBonusDays: 0,
    totalPaidDays: 12,
    monthlySalary: 9300,
    ratePerDay: 300,
    ratePerHour: 37.5,
    hoursExtraTotal: 0,
    hoursReducedTotal: 0,
    baseCalculatedSalary: 3600,
    calculatedSalary: 3600,
    advanceDeduction: 0,
    netCalculatedSalary: 3600,
    hasOverrides: false,
    overrideNotes: "",
    overrideUpdatedAt: "",
    overrideValues: {},
    calculatedValues: {
      presentDays: 12,
      absentDays: 14,
      holidayPresentDays: 1,
      earnedSundayPayDays: 0,
      sundayPresentBonusDays: 0,
      totalPaidDays: 12,
      hoursExtraTotal: 0,
      hoursReducedTotal: 0,
      calculatedSalary: 3600,
      advanceDeduction: 0,
      netCalculatedSalary: 3600,
    },
  };
}

describe("salarySheetEditorState", () => {
  it("prefills the draft with current effective row values", () => {
    expect(getSalarySheetDriverDefaults(buildRow())).toEqual({
      presentDays: 12,
      holidayPresentDays: 1,
      earnedSundayPayDays: 0,
      sundayPresentBonusDays: 0,
      hoursExtraTotal: 0,
      hoursReducedTotal: 0,
    });
  });

  it("auto-adjusts absent, paid days, and salary from driver changes", () => {
    const draft = buildSalarySheetDraftState(buildRow(), {
      presentDays: 13,
      holidayPresentDays: 1,
      earnedSundayPayDays: 2,
      sundayPresentBonusDays: 1,
      hoursExtraTotal: 0,
      hoursReducedTotal: 0,
    });

    expect(draft.derived.absentDays).toBe(13);
    expect(draft.derived.totalPaidDays).toBe(16);
    expect(draft.derived.calculatedSalary).toBe(4800);
    expect(draft.changedDerivedFields).toEqual([
      "absentDays",
      "totalPaidDays",
      "calculatedSalary",
    ]);
  });

  it("saves only driver overrides that differ from calculated values", () => {
    const row = buildRow();
    const draft = buildSalarySheetDraftState(row, {
      presentDays: 13,
      holidayPresentDays: 1,
      earnedSundayPayDays: 2,
      sundayPresentBonusDays: 0,
      hoursExtraTotal: 1,
      hoursReducedTotal: 0,
    });

    expect(buildSalarySheetOverrideValuesFromDraft(row, draft)).toEqual({
      presentDays: 13,
      earnedSundayPayDays: 2,
      hoursExtraTotal: 1,
    });
  });

  it("steps by whole numbers and never goes below zero", () => {
    expect(stepSalarySheetDriverValue(12, 1)).toBe(13);
    expect(stepSalarySheetDriverValue(12, -1)).toBe(11);
    expect(stepSalarySheetDriverValue(0, -1)).toBe(0);
  });
});
