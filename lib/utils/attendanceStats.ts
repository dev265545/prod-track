/**
 * Attendance stats calculation shared between employee page and salary sheet.
 * Logic: no entry = absent on working days. Production is tracked separately and does
 * not affect attendance salary.
 * Daily rate = monthly salary ÷ calendar days in the month.
 * Extra pay days (earned pool): each **full 15 calendar days** of the month starting at day 1
 * (1–15, 16–30, …) counts **working-day** present equivalents (fractions). If that sum is **≥12**,
 * the block earns **+2** extra pay days. **At most 4** such extra days apply **per calendar month**
 * (range logic sums each overlapped month). Sunday marked present still adds separately.
 * Hours: hoursReduced (-) and hoursExtra (+) adjust salary via rate per hour.
 */
import {
  getWorkingDayDates,
  getDatesInRange,
  isSunday,
  getSundayDatesInMonth,
  getMonthRange,
  getCalendarDaysInMonth,
} from "./date";

/** Length of each pay cycle window (calendar days within a month). */
export const EXTRA_PAY_CYCLE_DAYS = 15;
/** Hard cap on earned Sunday pay days per 15-day cycle, regardless of category. */
export const MAX_EXTRA_PAY_DAYS_PER_CYCLE = 2;
/** Minimum working-day present **equivalents** in a cycle to qualify. */
export const EXTRA_PAY_CYCLE_PRESENT_THRESHOLD = 12;
/** Extra pay days granted per qualifying cycle (before monthly cap). */
export const EXTRA_PAY_DAYS_PER_QUALIFIED_CYCLE = 2;
/** Hard cap on cycle-based extra pay days per calendar month. */
export const MAX_EXTRA_PAY_DAYS_PER_MONTH = 4;

export type SundayCategoryRule =
  | {
      mode: "threshold";
      requiredPresent: number;
      earnedSundays: number;
    }
  | {
      mode: "step";
      everyPresentDays: number;
      earnedPerStep: number;
    };

export const DEFAULT_SUNDAY_CATEGORY_RULE: SundayCategoryRule = {
  mode: "threshold",
  requiredPresent: EXTRA_PAY_CYCLE_PRESENT_THRESHOLD,
  earnedSundays: EXTRA_PAY_DAYS_PER_QUALIFIED_CYCLE,
};

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

function sumPresentFractionOnWorkingDaysInMonthWindow(
  year: number,
  month: number,
  dayStart: number,
  dayEnd: number,
  holidaySet: Set<string>,
  attByDate: AttendanceMap,
  hoursPerDay: number
): number {
  let sum = 0;
  for (let d = dayStart; d <= dayEnd; d++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    if (isSunday(dateStr) || holidaySet.has(dateStr)) continue;
    const att = attByDate.get(dateStr);
    if (att?.status === "present") {
      sum += computeDayPayFraction(att, hoursPerDay);
    }
  }
  return sum;
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
 * Cycle-based extra pay days for every calendar month that overlaps `[fromDate, toDate]`.
 * Only **full** in-month 15-day blocks (starting at calendar day 1) that lie entirely inside the
 * range are evaluated. Each qualifying block adds {@link EXTRA_PAY_DAYS_PER_QUALIFIED_CYCLE};
 * each month’s total is capped at {@link MAX_EXTRA_PAY_DAYS_PER_MONTH}.
 */
export function computeEarnedExtraPayDaysForCalendarScope(
  fromDate: string,
  toDate: string,
  holidayDates: string[],
  attByDate: AttendanceMap,
  hoursPerDay: number,
  categoryRule: SundayCategoryRule = DEFAULT_SUNDAY_CATEGORY_RULE,
): number {
  const holidaySet = new Set(holidayDates);
  let total = 0;
  forEachCalendarMonthOverlappingRange(fromDate, toDate, (year, monthIndex) => {
    const lastDay = getCalendarDaysInMonth(year, monthIndex);
    let monthRaw = 0;
    for (
      let start = 1;
      start + EXTRA_PAY_CYCLE_DAYS - 1 <= lastDay;
      start += EXTRA_PAY_CYCLE_DAYS
    ) {
      const end = start + EXTRA_PAY_CYCLE_DAYS - 1;
      const windowStart = `${year}-${pad2(monthIndex + 1)}-${pad2(start)}`;
      const windowEnd = `${year}-${pad2(monthIndex + 1)}-${pad2(end)}`;
      if (windowStart < fromDate || windowEnd > toDate) continue;
      const frac = sumPresentFractionOnWorkingDaysInMonthWindow(
        year,
        monthIndex,
        start,
        end,
        holidaySet,
        attByDate,
        hoursPerDay
      );
      let earnedForCycle = 0;
      if (categoryRule.mode === "threshold") {
        if (frac >= categoryRule.requiredPresent) {
          earnedForCycle = categoryRule.earnedSundays;
        }
      } else if (categoryRule.everyPresentDays > 0) {
        earnedForCycle =
          Math.floor(frac / categoryRule.everyPresentDays) *
          categoryRule.earnedPerStep;
      }
      monthRaw += Math.min(MAX_EXTRA_PAY_DAYS_PER_CYCLE, earnedForCycle);
    }
    total += Math.min(MAX_EXTRA_PAY_DAYS_PER_MONTH, monthRaw);
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
  /** Extra pay days from 15-day in-month cycles (capped per calendar month) */
  earnedSundayPayDays: number;
  /** Sundays marked present — each adds an extra daily rate on top of earned units */
  sundayPresentBonusDays: number;
  totalPaidDays: number;
  totalHoursWorked: number;
}

/** Paid-day fraction for a present working day (hours worked or extra/less adjust). */
export function computeDayPayFraction(
  att: { hoursWorked?: number; hoursReduced?: number; hoursExtra?: number },
  fullDayHours: number
): number {
  if (fullDayHours <= 0) return 1;
  if (att.hoursWorked != null && att.hoursWorked >= 0) {
    return Math.min(Math.max(att.hoursWorked / fullDayHours, 0), 2);
  }
  const reduced = att.hoursReduced ?? 0;
  const extra = att.hoursExtra ?? 0;
  const adj = (extra - reduced) / fullDayHours;
  return Math.min(Math.max(1 + adj, 0), 2);
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
  let sumHoursExtra = 0;
  let sumHoursReduced = 0;
  let sundayPresentBonusDays = 0;

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
      const bonusPay = sundayPresent
        ? Math.round(ratePerDay * 100) / 100
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
        const ex = att.hoursExtra ?? 0;
        const red = att.hoursReduced ?? 0;
        if (ex > 0) sumHoursExtra += ex;
        if (red > 0) sumHoursReduced += red;
        days.push({
          date: dateStr,
          weekdayShort,
          rowKind: "holiday",
          statusLabel: "Present (holiday — no base pay)",
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
          paidFraction: 0,
          basePay: 0,
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
  const sundayMarkBonusPay =
    Math.round(sundayPresentBonusDays * ratePerDay * 100) / 100;
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
    earnedSundayPayDays,
    sundayPresentBonusDays,
    totalPaidDays,
    totalHoursWorked,
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
