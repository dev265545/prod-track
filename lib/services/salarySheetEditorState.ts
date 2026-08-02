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

/**
 * What the boxes show when the dialog opens: the figures currently in force,
 * corrections included.
 *
 * This deliberately reads the *effective* row and not `calculatedValues`. A
 * correction that is already saved has to come back into the boxes, or opening
 * the dialog and pressing Save without touching anything would throw the
 * correction away. It also carries the three drivers this dialog does not show
 * (holiday days, extra hours, reduced hours) through untouched, so editing
 * present days cannot quietly drop a correction made elsewhere.
 *
 * The counterpart is `getSalarySheetCalculatedDrivers`, which is what "use the
 * app's number" must put back. The two are different questions and must not
 * share one function.
 */
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

/**
 * What the app itself counted, ignoring every hand correction.
 *
 * This is the value behind "use the app's number": putting it in a box is what
 * removes a correction, because a driver equal to the calculated figure is not
 * written as an override at all.
 */
export function getSalarySheetCalculatedDrivers(
  row: SalarySheetRow,
): SalarySheetDraftDrivers {
  const calculated = row.calculatedValues;
  return {
    presentDays: calculated.presentDays,
    holidayPresentDays: calculated.holidayPresentDays,
    earnedSundayPayDays: calculated.earnedSundayPayDays,
    sundayPresentBonusDays: calculated.sundayPresentBonusDays,
    hoursExtraTotal: calculated.hoursExtraTotal,
    hoursReducedTotal: calculated.hoursReducedTotal,
  };
}

/** True when this driver currently carries a hand correction. */
export function isSalarySheetDriverCorrected(
  row: SalarySheetRow,
  field: SalarySheetDriverField,
  value: number,
): boolean {
  return Math.abs(value - row.calculatedValues[field]) > 0.001;
}

export function computeSalarySheetDerivedValues(
  row: SalarySheetRow,
  drivers: SalarySheetDraftDrivers,
): SalarySheetDerivedValues {
  // How many workdays the period holds is a fact about the calendar, so it is
  // read from what the app counted and never from the corrected row. Reading
  // the effective row made this total grow by the size of the correction every
  // time the dialog was reopened, and the absent-days preview drifted with it:
  // correct 12 present days up to 14, and a reopen showed 14 absent instead of
  // 12. Nothing here is saved, but a preview that changes on reopen is a
  // preview nobody can trust.
  const fixedWorkdayTotal = round2(
    row.calculatedValues.presentDays + row.calculatedValues.absentDays,
  );
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
