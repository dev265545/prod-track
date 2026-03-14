/**
 * Salary rate calculations (rate per day, rate per hour)
 * based on monthly salary, working days, and shift hours.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Count working days in a month: weekdays minus Sundays and factory holidays. */
export function getWorkingDaysInMonth(
  year: number,
  month: number,
  factoryHolidayDates: string[] = []
): number {
  const holidaySet = new Set(factoryHolidayDates);
  let count = 0;
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    if (holidaySet.has(dateStr)) continue;
    const dayOfWeek = new Date(year, month, d).getDay();
    if (dayOfWeek === 0) continue; // Sunday
    count++;
  }
  return count;
}

export function getRatePerDay(
  monthlySalary: number,
  workingDays: number
): number {
  if (workingDays <= 0) return 0;
  return monthlySalary / workingDays;
}

export function getRatePerHour(
  monthlySalary: number,
  workingDays: number,
  hoursPerDay: number
): number {
  if (workingDays <= 0 || hoursPerDay <= 0) return 0;
  return monthlySalary / (workingDays * hoursPerDay);
}

/**
 * Earned Sundays based on attendance count.
 * Thresholds: 10 days → 1 Sunday, 12 → 2, 18 → 3, 24 → 4, 30 → 5, 36 → 6, etc.
 */
const SUNDAY_THRESHOLDS = [10, 12, 18, 24, 30, 36, 42, 48];

export function getEarnedSundays(daysCountForSunday: number): number {
  return SUNDAY_THRESHOLDS.filter((t) => daysCountForSunday >= t).length;
}
