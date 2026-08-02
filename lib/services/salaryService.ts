import { getProductionsByEmployee } from "./productionService";
import { getAdvancesByEmployee } from "./advanceService";
import { getDeductionForPeriod } from "./advanceDeductionService";
import { getItems } from "./itemService";
import { getEmployee } from "./employeeService";
import { getHolidaysInRange } from "./factoryHolidayService";
import { getAttendanceByEmployeeInRange } from "./attendanceService";
import { getShifts } from "./shiftService";
import { plural } from "./auditNames";
import {
  getSundayCategories,
  resolveSundayCategoryRule,
} from "./sundayCategoryService";
import { getPeriodForDate, getMonthRange, formatMonthYear } from "@/lib/utils/date";
import { currency, dateDisplay, number } from "@/lib/utils/formatter";
import {
  getCalendarDaysInMonth,
  getRatePerDay,
  getRatePerHour,
} from "@/lib/utils/salaryRates";
import { getSalarySheetRowForEmployee } from "@/lib/services/salarySheetService";
import { buildMonthSalaryBreakdown } from "@/lib/utils/attendanceStats";
import type {
  AttendanceSalarySummaryForRange,
  MonthSalaryDayRow,
} from "@/lib/utils/attendanceStats";
import {
  applySalarySheetRowToMonthBreakdown,
  applySalaryTargetsToDayRows,
  salarySheetRowToAttendanceSummary,
} from "@/lib/utils/salarySheetDayDisplay";
import { salarySheetRowHasAdjustment } from "@/lib/services/salarySheetService";
import {
  buildAttendanceSalarySummaryForRange,
} from "@/lib/utils/attendanceStats";
import { buildPrintDocument, escapeHtml } from "@/lib/print/html";
import { buildPrintStyles } from "@/lib/print/styles";

/**
 * Cells for the printed employee documents.
 *
 * Everything that reaches paper goes through `escapeHtml`: item names,
 * attendance status labels and employee names are all typed by the user, and
 * an unescaped `&` in an item name is enough to corrupt the rest of the row.
 */
function td(value: string | number, right = false): string {
  return `<td class="border${right ? " text-right" : ""}">${escapeHtml(String(value))}</td>`;
}

function th(label: string, right = false): string {
  return `<th class="border${right ? " text-right" : ""}">${escapeHtml(label)}</th>`;
}

/** `<strong>label</strong> value`, both escaped. */
function labelled(label: string, value: string | number): string {
  return `<strong>${escapeHtml(label)}</strong> ${escapeHtml(String(value))}`;
}

const DASH = "—";

/** Header of the per-day attendance table, shared by both attendance prints. */
const DAY_TABLE_HEADER =
  `<tr>` +
  th("Date") +
  th("Day") +
  th("Status") +
  th("Hrs worked", true) +
  th("Extra hrs", true) +
  th("Less hrs", true) +
  th("Equiv. hrs", true) +
  th("Paid day %", true) +
  th("Day pay", true) +
  `</tr>`;

/** Column count of `DAY_TABLE_HEADER`, for the "no rows" message's colspan. */
const DAY_TABLE_COLUMNS = 9;

/** One row of the per-day attendance table. Must match `DAY_TABLE_HEADER`. */
function dayRowHtml(row: MonthSalaryDayRow): string {
  const hours = (v: number | null | undefined) =>
    v != null ? number(v) : DASH;
  return (
    `<tr>` +
    td(dateDisplay(row.date)) +
    td(row.weekdayShort) +
    td(row.statusLabel) +
    td(hours(row.hoursWorked), true) +
    td(hours(row.hoursExtra), true) +
    td(hours(row.hoursReduced), true) +
    td(hours(row.effectiveHours), true) +
    td(number(row.paidFraction), true) +
    td(currency(row.basePay), true) +
    `</tr>`
  );
}

