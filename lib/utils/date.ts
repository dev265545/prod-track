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

/** Returns true if entries (production, attendance) are not allowed on this date (Sunday or factory holiday) */
export function isRestrictedForEntry(
  dateStr: string,
  factoryHolidayDates: string[] = []
): boolean {
  if (isSunday(dateStr)) return true;
  return factoryHolidayDates.includes(dateStr);
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
