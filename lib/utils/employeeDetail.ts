/**
 * Pure helpers for the single-employee detail screen (`app/employee`).
 *
 * Everything here computes rather than renders, so it can be unit tested
 * without a React harness. The screen itself is payroll-adjacent, so these
 * helpers deliberately mirror the previous inline behaviour exactly.
 */
import {
  clampDateToMonth,
  formatMonthYear,
  getMonthRange,
  getMonthRangeLabel,
  getMonthRangePresets,
  toISODate,
  type DisplayLocale,
  type MonthRangeMode,
} from "@/lib/utils/date";

export type EmployeeType = "salaried" | "production" | "operator";

/** Loose DB row shape: the employee screen reads untyped store records. */
export type Row = Record<string, unknown>;

/**
 * Which employee types are stored. Anything unrecognised falls back to
 * "salaried", matching the previous `(employee.employeeType) || "salaried"`.
 */
export function resolveEmployeeType(value: unknown): EmployeeType {
  return value === "production" || value === "operator" || value === "salaried"
    ? value
    : "salaried";
}

export type EmployeeSections = {
  /** Shift / Sunday-category / salary / rate tiles. */
  paySettings: boolean;
  /** Required-present-days + Sunday multiplier (operators, admin only). */
  operatorSettings: boolean;
  /** Printable monthly attendance sheet + attendance-salary range card. */
  attendanceSalary: boolean;
  /** Period picker + gross/advance/net summary for piece-rate workers. */
  productionAdvances: boolean;
  /** "Add production" form and the production-entries dialog. */
  productionLog: boolean;
  /** Stored salary records table. */
  storedSalaryRecords: boolean;
  /** Money is hidden from non-admins looking at an operator. */
  hideRates: boolean;
};

/**
 * Single source of truth for which sections a given employee shows.
 * Previously spread across six inline `isProductionEmp && ...` guards.
 */
export function getEmployeeSections(
  employeeType: EmployeeType,
  options: { isAdmin: boolean; hasStoredSalaryRecords: boolean },
): EmployeeSections {
  const isProduction = employeeType === "production";
  const isOperator = employeeType === "operator";
  return {
    paySettings: !isProduction,
    operatorSettings: isOperator && options.isAdmin,
    attendanceSalary: !isProduction,
    productionAdvances: isProduction,
    productionLog: isProduction,
    storedSalaryRecords: options.isAdmin && options.hasStoredSalaryRecords,
    hideRates: isOperator && !options.isAdmin,
  };
}

/** ISO first/last day of a calendar month, as the DB range queries want them. */
export function getMonthIsoBounds(
  year: number,
  month: number,
): { monthStart: string; monthEnd: string } {
  const padM = String(month + 1).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    monthStart: `${year}-${padM}-01`,
    monthEnd: `${year}-${padM}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Month options for the "print sheet" / "salary range" month pickers. */
export function monthPickerOptions(
  count = 36,
  locale: DisplayLocale = "en",
  now: Date = new Date(),
): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${d.getMonth()}`,
      label: formatMonthYear(toISODate(d), locale),
    });
  }
  return out;
}

/** Parses a `"2026-7"` month-picker value back into year/month. */
export function parseMonthPickerValue(
  value: string,
): { year: number; month: number } | null {
  const [y, m] = value.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return { year: y, month: m };
}

/** Total quantity across production rows. */
export function sumQuantity(productions: Row[]): number {
  return productions.reduce(
    (sum, p) => sum + ((p.quantity as number) || 0),
    0,
  );
}

/** Total value (quantity x item rate) across production rows. */
export function sumProductionValue(
  productions: Row[],
  itemRates: (itemId: string) => number,
): number {
  return productions.reduce(
    (sum, p) =>
      sum + ((p.quantity as number) || 0) * itemRates(p.itemId as string),
    0,
  );
}

/** Total of all advance rows. */
export function sumAdvances(advances: Row[]): number {
  return advances.reduce((sum, a) => sum + ((a.amount as number) || 0), 0);
}

/** Indexes rows by `id` for cheap lookup during render. */
export function indexById<T extends Row>(rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((r) => [r.id as string, r])) as Record<
    string,
    T
  >;
}

export type Settlement = {
  /** Payable this period, never negative. */
  net: number;
  /** Advance still outstanding after this period's cut, never negative. */
  advanceLeft: number;
};

/** The settlement card's arithmetic. */
export function computeSettlement(input: {
  gross: number;
  totalAdvancePaid: number;
  advanceToCut: number;
}): Settlement {
  return {
    net: Math.max(0, input.gross - input.advanceToCut),
    advanceLeft: Math.max(0, input.totalAdvancePaid - input.advanceToCut),
  };
}

/** Hours credited for one day, matching the day-hours tile. */
export function computeDayHours(
  record: Row | undefined,
  hoursPerDay: number,
): number {
  if (!record || (record.status as string) !== "present") return 0;
  const extra =
    ((record.hoursExtra as number) ?? 0) -
    ((record.hoursReduced as number) ?? 0);
  return (record.hoursWorked as number) ?? hoursPerDay + extra;
}