/**
 * Money in this file is rupees rounded to two decimals, at every point a
 * number is stored or shown. `round2` is the same rounding the salary-sheet
 * engine uses (`salarySheetService.round2`); there is deliberately only one
 * convention in the app.
 *
 * Rounding happens per production row, then again on each total, so the row
 * values on the payslip add up to the printed gross rather than being a
 * rounded view of an unrounded number.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The rate a piece of work is paid at, or `null` when the item cannot be
 * priced.
 *
 * This is the same test as `productionCatalog.toRate`: only a finite rate
 * **above zero** is a price. The rest of the app treats "no rate" and "a rate
 * of 0" as the same fact — not priced yet — and the Items screen refuses to
 * store 0 for exactly that reason (`itemCatalog.validateRate`). A payslip that
 * paid an unpriced item at 0 was quietly disagreeing with the screen that
 * refuses to save it.
 */
function toPaidRate(value: unknown): number | null {
  const rate = typeof value === "number" ? value : Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Shown in the Item column when the production row points at an item that is
 * gone. Never the raw item id: an id on a document handed to a worker is
 * noise, and `auditNames` already settled that argument for the audit log.
 */
const UNKNOWN_ITEM_NAME = "Unknown item";

/** Shown in the Rate/Value columns of a row that has no price. */
const NOT_PRICED_LABEL = "Not priced";

export interface ProductionRow {
  date: string;
  itemName: string;
  quantity: number;
  shift: string;
  /**
   * `null` when the item is missing, unpriced, or priced at 0 — see
   * `toPaidRate`. A `null` rate is not the number 0: it means nobody has said
   * what this work is worth, and `unpriced` is set so no caller can round it
   * back down to "free" by accident.
   */
  rate: number | null;
  value: number;
  /** True when `rate` is null: this row earned nothing because it has no price. */
  unpriced: boolean;
}

export interface AdvanceRow {
  date: string;
  amount: number;
}

export interface SalaryResult {
  gross: number;
  advance: number;
  /**
   * `gross - advance`, **not** floored at zero. A negative net is a real fact —
   * the worker drew more than they earned this period and carries a balance —
   * and it is reported here and printed on the payslip with a plain-language
   * line saying so. Hiding it in one place and showing it in the other is what
   * used to make screen and paper disagree.
   */
  final: number;
  productions: ProductionRow[];
  advances: AdvanceRow[];
  /**
   * How many production rows could not be priced. Never silently zero: the
   * payslip prints a warning whenever this is above 0, so an owner is told
   * that real recorded work is missing from the gross instead of finding a
   * row worth ₹0 and guessing why.
   */
  unpricedCount: number;
}

export async function calculateSalary(
  employeeId: string,
  fromDate: string,
  toDate: string
): Promise<SalaryResult> {
  const [productions, advances, items] = await Promise.all([
    getProductionsByEmployee(employeeId, fromDate, toDate),
    getAdvancesByEmployee(employeeId, fromDate, toDate),
    getItems(),
  ]);

  const itemMap = Object.fromEntries(
    items.map((i) => [i.id as string, i])
  ) as Record<string, Record<string, unknown>>;
  let gross = 0;
  let unpricedCount = 0;
  const productionRows: ProductionRow[] = productions.map((p) => {
    const item = itemMap[p.itemId as string];
    const rate = item ? toPaidRate(item.rate) : null;
    const qty = (p.quantity as number) || 0;
    const value = rate == null ? 0 : round2(qty * rate);
    if (rate == null) unpricedCount += 1;
    gross += value;
    const name = item ? (item.name as string) : "";
    return {
      date: p.date as string,
      itemName: name?.trim() ? name.trim() : UNKNOWN_ITEM_NAME,
      quantity: qty,
      shift: p.shift === "night" ? "Night" : "Day",
      rate,
      value,
      unpriced: rate == null,
    };
  });

  const totalAdvance = round2(
    advances.reduce((sum, a) => sum + ((a.amount as number) || 0), 0)
  );
  const advanceRows: AdvanceRow[] = advances.map((a) => ({
    date: a.date as string,
    amount: round2((a.amount as number) || 0),
  }));

  const roundedGross = round2(gross);
  return {
    gross: roundedGross,
    advance: totalAdvance,
    final: round2(roundedGross - totalAdvance),
    productions: productionRows,
    advances: advanceRows,
    unpricedCount,
  };
}

export async function calculateSalaryForPeriod(
  employeeId: string,
  dateInPeriod: string
): Promise<SalaryResult> {
  const period = getPeriodForDate(dateInPeriod);
  return calculateSalary(employeeId, period.from, period.to);
}

export async function getPrintableSalaryHtml(
  employeeId: string,
  fromDate: string,
  toDate: string,
  filter: "day" | "night" | "both" = "both"
): Promise<{ html: string; employeeName: string; salary: SalaryResult }> {
  const [employee, salary, deduction] = await Promise.all([
    getEmployee(employeeId),
    calculateSalary(employeeId, fromDate, toDate),
    getDeductionForPeriod(employeeId, fromDate, toDate),
  ]);
  const name = (employee?.name as string) || "Unknown";
  const advanceToCut = (deduction?.amount as number) ?? 0;

  const productions =
    filter === "day"
      ? salary.productions.filter((r) => r.shift === "Day")
      : filter === "night"
        ? salary.productions.filter((r) => r.shift === "Night")
        : salary.productions;
  const grossFiltered = round2(
    productions.reduce((sum, r) => sum + (r.value || 0), 0)
  );
  // Not floored. `calculateSalary().final` is not floored either, and the two
  // must be the same number for the same worker; the shortfall is spelled out
  // below instead of being rounded away into a ₹0 that looks like "paid".
  const finalFiltered = round2(grossFiltered - advanceToCut);
  const unpricedFiltered = productions.filter((r) => r.unpriced).length;
  const grossLabel =
    filter === "day"
      ? "Gross (Day):"
      : filter === "night"
        ? "Gross (Night):"
        : "Gross (Production):";

  const showShiftCol = filter === "both";
  const rows = productions
    .map(
      (r) =>
        `<tr>` +
        td(dateDisplay(r.date)) +
        td(r.itemName) +
        (showShiftCol ? td(r.shift) : "") +
        td(number(r.quantity), true) +
        td(r.unpriced ? NOT_PRICED_LABEL : currency(r.rate), true) +
        td(r.unpriced ? DASH : currency(r.value), true) +
        `</tr>`,
    )
    .join("");
  const prodColspan = showShiftCol ? 6 : 5;
  const prodHeader =
    `<tr class="border">` +
    th("Date") +
    th("Item") +
    (showShiftCol ? th("Shift") : "") +
    th("Qty", true) +
    th("Rate", true) +
    th("Value", true) +
    `</tr>`;

  // The advances table shares the production table's width so the two line up.
  const advanceColspan = prodColspan - 1;
  const advanceRows = salary.advances
    .map(
      (a) =>
        `<tr>${td(dateDisplay(a.date))}<td class="border text-right" colspan="${advanceColspan}">${escapeHtml(currency(a.amount))}</td></tr>`,
    )
    .join("");

  /**
   * Work that is on the sheet but not in the gross has to say so on the paper
   * itself — the same rule the Sunday caps, the daily pay cap and the
   * unusable-machine guard already follow. Without this the owner sees a real
   * day's work sitting at "—" and has no way to tell whether that is correct.
   */
  const unpricedNote =
    unpricedFiltered === 0
      ? ""
      : `<p class="text-sm" style="margin:-12px 0 16px;color:#b45309">${escapeHtml(
          `${plural(unpricedFiltered, "row is", "rows are")} not included above: the item has no rate (or has been deleted), so this work could not be priced. Set a rate on the Items screen and print again.`,
        )}</p>`;

  /**
   * A net below zero means the worker drew more than they earned. It is said
   * out loud rather than floored to ₹0, which read as "nothing owed either
   * way" and disagreed with the figure the app showed on screen.
   */
  const netNote =
    finalFiltered >= 0
      ? ""
      : `<p class="text-sm" style="margin:4px 0 0;color:#b45309">${escapeHtml(
          `Advances exceed earnings for this period by ${currency(-finalFiltered)}. Nothing is payable now; this amount is still owed.`,
        )}</p>`;

  const body =
    `<div class="mb-4"><p class="text-lg">${labelled("Employee:", name)}</p></div>` +
    `<h2 class="text-sm" style="font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:6px">Production</h2>` +
    `<table class="table w-full mb-6"><thead>${prodHeader}</thead><tbody>` +
    (rows ||
      `<tr><td colspan="${prodColspan}" class="border" style="color:#71717a">No production in this period.</td></tr>`) +
    `</tbody></table>` +
    unpricedNote +
    `<h2 class="text-sm" style="font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:6px">Advances</h2>` +
    `<table class="table w-full mb-6"><thead><tr class="border">${th("Date")}<th class="border text-right" colspan="${advanceColspan}">Amount</th></tr></thead><tbody>` +
    (advanceRows ||
      `<tr><td colspan="${advanceColspan + 1}" class="border" style="color:#71717a">No advances.</td></tr>`) +
    `</tbody></table>` +
    `<div style="border-top:2px solid #e4e4e7;padding-top:12px">` +
    `<p class="text-sm">${labelled(grossLabel, currency(grossFiltered))}</p>` +
    `<p class="text-sm">${labelled("Advance to cut (this period):", currency(advanceToCut))}</p>` +
    `<p class="text-lg" style="font-weight:700;padding-top:8px">Net: ${escapeHtml(currency(finalFiltered))}</p>` +
    netNote +
    `</div>`;

  const html = buildPrintDocument({
    title: `Production — ${name}`,
    appName: "ProdTrack Lite",
    subtitle:
      "Production & advances" +
      (filter === "both" ? "" : ` (${filter === "day" ? "Day" : "Night"} shift)`),
    meta: [
      {
        label: "Period:",
        value: `${dateDisplay(fromDate)} – ${dateDisplay(toDate)}`,
      },
    ],
    body,
    styles: buildPrintStyles(),
  });

  return { html, employeeName: name, salary };
}

/**
 * Guard for the 0-based month arguments below.
 *
 * Every month number in this codebase is a `Date` month index: 0 = January,
 * 3 = April, 11 = December. That is impossible to see at a call site — `4`
 * reads as April and silently prints May — so the parameters are named
 * `monthIndex`, never `month`, and passing 12 (or anything outside 0–11)
 * throws here instead of quietly rolling into the next year.
 *
 * Exported so `monthIndex` is a checked contract rather than a comment.
 */
export function assertMonthIndex(monthIndex: number): void {
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new RangeError(
      `monthIndex must be a Date month index 0–11 (0 = January, 11 = December); received ${monthIndex}. For a calendar month number, pass month - 1.`,
    );
  }
}

