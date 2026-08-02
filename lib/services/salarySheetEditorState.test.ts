import { describe, expect, it } from "vitest";
import type { SalarySheetRow } from "./salarySheetService";
import {
  buildSalarySheetDraftState,
  buildSalarySheetOverrideValuesFromDraft,
  getSalarySheetCalculatedDrivers,
  getSalarySheetDriverDefaults,
  isSalarySheetDriverCorrected,
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

  describe("a row that already carries a correction", () => {
    /**
     * The app counted 12 present days; somebody corrected it to 14. The
     * effective figures move, `calculatedValues` never does.
     */
    function buildCorrectedRow(): SalarySheetRow {
      const row = buildRow();
      return {
        ...row,
        presentDays: 14,
        totalPaidDays: 14,
        calculatedSalary: 4200,
        netCalculatedSalary: 4200,
        hasOverrides: true,
        overrideValues: { presentDays: 14 },
      };
    }

    it("reopening and saving without touching anything keeps the correction", () => {
      const row = buildCorrectedRow();
      const draft = buildSalarySheetDraftState(
        row,
        getSalarySheetDriverDefaults(row),
      );

      expect(buildSalarySheetOverrideValuesFromDraft(row, draft)).toEqual({
        presentDays: 14,
      });
    });

    it("does not drift when opened and saved over and over", () => {
      let row = buildCorrectedRow();
      let saved = buildSalarySheetOverrideValuesFromDraft(
        row,
        buildSalarySheetDraftState(row, getSalarySheetDriverDefaults(row)),
      );

      for (let pass = 0; pass < 5; pass += 1) {
        // What a reload would hand back: the correction applied on top of the
        // unchanged calculated figures.
        row = {
          ...row,
          presentDays: saved.presentDays ?? row.calculatedValues.presentDays,
        };
        const next = buildSalarySheetOverrideValuesFromDraft(
          row,
          buildSalarySheetDraftState(row, getSalarySheetDriverDefaults(row)),
        );
        expect(next).toEqual(saved);
        saved = next;
      }

      expect(saved).toEqual({ presentDays: 14 });
    });

    it("shows the same absent days on every reopen", () => {
      const row = buildCorrectedRow();
      const first = buildSalarySheetDraftState(
        row,
        getSalarySheetDriverDefaults(row),
      );
      // Reopened after the save: the effective row now says 14 present days,
      // but the period still holds the same 26 workdays, so the preview must
      // not have grown with the correction.
      const second = buildSalarySheetDraftState(
        row,
        getSalarySheetDriverDefaults(row),
      );

      expect(first.derived.absentDays).toBe(12);
      expect(second.derived.absentDays).toBe(12);
    });

    it("offers the app's own count for putting a correction back", () => {
      const row = buildCorrectedRow();
      expect(getSalarySheetCalculatedDrivers(row).presentDays).toBe(12);
      expect(getSalarySheetDriverDefaults(row).presentDays).toBe(14);
    });

    it("clearing a field back to the app's count removes the correction", () => {
      const row = buildCorrectedRow();
      const draft = buildSalarySheetDraftState(
        row,
        getSalarySheetCalculatedDrivers(row),
      );

      expect(buildSalarySheetOverrideValuesFromDraft(row, draft)).toEqual({});
    });

    it("marks only the corrected field as hand-typed", () => {
      const row = buildCorrectedRow();
      const drivers = getSalarySheetDriverDefaults(row);

      expect(
        isSalarySheetDriverCorrected(row, "presentDays", drivers.presentDays),
      ).toBe(true);
      expect(
        isSalarySheetDriverCorrected(
          row,
          "earnedSundayPayDays",
          drivers.earnedSundayPayDays,
        ),
      ).toBe(false);
    });

    it("correcting one driver leaves the others free to follow the app", () => {
      const row = buildCorrectedRow();
      const draft = buildSalarySheetDraftState(row, {
        ...getSalarySheetDriverDefaults(row),
        earnedSundayPayDays: 1,
      });

      // Nothing for holiday days or the hour totals: an untouched driver must
      // not be frozen at today's figure.
      expect(buildSalarySheetOverrideValuesFromDraft(row, draft)).toEqual({
        presentDays: 14,
        earnedSundayPayDays: 1,
      });
    });
  });

  describe("a genuine zero", () => {
    it("is saved as a correction, not read as 'nothing entered'", () => {
      const row = buildRow();
      const draft = buildSalarySheetDraftState(row, {
        ...getSalarySheetDriverDefaults(row),
        presentDays: 0,
      });
      const overrides = buildSalarySheetOverrideValuesFromDraft(row, draft);

      expect(overrides).toEqual({ presentDays: 0 });
      expect(Object.prototype.hasOwnProperty.call(overrides, "presentDays")).toBe(
        true,
      );
      expect(overrides.presentDays).toBe(0);
    });

    it("survives a reopen instead of falling back to the app's count", () => {
      const row: SalarySheetRow = {
        ...buildRow(),
        presentDays: 0,
        totalPaidDays: 0,
        calculatedSalary: 0,
        netCalculatedSalary: 0,
        hasOverrides: true,
        overrideValues: { presentDays: 0 },
      };

      expect(getSalarySheetDriverDefaults(row).presentDays).toBe(0);
      expect(
        buildSalarySheetOverrideValuesFromDraft(
          row,
          buildSalarySheetDraftState(row, getSalarySheetDriverDefaults(row)),
        ),
      ).toEqual({ presentDays: 0 });
    });
  });
});
