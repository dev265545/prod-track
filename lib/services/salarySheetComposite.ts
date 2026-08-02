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

/**
 * Re-attach the part of the range's advance deduction that no slice could see.
 *
 * An advance deduction is recorded against a period. When the owner corrects
 * only half a month, the month is rebuilt out of half-month slices, and a
 * deduction recorded against the WHOLE month belongs to none of them: each
 * slice resolved 0, the merge summed 0 + 0, and the employee was paid a full
 * salary with an advance they had already taken in hand never cut. That is
 * money out the door, so it is fixed here rather than left to the slices.
 *
 * The range's own base row is the authority on how much this range deducts —
 * it is resolved once, over `[fromDate, toDate]`, before any slicing. Whatever
 * the slices already account for is subtracted, so:
 *   • deduction recorded for the whole month → no slice sees it, all of it is
 *     added back here, exactly once;
 *   • deduction recorded per half-month → each slice matches its own, the
 *     residual is zero and nothing is added twice;
 *   • no deduction, or one that only partly overlaps the range → zero on both
 *     sides, and the merged row is returned untouched.
 *
 * The residual is subtracted from take-home rather than take-home being
 * recomputed, so a slice whose net pay the owner stated outright keeps that
 * stated figure minus the advance, and a row with no residual is bit-for-bit
 * what the merge produced.
 */
function reattachUnslicedAdvanceDeduction(
  merged: SalarySheetRow,
  baseRow: SalarySheetRow,
  sliceRows: SalarySheetRow[],
): SalarySheetRow {
  const sliceTotal = round2(
    sliceRows.reduce(
      (total, row) => total + row.calculatedValues.advanceDeduction,
      0,
    ),
  );
  const residual = round2(
    Math.max(0, baseRow.calculatedValues.advanceDeduction - sliceTotal),
  );
  if (residual === 0) return merged;

  return {
    ...merged,
    advanceDeduction: round2(merged.advanceDeduction + residual),
    netCalculatedSalary: round2(
      Math.max(0, merged.netCalculatedSalary - residual),
    ),
    calculatedValues: {
      ...merged.calculatedValues,
      advanceDeduction: round2(
        merged.calculatedValues.advanceDeduction + residual,
      ),
      netCalculatedSalary: round2(
        Math.max(0, merged.calculatedValues.netCalculatedSalary - residual),
      ),
    },
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
  // slices is not value-neutral: running per-month state (the Operator Sunday
  // multiplier's present-day counter) is lost when the range is cut up. With no
  // override to honour, the whole-range base row is both cheaper and more
  // accurate. (Period-scoped advance deductions used to be lost here too; they
  // are now carried across the cut by `reattachUnslicedAdvanceDeduction`.)
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

  const sliceRows = slices.map((period) => {
    const sliceBase = buildBaseForRange(period.fromDate, period.toDate);
    const sliceOverride = findSalarySheetOverrideForRange(
      employeeOverrides,
      period.fromDate,
      period.toDate,
    );
    return applySalarySheetOverrides(sliceBase, sliceOverride);
  });

  // `mergeSalarySheetRows` returns the single row unchanged when there is one
  // slice, and a one-slice range is the whole range, so its residual is zero.
  return reattachUnslicedAdvanceDeduction(
    mergeSalarySheetRows(sliceRows),
    baseRow,
    sliceRows,
  );
}
