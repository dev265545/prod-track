/**
 * Attendance stats calculation shared between employee page and salary sheet.
 * Logic: no entry = absent on working days. Production is tracked separately and does
 * not affect attendance salary.
 * Daily rate = monthly salary ÷ calendar days in the month.
 * Earned “Sunday pay” units follow a step table on present working-day equivalents (see
 * `getEarnedSundayPayUnits`). Each Sunday explicitly marked present adds one extra daily rate.
 * Hours: hoursReduced (-) and hoursExtra (+) adjust salary via rate per hour.
 */
import {
  getWorkingDayDates,
  getDatesInRange,
  isSunday,
  getSundayDatesInMonth,
} from "./date";

/**
 * Earned Sunday pay units from working-day attendance (piecewise).
 * First grant at ≥10 presents: **2** units; then +1 at ≥15, +1 at ≥25, +1 at ≥30;
 * after 30: +1 per additional 5 full presents.
 */
export function getEarnedSundayPayUnits(paidWorkingDays: number): number {
  const p = paidWorkingDays;
  if (p < 10) return 0;
  if (p < 15) return 2;
  if (p < 25) return 3;
  if (p < 30) return 4;
  return 5 + Math.floor((p - 30) / 5);
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
}

export interface AttendanceStats {
  presentDays: number;
  absentDays: number;
  /** Paid Sunday units from the earned-Sunday step table on working presents */
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
  const earnedSundayPayDays = getEarnedSundayPayUnits(paidWorkingDays);
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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
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
  const earnedSundayPayDays = getEarnedSundayPayUnits(paidWorkingDays);
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
}): AttendanceStats {
  const {
    fromDate,
    toDate,
    holidayDates,
    attendance,
    hoursPerDay = 8,
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
  const earnedSundayPayDays = getEarnedSundayPayUnits(paidWorkingDays);
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
