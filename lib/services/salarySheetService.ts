import { getEmployee, getEmployees } from "./employeeService";
import {
  getAttendanceByEmployeeInRange,
  getAttendanceInRange,
} from "./attendanceService";
import { getHolidaysInRange } from "./factoryHolidayService";
import { getShifts } from "./shiftService";
import {
  getSundayCategories,
  resolveSundayCategoryRule,
  type SundayCategory,
} from "./sundayCategoryService";
import {
  getSalarySheetOverridesForMonth,
  type SalarySheetOverrideRecord,
  type SalarySheetOverrideValues,
} from "./salarySheetOverrideService";
import { resolveEffectiveSalarySheetRow } from "./salarySheetComposite";
import { getDeductionsByEmployee } from "./advanceDeductionService";
import { getAppSettings } from "./appSettingsService";
import { getOperatorHolidaysInRange } from "./operatorHolidayService";
import {
  getCalendarDaysInMonth,
  getRatePerDay,
  getRatePerHour,
} from "@/lib/utils/salaryRates";
import {
  getMonthRange,
  normalizeDayPayCap,
  type DayPayCap,
} from "@/lib/utils/date";
import {
  buildAttendanceSalarySummaryForRange,
  buildMonthSalaryBreakdown,
  computeEarnedExtraPayDaysForCalendarScope,
  reportDayPayCapForRange,
  type AttendanceRecord,
  type DayPayCapReport,
  type SundayCategoryRule,
} from "@/lib/utils/attendanceStats";