export type SalaryRange = { from: string; to: string; label: string };

/** Resolves the attendance-salary range picker into concrete dates. */
export function resolveSalaryRange(input: {
  year: number;
  month: number;
  mode: MonthRangeMode;
  customFrom: string;
  customTo: string;
  locale: DisplayLocale;
}): SalaryRange {
  const { year, month, mode, customFrom, customTo, locale } = input;
  const bounds = getMonthRange(year, month);
  const presets = getMonthRangePresets(year, month, locale);
  if (mode === "custom") {
    const a = clampDateToMonth(customFrom || bounds.from, year, month);
    const b = clampDateToMonth(customTo || bounds.to, year, month);
    const from = a <= b ? a : b;
    const to = a <= b ? b : a;
    return { from, to, label: getMonthRangeLabel(from, to, locale) };
  }
  const preset = presets.find((p) => p.mode === mode) ?? presets[0];
  return { from: preset.from, to: preset.to, label: preset.label };
}

/**
 * Keeps the custom from/to pair ordered and inside the month while the user
 * edits one end of it.
 */
export function adjustCustomRange(input: {
  edited: "from" | "to";
  value: string;
  currentFrom: string;
  currentTo: string;
  year: number;
  month: number;
}): { from: string; to: string } {
  const { edited, value, currentFrom, currentTo, year, month } = input;
  const bounds = getMonthRange(year, month);
  if (edited === "from") {
    const from = clampDateToMonth(value, year, month);
    const to = clampDateToMonth(currentTo || bounds.to, year, month);
    return { from, to: to < from ? from : to };
  }
  const to = clampDateToMonth(value, year, month);
  const from = clampDateToMonth(currentFrom || bounds.from, year, month);
  return { from: to < from ? to : from, to };
}

export type HoursDraft = {
  /** The day these typed values belong to. Guards against cross-day writes. */
  date: string;
  reduced: string;
  extra: string;
};

/** The hours inputs as stored for a day, when nothing has been typed yet. */
export function hoursInputsForDate(
  record: Row | undefined,
): { reduced: string; extra: string } {
  if (!record || record.status !== "present") return { reduced: "", extra: "" };
  return {
    reduced: record.hoursReduced != null ? String(record.hoursReduced) : "",
    extra: record.hoursExtra != null ? String(record.hoursExtra) : "",
  };
}

/**
 * The values the hours inputs should show: the user's draft only when it was
 * typed for this very day, otherwise whatever is stored.
 *
 * This is the fix for the cross-day bug — typing hours on day A then clicking
 * day B used to leave A's numbers in the inputs, and "Present" wrote them onto B.
 */
export function resolveHoursInputs(
  draft: HoursDraft | null,
  selectedDate: string | null,
  record: Row | undefined,
): { reduced: string; extra: string } {
  if (selectedDate && draft && draft.date === selectedDate) {
    return { reduced: draft.reduced, extra: draft.extra };
  }
  return hoursInputsForDate(record);
}

/** Parses an hours input; only non-negative numbers are persisted. */
export function parseHoursInput(value: string): number | undefined {
  if (value === "") return undefined;
  const n = parseFloat(value);
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

/** Whether the typed hours differ from what is stored (shows "Save hours"). */
export function hoursInputsChanged(
  record: Row | undefined,
  reducedInput: string,
  extraInput: string,
): boolean {
  const storedReduced = (record?.hoursReduced as number | undefined) ?? 0;
  const storedExtra = (record?.hoursExtra as number | undefined) ?? 0;
  return (
    (reducedInput !== "" && parseFloat(reducedInput) !== storedReduced) ||
    (extraInput !== "" && parseFloat(extraInput) !== storedExtra)
  );
}

/** Attendance row for a date, if any. */
export function findAttendanceForDate(
  attendance: Row[],
  date: string | null,
): Row | undefined {
  if (!date) return undefined;
  return attendance.find((a) => (a.date as string) === date);
}

/**
 * Picks the opening period for the screen: today's period when it has data,
 * otherwise the most recent period that does.
 */
export function pickInitialPeriod(
  periodsWithData: { from: string; to: string; label: string }[],
  currentPeriod: { from: string; to: string; label: string },
): { periods: { from: string; to: string; label: string }[]; from: string; to: string } {
  const periods =
    periodsWithData.length > 0 ? periodsWithData : [currentPeriod];
  const from =
    periodsWithData.length > 0 &&
    periodsWithData.some((p) => p.from === currentPeriod.from)
      ? currentPeriod.from
      : (periods[periods.length - 1]?.from ?? currentPeriod.from);
  const to = periods.find((p) => p.from === from)?.to ?? currentPeriod.to;
  return { periods, from, to };
}

/**
 * Both payroll badges need a salary-sheet row. When the two ranges coincide
 * the page must fetch once, not twice — the underlying service builds rows for
 * every employee on each call.
 */
export function salarySheetRequestKey(
  employeeId: string,
  from: string,
  to: string,
): string {
  return `${employeeId}|${from}|${to}`;
}
