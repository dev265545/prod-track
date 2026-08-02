/**
 * ProdTrack Lite - Date & pay-period utilities
 */

import type { AppLocale } from "@/lib/i18n/locale";

/** Locale for month/day labels in formatted dates. */
export type DisplayLocale = AppLocale;

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const monthNamesLong = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const monthNamesHiShort = [
  "जन", "फ़र", "मार्च", "अप्रै", "मई", "जून",
  "जुला", "अग", "सितं", "अक्टू", "नवं", "दिसं",
];

const monthNamesHiLong = [
  "जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून",
  "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर",
];

function monthShort(m: number, locale: DisplayLocale = "en"): string {
  return locale === "hi" ? monthNamesHiShort[m] : monthNames[m];
}

function monthLong(m: number, locale: DisplayLocale = "en"): string {
  return locale === "hi" ? monthNamesHiLong[m] : monthNamesLong[m];
}

/** Format ISO date for display, e.g. "14 Mar 2026" (Hindi month names when `locale` is `hi`). */
export function formatDisplayDate(
  dateStr: string,
  locale: DisplayLocale = "en",
): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDate();
  const month = monthShort(d.getMonth(), locale);
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/** Format for month + year, e.g. "March 2026". */
export function formatMonthYear(
  dateStr: string,
  locale: DisplayLocale = "en",
): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${monthLong(d.getMonth(), locale)} ${d.getFullYear()}`;
}

/** Calendar title: long month name + year. */
export function formatMonthCalendarHeading(
  year: number,
  monthIndex: number,
  locale: DisplayLocale = "en",
): string {
  return `${monthLong(monthIndex, locale)} ${year}`;
}

/** Weekday abbreviations for calendar grids (Sunday-first). */
export function weekdayShortLabels(locale: DisplayLocale = "en"): string[] {
  if (locale === "hi") {
    return ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"];
  }
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

/**
 * Calendar year and month index (0–11) from an ISO calendar date (`yyyy-mm-dd`).
 * Used to anchor payroll ranges (e.g. 15-day periods) to the correct sheet month
 * regardless of which month is visible on a calendar UI.
 */
export function getYearMonthFromIsoDate(
  isoDate: string,
): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})-/.exec(isoDate);
  if (!m) return null;
  const year = Number(m[1]);
  const monthNum = Number(m[2]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthNum) ||
    monthNum < 1 ||
    monthNum > 12
  ) {
    return null;
  }
  return { year, month: monthNum - 1 };
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

export type MonthRangeMode =
  | "full-month"
  | "first-half"
  | "second-half"
  | "custom";

export interface MonthRangePreset {
  mode: Exclude<MonthRangeMode, "custom">;
  from: string;
  to: string;
  label: string;
}

export function getPeriodForDate(
  date: string | Date,
  locale: DisplayLocale = "en",
): Period {
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
    label = `1–15 ${monthShort(m, locale)} ${y}`;
  } else {
    const lastDay = getLastDayOfMonth(y, m);
    from = `${y}-${pad(m + 1)}-16`;
    to = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
    label = `16–${lastDay} ${monthShort(m, locale)} ${y}`;
  }

  return { from, to, label, year: y, month: m };
}

export function getMonthRangeLabel(
  fromDate: string,
  toDate: string,
  locale: DisplayLocale = "en",
): string {
  const from = new Date(fromDate + "T12:00:00");
  const to = new Date(toDate + "T12:00:00");
  const sameDay = fromDate === toDate;
  const sameMonth =
    from.getFullYear() === to.getFullYear() &&
    from.getMonth() === to.getMonth();

  if (sameDay) {
    return `${from.getDate()} ${monthShort(from.getMonth(), locale)} ${from.getFullYear()}`;
  }
  if (sameMonth) {
    return `${from.getDate()}-${to.getDate()} ${monthShort(from.getMonth(), locale)} ${from.getFullYear()}`;
  }
  return `${formatDisplayDate(fromDate, locale)} - ${formatDisplayDate(toDate, locale)}`;
}

export function getMonthRangePresets(
  year: number,
  month: number,
  locale: DisplayLocale = "en",
): MonthRangePreset[] {
  const fullMonth = getMonthRange(year, month);
  const lastDay = getCalendarDaysInMonth(year, month);
  return [
    {
      mode: "full-month",
      from: fullMonth.from,
      to: fullMonth.to,
      label: getMonthRangeLabel(fullMonth.from, fullMonth.to, locale),
    },
    {
      mode: "first-half",
      from: `${year}-${pad(month + 1)}-01`,
      to: `${year}-${pad(month + 1)}-15`,
      label: `1-15 ${monthShort(month, locale)} ${year}`,
    },
    {
      mode: "second-half",
      from: `${year}-${pad(month + 1)}-16`,
      to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
      label: `16-${lastDay} ${monthShort(month, locale)} ${year}`,
    },
  ];
}

export function clampDateToMonth(
  dateStr: string,
  year: number,
  month: number,
): string {
  const { from, to } = getMonthRange(year, month);
  if (!dateStr) return from;
  if (dateStr < from) return from;
  if (dateStr > to) return to;
  return dateStr;
}

export function getPeriods(
  count = 24,
  locale: DisplayLocale = "en",
): { from: string; to: string; label: string }[] {
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
      label: `1–15 ${monthShort(m, locale)} ${y}`,
    });
    periods.push({
      from: `${y}-${pad(m + 1)}-16`,
      to: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
      label: `16–${lastDay} ${monthShort(m, locale)} ${y}`,
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

/** Inclusive calendar day count — cannot exceed this for “present days” in a payroll range. */
export function countCalendarDaysInclusive(
  fromDate: string,
  toDate: string,
): number {
  if (!fromDate || !toDate || fromDate > toDate) return 0;
  return getDatesInRange(fromDate, toDate).length;
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

/**
 * Max “earned Sunday pay” extra days for this calendar span: 2 in a half-month
 * (≤16 days), 4 for longer (full-month style).
 */
export function getMaxEarnedSundayPayDaysInRange(
  fromDate: string,
  toDate: string,
): number {
  const n = countCalendarDaysInclusive(fromDate, toDate);
  if (n <= 0) return 0;
  if (n <= 16) return 2;
  return 4;
}

/** Subset of sheet drivers enforced together for payroll-period caps. */
export interface PayrollDriverCapFields {
  presentDays: number;
  earnedSundayPayDays: number;
  sundayPresentBonusDays: number;
}

/**
 * The most one calendar date may pay, in days — or `null` for "no limit".
 *
 * ## Why this is one factory-wide number and not a per-shift one
 *
 * The obvious reading is that a 12-hour shift and an 8-hour shift deserve
 * different ceilings. They do — and they already get them, because
 * `computeDayPayFraction` divides the extra hours by that employee's own
 * `hoursPerDay` before this limit is applied. The fraction is expressed in
 * units of *their* working day, so a limit of 2 already means "24 hours" on
 * the 12-hour shift and "16 hours" on the 8-hour one. Repeating the limit per
 * shift would be a second knob saying the same thing as `hoursPerDay`, and two
 * knobs for one idea is exactly the kind of configuration this rework exists to
 * remove. It lives in app settings, where it is one number the owner can read.
 */
export type DayPayCap = number | null;

/**
 * The limit as it stood when it was a hardcoded constant. Still the default, so
 * an install that never opens the editor pays exactly what it paid before.
 */
export const DEFAULT_MAX_DAY_PAY_FRACTION = 2;

/**
 * A limit below 1 would cut the pay of an ordinary full day — somebody who
 * worked their whole shift would be paid a fraction of it, which is never what
 * a "maximum for a long day" is meant to express. The editor refuses it out
 * loud; this is the last line of defence for a value that reached storage some
 * other way.
 */
export const MIN_DAY_PAY_CAP = 1;

/** Turn stored or typed input into a usable cap. `null` survives as "no limit". */
export function normalizeDayPayCap(value: unknown): DayPayCap {
  if (value === null) return null;
  if (value === undefined || value === "") return DEFAULT_MAX_DAY_PAY_FRACTION;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MAX_DAY_PAY_FRACTION;
  return Math.max(MIN_DAY_PAY_CAP, n);
}

/** The cap as a number for `Math.min`; "no limit" is `Infinity`. */
export function dayPayCapValue(cap: DayPayCap): number {
  return cap === null ? Number.POSITIVE_INFINITY : cap;
}

/**
 * Highest `presentDays` figure the payroll engine can legitimately produce for
 * a range. `presentDays` is a sum of paid-day *fractions*, not a headcount:
 *  - every non-Sunday date can contribute (factory holidays included — working
 *    a holiday is paid and is folded into `presentDays`), and
 *  - each such date can contribute up to the configured day pay cap.
 * Sundays are excluded because a present Sunday is counted under
 * `sundayPresentBonusDays`, not here.
 *
 * With no limit configured this is `Infinity`, which is the honest answer: the
 * period imposes no ceiling of its own on a manually corrected figure.
 */
export function getMaxPresentDaysInRange(
  fromDate: string,
  toDate: string,
  cap: DayPayCap = DEFAULT_MAX_DAY_PAY_FRACTION,
): number {
  const nonSundayDates = getDatesInRange(fromDate, toDate).filter(
    (d) => !isSunday(d),
  );
  if (nonSundayDates.length === 0) return 0;
  return nonSundayDates.length * dayPayCapValue(cap);
}

/** Which driver fields a period clamp actually moved, and what it moved them to. */
export interface PayrollDriverClampReport {
  values: PayrollDriverCapFields;
  trimmed: {
    presentDays: boolean;
    earnedSundayPayDays: boolean;
    sundayPresentBonusDays: boolean;
  };
  limits: PayrollDriverCapFields;
}

/**
 * Clamp the three adjustable payroll drivers to the period, and say what moved.
 *
 * A correction typed by the owner is a deliberate statement, so trimming it
 * silently is the same defect as a silent per-day cap: the caller gets the
 * before/after here and is expected to tell somebody. `clampPayrollDriverFieldsToPeriod`
 * keeps the old value-only shape for callers that have already reported.
 *
 * - present days ≤ non-Sunday dates × the day pay cap (see getMaxPresentDaysInRange)
 * - earned Sunday pay days ≤ 2 (half-month) or 4 (longer)
 * - Sunday present bonus ≤ number of Sundays in range
 *
 * `factoryHolidayDates` no longer affects the present-days ceiling (holiday
 * work is paid) but is kept in the signature for the other callers' clarity.
 */
export function reportPayrollDriverClamp(
  fromDate: string,
  toDate: string,
  factoryHolidayDates: string[],
  d: PayrollDriverCapFields,
  cap: DayPayCap = DEFAULT_MAX_DAY_PAY_FRACTION,
): PayrollDriverClampReport {
  void factoryHolidayDates;
  const maxPresent = Math.max(0, getMaxPresentDaysInRange(fromDate, toDate, cap));
  const maxEarned = getMaxEarnedSundayPayDaysInRange(fromDate, toDate);
  const maxSundayBonus = countSundaysInRange(fromDate, toDate);
  const values: PayrollDriverCapFields = {
    presentDays: Math.min(Math.max(0, d.presentDays), maxPresent),
    earnedSundayPayDays: Math.min(
      Math.max(0, d.earnedSundayPayDays),
      maxEarned,
    ),
    sundayPresentBonusDays: Math.min(
      Math.max(0, d.sundayPresentBonusDays),
      maxSundayBonus,
    ),
  };
  return {
    values,
    trimmed: {
      // Only a *downward* move counts as trimming a correction. Raising a
      // negative number to zero is rejecting nonsense, not overruling anybody.
      presentDays: d.presentDays > maxPresent,
      earnedSundayPayDays: d.earnedSundayPayDays > maxEarned,
      sundayPresentBonusDays: d.sundayPresentBonusDays > maxSundayBonus,
    },
    limits: {
      presentDays: maxPresent,
      earnedSundayPayDays: maxEarned,
      sundayPresentBonusDays: maxSundayBonus,
    },
  };
}

/** {@link reportPayrollDriverClamp}, values only. */
export function clampPayrollDriverFieldsToPeriod(
  fromDate: string,
  toDate: string,
  factoryHolidayDates: string[],
  d: PayrollDriverCapFields,
  cap: DayPayCap = DEFAULT_MAX_DAY_PAY_FRACTION,
): PayrollDriverCapFields {
  return reportPayrollDriverClamp(fromDate, toDate, factoryHolidayDates, d, cap)
    .values;
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
  maxPeriods = 24,
  locale: DisplayLocale = "en",
): { from: string; to: string; label: string }[] {
  const keysWithData = new Set<string>();
  records.forEach((r) => {
    if (r.date) {
      const p = getPeriodForDate(r.date, locale);
      keysWithData.add(`${p.from}|${p.to}`);
    }
  });
  const all = getPeriods(maxPeriods, locale);
  return all.filter((p) => keysWithData.has(`${p.from}|${p.to}`));
}
