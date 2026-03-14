import { getProductionsByEmployee } from "./productionService";
import { getAdvancesByEmployee } from "./advanceService";
import { getDeductionForPeriod } from "./advanceDeductionService";
import { getItems } from "./itemService";
import { getEmployee } from "./employeeService";
import { getPeriodForDate } from "@/lib/utils/date";
import { currency, dateDisplay, number } from "@/lib/utils/formatter";

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

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Salary - ${name}</title><style>${printStyles}</style></head><body id="printArea"><div style="max-width:42rem;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px"><div><h1 class="text-2xl">ProdTrack Lite</h1><p class="text-sm text-gray-600">Salary Sheet${filter !== "both" ? ` (${filter === "day" ? "Day shift" : "Night shift"} only)` : ""}</p></div><div class="text-sm text-right"><p><strong>Period:</strong> ${dateDisplay(fromDate)} – ${dateDisplay(toDate)}</p></div></div><div class="mb-4"><p class="text-lg"><strong>Employee:</strong> ${name}</p></div><h2 class="text-sm" style="font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:6px">Production</h2><table class="table w-full border-collapse mb-6"><thead>${prodHeader}</thead><tbody>${rows || `<tr><td colspan="${prodColspan}" class="border" style="padding:6px;color:#71717a">No production in this period.</td></tr>`}</tbody></table><h2 class="text-sm" style="font-weight:600;text-transform:uppercase;color:#52525b;margin-bottom:6px">Advances</h2><table class="table w-full border-collapse mb-6"><thead><tr class="border"><th class="border" style="padding:4px 6px">Date</th><th class="border text-right" colspan="${advanceColspan}" style="padding:4px 6px">Amount</th></tr></thead><tbody>${advanceRows || `<tr><td colspan="${advanceColspan + 1}" class="border" style="padding:6px;color:#71717a">No advances.</td></tr>`}</tbody></table><div class="border-t-2 pt-4" style="border-color:#e4e4e7"><p class="text-sm"><strong>${grossLabel}</strong> ${currency(grossFiltered)}</p><p class="text-sm"><strong>Advance to cut (this period):</strong> ${currency(advanceToCut)}</p><p class="text-lg font-bold pt-2" style="font-weight:700;padding-top:8px">Net Pay: ${currency(finalFiltered)}</p></div></div></body></html>`;

  return { html, employeeName: name, salary };
}
