import type {
  MonthSalaryBreakdown,
  MonthSalaryDayRow,
} from "@/lib/utils/attendanceStats";
import type { SalarySheetRow } from "@/lib/services/salarySheetService";
import { salarySheetRowHasAdjustment } from "@/lib/services/salarySheetService";
import { translate, type Translate } from "@/lib/i18n/translate";

/**
 * Every day-status word here reaches paper (`lib/print` via `salaryService`),
 * so none of them may be written in English by hand: half the workers handed
 * the sheet read Hindi. There is no hook this deep in a util, so the default
 * translator reads the language the operator picked out of `localStorage`; a
 * caller that already has `t()` can pass it in instead.
 */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function stableHash(seed: string, key: string): number {
  const input = `${seed}:${key}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

function stablePick<T>(
  items: T[],
  count: number,
  seed: string,
  keyFn: (item: T) => string,
): T[] {
  if (count <= 0 || items.length === 0) return [];
  const sorted = [...items].sort(
    (a, b) =>
      stableHash(seed, keyFn(a)) - stableHash(seed, keyFn(b)),
  );
  return sorted.slice(0, Math.min(count, sorted.length));
}

export interface SalarySheetDayTargets {
  presentDays: number;
  holidayPresentDays: number;
  sundayPresentBonusDays: number;
  hoursExtraTotal?: number;
  hoursReducedTotal?: number;
}

function resetAdjustableDayRow(
  row: MonthSalaryDayRow,
  tr: Translate,
): MonthSalaryDayRow {
  if (row.rowKind === "sunday") {
    return {
      ...row,
      statusLabel: tr("dayStatusSunday"),
      hoursWorked: null,
      hoursExtra: null,
      hoursReduced: null,
      effectiveHours: null,
      paidFraction: 0,
      basePay: 0,
    };
  }
  if (row.rowKind === "holiday") {
    return {
      ...row,
      statusLabel: tr("calTitleFactoryHoliday"),
      hoursWorked: null,
      hoursExtra: null,
      hoursReduced: null,
      effectiveHours: null,
      paidFraction: 0,
      basePay: 0,
    };
  }
  return {
    ...row,
    statusLabel: tr("calTitleAbsent"),
    hoursWorked: null,
    hoursExtra: null,
    hoursReduced: null,
    effectiveHours: null,
    paidFraction: 0,
    basePay: 0,
  };
}

function markSundayBonus(
  row: MonthSalaryDayRow,
  ratePerDay: number,
  tr: Translate,
): MonthSalaryDayRow {
  return {
    ...row,
    statusLabel: tr("dayStatusSundayWorked"),
    paidFraction: 1,
    basePay: round2(ratePerDay),
    effectiveHours: row.effectiveHours,
  };
}

function markHolidayPresent(
  row: MonthSalaryDayRow,
  ratePerDay: number,
  tr: Translate,
): MonthSalaryDayRow {
  return {
    ...row,
    statusLabel: tr("dayStatusPresentOnHoliday"),
    paidFraction: 1,
    basePay: round2(ratePerDay),
    effectiveHours: row.effectiveHours ?? null,
  };
}

function markWorkingPresent(
  row: MonthSalaryDayRow,
  paidFraction: number,
  ratePerDay: number,
  hoursPerDay: number,
  tr: Translate,
): MonthSalaryDayRow {
  const effectiveHours =
    paidFraction >= 1
      ? hoursPerDay
      : round2(Math.max(0, paidFraction * hoursPerDay));
  return {
    ...row,
    statusLabel: tr("calTitlePresent"),
    hoursWorked: paidFraction >= 1 ? hoursPerDay : null,
    hoursExtra: null,
    hoursReduced: null,
    effectiveHours,
    paidFraction: round2(paidFraction),
    basePay: round2(paidFraction * ratePerDay),
  };
}

/**
 * Re-label calendar day rows so printed attendance matches payroll adjustment
 * totals (stable pseudo-random day picks per employee + range).
 */
export function applySalaryTargetsToDayRows(
  dayRows: MonthSalaryDayRow[],
  targets: SalarySheetDayTargets,
  ratePerDay: number,
  hoursPerDay: number,
  seed: string,
  tr: Translate = translate,
): MonthSalaryDayRow[] {
  const resetRows = dayRows.map((row) => resetAdjustableDayRow(row, tr));

  const sundayRows = resetRows.filter((row) => row.rowKind === "sunday");
  const holidayRows = resetRows.filter((row) => row.rowKind === "holiday");
  const workingRows = resetRows.filter((row) => row.rowKind === "working");

  const pickedSundayKeys = new Set(
    stablePick(
      sundayRows,
      Math.round(targets.sundayPresentBonusDays),
      `${seed}:sun`,
      (row) => row.date,
    ).map((row) => row.date),
  );
  const pickedHolidayKeys = new Set(
    stablePick(
      holidayRows,
      Math.round(targets.holidayPresentDays),
      `${seed}:hol`,
      (row) => row.date,
    ).map((row) => row.date),
  );

  let remainingPresent = Math.max(0, targets.presentDays);
  const workingPickCount = Math.min(
    workingRows.length,
    Math.ceil(remainingPresent - 1e-9),
  );
  const pickedWorking = stablePick(
    workingRows,
    workingPickCount,
    `${seed}:work`,
    (row) => row.date,
  );

  const workingPayByDate = new Map<string, number>();
  for (let i = 0; i < pickedWorking.length; i += 1) {
    const fraction =
      remainingPresent >= 1 ? 1 : Math.max(0, remainingPresent);
    workingPayByDate.set(pickedWorking[i].date, fraction);
    remainingPresent = round2(remainingPresent - fraction);
  }

  return resetRows.map((row) => {
    if (row.rowKind === "sunday" && pickedSundayKeys.has(row.date)) {
      return markSundayBonus(row, ratePerDay, tr);
    }
    if (row.rowKind === "holiday" && pickedHolidayKeys.has(row.date)) {
      return markHolidayPresent(row, ratePerDay, tr);
    }
    if (row.rowKind === "working") {
      const fraction = workingPayByDate.get(row.date);
      if (fraction != null && fraction > 0) {
        return markWorkingPresent(
          row,
          fraction,
          ratePerDay,
          hoursPerDay,
          tr,
        );
      }
    }
    return row;
  });
}

/** Apply payroll adjustment totals to a full-month attendance breakdown (print/UI). */
export function applySalarySheetRowToMonthBreakdown(
  breakdown: MonthSalaryBreakdown,
  salarySheetRow: SalarySheetRow | null,
  employeeId: string,
  from: string,
  to: string,
  ratePerDay: number,
  hoursPerDay: number,
  tr: Translate = translate,
): MonthSalaryBreakdown {
  if (!salarySheetRowHasAdjustment(salarySheetRow) || !salarySheetRow) {
    return breakdown;
  }

  const adjustedDays = applySalaryTargetsToDayRows(
    breakdown.days,
    {
      presentDays: salarySheetRow.presentDays,
      holidayPresentDays: salarySheetRow.holidayPresentDays,
      sundayPresentBonusDays: salarySheetRow.sundayPresentBonusDays,
      hoursExtraTotal: salarySheetRow.hoursExtraTotal,
      hoursReducedTotal: salarySheetRow.hoursReducedTotal,
    },
    ratePerDay,
    hoursPerDay,
    `${employeeId}:${from}:${to}`,
    tr,
  );
  const earnedSundayPoolPay = round2(
    salarySheetRow.earnedSundayPayDays * ratePerDay,
  );
  const sundayMarkBonusPay = round2(
    salarySheetRow.sundayPresentBonusDays * ratePerDay,
  );

  return {
    ...breakdown,
    days: adjustedDays,
    paidWorkingDays: salarySheetRow.presentDays,
    absentDays: salarySheetRow.absentDays,
    holidayPresentDays: salarySheetRow.holidayPresentDays,
    earnedSundayPayDays: salarySheetRow.earnedSundayPayDays,
    earnedSundayPoolPay,
    sundayPresentBonusDays: salarySheetRow.sundayPresentBonusDays,
    sundayMarkBonusPay,
    totalPaidDays: salarySheetRow.totalPaidDays,
    totalBaseSalary: salarySheetRow.calculatedSalary,
    sumHoursExtra: salarySheetRow.hoursExtraTotal,
    sumHoursReduced: salarySheetRow.hoursReducedTotal,
  };
}

export function salarySheetRowToAttendanceSummary(
  row: {
    presentDays: number;
    absentDays: number;
    holidayPresentDays: number;
    earnedSundayPayDays: number;
    sundayPresentBonusDays: number;
    totalPaidDays: number;
    hoursExtraTotal: number;
    hoursReducedTotal: number;
    calculatedSalary: number;
  },
  totalHoursWorked: number,
) {
  return {
    presentDays: row.presentDays,
    absentDays: row.absentDays,
    holidayPresentDays: row.holidayPresentDays,
    earnedSundayPayDays: row.earnedSundayPayDays,
    sundayPresentBonusDays: row.sundayPresentBonusDays,
    totalPaidDays: row.totalPaidDays,
    totalHoursWorked,
    hoursExtraTotal: row.hoursExtraTotal,
    hoursReducedTotal: row.hoursReducedTotal,
    calculatedSalary: row.calculatedSalary,
  };
}
