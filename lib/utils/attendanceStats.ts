/**
 * Attendance stats calculation shared between employee page and salary sheet.
 * Logic: no entry = absent on working days. Production is tracked separately and does
 * not affect attendance salary.
 * Daily rate = monthly salary ÷ calendar days in the month.
 * Extra pay days (earned pool): the month is split into cycle windows (1–15, 16–end by
 * default) and each window counts its **working-day** present dates. What that count earns
 * is entirely the configured {@link SundayCategoryRule} — a bracket table or a repeating
 * rule — clamped by that rule's own per-cycle and per-month caps (`null` = no cap).
 * Range logic sums each overlapped month. Sunday marked present still adds separately.
 * Hours: hoursReduced (-) and hoursExtra (+) adjust salary via rate per hour.
 */
import {
  getWorkingDayDates,
  getDatesInRange,
  isSunday,
  getSundayDatesInMonth,
  getMonthRange,
  getCalendarDaysInMonth,
  DEFAULT_MAX_DAY_PAY_FRACTION,
  dayPayCapValue,
  type DayPayCap,
} from "./date";
import {
  DEFAULT_SUNDAY_RULE,
  evaluateSundayRuleForCycle,
  getSundayRuleCycleBlocks,
  LEGACY_CYCLE_DAYS,
  LEGACY_EARNED_SUNDAYS,
  LEGACY_MAX_PER_CYCLE,
  LEGACY_MAX_PER_MONTH,
  LEGACY_REQUIRED_PRESENT,
  type SundayRule,
} from "./sundayRule";

/** Default cycle window length, when a rule does not configure its own. */
export const EXTRA_PAY_CYCLE_DAYS = LEGACY_CYCLE_DAYS;
/** Default cap on earned Sunday pay days per cycle. */
export const MAX_EXTRA_PAY_DAYS_PER_CYCLE = LEGACY_MAX_PER_CYCLE;
/** Default minimum working-day present dates in a cycle to qualify. */
export const EXTRA_PAY_CYCLE_PRESENT_THRESHOLD = LEGACY_REQUIRED_PRESENT;
/** Default extra pay days granted per qualifying cycle. */
export const EXTRA_PAY_DAYS_PER_QUALIFIED_CYCLE = LEGACY_EARNED_SUNDAYS;
/** Default cap on cycle-based extra pay days per calendar month. */
export const MAX_EXTRA_PAY_DAYS_PER_MONTH = LEGACY_MAX_PER_MONTH;

/**
 * The rule the payroll engine consumes. Now the fully configurable
 * {@link SundayRule} — the two hardcoded `threshold` / `step` modes it replaced
 * are migrated on read by `normalizeSundayRule`, so callers that simply pass a
 * resolved rule through are unaffected.
 */
export type SundayCategoryRule = SundayRule;

export const DEFAULT_SUNDAY_CATEGORY_RULE: SundayCategoryRule =
  DEFAULT_SUNDAY_RULE;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

type AttendanceMap = Map<
  string,
  {
    status: string;
    hoursWorked?: number;
    hoursReduced?: number;
    hoursExtra?: number;
  }
>;

function countPresentDaysInMonthWindow(
  year: number,
  month: number,
  dayStart: number,
  dayEnd: number,
  attByDate: AttendanceMap,
): number {
  let count = 0;
  for (let d = dayStart; d <= dayEnd; d++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    if (isSunday(dateStr)) continue;
    const att = attByDate.get(dateStr);
    if (att?.status === "present") {
      count += 1;
    }
  }
  return count;
}

