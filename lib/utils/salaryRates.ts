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

/** Daily rate: monthly salary divided by calendar days in that month (not only working days). */
export function getRatePerDay(
  monthlySalary: number,
  calendarDaysInMonth: number
): number {
  if (calendarDaysInMonth <= 0) return 0;
  return monthlySalary / calendarDaysInMonth;
}

export function getRatePerHour(
  monthlySalary: number,
  calendarDaysInMonth: number,
  hoursPerDay: number
): number {
  if (calendarDaysInMonth <= 0 || hoursPerDay <= 0) return 0;
  return monthlySalary / (calendarDaysInMonth * hoursPerDay);
}

export { getCalendarDaysInMonth } from "./date";
