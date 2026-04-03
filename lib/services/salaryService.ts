import { getProductionsByEmployee } from "./productionService";
import { getAdvancesByEmployee } from "./advanceService";
import { getDeductionForPeriod } from "./advanceDeductionService";
import { getItems } from "./itemService";
import { getEmployee } from "./employeeService";
import { getHolidaysInRange } from "./factoryHolidayService";
import { getAttendanceByEmployeeInRange } from "./attendanceService";
import { getShifts } from "./shiftService";
import { getPeriodForDate, getMonthRange, formatMonthYear } from "@/lib/utils/date";
import { currency, dateDisplay, number } from "@/lib/utils/formatter";
import {
  getWorkingDaysInMonth,
  getRatePerDay,
  getRatePerHour,
} from "@/lib/utils/salaryRates";
import { buildMonthSalaryBreakdown } from "@/lib/utils/attendanceStats";

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

  const printStyles =
    "body{margin:0;font-family:system-ui,sans-serif;font-size:12px;color:#0a0a0a;background:#fff;padding:16px}.mb-4{margin-bottom:12px}.mb-6{margin-bottom:16px}.text-2xl{font-size:1.25rem;font-weight:700}.text-sm{font-size:0.75rem}.text-lg{font-size:1rem}.text-gray-600{color:#52525b}.border{border:1px solid #e4e4e7}.border-t-2{border-top:2px solid #e4e4e7}.w-full{width:100%}.table{width:100%;font-size:11px;border-collapse:collapse}.table th,.table td{padding:4px 6px;text-align:left;border:1px solid #e4e4e7}.table th{background:#f4f4f5;font-weight:600}.text-right{text-align:right}.pt-2{padding-top:6px}.pt-4{padding-top:12px}.no-print{display:none!important}@media print{body*{visibility:hidden}#printArea,#printArea *{visibility:visible}#printArea{position:absolute;left:0;top:0;width:100%}}";

  const showShiftCol = filter === "both";
  const rowCells = (r: ProductionRow) =>
    showShiftCol
      ? `<tr><td class="border" style="padding:4px 6px">${dateDisplay(r.date)}</td><td class="border" style="padding:4px 6px">${r.itemName}</td><td class="border" style="padding:4px 6px">${r.shift}</td><td class="border text-right" style="padding:4px 6px">${number(r.quantity)}</td><td class="border text-right" style="padding:4px 6px">${currency(r.rate)}</td><td class="border text-right" style="padding:4px 6px">${currency(r.value)}</td></tr>`
      : `<tr><td class="border" style="padding:4px 6px">${dateDisplay(r.date)}</td><td class="border" style="padding:4px 6px">${r.itemName}</td><td class="border text-right" style="padding:4px 6px">${number(r.quantity)}</td><td class="border text-right" style="padding:4px 6px">${currency(r.rate)}</td><td class="border text-right" style="padding:4px 6px">${currency(r.value)}</td></tr>`;
  const rows = productions.map((r) => rowCells(r)).join("");
  const prodColspan = showShiftCol ? 6 : 5;
  const prodHeader =
    showShiftCol
      ? "<tr class=\"border\"><th class=\"border\" style=\"padding:4px 6px\">Date</th><th class=\"border\" style=\"padding:4px 6px\">Item</th><th class=\"border\" style=\"padding:4px 6px\">Shift</th><th class=\"border text-right\" style=\"padding:4px 6px\">Qty</th><th class=\"border text-right\" style=\"padding:4px 6px\">Rate</th><th class=\"border text-right\" style=\"padding:4px 6px\">Value</th></tr>"
      : "<tr class=\"border\"><th class=\"border\" style=\"padding:4px 6px\">Date</th><th class=\"border\" style=\"padding:4px 6px\">Item</th><th class=\"border text-right\" style=\"padding:4px 6px\">Qty</th><th class=\"border text-right\" style=\"padding:4px 6px\">Rate</th><th class=\"border text-right\" style=\"padding:4px 6px\">Value</th></tr>";

  const advanceColspan = showShiftCol ? 4 : 3;
  const advanceRows = salary.advances
    .map(
      (a) =>
        `<tr><td class="border" style="padding:4px 6px">${dateDisplay(a.date)}</td><td class="border text-right" colspan="${advanceColspan}" style="padding:4px 6px">${currency(a.amount)}</td></tr>`
    )
    .join("");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Production — ${name}</title><style>${printStyles}</style></head><body id="printArea"><div style="max-width:42rem;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px"><div><h1 class="text-2xl">ProdTrack Lite</h1><p class="text-sm text-gray-600">Production &amp; advances${filter !== "both" ? ` (${filter === "day" ? "Day" : "Night"} shift)` : ""}</p></div><div class="text-sm text-right"><p><strong>Period:</strong> ${dateDisplay(fromDate)} – ${dateDisplay(toDate)}</p></div></div><div class="mb-4"><p class="text-lg"><strong>Employee:</strong> ${name}</p></div><h2 class="text-sm" style="font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:6px">Production</h2><table class="table w-full border-collapse mb-6"><thead>${prodHeader}</thead><tbody>${rows || `<tr><td colspan="${prodColspan}" class="border" style="padding:6px;color:#71717a">No production in this period.</td></tr>`}</tbody></table><h2 class="text-sm" style="font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:6px">Advances</h2><table class="table w-full border-collapse mb-6"><thead><tr class="border"><th class="border" style="padding:4px 6px">Date</th><th class="border text-right" colspan="${advanceColspan}" style="padding:4px 6px">Amount</th></tr></thead><tbody>${advanceRows || `<tr><td colspan="${advanceColspan + 1}" class="border" style="padding:6px;color:#71717a">No advances.</td></tr>`}</tbody></table><div class="border-t-2 pt-4" style="border-color:#e4e4e7"><p class="text-sm"><strong>${grossLabel}</strong> ${currency(grossFiltered)}</p><p class="text-sm"><strong>Advance to cut (this period):</strong> ${currency(advanceToCut)}</p><p class="text-lg font-bold pt-2" style="font-weight:700;padding-top:8px">Net: ${currency(finalFiltered)}</p></div></div></body></html>`;

  return { html, employeeName: name, salary };
}

/** Printable full-month attendance & salary grid for one employee (attendance only; no production earnings). */
export async function getPrintableMonthlyAttendanceSheetHtml(
  employeeId: string,
  year: number,
  month: number
): Promise<{ html: string; employeeName: string }> {
  const { from, to } = getMonthRange(year, month);
  const [employee, holidays, prods, att, shifts] = await Promise.all([
    getEmployee(employeeId),
    getHolidaysInRange(from, to),
    getProductionsByEmployee(employeeId, from, to),
    getAttendanceByEmployeeInRange(employeeId, from, to),
    getShifts(),
  ]);
  const name = (employee?.name as string) || "Unknown";
  const printStyles =
    "body{margin:0;font-family:system-ui,sans-serif;font-size:11px;color:#0a0a0a;background:#fff;padding:12px}.text-2xl{font-size:1.25rem;font-weight:700}.text-sm{font-size:0.75rem}.text-gray-600{color:#52525b}.border{border:1px solid #e4e4e7}.table{width:100%;font-size:10px;border-collapse:collapse}.table th,.table td{padding:3px 5px;text-align:left;border:1px solid #e4e4e7}.table th{background:#f4f4f5;font-weight:600}.text-right{text-align:right}";

  if (!employee) {
    return {
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not found</title><style>${printStyles}</style></head><body><p>Employee not found.</p></body></html>`,
      employeeName: name,
    };
  }

  const monthlySalary = (employee.monthlySalary as number) ?? 0;
  const holidayDates = holidays.map((h) => h.date as string);
  const workingDays = getWorkingDaysInMonth(year, month, holidayDates);
  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, (s.hoursPerDay as number) ?? 8])
  );
  const shiftId = employee.shiftId as string | undefined;
  const hoursPerDay = shiftId ? (shiftMap[shiftId] ?? 8) : 8;
  const ratePerDay = getRatePerDay(monthlySalary, workingDays);
  const ratePerHour = getRatePerHour(monthlySalary, workingDays, hoursPerDay);

  const productionDates = new Set(prods.map((p) => p.date as string));

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
    productionDates,
    productionPayByDate: new Map(),
    hoursPerDay,
    ratePerDay,
    includeProductionPay: false,
  });

  const monthTitle = formatMonthYear(from);
  const dayRows = breakdown.days
    .map(
      (r) =>
        `<tr>
        <td class="border">${dateDisplay(r.date)}</td>
        <td class="border">${r.weekdayShort}</td>
        <td class="border">${r.statusLabel}</td>
        <td class="border text-right">${r.hoursWorked != null ? number(r.hoursWorked) : "—"}</td>
        <td class="border text-right">${r.hoursExtra != null ? number(r.hoursExtra) : "—"}</td>
        <td class="border text-right">${r.hoursReduced != null ? number(r.hoursReduced) : "—"}</td>
        <td class="border text-right">${r.effectiveHours != null ? number(r.effectiveHours) : "—"}</td>
        <td class="border text-right">${number(r.paidFraction)}</td>
        <td class="border text-right font-semibold">${currency(r.basePay)}</td>
      </tr>`
    )
    .join("");

  const summary = `<div class="border" style="padding:10px;margin-bottom:12px;border-color:#e4e4e7">
    <p style="margin:0 0 4px"><strong>Monthly salary:</strong> ${currency(monthlySalary)} · <strong>Rate / day:</strong> ${currency(ratePerDay)} · <strong>Rate / hour:</strong> ${currency(ratePerHour)} · <strong>${number(hoursPerDay)}h</strong> shift · <strong>${number(workingDays)}</strong> working days</p>
    <p style="margin:0 0 4px"><strong>Paid working days (fraction):</strong> ${number(breakdown.paidWorkingDays)} · <strong>Absent:</strong> ${number(breakdown.absentDays)} · <strong>Earned Sundays:</strong> ${number(breakdown.earnedSundays)} · <strong>Total paid days:</strong> ${number(breakdown.totalPaidDays)}</p>
    <p style="margin:0 0 4px"><strong>Extra hours (sum):</strong> ${number(breakdown.sumHoursExtra)} · <strong>Hours reduced (sum):</strong> ${number(breakdown.sumHoursReduced)}</p>
    <p style="margin:0"><strong>Total (attendance):</strong> ${currency(breakdown.totalBaseSalary)}${breakdown.sundayBonusPay > 0 ? ` (incl. Sunday bonus ${currency(breakdown.sundayBonusPay)})` : ""}</p>
  </div>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Monthly attendance — ${name}</title><style>${printStyles}</style></head><body id="printArea"><div style="margin:0 auto"><div style="display:flex;justify-content:space-between;margin-bottom:12px"><div><h1 class="text-2xl">ProdTrack Lite</h1><p class="text-sm text-gray-600">Monthly attendance &amp; salary</p></div><div class="text-sm text-right"><p><strong>Employee:</strong> ${name}</p><p><strong>Month:</strong> ${monthTitle}</p></div></div>${summary}<table class="table"><thead><tr><th class="border">Date</th><th class="border">Day</th><th class="border">Status</th><th class="border text-right">Hrs worked</th><th class="border text-right">Extra hrs</th><th class="border text-right">Less hrs</th><th class="border text-right">Equiv. hrs</th><th class="border text-right">Paid day %</th><th class="border text-right">Day pay</th></tr></thead><tbody>${dayRows}</tbody></table></div></body></html>`;

  return { html, employeeName: name };
}