/**
 * Printable full-month attendance & salary grid for one employee (attendance
 * only; no production earnings).
 *
 * @param monthIndex 0-based, as in `Date`: 0 = January, 3 = April.
 */
export async function getPrintableMonthlyAttendanceSheetHtml(
  employeeId: string,
  year: number,
  monthIndex: number
): Promise<{ html: string; employeeName: string }> {
  assertMonthIndex(monthIndex);
  const month = monthIndex;
  const { from, to } = getMonthRange(year, month);
  const [employee, holidays, att, shifts, sundayCategories] = await Promise.all([
    getEmployee(employeeId),
    getHolidaysInRange(from, to),
    getAttendanceByEmployeeInRange(employeeId, from, to),
    getShifts(),
    getSundayCategories(),
  ]);
  const name = (employee?.name as string) || "Unknown";
  const printStyles = buildPrintStyles({
    tableFontSize: 10,
    cellPadding: "3px 5px",
  });

  if (!employee) {
    return {
      html: buildPrintDocument({
        title: "Not found",
        appName: "ProdTrack Lite",
        subtitle: "Monthly attendance & salary",
        meta: [],
        body: "<p>Employee not found.</p>",
        styles: printStyles,
      }),
      employeeName: name,
    };
  }

  const monthlySalary = (employee.monthlySalary as number) ?? 0;
  const holidayDates = holidays.map((h) => h.date as string);
  const calendarDaysInMonth = getCalendarDaysInMonth(year, month);
  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, (s.hoursPerDay as number) ?? 8])
  );
  const shiftId = employee.shiftId as string | undefined;
  const hoursPerDay = shiftId ? (shiftMap[shiftId] ?? 8) : 8;
  const sundayCategoryMap = Object.fromEntries(
    sundayCategories.map((c) => [c.id, c]),
  );
  const sundayCategoryId = employee.sundayCategoryId as string | undefined;
  const sundayCategory = sundayCategoryId
    ? sundayCategoryMap[sundayCategoryId]
    : undefined;
  const sundayCategoryRule = resolveSundayCategoryRule(sundayCategory);
  const ratePerDay = getRatePerDay(monthlySalary, calendarDaysInMonth);
  const ratePerHour = getRatePerHour(
    monthlySalary,
    calendarDaysInMonth,
    hoursPerDay
  );

  const breakdown = buildMonthSalaryBreakdown({
    year,
    month,
    holidayDates,
    attendance: att.map((a) => ({
      date: a.date as string,
      status: a.status as string,
      hoursWorked: a.hoursWorked as number | undefined,
      hoursReduced: a.hoursReduced as number | undefined,
      hoursExtra: a.hoursExtra as number | undefined,
    })),
    productionPayByDate: new Map(),
    hoursPerDay,
    ratePerDay,
    includeProductionPay: false,
    sundayCategoryRule,
  });

  const salarySheetRow = await getSalarySheetRowForEmployee(
    employeeId,
    year,
    month,
    from,
    to,
  );
  const effectiveBreakdown = applySalarySheetRowToMonthBreakdown(
    breakdown,
    salarySheetRow,
    employeeId,
    from,
    to,
    ratePerDay,
    hoursPerDay,
  );

  const monthTitle = formatMonthYear(from);
  const dayRows = effectiveBreakdown.days.map(dayRowHtml).join("");

  const summary =
    `<div class="border" style="padding:10px;margin-bottom:12px">` +
    `<p style="margin:0 0 4px">${labelled("Monthly salary:", currency(monthlySalary))} · ${labelled("Rate / day:", currency(ratePerDay))} · ${labelled("Rate / hour:", currency(ratePerHour))} · <strong>${escapeHtml(number(hoursPerDay))}h</strong> shift · <strong>${escapeHtml(number(calendarDaysInMonth))}</strong> calendar days in month</p>` +
    `<p style="margin:0 0 4px">${labelled("Paid working days (fraction):", number(effectiveBreakdown.paidWorkingDays))} · ${labelled("Absent:", number(effectiveBreakdown.absentDays))} · ${labelled("Holiday present:", number(effectiveBreakdown.holidayPresentDays))} · ${labelled("Earned extra days (15-day cycles, max 4/mo):", `${number(effectiveBreakdown.earnedSundayPayDays)} (${currency(effectiveBreakdown.earnedSundayPoolPay)})`)} · ${labelled("Sunday marked present:", `${number(effectiveBreakdown.sundayPresentBonusDays)} (${currency(effectiveBreakdown.sundayMarkBonusPay)})`)} · ${labelled("Total paid days:", number(effectiveBreakdown.totalPaidDays))}</p>` +
    `<p style="margin:0 0 4px">${labelled("Extra hours (sum):", number(effectiveBreakdown.sumHoursExtra))} · ${labelled("Hours reduced (sum):", number(effectiveBreakdown.sumHoursReduced))}</p>` +
    `<p style="margin:0">${labelled("Total (attendance):", currency(effectiveBreakdown.totalBaseSalary))}${salarySheetRowHasAdjustment(salarySheetRow) ? " · <em>Includes payroll adjustment</em>" : ""}</p>` +
    `</div>`;

  const html = buildPrintDocument({
    title: `Monthly attendance — ${name}`,
    appName: "ProdTrack Lite",
    subtitle: "Monthly attendance & salary",
    meta: [
      { label: "Employee:", value: name },
      { label: "Month:", value: monthTitle },
    ],
    body:
      summary +
      `<table class="table"><thead>${DAY_TABLE_HEADER}</thead><tbody>${dayRows}</tbody></table>`,
    styles: printStyles,
  });

  return { html, employeeName: name };
}