function forEachCalendarMonthOverlappingRange(
  fromDate: string,
  toDate: string,
  visit: (year: number, monthIndex: number) => void
): void {
  let y = +fromDate.slice(0, 4);
  let m = +fromDate.slice(5, 7) - 1;
  const endY = +toDate.slice(0, 4);
  const endM = +toDate.slice(5, 7) - 1;
  while (y < endY || (y === endY && m <= endM)) {
    visit(y, m);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
}

/**
 * Split a calendar month into its extra-pay cycle blocks.
 *
 * Thin wrapper over {@link getSundayRuleCycleBlocks} for callers that still
 * assume the default cycle length; see that function for why the last block
 * absorbs the tail of the month.
 */
export function getExtraPayCycleBlocks(
  year: number,
  monthIndex: number,
  cycleDays: number = EXTRA_PAY_CYCLE_DAYS,
): { start: number; end: number }[] {
  return getSundayRuleCycleBlocks(year, monthIndex, cycleDays);
}

/**
 * Cycle-based extra pay days for every calendar month that overlaps `[fromDate, toDate]`.
 * Only blocks (see {@link getExtraPayCycleBlocks}) that lie entirely inside the
 * range are evaluated — that containment check is what lets a half-month slice
 * and its sibling add up to the full month without double counting. Each block
 * earns whatever the rule says, clamped by the rule's own `maxPerCycle`, and
 * each month's total by its `maxPerMonth`. Both caps are configuration now, and
 * `null` means "no cap" — nothing here clamps behind the owner's back.
 */
export function computeEarnedExtraPayDaysForCalendarScope(
  fromDate: string,
  toDate: string,
  holidayDates: string[],
  attByDate: AttendanceMap,
  hoursPerDay: number,
  categoryRule: SundayCategoryRule = DEFAULT_SUNDAY_CATEGORY_RULE,
): number {
  let total = 0;
  forEachCalendarMonthOverlappingRange(fromDate, toDate, (year, monthIndex) => {
    let monthRaw = 0;
    for (const { start, end } of getExtraPayCycleBlocks(
      year,
      monthIndex,
      categoryRule.cycleDays,
    )) {
      const windowStart = `${year}-${pad2(monthIndex + 1)}-${pad2(start)}`;
      const windowEnd = `${year}-${pad2(monthIndex + 1)}-${pad2(end)}`;
      if (windowStart < fromDate || windowEnd > toDate) continue;
      const presentCount = countPresentDaysInMonthWindow(
        year,
        monthIndex,
        start,
        end,
        attByDate,
      );
      monthRaw += evaluateSundayRuleForCycle(categoryRule, presentCount).earned;
    }
    const capped =
      categoryRule.maxPerMonth === null
        ? monthRaw
        : Math.min(categoryRule.maxPerMonth, monthRaw);
    // What one earned day is worth is applied last, *after* both caps, so the
    // caps keep meaning "this many lines' worth of days" — the units the owner
    // typed them in. At the default worth of 1 this multiplication is the
    // identity and no install's total moves.
    total += capped * categoryRule.earnedDayPayDays;
  });
  return total;
}

/**
 * "Once someone has been present `requiredPresentDays` days this month, a
 * Sunday they work pays `sundayMultiplier` times a day's pay."
 *
 * One shape for the two numbers a Sunday category configures, the day-by-day
 * sheet applies and the period total adds up — so the sheet and the total
 * cannot drift apart.
 */
export interface SundayRatePremium {
  requiredPresentDays: number;
  sundayMultiplier: number;
}

/**
 * The *extra* rupees a Sunday premium adds over the flat rate, for the Sundays
 * worked inside `[fromDate, toDate]`.
 *
 * Returned as an addition rather than a rebuilt total on purpose. The range
 * summary pays `totalPaidDays × ratePerDay` in one multiplication; recomputing
 * it day by day to slip the premium in would re-round every day and move a
 * premium-free factory's pay by a paisa here and there. Adding zero changes
 * nothing at all, which is exactly what a factory with no premium configured
 * must see.
 *
 * `attendance` should cover each whole calendar month the range touches, not
 * just the range: the qualifying count runs from day 1 of the month, so feeding
 * it a half-month slice would restart the count and quietly withhold the
 * premium from the second half. Sundays outside the range are counted for
 * qualification but never paid here.
 */
export function computeSundayPremiumExtraPay(input: {
  fromDate: string;
  toDate: string;
  attendance: AttendanceRecord[];
  ratePerDay: number;
  premium?: SundayRatePremium | null;
  /**
   * What one worked Sunday is worth in days' pay, from the rule. The premium
   * multiplies this, so a factory paying half a day for Sunday work and 2× once
   * someone qualifies pays one whole day, not two. Defaults to 1, which is what
   * every caller meant before the worth was configurable.
   */
  sundayWorkedPayDays?: number;
}): number {
  const { fromDate, toDate, attendance, ratePerDay, premium } = input;
  const worth = input.sundayWorkedPayDays ?? 1;
  if (!premium) return 0;
  const { requiredPresentDays, sundayMultiplier } = premium;
  if (!Number.isFinite(sundayMultiplier) || !Number.isFinite(requiredPresentDays)) {
    return 0;
  }
  // Rounded exactly as `buildMonthSalaryBreakdown` rounds each Sunday row, so a
  // person's total agrees with the day rows printed underneath it.
  const flatPay = Math.round(ratePerDay * worth * 100) / 100;
  const premiumPay = Math.round(ratePerDay * worth * sundayMultiplier * 100) / 100;
  const perSunday = Math.round((premiumPay - flatPay) * 100) / 100;
  if (perSunday === 0) return 0;

  const statusByDate = new Map(attendance.map((a) => [a.date, a.status]));
  let extra = 0;
  forEachCalendarMonthOverlappingRange(fromDate, toDate, (year, monthIndex) => {
    // Present working and holiday days count towards qualifying; Sundays never
    // do. Same rule as `presentWorkingDayCountSoFar` in the day-by-day builder.
    let presentSoFar = 0;
    const lastDay = getCalendarDaysInMonth(year, monthIndex);
    for (let d = 1; d <= lastDay; d += 1) {
      const dateStr = `${year}-${pad2(monthIndex + 1)}-${pad2(d)}`;
      const present = statusByDate.get(dateStr) === "present";
      if (!isSunday(dateStr)) {
        if (present) presentSoFar += 1;
        continue;
      }
      if (!present) continue;
      if (dateStr < fromDate || dateStr > toDate) continue;
      if (presentSoFar >= requiredPresentDays) extra += perSunday;
    }
  });
  return Math.round(extra * 100) / 100;
}

export interface AttendanceRecord {
  date: string;
  status: string;
  hoursWorked?: number;
  hoursReduced?: number;
  hoursExtra?: number;
}

export interface AttendanceStatsInput {
  year: number;
  month: number;
  holidayDates: string[];
  attendance: AttendanceRecord[];
  hoursPerDay?: number;
  sundayCategoryRule?: SundayCategoryRule;
  /** Most one date may pay, in days. `null` = no limit. Default 2, as before. */
  maxDayPayFraction?: DayPayCap;
}

export interface AttendanceStats {
  presentDays: number;
  absentDays: number;
  holidayPresentDays: number;
  /** Extra pay days from 15-day in-month cycles (capped per calendar month) */
  earnedSundayPayDays: number;
  /**
   * Days' pay from Sundays marked present. One per Sunday worked unless the
   * rule sets a different worth (`sundayWorkedPayDays`), so this is a *pay*
   * figure, not a count of Sundays.
   */
  sundayPresentBonusDays: number;
  totalPaidDays: number;
  totalHoursWorked: number;
  /**
   * What the per-day limit removed from `presentDays`, for reporting.
   *
   * Optional because callers outside this module hand-build this shape for
   * display; every function here always sets it.
   */
  dayPayCap?: DayPayCapReport;
}

export interface AttendanceSalarySummaryForRange extends AttendanceStats {
  hoursExtraTotal: number;
  hoursReducedTotal: number;
  /**
   * Rupees the Sunday premium added on top of the flat daily rate. 0 whenever
   * no premium applies, and carried so a caller can say where the money came
   * from instead of the total simply being bigger than the days imply.
   *
   * Optional because callers outside this module hand-build this shape for
   * display (`salarySheetRowToAttendanceSummary`, whose figures already include
   * any premium); every function here always sets it.
   */
  sundayPremiumExtraPay?: number;
  calculatedSalary: number;
}

/**
 * What one present day earns, before and after the per-day limit.
 *
 * The limit used to be a hardcoded 2 applied inside `computeDayPayFraction`,
 * so a person who worked eight hours extra on an eight-hour shift earned 2.25
 * days by the app's own arithmetic and was paid 2, with nothing anywhere saying
 * a number had been reduced. Returning both figures — exactly as
 * `evaluateSundayRuleForCycle` does for Sunday earnings — is what lets a caller
 * say "this day earned 2.25 days, the limit pays 2" instead of quietly paying
 * the smaller one.
 */
export interface DayPayFractionResult {
  /** What the day actually pays. */
  paid: number;
  /** What the formula produced before the limit was applied. */
  uncapped: number;
  /** True when the limit reduced the day. */
  capped: boolean;
}

/** Paid-day fraction for a present working day (hours worked or extra/less adjust). */
export function computeDayPayFractionDetailed(
  att: { hoursWorked?: number; hoursReduced?: number; hoursExtra?: number },
  fullDayHours: number,
  cap: DayPayCap = DEFAULT_MAX_DAY_PAY_FRACTION,
): DayPayFractionResult {
  const limit = dayPayCapValue(cap);
  // A shift with no hours has no scale to measure a long day against, so there
  // is nothing for the limit to act on: the day is simply a full day.
  if (fullDayHours <= 0) return { paid: 1, uncapped: 1, capped: false };
  const uncapped =
    att.hoursWorked != null && att.hoursWorked >= 0
      ? Math.max(att.hoursWorked / fullDayHours, 0)
      : Math.max(1 + ((att.hoursExtra ?? 0) - (att.hoursReduced ?? 0)) / fullDayHours, 0);
  const paid = Math.min(uncapped, limit);
  // `capped` stays false for NaN, where the comparison is false anyway: a
  // number nobody can read is not a limit story worth telling.
  return { paid, uncapped, capped: paid < uncapped };
}

/** {@link computeDayPayFractionDetailed}, paid fraction only. */
export function computeDayPayFraction(
  att: { hoursWorked?: number; hoursReduced?: number; hoursExtra?: number },
  fullDayHours: number,
  cap: DayPayCap = DEFAULT_MAX_DAY_PAY_FRACTION,
): number {
  return computeDayPayFractionDetailed(att, fullDayHours, cap).paid;
}

/**
 * How much pay a per-day limit removed over a set of days, so the salary sheet
 * and the adjust dialog can report it instead of the owner discovering it by
 * arithmetic.
 */
export interface DayPayCapReport {
  /** The limit in force, `null` when there is none. */
  limit: DayPayCap;
  /** Days of pay the limit removed, rounded to two places. */
  clippedDays: number;
  /** How many dates were reduced. */
  clippedDates: number;
}

/** Running total of what a per-day limit took off. */
class DayPayCapTally {
  private days = 0;
  private dates = 0;
  constructor(private readonly limit: DayPayCap) {}
  add(result: DayPayFractionResult): number {
    if (result.capped) {
      this.days += result.uncapped - result.paid;
      this.dates += 1;
    }
    return result.paid;
  }
  report(): DayPayCapReport {
    return {
      limit: this.limit,
      clippedDays: Math.round(this.days * 100) / 100,
      clippedDates: this.dates,
    };
  }
}

/**
 * What the per-day limit takes off an employee's present days in a date range.
 *
 * Computed on its own rather than read off a summary because the two salary
 * sheet paths (ordinary and Operator) build their totals differently — the
 * Operator path runs a whole month and filters afterwards — and a report that
 * covers a different span from the row it sits on is worse than no report.
 *
 * Sundays are skipped: a present Sunday pays a flat bonus day, so no per-day
 * limit is applied to it and none can be reported.
 */
export function reportDayPayCapForRange(
  attendance: AttendanceRecord[],
  fromDate: string,
  toDate: string,
  hoursPerDay: number,
  cap: DayPayCap = DEFAULT_MAX_DAY_PAY_FRACTION,
): DayPayCapReport {
  const tally = new DayPayCapTally(cap);
  for (const a of attendance) {
    if (a.date < fromDate || a.date > toDate) continue;
    if (a.status !== "present") continue;
    if (isSunday(a.date)) continue;
    tally.add(computeDayPayFractionDetailed(a, hoursPerDay, cap));
  }
  return tally.report();
}

export function computeAttendanceStats(input: AttendanceStatsInput): AttendanceStats {
  const {
    year,
    month,
    holidayDates,
    attendance,
    hoursPerDay = 8,
    sundayCategoryRule = DEFAULT_SUNDAY_CATEGORY_RULE,
    maxDayPayFraction = DEFAULT_MAX_DAY_PAY_FRACTION,
  } = input;

  const capTally = new DayPayCapTally(maxDayPayFraction);
  const workingDayDates = getWorkingDayDates(year, month, holidayDates);
  const attByDate = new Map(
    attendance.map((a) => [
      a.date,
      {
        status: a.status,
        hoursWorked: a.hoursWorked,
        hoursReduced: a.hoursReduced,
        hoursExtra: a.hoursExtra,
      },
    ])
  );

  let paidWorkingDays = 0;
  let absentCount = 0;
  let holidayPresentCount = 0;
  let totalHoursWorked = 0;

  for (const dateStr of workingDayDates) {
    const att = attByDate.get(dateStr);
    if (att?.status === "present") {
      const dayVal = capTally.add(
        computeDayPayFractionDetailed(att, hoursPerDay, maxDayPayFraction),
      );
      paidWorkingDays += dayVal;
      const extra = (att.hoursExtra ?? 0) - (att.hoursReduced ?? 0);
      totalHoursWorked += att.hoursWorked != null ? att.hoursWorked : hoursPerDay + extra;
    } else if (att?.status === "absent") {
      absentCount += 1;
    } else {
      absentCount += 1;
    }
  }

  for (const dateStr of holidayDates) {
    const att = attByDate.get(dateStr);
    if (att?.status !== "present") continue;
    const dayVal = capTally.add(
      computeDayPayFractionDetailed(att, hoursPerDay, maxDayPayFraction),
    );
    paidWorkingDays += dayVal;
    holidayPresentCount += 1;
    const extra = (att.hoursExtra ?? 0) - (att.hoursReduced ?? 0);
    totalHoursWorked += att.hoursWorked != null ? att.hoursWorked : hoursPerDay + extra;
  }

  let sundayPresentBonusDays = 0;
  for (const dateStr of getSundayDatesInMonth(year, month)) {
    const att = attByDate.get(dateStr);
    if (att?.status === "present") {
      sundayPresentBonusDays += sundayCategoryRule.sundayWorkedPayDays;
    }
  }

  const paidRounded = Math.round(paidWorkingDays * 100) / 100;
  const { from: monthFrom, to: monthTo } = getMonthRange(year, month);
  const earnedSundayPayDays =
    Math.round(
      computeEarnedExtraPayDaysForCalendarScope(
        monthFrom,
        monthTo,
        holidayDates,
        attByDate,
        hoursPerDay,
        sundayCategoryRule,
      ) * 100,
    ) / 100;
  const totalPaidDays =
    paidRounded + earnedSundayPayDays + sundayPresentBonusDays;

  return {
    presentDays: paidRounded,
    absentDays: absentCount,
    holidayPresentDays: holidayPresentCount,
    earnedSundayPayDays,
    sundayPresentBonusDays,
    totalPaidDays,
    totalHoursWorked,
    dayPayCap: capTally.report(),
  };
}

/** Compute total hours worked in a date range from attendance records. */
export function computeHoursInRange(
  attendance: AttendanceRecord[],
  fromDate: string,
  toDate: string,
  hoursPerDay: number
): number {
  let total = 0;
  attendance.forEach((a) => {
    if (a.date < fromDate || a.date > toDate) return;
    if (a.status !== "present") return;
    const extra = (a.hoursExtra ?? 0) - (a.hoursReduced ?? 0);
    total += a.hoursWorked != null ? a.hoursWorked : hoursPerDay + extra;
  });
  return total;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface MonthSalaryDayRow {
  date: string;
  weekdayShort: string;
  rowKind: "sunday" | "holiday" | "working";
  statusLabel: string;
  hoursWorked: number | null;
  hoursExtra: number | null;
  hoursReduced: number | null;
  effectiveHours: number | null;
  paidFraction: number;
  basePay: number;
  productionPay: number;
}

export interface MonthSalaryBreakdown {
  days: MonthSalaryDayRow[];
  paidWorkingDays: number;
  absentDays: number;
  holidayPresentDays: number;
  earnedSundayPayDays: number;
  earnedSundayPoolPay: number;
  sundayPresentBonusDays: number;
  totalPaidDays: number;
  totalBaseSalary: number;
  sundayMarkBonusPay: number;
  sumHoursExtra: number;
  sumHoursReduced: number;
  /** What the per-day limit removed from `paidWorkingDays`, for reporting. */
  dayPayCap: DayPayCapReport;
}

/**
 * One row per calendar day: attendance, hours adjustments, base pay.
 * When `includeProductionPay` is false, `productionPay` is always 0 (attendance-only sheet).
 * Production earnings are separate from attendance salary; optional `productionPayByDate`
 * is only for display when included.
 */
export function buildMonthSalaryBreakdown(input: {
  year: number;
  month: number;
  holidayDates: string[];
  attendance: AttendanceRecord[];
  productionPayByDate: Map<string, number>;
  hoursPerDay: number;
  ratePerDay: number;
  /** When false, per-day production earnings are omitted (attendance sheet only). Default true. */
  includeProductionPay?: boolean;
  sundayCategoryRule?: SundayCategoryRule;
  /**
   * Optional Sunday premium: once the running count of present working/holiday
   * days so far in the month reaches `requiredPresentDays`, a present Sunday is paid
   * `ratePerDay * sundayMultiplier` instead of the flat `ratePerDay`. Undefined
   * preserves today's behavior exactly (flat rate for every present Sunday).
   *
   * Was called `operatorSundayRule`, from when only Operators could have one.
   * Any employee's Sunday category can configure it now, so a name that says
   * "Operator" would send the next reader looking for a restriction that is not
   * there.
   */
  sundayPremium?: SundayRatePremium;
  /** Most one date may pay, in days. `null` = no limit. Default 2, as before. */
  maxDayPayFraction?: DayPayCap;
}): MonthSalaryBreakdown {
  const {
    year,
    month,
    holidayDates,
    attendance,
    productionPayByDate,
    hoursPerDay,
    ratePerDay,
    includeProductionPay = true,
    sundayCategoryRule = DEFAULT_SUNDAY_CATEGORY_RULE,
    sundayPremium,
    maxDayPayFraction = DEFAULT_MAX_DAY_PAY_FRACTION,
  } = input;

  const capTally = new DayPayCapTally(maxDayPayFraction);
  const holidaySet = new Set(holidayDates);
  const attByDate = new Map(
    attendance.map((a) => [
      a.date,
      {
        status: a.status,
        hoursWorked: a.hoursWorked,
        hoursReduced: a.hoursReduced,
        hoursExtra: a.hoursExtra,
      },
    ])
  );

  const lastDay = new Date(year, month + 1, 0).getDate();
  const days: MonthSalaryDayRow[] = [];
  let paidWorkingDays = 0;
  let absentCount = 0;
  let holidayPresentCount = 0;
  let sumHoursExtra = 0;
  let sumHoursReduced = 0;
  let sundayPresentBonusDays = 0;
  // Running count of present working/holiday days so far in the month, used only
  // by the optional Sunday premium. Sundays never contribute to
  // this count since they are not "working days".
  let presentWorkingDayCountSoFar = 0;

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    const dow = new Date(year, month, d).getDay();
    const weekdayShort = WEEKDAY_SHORT[dow];
    const prodPay =
      includeProductionPay ? (productionPayByDate.get(dateStr) ?? 0) : 0;

    if (dow === 0) {
      const att = attByDate.get(dateStr);
      const sundayPresent = att?.status === "present";
      // What one worked Sunday is worth, in days' pay. 1 unless the rule says
      // otherwise, which is every rule written before the field existed.
      const sundayWorth = sundayCategoryRule.sundayWorkedPayDays;
      if (sundayPresent) sundayPresentBonusDays += sundayWorth;
      const sundayMultiplierApplies =
        sundayPresent &&
        sundayPremium != null &&
        presentWorkingDayCountSoFar >= sundayPremium.requiredPresentDays;
      const bonusPay = sundayPresent
        ? sundayMultiplierApplies
          ? Math.round(
              ratePerDay * sundayWorth * sundayPremium!.sundayMultiplier * 100,
            ) / 100
          : Math.round(ratePerDay * sundayWorth * 100) / 100
        : 0;
      if (sundayPresent) {
        const ex = att.hoursExtra ?? 0;
        const red = att.hoursReduced ?? 0;
        if (ex > 0) sumHoursExtra += ex;
        if (red > 0) sumHoursReduced += red;
      }
      days.push({
        date: dateStr,
        weekdayShort,
        rowKind: "sunday",
        statusLabel: sundayPresent
          ? "Sunday (marked present — bonus day)"
          : "Sunday",
        hoursWorked:
          sundayPresent &&
          att.hoursWorked != null &&
          att.hoursWorked >= 0
            ? att.hoursWorked
            : null,
        hoursExtra:
          sundayPresent ? att.hoursExtra ?? null : null,
        hoursReduced:
          sundayPresent ? att.hoursReduced ?? null : null,
        effectiveHours:
          sundayPresent
            ? att.hoursWorked != null && att.hoursWorked >= 0
              ? att.hoursWorked
              : hoursPerDay +
                (att.hoursExtra ?? 0) -
                (att.hoursReduced ?? 0)
            : null,
        paidFraction: sundayPresent ? sundayWorth : 0,
        basePay: bonusPay,
        productionPay: prodPay,
      });
      continue;
    }

    if (holidaySet.has(dateStr)) {
      const att = attByDate.get(dateStr);
      if (att?.status === "present") {
        const frac = capTally.add(
          computeDayPayFractionDetailed(att, hoursPerDay, maxDayPayFraction),
        );
        const ex = att.hoursExtra ?? 0;
        const red = att.hoursReduced ?? 0;
        paidWorkingDays += frac;
        holidayPresentCount += 1;
        presentWorkingDayCountSoFar += 1;
        if (ex > 0) sumHoursExtra += ex;
        if (red > 0) sumHoursReduced += red;
        days.push({
          date: dateStr,
          weekdayShort,
          rowKind: "holiday",
          statusLabel: "Present (factory holiday)",
          hoursWorked:
            att.hoursWorked != null && att.hoursWorked >= 0
              ? att.hoursWorked
              : null,
          hoursExtra: att.hoursExtra ?? null,
          hoursReduced: att.hoursReduced ?? null,
          effectiveHours:
            att.hoursWorked != null && att.hoursWorked >= 0
              ? att.hoursWorked
              : hoursPerDay + ex - red,
          paidFraction: Math.round(frac * 100) / 100,
          basePay: Math.round(frac * ratePerDay * 100) / 100,
          productionPay: prodPay,
        });
      } else {
        days.push({
          date: dateStr,
          weekdayShort,
          rowKind: "holiday",
          statusLabel: "Factory holiday",
          hoursWorked: null,
          hoursExtra: null,
          hoursReduced: null,
          effectiveHours: null,
          paidFraction: 0,
          basePay: 0,
          productionPay: prodPay,
        });
      }
      continue;
    }

    const att = attByDate.get(dateStr);

    if (att?.status === "present") {
      const frac = capTally.add(
        computeDayPayFractionDetailed(att, hoursPerDay, maxDayPayFraction),
      );
      paidWorkingDays += frac;
      presentWorkingDayCountSoFar += 1;
      const ex = att.hoursExtra ?? 0;
      const red = att.hoursReduced ?? 0;
      if (ex > 0) sumHoursExtra += ex;
      if (red > 0) sumHoursReduced += red;
      const effective =
        att.hoursWorked != null && att.hoursWorked >= 0
          ? att.hoursWorked
          : hoursPerDay + ex - red;
      days.push({
        date: dateStr,
        weekdayShort,
        rowKind: "working",
        statusLabel: "Present",
        hoursWorked:
          att.hoursWorked != null && att.hoursWorked >= 0
            ? att.hoursWorked
            : null,
        hoursExtra: att.hoursExtra ?? null,
        hoursReduced: att.hoursReduced ?? null,
        effectiveHours: effective,
        paidFraction: Math.round(frac * 100) / 100,
        basePay: Math.round(frac * ratePerDay * 100) / 100,
        productionPay: prodPay,
      });
    } else if (att?.status === "absent") {
      absentCount += 1;
      days.push({
        date: dateStr,
        weekdayShort,
        rowKind: "working",
        statusLabel: "Absent",
        hoursWorked: null,
        hoursExtra: null,
        hoursReduced: null,
        effectiveHours: null,
        paidFraction: 0,
        basePay: 0,
        productionPay: prodPay,
      });
    } else {
      absentCount += 1;
      days.push({
        date: dateStr,
        weekdayShort,
        rowKind: "working",
        statusLabel: "Absent (no entry)",
        hoursWorked: null,
        hoursExtra: null,
        hoursReduced: null,
        effectiveHours: null,
        paidFraction: 0,
        basePay: 0,
        productionPay: prodPay,
      });
    }
  }

  const paidRounded = Math.round(paidWorkingDays * 100) / 100;
  const { from: monthFrom, to: monthTo } = getMonthRange(year, month);
  const earnedSundayPayDays =
    Math.round(
      computeEarnedExtraPayDaysForCalendarScope(
        monthFrom,
        monthTo,
        holidayDates,
        attByDate,
        hoursPerDay,
        sundayCategoryRule,
      ) * 100,
    ) / 100;
  const earnedSundayPoolPay =
    Math.round(earnedSundayPayDays * ratePerDay * 100) / 100;
  // Sum actual per-row Sunday bonus pay rather than `sundayPresentBonusDays * ratePerDay`,
  // since the Sunday premium can make individual Sundays' bonusPay differ
  // from the flat rate within the same month.
  const sundayMarkBonusPay =
    Math.round(
      days
        .filter((r) => r.rowKind === "sunday")
        .reduce((s, r) => s + r.basePay, 0) * 100,
    ) / 100;
  const rowPaySum =
    Math.round(
      days.reduce((s, r) => s + r.basePay, 0) * 100
    ) / 100;
  const totalBaseSalary =
    Math.round((rowPaySum + earnedSundayPoolPay) * 100) / 100;
  const totalPaidDays =
    paidRounded + earnedSundayPayDays + sundayPresentBonusDays;

  return {
    days,
    paidWorkingDays: paidRounded,
    absentDays: absentCount,
    holidayPresentDays: holidayPresentCount,
    earnedSundayPayDays,
    earnedSundayPoolPay,
    sundayPresentBonusDays,
    totalPaidDays,
    totalBaseSalary,
    sundayMarkBonusPay,
    sumHoursExtra,
    sumHoursReduced,
    dayPayCap: capTally.report(),
  };
}

/** Attendance aggregates for an arbitrary inclusive date range (pay period, etc.). */
export function computeAttendanceStatsForRange(input: {
  fromDate: string;
  toDate: string;
  holidayDates: string[];
  attendance: AttendanceRecord[];
  hoursPerDay?: number;
  sundayCategoryRule?: SundayCategoryRule;
  /** Most one date may pay, in days. `null` = no limit. Default 2, as before. */
  maxDayPayFraction?: DayPayCap;
}): AttendanceStats {
  const {
    fromDate,
    toDate,
    holidayDates,
    attendance,
    hoursPerDay = 8,
    sundayCategoryRule = DEFAULT_SUNDAY_CATEGORY_RULE,
    maxDayPayFraction = DEFAULT_MAX_DAY_PAY_FRACTION,
  } = input;

  const capTally = new DayPayCapTally(maxDayPayFraction);
  const holidaySet = new Set(holidayDates);
  const rangeDates = getDatesInRange(fromDate, toDate);
  const attByDate = new Map(
    attendance.map((a) => [
      a.date,
      {
        status: a.status,
        hoursWorked: a.hoursWorked,
        hoursReduced: a.hoursReduced,
        hoursExtra: a.hoursExtra,
      },
    ])
  );

  const workingDayDatesInRange = rangeDates.filter(
    (d) => !isSunday(d) && !holidaySet.has(d)
  );

  let paidWorkingDays = 0;
  let absentCount = 0;
  let holidayPresentCount = 0;
  let totalHoursWorked = 0;

  for (const dateStr of workingDayDatesInRange) {
    const att = attByDate.get(dateStr);
    if (att?.status === "present") {
      const dayVal = capTally.add(
        computeDayPayFractionDetailed(att, hoursPerDay, maxDayPayFraction),
      );
      paidWorkingDays += dayVal;
      const extra = (att.hoursExtra ?? 0) - (att.hoursReduced ?? 0);
      totalHoursWorked += att.hoursWorked != null ? att.hoursWorked : hoursPerDay + extra;
    } else if (att?.status === "absent") {
      absentCount += 1;
    } else {
      absentCount += 1;
    }
  }

  for (const dateStr of rangeDates) {
    if (!holidaySet.has(dateStr)) continue;
    const att = attByDate.get(dateStr);
    if (att?.status !== "present") continue;
    const dayVal = capTally.add(
      computeDayPayFractionDetailed(att, hoursPerDay, maxDayPayFraction),
    );
    paidWorkingDays += dayVal;
    holidayPresentCount += 1;
    const extra = (att.hoursExtra ?? 0) - (att.hoursReduced ?? 0);
    totalHoursWorked += att.hoursWorked != null ? att.hoursWorked : hoursPerDay + extra;
  }

  let sundayPresentBonusDays = 0;
  for (const dateStr of rangeDates) {
    if (!isSunday(dateStr)) continue;
    const att = attByDate.get(dateStr);
    if (att?.status === "present") {
      sundayPresentBonusDays += sundayCategoryRule.sundayWorkedPayDays;
    }
  }

  const paidRounded = Math.round(paidWorkingDays * 100) / 100;
  const earnedSundayPayDays =
    Math.round(
      computeEarnedExtraPayDaysForCalendarScope(
        fromDate,
        toDate,
        holidayDates,
        attByDate,
        hoursPerDay,
        sundayCategoryRule,
      ) * 100,
    ) / 100;
  const totalPaidDays =
    paidRounded + earnedSundayPayDays + sundayPresentBonusDays;

  return {
    presentDays: paidRounded,
    absentDays: absentCount,
    holidayPresentDays: holidayPresentCount,
    earnedSundayPayDays,
    sundayPresentBonusDays,
    totalPaidDays,
    totalHoursWorked,
    dayPayCap: capTally.report(),
  };
}

export function buildAttendanceSalarySummaryForRange(input: {
  fromDate: string;
  toDate: string;
  holidayDates: string[];
  attendance: AttendanceRecord[];
  hoursPerDay?: number;
  ratePerDay: number;
  sundayCategoryRule?: SundayCategoryRule;
  /** Most one date may pay, in days. `null` = no limit. Default 2, as before. */
  maxDayPayFraction?: DayPayCap;
  /**
   * Extra pay for Sundays worked, once the month's present days reach a set
   * number. Omitted or `null` pays every Sunday worked at the flat daily rate,
   * which is what every caller did before this existed.
   */
  sundayPremium?: SundayRatePremium | null;
  /**
   * Attendance for the whole calendar month(s) the range touches, used only to
   * decide which Sundays qualify for `sundayPremium` — see
   * {@link computeSundayPremiumExtraPay}. Defaults to `attendance`.
   */
  premiumAttendance?: AttendanceRecord[];
}): AttendanceSalarySummaryForRange {
  const {
    fromDate,
    toDate,
    holidayDates,
    attendance,
    hoursPerDay = 8,
    ratePerDay,
    sundayCategoryRule = DEFAULT_SUNDAY_CATEGORY_RULE,
    maxDayPayFraction = DEFAULT_MAX_DAY_PAY_FRACTION,
    sundayPremium = null,
    premiumAttendance,
  } = input;

  const stats = computeAttendanceStatsForRange({
    fromDate,
    toDate,
    holidayDates,
    attendance,
    hoursPerDay,
    sundayCategoryRule,
    maxDayPayFraction,
  });
  const { hoursExtraSum, hoursReducedSum } = sumHoursAdjustmentsInRange(
    attendance,
    fromDate,
    toDate,
  );

  const sundayPremiumExtraPay = computeSundayPremiumExtraPay({
    fromDate,
    toDate,
    attendance: premiumAttendance ?? attendance,
    ratePerDay,
    premium: sundayPremium,
    sundayWorkedPayDays: sundayCategoryRule.sundayWorkedPayDays,
  });

  return {
    ...stats,
    hoursExtraTotal: hoursExtraSum,
    hoursReducedTotal: hoursReducedSum,
    sundayPremiumExtraPay,
    calculatedSalary:
      Math.round(
        (Math.round(stats.totalPaidDays * ratePerDay * 100) / 100 +
          sundayPremiumExtraPay) *
          100,
      ) / 100,
  };
}

/** Sum extra / reduced hours on present days in an inclusive date range. */
export function sumHoursAdjustmentsInRange(
  attendance: AttendanceRecord[],
  fromDate: string,
  toDate: string
): { hoursExtraSum: number; hoursReducedSum: number } {
  let hoursExtraSum = 0;
  let hoursReducedSum = 0;
  for (const a of attendance) {
    if (a.date < fromDate || a.date > toDate) continue;
    if (a.status !== "present") continue;
    const ex = a.hoursExtra ?? 0;
    const red = a.hoursReduced ?? 0;
    if (ex > 0) hoursExtraSum += ex;
    if (red > 0) hoursReducedSum += red;
  }
  return {
    hoursExtraSum: Math.round(hoursExtraSum * 100) / 100,
    hoursReducedSum: Math.round(hoursReducedSum * 100) / 100,
  };
}
