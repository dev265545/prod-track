import {
  applySalarySheetOverrides,
  type SalarySheetRow,
} from "./salarySheetService";
import {
  getSalarySheetCorrectionPeriods,
  type SalarySheetCorrectionPeriod,
  type SalarySheetOverrideRecord,
} from "./salarySheetOverrideService";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function findSalarySheetOverrideForRange(
  employeeOverrides: SalarySheetOverrideRecord[],
  fromDate: string,
  toDate: string,
): SalarySheetOverrideRecord | null {
  return (
    employeeOverrides.find(
      (record) =>
        record.fromDate === fromDate && record.toDate === toDate,
    ) ?? null
  );
}

/** Half-month correction slices that exactly tile [fromDate, toDate] with no gaps. */
export function getCompositeCorrectionSlices(
  year: number,
  month: number,
  fromDate: string,
  toDate: string,
): SalarySheetCorrectionPeriod[] {
  const periods = getSalarySheetCorrectionPeriods(year, month);
  const slices = periods.filter(
    (period) => period.fromDate >= fromDate && period.toDate <= toDate,
  );
  if (slices.length === 0) return [];
  if (slices[0].fromDate !== fromDate || slices[slices.length - 1].toDate !== toDate) {
    return [];
  }
  for (let i = 1; i < slices.length; i += 1) {
    const prevEnd = new Date(`${slices[i - 1].toDate}T12:00:00`);
    prevEnd.setDate(prevEnd.getDate() + 1);
    const y = prevEnd.getFullYear();
    const m = String(prevEnd.getMonth() + 1).padStart(2, "0");
    const d = String(prevEnd.getDate()).padStart(2, "0");
    if (`${y}-${m}-${d}` !== slices[i].fromDate) return [];
  }
  return slices;
}

export function mergeSalarySheetRows(rows: SalarySheetRow[]): SalarySheetRow {
  if (rows.length === 0) {
    throw new Error("mergeSalarySheetRows requires at least one row");
  }
  if (rows.length === 1) return rows[0];

  const first = rows[0];
  const sum = (pick: (row: SalarySheetRow) => number) =>
    round2(rows.reduce((total, row) => total + pick(row), 0));

  const calculatedValues = {
    presentDays: sum((row) => row.calculatedValues.presentDays),
    absentDays: sum((row) => row.calculatedValues.absentDays),
    holidayPresentDays: sum((row) => row.calculatedValues.holidayPresentDays),
    earnedSundayPayDays: sum((row) => row.calculatedValues.earnedSundayPayDays),
    sundayPresentBonusDays: sum(
      (row) => row.calculatedValues.sundayPresentBonusDays,
    ),
    totalPaidDays: sum((row) => row.calculatedValues.totalPaidDays),
    hoursExtraTotal: sum((row) => row.calculatedValues.hoursExtraTotal),
    hoursReducedTotal: sum((row) => row.calculatedValues.hoursReducedTotal),
    calculatedSalary: sum((row) => row.calculatedValues.calculatedSalary),
    advanceDeduction: sum((row) => row.calculatedValues.advanceDeduction),
    netCalculatedSalary: sum(
      (row) => row.calculatedValues.netCalculatedSalary,
    ),
  };

  const overrideNotes = rows
    .map((row) => row.overrideNotes.trim())
    .filter(Boolean)
    .join(" · ");

  return {
    ...first,
    presentDays: sum((row) => row.presentDays),
    absentDays: sum((row) => row.absentDays),
    holidayPresentDays: sum((row) => row.holidayPresentDays),
    earnedSundayPayDays: sum((row) => row.earnedSundayPayDays),
    sundayPresentBonusDays: sum((row) => row.sundayPresentBonusDays),
    totalPaidDays: sum((row) => row.totalPaidDays),
    hoursExtraTotal: sum((row) => row.hoursExtraTotal),
    hoursReducedTotal: sum((row) => row.hoursReducedTotal),
    baseCalculatedSalary: calculatedValues.calculatedSalary,
    calculatedSalary: sum((row) => row.calculatedSalary),
    advanceDeduction: sum((row) => row.advanceDeduction),
    netCalculatedSalary: sum((row) => row.netCalculatedSalary),
    hasOverrides: rows.some((row) => row.hasOverrides),
    overrideNotes,
    overrideUpdatedAt:
      rows
        .map((row) => row.overrideUpdatedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? "",
    overrideValues: {},
    calculatedValues,
  };
}

export function resolveEffectiveSalarySheetRow(
  baseRow: SalarySheetRow,
  employeeOverrides: SalarySheetOverrideRecord[],
  year: number,
  month: number,
  fromDate: string,
  toDate: string,
  buildBaseForRange: (from: string, to: string) => SalarySheetRow,
): SalarySheetRow {
  const exact = findSalarySheetOverrideForRange(
    employeeOverrides,
    fromDate,
    toDate,
  );
  if (exact) {
    return applySalarySheetOverrides(baseRow, exact);
  }

  const slices = getCompositeCorrectionSlices(year, month, fromDate, toDate);
  if (slices.length === 0) {
    return baseRow;
  }

  // Only fall back to per-slice composition when a correction actually exists
  // for one of the slices. Recomposing an un-corrected range out of half-month
  // slices is not value-neutral: period-scoped values (advance deductions are
  // matched on an exact periodFrom/periodTo pair) and running per-month state
  // (the Operator Sunday multiplier's present-day counter) are lost when the
  // range is cut up. With no override to honour, the whole-range base row is
  // both cheaper and more accurate.
  const hasSliceOverride = slices.some((period) =>
    Boolean(
      findSalarySheetOverrideForRange(
        employeeOverrides,
        period.fromDate,
        period.toDate,
      ),
    ),
  );
  if (!hasSliceOverride) {
    return baseRow;
  }

  if (slices.length === 1) {
    const period = slices[0];
    const sliceBase = buildBaseForRange(period.fromDate, period.toDate);
    const sliceOverride = findSalarySheetOverrideForRange(
      employeeOverrides,
      period.fromDate,
      period.toDate,
    );
    return applySalarySheetOverrides(sliceBase, sliceOverride);
  }

  const mergedRows = slices.map((period) => {
    const sliceBase = buildBaseForRange(period.fromDate, period.toDate);
    const sliceOverride = findSalarySheetOverrideForRange(
      employeeOverrides,
      period.fromDate,
      period.toDate,
    );
    return applySalarySheetOverrides(sliceBase, sliceOverride);
  });

  return mergeSalarySheetRows(mergedRows);
}