/**
 * Build attendance-salary print HTML; loads payroll overrides fresh at print
 * time.
 *
 * @param monthIndex 0-based, as in `Date`: 0 = January, 3 = April.
 */
export async function getPrintableAttendanceSalaryRangeHtml(
  employeeId: string,
  year: number,
  monthIndex: number,
  fromDate: string,
  toDate: string,
): Promise<string> {
  assertMonthIndex(monthIndex);
  const month = monthIndex;
  const [employee, holidays, att, shifts, sundayCategories] = await Promise.all([
    getEmployee(employeeId),
    getHolidaysInRange(fromDate, toDate),
    getAttendanceByEmployeeInRange(employeeId, fromDate, toDate),
    getShifts(),
    getSundayCategories(),
  ]);
  const name = (employee?.name as string) || "Unknown";
  const monthlySalary = (employee?.monthlySalary as number) ?? 0;
  const holidayDates = holidays.map((h) => h.date as string);
  const calendarDaysInMonth = getCalendarDaysInMonth(year, month);
  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, (s.hoursPerDay as number) ?? 8]),
  );
  const shiftId = employee?.shiftId as string | undefined;
  const hoursPerDay = shiftId ? (shiftMap[shiftId] ?? 8) : 8;
  const sundayCategoryMap = Object.fromEntries(
    sundayCategories.map((c) => [c.id, c]),
  );
  const sundayCategoryId = employee?.sundayCategoryId as string | undefined;
  const sundayCategory = sundayCategoryId
    ? sundayCategoryMap[sundayCategoryId]
    : undefined;
  const sundayCategoryRule = resolveSundayCategoryRule(sundayCategory);
  const ratePerDay = getRatePerDay(monthlySalary, calendarDaysInMonth);
  const ratePerHour = getRatePerHour(
    monthlySalary,
    calendarDaysInMonth,
    hoursPerDay,
  );

  const attendance = att.map((a) => ({
    date: a.date as string,
    status: a.status as string,
    hoursWorked: a.hoursWorked as number | undefined,
    hoursReduced: a.hoursReduced as number | undefined,
    hoursExtra: a.hoursExtra as number | undefined,
  }));

  let summary = buildAttendanceSalarySummaryForRange({
    fromDate,
    toDate,
    holidayDates,
    attendance,
    hoursPerDay,
    ratePerDay,
    sundayCategoryRule,
  });

  const monthBreakdown = buildMonthSalaryBreakdown({
    year,
    month,
    holidayDates,
    attendance,
    productionPayByDate: new Map(),
    hoursPerDay,
    ratePerDay,
    includeProductionPay: false,
    sundayCategoryRule,
  });
  let dayRows = monthBreakdown.days.filter(
    (row) => row.date >= fromDate && row.date <= toDate,
  );

  const salarySheetRow = await getSalarySheetRowForEmployee(
    employeeId,
    year,
    month,
    fromDate,
    toDate,
  );
  const adjusted = salarySheetRowHasAdjustment(salarySheetRow);
  if (adjusted && salarySheetRow) {
    summary = salarySheetRowToAttendanceSummary(
      salarySheetRow,
      summary.totalHoursWorked,
    );
    dayRows = applySalaryTargetsToDayRows(
      dayRows,
      {
        presentDays: salarySheetRow.presentDays,
        holidayPresentDays: salarySheetRow.holidayPresentDays,
        sundayPresentBonusDays: salarySheetRow.sundayPresentBonusDays,
        hoursExtraTotal: salarySheetRow.hoursExtraTotal,
        hoursReducedTotal: salarySheetRow.hoursReducedTotal,
      },
      ratePerDay,
      hoursPerDay,
      `${employeeId}:${fromDate}:${toDate}`,
    );
  }

  const { from: monthFrom } = getMonthRange(year, month);
  return buildPrintableAttendanceSalaryRangeHtml({
    employeeName: name,
    monthLabel: formatMonthYear(monthFrom),
    rangeLabel: `${dateDisplay(fromDate)} – ${dateDisplay(toDate)}`,
    fromDate,
    toDate,
    monthlySalary,
    ratePerDay,
    ratePerHour,
    summary,
    dayRows,
    includesPayrollAdjustment: adjusted,
  });
}

