/**
 * ProdTrack Lite - Date & pay-period utilities
 */

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const monthNamesLong = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Format ISO date for display, e.g. "14 Mar 2026" */
export function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDate();
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/** Format for month + year, e.g. "March 2026" */
export function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${monthNamesLong[d.getMonth()]} ${d.getFullYear()}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toISODate(new Date());
}

/** Yesterday's date as ISO string */
export function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export interface Period {
  from: string;
  to: string;
  label: string;
  year: number;
  month: number;
}

export function getPeriodForDate(date: string | Date): Period {
  const d =
    typeof date === "string" ? new Date(date + "T12:00:00") : new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();

  let from: string;
  let to: string;
  let label: string;

  if (day <= 15) {
    from = `${y}-${pad(m + 1)}-01`;
    to = `${y}-${pad(m + 1)}-15`;
    label = `1–15 ${monthNames[m]} ${y}`;
  } else {
    const lastDay = getLastDayOfMonth(y, m);
    from = `${y}-${pad(m + 1)}-16`;
    to = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
    label = `16–${lastDay} ${monthNames[m]} ${y}`;
  }

  return { from, to, label, year: y, month: m };
}

export function getPeriods(count = 24): { from: string; to: string; label: string }[] {
  const now = new Date();
  const periods: { from: string; to: string; label: string }[] = [];
  const monthsBack = Math.ceil(count / 2);
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const lastDay = getLastDayOfMonth(y, m);
    periods.push({
      from: `${y}-${pad(m + 1)}-01`,
      to: `${y}-${pad(m + 1)}-15`,
      label: `1–15 ${monthNames[m]} ${y}`,
    });
    periods.push({
      from: `${y}-${pad(m + 1)}-16`,
      to: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
      label: `16–${lastDay} ${monthNames[m]} ${y}`,
    });
  }
  return periods.slice(-count);
}

export function isDateInPeriod(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/** Returns true if the date falls on Sunday */
export function isSunday(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00");
  return d.getDay() === 0;
}

/** Returns true if entries (production, attendance) are not allowed on this date (factory holiday only; Sundays are allowed). */
export function isRestrictedForEntry(
  dateStr: string,
  factoryHolidayDates: string[] = []
): boolean {
  return factoryHolidayDates.includes(dateStr);
}

/** Number of calendar days in a month (1-based month index as in Date: 0 = January). */
export function getCalendarDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** ISO dates (yyyy-mm-dd) that fall on Sunday in the given month. */
export function getSundayDatesInMonth(year: number, month: number): string[] {
  const last = getCalendarDaysInMonth(year, month);
  const dates: string[] = [];
  for (let d = 1; d <= last; d++) {
    if (new Date(year, month, d).getDay() !== 0) continue;
    dates.push(`${year}-${pad(month + 1)}-${pad(d)}`);
  }
  return dates;
}

/** Count Sundays in an inclusive ISO date range. */
export function countSundaysInRange(fromDate: string, toDate: string): number {
  return getDatesInRange(fromDate, toDate).filter((d) => isSunday(d)).length;
}

/** Get first and last day of month as ISO strings */
export function getMonthRange(
  year: number,
  month: number
): { from: string; to: string } {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

/** Every calendar date from `from` through `to` inclusive (ISO strings). */
export function getDatesInRange(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    out.push(cursor);
    const d = new Date(cursor + "T12:00:00");
    d.setDate(d.getDate() + 1);
    cursor = toISODate(d);
  }
  return out;
}

/** Count Mon–Sat workdays in a range, excluding factory holidays and Sundays. */
export function getWorkingDaysInRange(
  fromDate: string,
  toDate: string,
  factoryHolidayDates: string[] = []
): number {
  const holidaySet = new Set(factoryHolidayDates);
  return getDatesInRange(fromDate, toDate).filter(
    (d) => !isSunday(d) && !holidaySet.has(d)
  ).length;
}

/** All working day dates in a month (excludes Sundays and factory holidays). */
export function getWorkingDayDates(
  year: number,
  month: number,
  factoryHolidayDates: string[] = []
): string[] {
  const holidaySet = new Set(factoryHolidayDates);
  const dates: string[] = [];
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    if (holidaySet.has(dateStr)) continue;
    if (new Date(year, month, d).getDay() === 0) continue; // Sunday
    dates.push(dateStr);
  }
  return dates;
}

export function getPeriodsWithData(
  records: { date?: string }[],
  maxPeriods = 24
): { from: string; to: string; label: string }[] {
  const keysWithData = new Set<string>();
  records.forEach((r) => {
    if (r.date) {
      const p = getPeriodForDate(r.date);
      keysWithData.add(`${p.from}|${p.to}`);
    }
  });
  const all = getPeriods(maxPeriods);
  return all.filter((p) => keysWithData.has(`${p.from}|${p.to}`));
}
