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
    total +=
      categoryRule.maxPerMonth === null
        ? monthRaw
        : Math.min(categoryRule.maxPerMonth, monthRaw);
  });
  return total;
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
}

export interface AttendanceStats {
  presentDays: number;
  absentDays: number;
  holidayPresentDays: number;
  /** Extra pay days from 15-day in-month cycles (capped per calendar month) */
  earnedSundayPayDays: number;
  /** Sundays marked present — each adds an extra daily rate on top of earned units */
  sundayPresentBonusDays: number;
  totalPaidDays: number;
  totalHoursWorked: number;
}

export interface AttendanceSalarySummaryForRange extends AttendanceStats {
  hoursExtraTotal: number;
  hoursReducedTotal: number;
  calculatedSalary: number;
}

/** Paid-day fraction for a present working day (hours worked or extra/less adjust). */
export function computeDayPayFraction(
  att: { hoursWorked?: number; hoursReduced?: number; hoursExtra?: number },
  fullDayHours: number
): number {
  if (fullDayHours <= 0) return 1;
  if (att.hoursWorked != null && att.hoursWorked >= 0) {
    return Math.min(
      Math.max(att.hoursWorked / fullDayHours, 0),
      MAX_DAY_PAY_FRACTION,
    );
  }
  const reduced = att.hoursReduced ?? 0;
  const extra = att.hoursExtra ?? 0;
  const adj = (extra - reduced) / fullDayHours;
  return Math.min(Math.max(1 + adj, 0), MAX_DAY_PAY_FRACTION);
}

export function computeAttendanceStats(input: AttendanceStatsInput): AttendanceStats {
  const {
    year,
    month,
    holidayDates,
    attendance,
    hoursPerDay = 8,
    sundayCategoryRule = DEFAULT_SUNDAY_CATEGORY_RULE,
  } = input;

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
      const dayVal = computeDayPayFraction(att, hoursPerDay);
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
    const dayVal = computeDayPayFraction(att, hoursPerDay);
    paidWorkingDays += dayVal;
    holidayPresentCount += 1;
    const extra = (att.hoursExtra ?? 0) - (att.hoursReduced ?? 0);
    totalHoursWorked += att.hoursWorked != null ? att.hoursWorked : hoursPerDay + extra;
  }

  let sundayPresentBonusDays = 0;
  for (const dateStr of getSundayDatesInMonth(year, month)) {
    const att = attByDate.get(dateStr);
    if (att?.status === "present") sundayPresentBonusDays += 1;
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
   * Optional Operator-only rule: once the running count of present working/holiday
   * days so far in the month reaches `requiredPresentDays`, a present Sunday is paid
   * `ratePerDay * sundayMultiplier` instead of the flat `ratePerDay`. Undefined
   * preserves today's behavior exactly (flat rate for every present Sunday).
   */
  operatorSundayRule?: {
    requiredPresentDays: number;
    sundayMultiplier: number;
  };
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
    operatorSundayRule,
  } = input;

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
  // by the optional Operator Sunday-multiplier rule. Sundays never contribute to
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
      if (sundayPresent) sundayPresentBonusDays += 1;
      const sundayMultiplierApplies =
        sundayPresent &&
        operatorSundayRule != null &&
        presentWorkingDayCountSoFar >= operatorSundayRule.requiredPresentDays;
      const bonusPay = sundayPresent
        ? sundayMultiplierApplies
          ? Math.round(
              ratePerDay * operatorSundayRule!.sundayMultiplier * 100,
            ) / 100
          : Math.round(ratePerDay * 100) / 100
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
        paidFraction: sundayPresent ? 1 : 0,
        basePay: bonusPay,
        productionPay: prodPay,
      });
      continue;
    }

    if (holidaySet.has(dateStr)) {
      const att = attByDate.get(dateStr);
      if (att?.status === "present") {
        const frac = computeDayPayFraction(att, hoursPerDay);
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
      const frac = computeDayPayFraction(att, hoursPerDay);
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
  // since the operator Sunday-multiplier rule can make individual Sundays' bonusPay differ
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
}): AttendanceStats {
  const {
    fromDate,
    toDate,
    holidayDates,
    attendance,
    hoursPerDay = 8,
    sundayCategoryRule = DEFAULT_SUNDAY_CATEGORY_RULE,
  } = input;

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
      const dayVal = computeDayPayFraction(att, hoursPerDay);
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
    const dayVal = computeDayPayFraction(att, hoursPerDay);
    paidWorkingDays += dayVal;
    holidayPresentCount += 1;
    const extra = (att.hoursExtra ?? 0) - (att.hoursReduced ?? 0);
    totalHoursWorked += att.hoursWorked != null ? att.hoursWorked : hoursPerDay + extra;
  }

  let sundayPresentBonusDays = 0;
  for (const dateStr of rangeDates) {
    if (!isSunday(dateStr)) continue;
    const att = attByDate.get(dateStr);
    if (att?.status === "present") sundayPresentBonusDays += 1;
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
}): AttendanceSalarySummaryForRange {
  const {
    fromDate,
    toDate,
    holidayDates,
    attendance,
    hoursPerDay = 8,
    ratePerDay,
    sundayCategoryRule = DEFAULT_SUNDAY_CATEGORY_RULE,
  } = input;

  const stats = computeAttendanceStatsForRange({
    fromDate,
    toDate,
    holidayDates,
    attendance,
    hoursPerDay,
    sundayCategoryRule,
  });
  const { hoursExtraSum, hoursReducedSum } = sumHoursAdjustmentsInRange(
    attendance,
    fromDate,
    toDate,
  );

  return {
    ...stats,
    hoursExtraTotal: hoursExtraSum,
    hoursReducedTotal: hoursReducedSum,
    calculatedSalary: Math.round(stats.totalPaidDays * ratePerDay * 100) / 100,
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