export interface SalarySheetRow {
  id: string;
  name: string;
  employeeType: string;
  presentDays: number;
  absentDays: number;
  holidayPresentDays: number;
  /** Extra pay days from 15-day in-month cycles (max 4 / month) */
  earnedSundayPayDays: number;
  /** Sundays marked present — one extra daily rate each */
  sundayPresentBonusDays: number;
  totalPaidDays: number;
  monthlySalary: number;
  ratePerDay: number;
  ratePerHour: number;
  hoursExtraTotal: number;
  hoursReducedTotal: number;
  baseCalculatedSalary: number;
  calculatedSalary: number;
  /** Amount deducted this period against an outstanding advance (Salaried/Operator only; 0 for Production). */
  advanceDeduction: number;
  /** calculatedSalary - advanceDeduction, floored at 0. */
  netCalculatedSalary: number;
  hasOverrides: boolean;
  overrideNotes: string;
  overrideUpdatedAt: string;
  overrideValues: SalarySheetOverrideValues;
  calculatedValues: Required<SalarySheetOverrideValues>;
  /**
   * What the per-day pay limit removed from `presentDays` over this period.
   *
   * Carried on every row, even when nothing was clipped, so the sheet and the
   * adjust dialog can always answer "why is this number what it is?" — the
   * limit used to apply with nothing anywhere saying it had.
   */
  dayPayCap: DayPayCapReport;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Rate multiplier applied to an Operator's present Sunday once the running
 * count of present working days in the month reaches `requiredPresentDays`.
 * Used whenever the employee record does not carry its own value — kept as a
 * single exported constant so the employee editor and the payroll engine
 * cannot drift apart (the editor has always shown 1.2 as its default).
 */
export const DEFAULT_SUNDAY_MULTIPLIER = 1.2;

/** Default number of present working days an Operator needs before the multiplier applies. */
export const DEFAULT_REQUIRED_PRESENT_DAYS = 26;

/**
 * Where an employee's Sunday rate premium comes from, most specific first.
 *
 * The premium used to live only on the employee record, in parallel with the
 * Sunday category — two mechanisms for "how do we reward showing up", with no
 * stated precedence between them. They are now one chain, and this is it:
 *
 * 1. the employee's own `requiredPresentDays` / `sundayMultiplier`, if set;
 * 2. the `sundayPremium` on the employee's Sunday category, if it has one;
 * 3. the factory-wide defaults in Settings (26 days, 1.2×).
 *
 * Each of the two numbers resolves independently, so a category can set the
 * multiplier while an employee still overrides only the day count. Existing
 * installs have no category premium, so this resolves to exactly what step 1
 * and the old hardcoded constants produced — no pay moves.
 */
export function resolveOperatorSundayRule(
  employee: Record<string, unknown>,
  sundayCategoryRule: SundayCategoryRule,
  defaults: {
    defaultSundayPremiumRequiredDays: number;
    defaultSundayPremiumMultiplier: number;
  },
): { requiredPresentDays: number; sundayMultiplier: number } {
  const premium = sundayCategoryRule.sundayPremium;
  const empRequired = employee.requiredPresentDays;
  const empMultiplier = employee.sundayMultiplier;
  return {
    requiredPresentDays:
      typeof empRequired === "number" && Number.isFinite(empRequired)
        ? empRequired
        : (premium?.requiredPresentDays ??
          defaults.defaultSundayPremiumRequiredDays),
    sundayMultiplier:
      typeof empMultiplier === "number" && Number.isFinite(empMultiplier)
        ? empMultiplier
        : (premium?.multiplier ?? defaults.defaultSundayPremiumMultiplier),
  };
}

/**
 * Override fields that can actually move an employee's pay. `absentDays` and
 * `holidayPresentDays` are deliberately absent: both are descriptive counters
 * derived from the same attendance that already produced `presentDays`
 * (a holiday-present day is *inside* `presentDays`), so honouring them as pay
 * inputs would double-count. They are still stored and displayed, but they must
 * not flip `hasOverrides` — a row is only "adjusted" when the adjustment is
 * capable of changing what the employee is paid.
 */
const PAY_AFFECTING_OVERRIDE_KEYS = [
  "presentDays",
  "earnedSundayPayDays",
  "sundayPresentBonusDays",
  "totalPaidDays",
  "hoursExtraTotal",
  "hoursReducedTotal",
  "calculatedSalary",
  "advanceDeduction",
  "netCalculatedSalary",
] as const;

function hasPersistedOverrides(record: SalarySheetOverrideRecord | null): boolean {
  if (!record) return false;
  const overrides = record.overrides ?? {};
  return (
    PAY_AFFECTING_OVERRIDE_KEYS.some((key) => overrides[key] !== undefined) ||
    (record.notes?.trim().length ?? 0) > 0
  );
}

const PAYROLL_NUMERIC_FIELDS = [
  "presentDays",
  "absentDays",
  "holidayPresentDays",
  "earnedSundayPayDays",
  "sundayPresentBonusDays",
  "totalPaidDays",
  "hoursExtraTotal",
  "hoursReducedTotal",
  "calculatedSalary",
  "advanceDeduction",
  "netCalculatedSalary",
] as const;

/** True when payroll adjustment should drive UI/print instead of raw attendance. */
export function salarySheetRowHasAdjustment(
  row: SalarySheetRow | null | undefined,
): row is SalarySheetRow {
  if (!row) return false;
  if (row.hasOverrides) return true;
  const cv = row.calculatedValues;
  return PAYROLL_NUMERIC_FIELDS.some(
    (key) => Math.abs(row[key] - cv[key]) > 0.001,
  );
}

export function applySalarySheetOverrides(
  baseRow: SalarySheetRow,
  overrideRecord: SalarySheetOverrideRecord | null,
): SalarySheetRow {
  const overrides = overrideRecord?.overrides ?? {};
  const presentDays = overrides.presentDays ?? baseRow.presentDays;
  const absentDays = overrides.absentDays ?? baseRow.absentDays;
  const holidayPresentDays =
    overrides.holidayPresentDays ?? baseRow.holidayPresentDays;
  const earnedSundayPayDays =
    overrides.earnedSundayPayDays ?? baseRow.earnedSundayPayDays;
  const sundayPresentBonusDays =
    overrides.sundayPresentBonusDays ?? baseRow.sundayPresentBonusDays;
  const hoursExtraTotal = overrides.hoursExtraTotal ?? baseRow.hoursExtraTotal;
  const hoursReducedTotal =
    overrides.hoursReducedTotal ?? baseRow.hoursReducedTotal;
  const totalPaidDays =
    overrides.totalPaidDays ??
    round2(presentDays + earnedSundayPayDays + sundayPresentBonusDays);
  const baseCalculatedSalary =
    baseRow.baseCalculatedSalary ?? baseRow.calculatedSalary;
  // Corrections are applied as *deltas* on top of the row's own computed pay
  // rather than by rebuilding it from a flat `totalPaidDays * ratePerDay`.
  // For ordinary rows the two are identical (their pay IS paid days times the
  // daily rate), but Operators can carry day-level premiums — a Sunday paid at
  // `ratePerDay * sundayMultiplier` — that the flat formula would silently
  // erase the moment any driver was corrected.
  //   • day drivers move pay by (corrected − computed) days × ratePerDay
  //   • hour totals move pay by (corrected − computed) hours × ratePerHour
  //     (extra adds, reduced subtracts), matching how attendance hours feed
  //     the computed figure in the first place.
  const dayDelta = totalPaidDays - baseRow.totalPaidDays;
  const hoursExtraDelta =
    overrides.hoursExtraTotal !== undefined
      ? overrides.hoursExtraTotal - baseRow.hoursExtraTotal
      : 0;
  const hoursReducedDelta =
    overrides.hoursReducedTotal !== undefined
      ? overrides.hoursReducedTotal - baseRow.hoursReducedTotal
      : 0;
  const hoursDelta = hoursExtraDelta - hoursReducedDelta;
  const calculatedSalary =
    overrides.calculatedSalary ??
    round2(
      baseRow.calculatedSalary +
        dayDelta * baseRow.ratePerDay +
        hoursDelta * baseRow.ratePerHour,
    );
  const advanceDeduction =
    overrides.advanceDeduction ?? baseRow.advanceDeduction ?? 0;
  const netCalculatedSalary =
    overrides.netCalculatedSalary ??
    round2(Math.max(0, calculatedSalary - advanceDeduction));

  return {
    ...baseRow,
    presentDays,
    absentDays,
    holidayPresentDays,
    earnedSundayPayDays,
    sundayPresentBonusDays,
    totalPaidDays,
    hoursExtraTotal,
    hoursReducedTotal,
    baseCalculatedSalary,
    calculatedSalary,
    advanceDeduction,
    netCalculatedSalary,
    hasOverrides: hasPersistedOverrides(overrideRecord),
    overrideNotes: overrideRecord?.notes?.trim() ?? "",
    overrideUpdatedAt: overrideRecord?.updatedAt ?? "",
    overrideValues: { ...overrides },
    calculatedValues: baseRow.calculatedValues,
  };
}

interface AttendanceSalarySummaryLike {
  presentDays: number;
  absentDays: number;
  holidayPresentDays: number;
  earnedSundayPayDays: number;
  sundayPresentBonusDays: number;
  totalPaidDays: number;
  hoursExtraTotal: number;
  hoursReducedTotal: number;
  calculatedSalary: number;
}

/**
 * Operator-specific attendance salary summary for `[rangeFrom, rangeTo]`.
 * Unlike `buildAttendanceSalarySummaryForRange`, this honors the Operator
 * Sunday-multiplier rule by using `buildMonthSalaryBreakdown`'s day-level
 * pay (`basePay`), which computes each Sunday's pay individually, then
 * filters the resulting day rows down to the requested range — same
 * filtering pattern `getPrintableAttendanceSalaryRangeHtml` in
 * salaryService.ts uses for display purposes.
 *
 * `attendance` must be the employee's attendance for the WHOLE month, not just
 * `[rangeFrom, rangeTo]`: the Sunday-multiplier rule depends on a present-day
 * count that runs from day 1 of the month, so a range-filtered input would
 * restart that counter and silently suppress the multiplier for any range that
 * does not start on the 1st. Scoping happens afterwards, by filtering the
 * resulting day rows.
 */
function buildOperatorSummaryForRange(input: {
  year: number;
  month: number;
  rangeFrom: string;
  rangeTo: string;
  holidayDates: string[];
  /** Whole-month attendance (see doc comment) — filtered to the range internally. */
  attendance: AttendanceRecord[];
  hoursPerDay: number;
  ratePerDay: number;
  sundayCategoryRule: SundayCategoryRule;
  operatorSundayRule: { requiredPresentDays: number; sundayMultiplier: number };
  maxDayPayFraction: DayPayCap;
}): AttendanceSalarySummaryLike {
  const {
    year,
    month,
    rangeFrom,
    rangeTo,
    holidayDates,
    attendance,
    hoursPerDay,
    ratePerDay,
    sundayCategoryRule,
    operatorSundayRule,
    maxDayPayFraction,
  } = input;

  const breakdown = buildMonthSalaryBreakdown({
    year,
    month,
    holidayDates,
    attendance,
    productionPayByDate: new Map(),
    hoursPerDay,
    ratePerDay,
    includeProductionPay: false,
    sundayCategoryRule,
    operatorSundayRule,
    maxDayPayFraction,
  });

  const daysInRange = breakdown.days.filter(
    (row) => row.date >= rangeFrom && row.date <= rangeTo,
  );

  let presentDays = 0;
  let absentDays = 0;
  let holidayPresentDays = 0;
  let sundayPresentBonusDays = 0;
  let hoursExtraTotal = 0;
  let hoursReducedTotal = 0;
  let dayPaySum = 0;

  for (const row of daysInRange) {
    dayPaySum += row.basePay;
    if (row.hoursExtra != null && row.hoursExtra > 0) {
      hoursExtraTotal += row.hoursExtra;
    }
    if (row.hoursReduced != null && row.hoursReduced > 0) {
      hoursReducedTotal += row.hoursReduced;
    }
    if (row.rowKind === "sunday") {
      if (row.paidFraction > 0) sundayPresentBonusDays += 1;
      continue;
    }
    presentDays += row.paidFraction;
    if (row.rowKind === "holiday") {
      if (row.paidFraction > 0) holidayPresentDays += 1;
    } else if (row.paidFraction <= 0) {
      absentDays += 1;
    }
  }

  const attByDate = new Map(
    attendance.map((a) => [
      a.date,
      {
        status: a.status,
        hoursWorked: a.hoursWorked,
        hoursReduced: a.hoursReduced,
        hoursExtra: a.hoursExtra,
      },
    ]),
  );
  const earnedSundayPayDays = round2(
    computeEarnedExtraPayDaysForCalendarScope(
      rangeFrom,
      rangeTo,
      holidayDates,
      attByDate,
      hoursPerDay,
      sundayCategoryRule,
    ),
  );
  const earnedSundayPoolPay = round2(earnedSundayPayDays * ratePerDay);
  presentDays = round2(presentDays);
  const totalPaidDays = round2(
    presentDays + earnedSundayPayDays + sundayPresentBonusDays,
  );
  const calculatedSalary = round2(dayPaySum + earnedSundayPoolPay);

  return {
    presentDays,
    absentDays,
    holidayPresentDays,
    earnedSundayPayDays,
    sundayPresentBonusDays,
    totalPaidDays,
    hoursExtraTotal: round2(hoursExtraTotal),
    hoursReducedTotal: round2(hoursReducedTotal),
    calculatedSalary,
  };
}

/**
 * Advance deduction for `[rangeFrom, rangeTo]` from a pre-fetched list of an
 * employee's deduction records (avoids an async lookup per range so the
 * base-row builder closures used by `resolveEffectiveSalarySheetRow` can stay
 * synchronous — matching `getDeductionForPeriod`'s own exact periodFrom/periodTo
 * matching logic).
 */
function resolveAdvanceDeductionAmount(
  deductions: Record<string, unknown>[],
  rangeFrom: string,
  rangeTo: string,
): number {
  const match = deductions.find(
    (d) => d.periodFrom === rangeFrom && d.periodTo === rangeTo,
  );
  return (match?.amount as number) ?? 0;
}

/** One employee's attendance for the period, keyed by date, duplicates resolved. */
type AttendanceByDate = Map<
  string,
  {
    status: string;
    hoursWorked?: number;
    hoursReduced?: number;
    hoursExtra?: number;
  }
>;

/**
 * Everything a salary-sheet row needs that is *not* specific to one employee.
 *
 * It exists so the whole-sheet build and the single-employee build can run the
 * exact same row code. They used to be two transcriptions of the same rules,
 * which is why `getSalarySheetRowForEmployee` built the entire sheet just to
 * pick one row out of it: that was the only way to be sure the employee page
 * and the payroll table agreed. They now agree by construction, so one row can
 * be built from one employee's data.
 */
interface SalarySheetContext {
  year: number;
  month: number;
  calendarDaysInMonth: number;
  /** Factory holidays in range — the only holidays non-Operators observe. */
  holidayDates: string[];
  /** Operator-only national holidays; unioned with the above for Operators. */
  operatorHolidayDates: string[];
  /** shiftId → hoursPerDay */
  shiftMap: Record<string, number>;
  sundayCategoryMap: Record<string, SundayCategory | undefined>;
  appSettings: {
    defaultSundayPremiumRequiredDays: number;
    defaultSundayPremiumMultiplier: number;
    /** Most one date may pay, in days. `null` = no limit. */
    maxDayPayFraction?: DayPayCap;
  };
}

/**
 * Fold raw attendance rows into one entry per date.
 *
 * A store written before `saveAttendance` upserted can hold two rows for the
 * same employee and date. The **last** one wins, which is exactly what
 * `getAttendanceByEmployeeAndDate` does — see its doc comment. Both readers
 * must agree or a corrected day would display one way and be paid another.
 * Callers must pass rows in index order (employeeId/date then primary key),
 * which is how both `getAttendanceInRange` and `getAttendanceByEmployeeInRange`
 * return them.
 */
function foldAttendanceByDate(
  rows: Record<string, unknown>[],
): AttendanceByDate {
  const byDate: AttendanceByDate = new Map();
  rows.forEach((a) => {
    byDate.set(a.date as string, {
      status: a.status as string,
      hoursWorked: a.hoursWorked as number | undefined,
      hoursReduced: a.hoursReduced as number | undefined,
      hoursExtra: a.hoursExtra as number | undefined,
    });
  });
  return byDate;
}

function buildBaseSalarySheetRow(
  emp: Record<string, unknown>,
  attendanceByDate: AttendanceByDate,
  deductions: Record<string, unknown>[],
  ctx: SalarySheetContext,
  rangeFrom: string,
  rangeTo: string,
): SalarySheetRow {
  const {
    year,
    month,
    calendarDaysInMonth,
    holidayDates,
    operatorHolidayDates,
    shiftMap,
    sundayCategoryMap,
    appSettings,
  } = ctx;
  const empId = emp.id as string;
  const monthlySalary = (emp.monthlySalary as number) ?? 0;
  const ratePerDay = getRatePerDay(monthlySalary, calendarDaysInMonth);
  const shiftId = emp.shiftId as string | undefined;
  const hoursPerDay = shiftId ? (shiftMap[shiftId] ?? 8) : 8;
  const sundayCategoryId = emp.sundayCategoryId as string | undefined;
  const sundayCategory = sundayCategoryId
    ? sundayCategoryMap[sundayCategoryId]
    : undefined;
  const sundayCategoryRule = resolveSundayCategoryRule(sundayCategory);
  const maxDayPayFraction = normalizeDayPayCap(appSettings.maxDayPayFraction);
  const ratePerHour = getRatePerHour(
    monthlySalary,
    calendarDaysInMonth,
    hoursPerDay,
  );
  const attendanceForSheet: AttendanceRecord[] = Array.from(
    attendanceByDate.entries(),
  ).map(([date, att]) => ({
    date,
    status: att.status,
    hoursWorked: att.hoursWorked,
    hoursReduced: att.hoursReduced,
    hoursExtra: att.hoursExtra,
  }));
  const attendanceForRange = attendanceForSheet.filter(
    (a) => a.date >= rangeFrom && a.date <= rangeTo,
  );
  const employeeType = emp.employeeType as string | undefined;
  const isOperator = employeeType === "operator";
  const isProduction = employeeType === "production";

  const summary: AttendanceSalarySummaryLike = isOperator
    ? buildOperatorSummaryForRange({
        year,
        month,
        rangeFrom,
        rangeTo,
        holidayDates: Array.from(
          new Set([...holidayDates, ...operatorHolidayDates]),
        ),
        attendance: attendanceForSheet,
        hoursPerDay,
        ratePerDay,
        sundayCategoryRule,
        operatorSundayRule: resolveOperatorSundayRule(
          emp,
          sundayCategoryRule,
          appSettings,
        ),
        maxDayPayFraction,
      })
    : buildAttendanceSalarySummaryForRange({
        fromDate: rangeFrom,
        toDate: rangeTo,
        holidayDates,
        attendance: attendanceForRange,
        hoursPerDay,
        ratePerDay,
        sundayCategoryRule,
        maxDayPayFraction,
      });

  const advanceDeduction = isProduction
    ? 0
    : resolveAdvanceDeductionAmount(deductions, rangeFrom, rangeTo);
  const netCalculatedSalary = isProduction
    ? summary.calculatedSalary
    : round2(Math.max(0, summary.calculatedSalary - advanceDeduction));

  return {
    id: empId,
    name: (emp.name as string) || "Unknown",
    employeeType: employeeType ?? "salaried",
    presentDays: summary.presentDays,
    absentDays: summary.absentDays,
    holidayPresentDays: summary.holidayPresentDays,
    earnedSundayPayDays: summary.earnedSundayPayDays,
    sundayPresentBonusDays: summary.sundayPresentBonusDays,
    totalPaidDays: summary.totalPaidDays,
    monthlySalary,
    ratePerDay,
    ratePerHour,
    hoursExtraTotal: summary.hoursExtraTotal,
    hoursReducedTotal: summary.hoursReducedTotal,
    baseCalculatedSalary: summary.calculatedSalary,
    calculatedSalary: summary.calculatedSalary,
    advanceDeduction,
    netCalculatedSalary,
    hasOverrides: false,
    overrideNotes: "",
    overrideUpdatedAt: "",
    overrideValues: {},
    calculatedValues: {
      presentDays: summary.presentDays,
      absentDays: summary.absentDays,
      holidayPresentDays: summary.holidayPresentDays,
      earnedSundayPayDays: summary.earnedSundayPayDays,
      sundayPresentBonusDays: summary.sundayPresentBonusDays,
      totalPaidDays: summary.totalPaidDays,
      hoursExtraTotal: summary.hoursExtraTotal,
      hoursReducedTotal: summary.hoursReducedTotal,
      calculatedSalary: summary.calculatedSalary,
      advanceDeduction,
      netCalculatedSalary,
    },
    dayPayCap: reportDayPayCapForRange(
      attendanceForRange,
      rangeFrom,
      rangeTo,
      hoursPerDay,
      maxDayPayFraction,
    ),
  };
}

/** The finished row for one employee: base row plus any payroll corrections. */
function buildSalarySheetRowForEmployee(
  emp: Record<string, unknown>,
  attendanceByDate: AttendanceByDate,
  deductions: Record<string, unknown>[],
  employeeOverrides: SalarySheetOverrideRecord[],
  ctx: SalarySheetContext,
  from: string,
  to: string,
): SalarySheetRow {
  const buildBaseForRange = (rangeFrom: string, rangeTo: string) =>
    buildBaseSalarySheetRow(
      emp,
      attendanceByDate,
      deductions,
      ctx,
      rangeFrom,
      rangeTo,
    );
  return resolveEffectiveSalarySheetRow(
    buildBaseForRange(from, to),
    employeeOverrides,
    ctx.year,
    ctx.month,
    from,
    to,
    buildBaseForRange,
  );
}

export async function getSalarySheetForMonth(
  year: number,
  month: number
): Promise<{
  rows: SalarySheetRow[];
  from: string;
  to: string;
  holidayDates: string[];
  calendarDaysInMonth: number;
}> {
  const { from, to } = getMonthRange(year, month);
  return getSalarySheetForRange(year, month, from, to);
}

export async function getSalarySheetForRange(
  year: number,
  month: number,
  from: string,
  to: string,
): Promise<{
  rows: SalarySheetRow[];
  from: string;
  to: string;
  holidayDates: string[];
  calendarDaysInMonth: number;
}> {
  const [allEmployees, attendance, holidays, operatorHolidays, shifts, sundayCategories, monthOverrides, appSettings] =
    await Promise.all([
      getEmployees(true),
      getAttendanceInRange(from, to),
      getHolidaysInRange(from, to),
      getOperatorHolidaysInRange(from, to),
      getShifts(),
      getSundayCategories(),
      getSalarySheetOverridesForMonth(year, month),
      getAppSettings(),
    ]);

  // Production workers are paid for what they make, not for the days they
  // attend, so this attendance-based sheet says nothing true about them: their
  // monthly salary is 0, which made every one of their columns render blank.
  // They get their own document instead — see
  // `getProductionPaySheetForRange` in productionPaySheetService.ts.
  const employees = allEmployees.filter(
    (emp) => (emp.employeeType as string | undefined) !== "production",
  );

  const deductionsByEmployeeId = new Map<string, Record<string, unknown>[]>();
  await Promise.all(
    employees.map(async (emp) => {
      const empId = emp.id as string;
      deductionsByEmployeeId.set(empId, await getDeductionsByEmployee(empId));
    }),
  );

  const ctx: SalarySheetContext = {
    year,
    month,
    calendarDaysInMonth: getCalendarDaysInMonth(year, month),
    holidayDates: holidays.map((h) => h.date as string),
    operatorHolidayDates: operatorHolidays.map((h) => h.date),
    shiftMap: Object.fromEntries(
      shifts.map((s) => [s.id as string, (s.hoursPerDay as number) ?? 8]),
    ),
    sundayCategoryMap: Object.fromEntries(
      sundayCategories.map((c) => [c.id, c]),
    ),
    appSettings,
  };

  const overridesByEmployeeId = new Map<string, SalarySheetOverrideRecord[]>();
  monthOverrides.forEach((record) => {
    const list = overridesByEmployeeId.get(record.employeeId) ?? [];
    list.push(record);
    overridesByEmployeeId.set(record.employeeId, list);
  });

  // Attendance by employee+date, duplicates resolved last-write-wins.
  const attByEmpDate = new Map<string, Record<string, unknown>[]>();
  attendance.forEach((a) => {
    const empId = a.employeeId as string;
    const list = attByEmpDate.get(empId);
    if (list) list.push(a);
    else attByEmpDate.set(empId, [a]);
  });

  const rows: SalarySheetRow[] = employees.map((emp) => {
    const empId = emp.id as string;
    return buildSalarySheetRowForEmployee(
      emp,
      foldAttendanceByDate(attByEmpDate.get(empId) ?? []),
      deductionsByEmployeeId.get(empId) ?? [],
      overridesByEmployeeId.get(empId) ?? [],
      ctx,
      from,
      to,
    );
  });

  return {
    rows,
    from,
    to,
    holidayDates: ctx.holidayDates,
    calendarDaysInMonth: ctx.calendarDaysInMonth,
  };
}

/**
 * Single row for one employee — the same row `getSalarySheetForRange` would
 * produce for them, built from that employee's data alone.
 *
 * This used to build the whole sheet and pick one row out of it, so opening one
 * employee deserialised every employee's attendance for the period (~130k rows
 * on a 60-person factory, twice per page load) and ran the payroll engine 60
 * times to keep 1 answer. It now reads only this employee's attendance and
 * deductions and calls `buildSalarySheetRowForEmployee`, which is the very
 * function the sheet builds its rows with — the two cannot disagree, because
 * there is only one of them.
 *
 * The roster read stays: it is one small store, and it is how an employee is
 * found whether or not they appear on the sheet (Production workers are
 * deliberately off the roster — see `getSalarySheetForRange` — and inactive
 * employees are filtered out of it, yet both still have a row here).
 */
export async function getSalarySheetRowForEmployee(
  employeeId: string,
  year: number,
  month: number,
  from: string,
  to: string,
): Promise<SalarySheetRow | null> {
  const [
    employees,
    attendance,
    holidays,
    operatorHolidays,
    shifts,
    sundayCategories,
    monthOverrides,
    deductions,
    appSettings,
  ] = await Promise.all([
    getEmployees(false),
    getAttendanceByEmployeeInRange(employeeId, from, to),
    getHolidaysInRange(from, to),
    getOperatorHolidaysInRange(from, to),
    getShifts(),
    getSundayCategories(),
    getSalarySheetOverridesForMonth(year, month),
    getDeductionsByEmployee(employeeId),
    getAppSettings(),
  ]);

  const employee =
    employees.find((emp) => (emp.id as string) === employeeId) ??
    (await getEmployee(employeeId));
  if (!employee) return null;

  const ctx: SalarySheetContext = {
    year,
    month,
    calendarDaysInMonth: getCalendarDaysInMonth(year, month),
    holidayDates: holidays.map((h) => h.date as string),
    operatorHolidayDates: operatorHolidays.map((h) => h.date),
    shiftMap: Object.fromEntries(
      shifts.map((s) => [s.id as string, (s.hoursPerDay as number) ?? 8]),
    ),
    sundayCategoryMap: Object.fromEntries(
      sundayCategories.map((c) => [c.id, c]),
    ),
    appSettings,
  };

  return buildSalarySheetRowForEmployee(
    employee,
    foldAttendanceByDate(attendance),
    deductions,
    monthOverrides.filter((record) => record.employeeId === employeeId),
    ctx,
    from,
    to,
  );
}
