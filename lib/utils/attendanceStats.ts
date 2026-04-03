/**
 * Attendance stats calculation shared between employee page and salary sheet.
 * Logic: no entry = absent; holiday present = count for Sunday only, no salary;
 * production on working day = inferred present.
 * Hours: hoursReduced (-) and hoursExtra (+) adjust salary via rate per hour.
 */
import { getWorkingDayDates, getDatesInRange, isSunday } from "./date";
import { getEarnedSundays } from "./salaryRates";

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
  productionDates: Set<string>;
  hoursPerDay?: number;
}

export interface AttendanceStats {
  presentDays: number;
  absentDays: number;
  earnedSundays: number;
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
    productionDates,
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
  let daysCountForSunday = 0;
  let absentCount = 0;
  let totalHoursWorked = 0;

  for (const dateStr of workingDayDates) {
    const att = attByDate.get(dateStr);
    const hasProd = productionDates.has(dateStr);
    if (att?.status === "present") {
      const dayVal = computeDayPayFraction(att, hoursPerDay);
      paidWorkingDays += dayVal;
      daysCountForSunday += 1;
      const extra = (att.hoursExtra ?? 0) - (att.hoursReduced ?? 0);
      totalHoursWorked += att.hoursWorked != null ? att.hoursWorked : hoursPerDay + extra;
    } else if (att?.status === "absent") {
      absentCount += 1;
    } else if (hasProd) {
      paidWorkingDays += 1;
      daysCountForSunday += 1;
      totalHoursWorked += hoursPerDay;
    } else {
      absentCount += 1;
    }
  }

  for (const dateStr of holidayDates) {
    const att = attByDate.get(dateStr);
    if (att?.status === "present") daysCountForSunday += 1;
  }

  const earnedSundays = getEarnedSundays(daysCountForSunday);
  const totalPaidDays = Math.round(paidWorkingDays * 100) / 100 + earnedSundays;

  return {
    presentDays: Math.round(paidWorkingDays * 100) / 100,
    absentDays: absentCount,
    earnedSundays,
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
  earnedSundays: number;
  totalPaidDays: number;
  totalBaseSalary: number;
  sundayBonusPay: number;
  sumHoursExtra: number;
  sumHoursReduced: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * One row per calendar day: attendance, hours adjustments, base pay.
 * When `includeProductionPay` is false, `productionPay` is always 0 (production dates still used only to infer “present” if needed).
 */
export function buildMonthSalaryBreakdown(input: {
  year: number;
  month: number;
  holidayDates: string[];
  attendance: AttendanceRecord[];
  productionDates: Set<string>;
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
    productionDates,
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
  let daysCountForSunday = 0;
  let sumHoursExtra = 0;
  let sumHoursReduced = 0;

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    const dow = new Date(year, month, d).getDay();
    const weekdayShort = WEEKDAY_SHORT[dow];
    const prodPay =
      includeProductionPay ? (productionPayByDate.get(dateStr) ?? 0) : 0;

    if (dow === 0) {
      days.push({
        date: dateStr,
        weekdayShort,
        rowKind: "sunday",
        statusLabel: "Sunday",
        hoursWorked: null,
        hoursExtra: null,
        hoursReduced: null,
        effectiveHours: null,
        paidFraction: 0,
        basePay: 0,
        productionPay: prodPay,
      });
      continue;
    }

    if (holidaySet.has(dateStr)) {
      const att = attByDate.get(dateStr);
      if (att?.status === "present") {
        daysCountForSunday += 1;
        const ex = att.hoursExtra ?? 0;
        const red = att.hoursReduced ?? 0;
        if (ex > 0) sumHoursExtra += ex;
        if (red > 0) sumHoursReduced += red;
        days.push({
          date: dateStr,
          weekdayShort,
          rowKind: "holiday",
          statusLabel: "Present (holiday — counts toward earned Sundays)",
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
    const hasProd = productionDates.has(dateStr);

    if (att?.status === "present") {
      const frac = computeDayPayFraction(att, hoursPerDay);
      paidWorkingDays += frac;
      daysCountForSunday += 1;
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
    } else if (hasProd) {
      paidWorkingDays += 1;
      daysCountForSunday += 1;
      days.push({
        date: dateStr,
        weekdayShort,
        rowKind: "working",
        statusLabel: "Present (inferred)",
        hoursWorked: null,
        hoursExtra: null,
        hoursReduced: null,
        effectiveHours: hoursPerDay,
        paidFraction: 1,
        basePay: Math.round(ratePerDay * 100) / 100,
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

  const earnedSundays = getEarnedSundays(daysCountForSunday);
  const sundayBonusPay =
    Math.round(earnedSundays * ratePerDay * 100) / 100;
  const workingBaseTotal =
    Math.round(
      days.reduce((s, r) => s + r.basePay, 0) * 100
    ) / 100;
  const totalBaseSalary =
    Math.round((workingBaseTotal + sundayBonusPay) * 100) / 100;
  const paidRounded = Math.round(paidWorkingDays * 100) / 100;
  const totalPaidDays = paidRounded + earnedSundays;

  return {
    days,
    paidWorkingDays: paidRounded,
    absentDays: absentCount,
    earnedSundays,
    totalPaidDays,
    totalBaseSalary,
    sundayBonusPay,
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
  productionDates: Set<string>;
  hoursPerDay?: number;
}): AttendanceStats {
  const {
    fromDate,
    toDate,
    holidayDates,
    attendance,
    productionDates,
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
  const holidayDatesInRange = rangeDates.filter((d) => holidaySet.has(d));

  let paidWorkingDays = 0;
  let daysCountForSunday = 0;
  let absentCount = 0;
  let totalHoursWorked = 0;

  for (const dateStr of workingDayDatesInRange) {
    const att = attByDate.get(dateStr);
    const hasProd = productionDates.has(dateStr);
    if (att?.status === "present") {
      const dayVal = computeDayPayFraction(att, hoursPerDay);
      paidWorkingDays += dayVal;
      daysCountForSunday += 1;
      const extra = (att.hoursExtra ?? 0) - (att.hoursReduced ?? 0);
      totalHoursWorked += att.hoursWorked != null ? att.hoursWorked : hoursPerDay + extra;
    } else if (att?.status === "absent") {
      absentCount += 1;
    } else if (hasProd) {
      paidWorkingDays += 1;
      daysCountForSunday += 1;
      totalHoursWorked += hoursPerDay;
    } else {
      absentCount += 1;
    }
  }

  for (const dateStr of holidayDatesInRange) {
    const att = attByDate.get(dateStr);
    if (att?.status === "present") daysCountForSunday += 1;
  }

  const earnedSundays = getEarnedSundays(daysCountForSunday);
  const totalPaidDays = Math.round(paidWorkingDays * 100) / 100 + earnedSundays;

  return {
    presentDays: Math.round(paidWorkingDays * 100) / 100,
    absentDays: absentCount,
    earnedSundays,
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
