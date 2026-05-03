import type { SalarySheetRow } from "./salarySheetService";
import type { SalarySheetOverrideValues } from "./salarySheetOverrideService";

export type SalarySheetDriverField =
  | "presentDays"
  | "holidayPresentDays"
  | "earnedSundayPayDays"
  | "sundayPresentBonusDays"
  | "hoursExtraTotal"
  | "hoursReducedTotal";

export interface SalarySheetDraftDrivers {
  presentDays: number;
  holidayPresentDays: number;
  earnedSundayPayDays: number;
  sundayPresentBonusDays: number;
  hoursExtraTotal: number;
  hoursReducedTotal: number;
}

export interface SalarySheetDerivedValues {
  absentDays: number;
  totalPaidDays: number;
  calculatedSalary: number;
}

export interface SalarySheetDraftState {
  drivers: SalarySheetDraftDrivers;
  derived: SalarySheetDerivedValues;
  changedDerivedFields: Array<keyof SalarySheetDerivedValues>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getSalarySheetDriverDefaults(
  row: SalarySheetRow,
): SalarySheetDraftDrivers {
  return {
    presentDays: row.presentDays,
    holidayPresentDays: row.holidayPresentDays,
    earnedSundayPayDays: row.earnedSundayPayDays,
    sundayPresentBonusDays: row.sundayPresentBonusDays,
    hoursExtraTotal: row.hoursExtraTotal,
    hoursReducedTotal: row.hoursReducedTotal,
  };
}

export function computeSalarySheetDerivedValues(
  row: SalarySheetRow,
  drivers: SalarySheetDraftDrivers,
): SalarySheetDerivedValues {
  const fixedWorkdayTotal = round2(row.presentDays + row.absentDays);
  const absentDays = round2(Math.max(0, fixedWorkdayTotal - drivers.presentDays));
  const totalPaidDays = round2(
    drivers.presentDays +
      drivers.earnedSundayPayDays +
      drivers.sundayPresentBonusDays,
  );
  const calculatedSalary = round2(totalPaidDays * row.ratePerDay);

  return {
    absentDays,
    totalPaidDays,
    calculatedSalary,
  };
}

export function buildSalarySheetDraftState(
  row: SalarySheetRow,
  drivers: SalarySheetDraftDrivers,
): SalarySheetDraftState {
  const derived = computeSalarySheetDerivedValues(row, drivers);
  const changedDerivedFields: Array<keyof SalarySheetDerivedValues> = [];

  if (derived.absentDays !== row.absentDays) changedDerivedFields.push("absentDays");
  if (derived.totalPaidDays !== row.totalPaidDays) changedDerivedFields.push("totalPaidDays");
  if (derived.calculatedSalary !== row.calculatedSalary) {
    changedDerivedFields.push("calculatedSalary");
  }

  return {
    drivers,
    derived,
    changedDerivedFields,
  };
}

export function buildSalarySheetOverrideValuesFromDraft(
  row: SalarySheetRow,
  draft: SalarySheetDraftState,
): SalarySheetOverrideValues {
  const overrides: SalarySheetOverrideValues = {};

  for (const [key, value] of Object.entries(draft.drivers) as Array<
    [keyof SalarySheetDraftDrivers, number]
  >) {
    if (value !== row.calculatedValues[key]) {
      overrides[key] = value;
    }
  }

  return overrides;
}

export function stepSalarySheetDriverValue(
  currentValue: number,
  delta: number,
): number {
  return round2(Math.max(0, currentValue + delta));
}