export function buildPrintableAttendanceSalaryRangeHtml(input: {
  employeeName: string;
  monthLabel: string;
  rangeLabel: string;
  fromDate: string;
  toDate: string;
  monthlySalary: number;
  ratePerDay: number;
  ratePerHour: number;
  summary: AttendanceSalarySummaryForRange;
  dayRows: MonthSalaryDayRow[];
  includesPayrollAdjustment?: boolean;
}): string {
  const {
    employeeName,
    monthLabel,
    rangeLabel,
    fromDate,
    toDate,
    monthlySalary,
    ratePerDay,
    ratePerHour,
    summary,
    dayRows,
    includesPayrollAdjustment = false,
  } = input;
  const earnedSundayPoolPay =
    Math.round(summary.earnedSundayPayDays * ratePerDay * 100) / 100;
  const sundayMarkBonusPay =
    Math.round(summary.sundayPresentBonusDays * ratePerDay * 100) / 100;
  const dayRowsHtml =
    dayRows.length === 0
      ? `<tr><td colspan="${DAY_TABLE_COLUMNS}" class="border" style="color:#71717a">No attendance rows in this range.</td></tr>`
      : dayRows.map(dayRowHtml).join("");

  const body =
    `<div class="border" style="padding:10px;margin-bottom:12px">` +
    `<p style="margin:0 0 4px">${labelled("Period:", `${dateDisplay(fromDate)} – ${dateDisplay(toDate)}`)}</p>` +
    `<p style="margin:0 0 4px">${labelled("Monthly salary:", currency(monthlySalary))} · ${labelled("Rate / day:", currency(ratePerDay))} · ${labelled("Rate / hour:", currency(ratePerHour))}</p>` +
    `<p style="margin:0 0 4px">${labelled("Paid working days:", number(summary.presentDays))} · ${labelled("Absent:", number(summary.absentDays))} · ${labelled("Holiday present:", number(summary.holidayPresentDays))} · ${labelled("Earned Sun.:", `${number(summary.earnedSundayPayDays)} (${currency(earnedSundayPoolPay)})`)} · ${labelled("Sun. +:", `${number(summary.sundayPresentBonusDays)} (${currency(sundayMarkBonusPay)})`)}</p>` +
    `<p style="margin:0 0 4px">${labelled("Extra hours:", number(summary.hoursExtraTotal))} · ${labelled("Less hours:", number(summary.hoursReducedTotal))} · ${labelled("Paid days:", number(summary.totalPaidDays))}</p>` +
    `<p style="margin:0">${labelled("Salary contribution:", currency(summary.calculatedSalary))}${includesPayrollAdjustment ? " · <em>Includes payroll adjustment</em>" : ""}</p>` +
    `</div>` +
    `<h2 class="text-sm" style="font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:6px">Daily breakdown</h2>` +
    `<table class="table" style="margin-bottom:12px"><thead>${DAY_TABLE_HEADER}</thead><tbody>${dayRowsHtml}</tbody></table>`;

  return buildPrintDocument({
    title: `Attendance salary — ${employeeName}`,
    appName: "ProdTrack Lite",
    subtitle: "Attendance salary contribution",
    meta: [
      { label: "Employee:", value: employeeName },
      { label: "Month:", value: monthLabel },
      { label: "Range:", value: rangeLabel },
    ],
    body,
    styles: buildPrintStyles({ cellPadding: "5px 6px" }),
  });
}
