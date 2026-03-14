/**
 * Attendance stats calculation shared between employee page and salary sheet.
 * Logic: no entry = absent; holiday present = count for Sunday only, no salary;
 * production on working day = inferred present.
 * Hours: hoursReduced (-) and hoursExtra (+) adjust salary via rate per hour.
 */
import { getWorkingDayDates } from "./date";
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

/** Day pay fraction: 1 + (hoursExtra - hoursReduced) / fullDayHours */
function computeDayValue(
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
      const dayVal = computeDayValue(att, hoursPerDay);
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
