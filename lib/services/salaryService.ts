import { getProductionsByEmployee } from "./productionService";
import { getAdvancesByEmployee } from "./advanceService";
import { getDeductionForPeriod } from "./advanceDeductionService";
import { getItems } from "./itemService";
import { getEmployee } from "./employeeService";
import { getHolidaysInRange } from "./factoryHolidayService";
import { getAttendanceByEmployeeInRange } from "./attendanceService";
import { getShifts } from "./shiftService";
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

export interface ProductionRow {
  date: string;
  itemName: string;
  quantity: number;
  shift: string;
  rate: number;
  value: number;
}

export interface AdvanceRow {
  date: string;
  amount: number;
}

export interface SalaryResult {
  gross: number;
  advance: number;
  final: number;
  productions: ProductionRow[];
  advances: AdvanceRow[];
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
  const productionRows: ProductionRow[] = productions.map((p) => {
    const item = itemMap[p.itemId as string];
    const rate = item ? ((item.rate as number) || 0) : 0;
    const qty = (p.quantity as number) || 0;
    const value = qty * rate;
    gross += value;
    return {
      date: p.date as string,
      itemName: (item ? (item.name as string) : p.itemId) as string,
      quantity: qty,
      shift: p.shift === "night" ? "Night" : "Day",
      rate,
      value,
    };
  });

  const totalAdvance = advances.reduce(
    (sum, a) => sum + ((a.amount as number) || 0),
    0
  );
  const advanceRows: AdvanceRow[] = advances.map((a) => ({
    date: a.date as string,
    amount: (a.amount as number) || 0,
  }));

  return {
    gross,
    advance: totalAdvance,
    final: gross - totalAdvance,
    productions: productionRows,
    advances: advanceRows,
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
  const grossFiltered = productions.reduce(
    (sum, r) => sum + (r.value || 0),
    0
  );
  const finalFiltered = Math.max(0, grossFiltered - advanceToCut);
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
        td(currency(r.rate), true) +
        td(currency(r.value), true) +
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

  const body =
    `<div class="mb-4"><p class="text-lg">${labelled("Employee:", name)}</p></div>` +
    `<h2 class="text-sm" style="font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:6px">Production</h2>` +
    `<table class="table w-full mb-6"><thead>${prodHeader}</thead><tbody>` +
    (rows ||
      `<tr><td colspan="${prodColspan}" class="border" style="color:#71717a">No production in this period.</td></tr>`) +
    `</tbody></table>` +
    `<h2 class="text-sm" style="font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:6px">Advances</h2>` +
    `<table class="table w-full mb-6"><thead><tr class="border">${th("Date")}<th class="border text-right" colspan="${advanceColspan}">Amount</th></tr></thead><tbody>` +
    (advanceRows ||
      `<tr><td colspan="${advanceColspan + 1}" class="border" style="color:#71717a">No advances.</td></tr>`) +
    `</tbody></table>` +
    `<div style="border-top:2px solid #e4e4e7;padding-top:12px">` +
    `<p class="text-sm">${labelled(grossLabel, currency(grossFiltered))}</p>` +
    `<p class="text-sm">${labelled("Advance to cut (this period):", currency(advanceToCut))}</p>` +
    `<p class="text-lg" style="font-weight:700;padding-top:8px">Net: ${escapeHtml(currency(finalFiltered))}</p>` +
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

/** Printable full-month attendance & salary grid for one employee (attendance only; no production earnings). */
export async function getPrintableMonthlyAttendanceSheetHtml(
  employeeId: string,
  year: number,
  month: number
): Promise<{ html: string; employeeName: string }> {
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

/** Build attendance-salary print HTML; loads payroll overrides fresh at print time. */
export async function getPrintableAttendanceSalaryRangeHtml(
  employeeId: string,
  year: number,
  month: number,
  fromDate: string,
  toDate: string,
): Promise<string> {
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
