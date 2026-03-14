/**
 * ProdTrack Lite - Employee detail page
 * Salary, add production/advance, production summary (cumulative + by date), entries with delete.
 */

const iconTrash = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>';

import { getEmployee } from "../services/employeeService.js";
import {
  getProductionsByEmployee,
  saveProduction,
  deleteProduction,
  getProductions,
} from "../services/productionService.js";
import {
  getAdvancesByEmployee,
  saveAdvance,
  deleteAdvance,
  getAdvances,
} from "../services/advanceService.js";
import {
  getDeductionsByEmployee,
  getDeductionForPeriod,
  saveDeduction,
} from "../services/advanceDeductionService.js";
import { getItems } from "../services/itemService.js";
import {
  calculateSalary,
  getPrintableSalaryHtml,
} from "../services/salaryService.js";
import { getPeriodForDate, getPeriodsWithData, today } from "../utils/date.js";
import { currency, dateDisplay, number } from "../utils/formatter.js";

let onNavigate = () => {};

export function setEmployeeNavigate(fn) {
  onNavigate = fn;
}

export async function renderEmployeePage(container, employeeId) {
  const employee = await getEmployee(employeeId);
  if (!employee) {
    container.innerHTML =
      '<p class="text-lg text-gray-500 dark:text-gray-400 py-8">Employee not found.</p>';
    return;
  }

  const [allProductions, allAdvances] = await Promise.all([
    getProductions(),
    getAdvances(),
  ]);
  const empProductions = allProductions.filter(
    (p) => p.employeeId === employeeId,
  );
  const empAdvances = allAdvances.filter((a) => a.employeeId === employeeId);
  const periodsWithData = getPeriodsWithData([
    ...empProductions,
    ...empAdvances,
  ]);
  const period = getPeriodForDate(today());
  const periods = periodsWithData.length > 0 ? periodsWithData : [period];
  const selectedFrom =
    periodsWithData.length > 0 &&
    periodsWithData.some((p) => p.from === period.from)
      ? period.from
      : periods[periods.length - 1]?.from;

  container.innerHTML = `
    <div class="space-y-8">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <button type="button" id="backToDashboard" class="text-base text-violet-600 dark:text-violet-400 hover:underline mb-2 block">← Dashboard</button>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">${employee.name}</h1>
        </div>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-5">Salary (15-day periods)</h2>
        <div class="flex flex-wrap gap-5 items-end mb-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Period</label>
            <select id="periodSelect" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base min-w-[240px] focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
              ${periods.map((p) => `<option value="${p.from}|${p.to}" ${p.from === selectedFrom ? "selected" : ""}>${p.label}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Print</label>
            <select id="printScope" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
              <option value="both">Both (Day + Night)</option>
              <option value="day">Day shift only</option>
              <option value="night">Night shift only</option>
            </select>
          </div>
          <button type="button" id="printSalary" class="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-base font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Print salary sheet</button>
        </div>
        <div id="salaryPreview" class="grid grid-cols-3 gap-5 text-base text-gray-900 dark:text-gray-100">
          <p><span class="text-gray-500 dark:text-gray-400">Gross:</span> <span id="previewGross">—</span></p>
          <p><span class="text-gray-500 dark:text-gray-400">Advance to cut:</span> <span id="previewAdvance">—</span></p>
          <p><span class="text-gray-500 dark:text-gray-400 font-medium">Net:</span> <span id="previewFinal" class="font-bold">—</span></p>
        </div>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10" id="salarySettlementCard">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Salary for this period</h2>
        <p class="text-base text-gray-500 dark:text-gray-400 mb-5">Set how much advance to cut this 15-day cycle. Net = Gross − Advance to cut. Submit to save.</p>
        <div class="space-y-4 max-w-xl">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-gray-700 dark:text-gray-300">Total making (gross)</span>
            <span id="settlementGross" class="font-semibold text-gray-900 dark:text-gray-100">—</span>
          </div>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-gray-700 dark:text-gray-300">Total advance paid (all time)</span>
            <span id="settlementTotalAdvance" class="font-semibold text-gray-900 dark:text-gray-100">—</span>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Advance to cut this period (₹)</label>
            <input type="number" id="advanceToCutInput" min="0" step="1" placeholder="0" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base w-full max-w-[200px] focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
          </div>
          <div class="flex flex-wrap items-baseline justify-between gap-2 pt-2 border-t border-gray-200 dark:border-white/10">
            <span class="text-gray-700 dark:text-gray-300 font-medium">Net this period</span>
            <span id="settlementNet" class="font-bold text-lg text-gray-900 dark:text-gray-100">—</span>
          </div>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-gray-700 dark:text-gray-300">Advance left after this period</span>
            <span id="settlementAdvanceLeft" class="font-semibold text-gray-900 dark:text-gray-100">—</span>
          </div>
          <button type="button" id="submitSettlement" class="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-base font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Save period settlement</button>
        </div>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-5">Add production</h2>
        <form id="addProductionForm" class="flex flex-wrap gap-4 items-end">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Item</label>
            <select id="prodItem" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base w-52 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"></select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Shift</label>
            <select id="prodShift" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
              <option value="day">Day</option>
              <option value="night">Night</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Qty</label>
            <input type="number" id="prodQty" min="1" value="1" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base w-24 focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date</label>
            <input type="date" id="prodDate" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base focus:ring-2 focus:ring-violet-500 focus:border-violet-500" value="${today()}">
          </div>
          <button type="submit" class="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-base font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Add</button>
        </form>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-5">Add advance</h2>
        <form id="addAdvanceForm" class="flex flex-wrap gap-4 items-end">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amount (₹)</label>
            <input type="number" id="advAmount" min="0" step="1" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base w-32 focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date</label>
            <input type="date" id="advDate" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base focus:ring-2 focus:ring-violet-500 focus:border-violet-500" value="${today()}">
          </div>
          <button type="submit" class="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-base font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Add advance</button>
        </form>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Production summary</h2>
        <p class="text-base text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">Cumulative by item and by date for the selected period (quantity only).</p>
        <div class="grid gap-6 md:grid-cols-1">
          <div>
            <h3 class="text-base font-medium text-gray-700 dark:text-gray-300 mb-3">Cumulative by item</h3>
            <div class="overflow-x-auto rounded-xl border-2 border-gray-200 dark:border-white/10">
              <table class="w-full text-base">
                <thead>
                  <tr class="border-b-2 border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
                    <th class="text-left py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Item</th>
                    <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Day</th>
                    <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Night</th>
                    <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Total</th>
                  </tr>
                </thead>
                <tbody id="empCumulativeTable"></tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 class="text-base font-medium text-gray-700 dark:text-gray-300 mb-3">By date</h3>
            <div class="overflow-x-auto rounded-xl border-2 border-gray-200 dark:border-white/10">
              <table class="w-full text-base">
                <thead>
                  <tr class="border-b-2 border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
                    <th class="text-left py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Date</th>
                    <th class="text-left py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Item</th>
                    <th class="text-left py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Shift</th>
                    <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Qty</th>
                  </tr>
                </thead>
                <tbody id="empByDateTable"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Production entries</h2>
        <p class="text-base text-gray-500 dark:text-gray-400 mb-5">Individual entries in this period (edit/delete here).</p>
        <div class="overflow-x-auto">
          <table class="w-full text-base">
            <thead>
              <tr class="border-b-2 border-gray-200 dark:border-white/10">
                <th class="text-left py-4 pr-4 font-semibold text-gray-700 dark:text-gray-300">Date</th>
                <th class="text-left py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Item</th>
                <th class="text-left py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Shift</th>
                <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Qty</th>
                <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Value</th>
                <th class="w-14 py-4 pl-4"></th>
              </tr>
            </thead>
            <tbody id="productionTable"></tbody>
          </table>
        </div>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-5">Advances in period</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-base">
            <thead>
              <tr class="border-b-2 border-gray-200 dark:border-white/10">
                <th class="text-left py-4 pr-4 font-semibold text-gray-700 dark:text-gray-300">Date</th>
                <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Amount</th>
                <th class="w-14 py-4 pl-4"></th>
              </tr>
            </thead>
            <tbody id="advancesTable"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  container
    .querySelector("#backToDashboard")
    .addEventListener("click", () => onNavigate("/"));

  const periodSelect = container.querySelector("#periodSelect");
  const refreshPeriod = () => {
    const [from, to] = periodSelect.value.split("|");
    refreshSalaryPreview(container, employeeId, from, to);
    refreshSalarySettlementCard(container, employeeId, from, to);
    refreshProductionTable(container, employeeId, from, to);
    refreshAdvancesTable(container, employeeId, from, to);
    refreshEmpSummary(container, employeeId, from, to);
  };
  periodSelect.addEventListener("change", refreshPeriod);

  const advanceToCutInput = container.querySelector("#advanceToCutInput");
  const updateSettlementFromInput = () => {
    const card = container.querySelector("#salarySettlementCard");
    const gross = Number(card.dataset.gross) || 0;
    const totalAdvancePaid = Number(card.dataset.totalAdvancePaid) || 0;
    const advanceCutBefore = Number(card.dataset.advanceCutBefore) || 0;
    const advanceToCut = Number(advanceToCutInput?.value) || 0;
    const net = Math.max(0, gross - advanceToCut);
    const advanceLeft = Math.max(0, totalAdvancePaid - advanceCutBefore - advanceToCut);
    const netEl = container.querySelector("#settlementNet");
    const leftEl = container.querySelector("#settlementAdvanceLeft");
    if (netEl) netEl.textContent = currency(net);
    if (leftEl) leftEl.textContent = currency(advanceLeft);
  };
  advanceToCutInput?.addEventListener("input", updateSettlementFromInput);

  container.querySelector("#submitSettlement")?.addEventListener("click", async () => {
    const [from, to] = periodSelect.value.split("|");
    const amount = Number(container.querySelector("#advanceToCutInput").value) || 0;
    await saveDeduction({ employeeId, periodFrom: from, periodTo: to, amount });
    refreshPeriod();
  });

  container
    .querySelector("#printSalary")
    .addEventListener("click", async () => {
      const [from, to] = periodSelect.value.split("|");
      const scope = container.querySelector("#printScope").value || "both";
      const { html } = await getPrintableSalaryHtml(employeeId, from, to, scope);
      const win = window.open("", "_blank", "width=800,height=600");
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 300);
    });

  const items = await getItems();
  container.querySelector("#prodItem").innerHTML =
    '<option value="">Select…</option>' +
    items.map((i) => `<option value="${i.id}">${i.name}</option>`).join("");

  container
    .querySelector("#addProductionForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const itemId = container.querySelector("#prodItem").value;
      const shift = container.querySelector("#prodShift").value;
      const qty = parseInt(container.querySelector("#prodQty").value, 10) || 1;
      const date = container.querySelector("#prodDate").value;
      if (!itemId) return;
      await saveProduction({
        employeeId,
        itemId,
        date,
        quantity: qty,
        shift: shift === "night" ? "night" : "day",
      });
      container.querySelector("#prodQty").value = 1;
      refreshPeriod();
    });

  container
    .querySelector("#addAdvanceForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount =
        parseFloat(container.querySelector("#advAmount").value) || 0;
      const date = container.querySelector("#advDate").value;
      if (amount <= 0) return;
      await saveAdvance({ employeeId, amount, date });
      container.querySelector("#advAmount").value = "";
      refreshPeriod();
    });

  refreshPeriod();
}

async function refreshSalaryPreview(container, employeeId, from, to) {
  const [salary, deduction] = await Promise.all([
    calculateSalary(employeeId, from, to),
    getDeductionForPeriod(employeeId, from, to),
  ]);
  const advanceToCut = deduction?.amount ?? 0;
  const net = Math.max(0, salary.gross - advanceToCut);
  container.querySelector("#previewGross").textContent = currency(salary.gross);
  container.querySelector("#previewAdvance").textContent = currency(advanceToCut);
  container.querySelector("#previewFinal").textContent = currency(net);
}

async function refreshSalarySettlementCard(container, employeeId, from, to) {
  const [salary, allAdvances, deductions] = await Promise.all([
    calculateSalary(employeeId, from, to),
    getAdvances(),
    getDeductionsByEmployee(employeeId),
  ]);
  const totalAdvancePaid = allAdvances
    .filter((a) => a.employeeId === employeeId)
    .reduce((sum, a) => sum + (a.amount || 0), 0);
  const deductionThisPeriod = deductions.find(
    (d) => d.periodFrom === from && d.periodTo === to,
  );
  const advanceToCutThisPeriod = deductionThisPeriod?.amount ?? 0;
  const advanceCutBeforeThisPeriod = deductions
    .filter((d) => d.periodTo < from)
    .reduce((sum, d) => sum + (d.amount || 0), 0);
  const advanceCutIncludingThis = advanceCutBeforeThisPeriod + advanceToCutThisPeriod;
  const netThisPeriod = Math.max(0, salary.gross - advanceToCutThisPeriod);
  const advanceLeftAfter = Math.max(0, totalAdvancePaid - advanceCutIncludingThis);

  const card = container.querySelector("#salarySettlementCard");
  if (card) {
    card.dataset.gross = String(salary.gross);
    card.dataset.totalAdvancePaid = String(totalAdvancePaid);
    card.dataset.advanceCutBefore = String(advanceCutBeforeThisPeriod);
  }
  const input = container.querySelector("#advanceToCutInput");
  if (input) {
    input.value = advanceToCutThisPeriod > 0 ? String(advanceToCutThisPeriod) : "";
  }
  const grossEl = container.querySelector("#settlementGross");
  const totalAdvEl = container.querySelector("#settlementTotalAdvance");
  const netEl = container.querySelector("#settlementNet");
  const leftEl = container.querySelector("#settlementAdvanceLeft");
  if (grossEl) grossEl.textContent = currency(salary.gross);
  if (totalAdvEl) totalAdvEl.textContent = currency(totalAdvancePaid);
  if (netEl) netEl.textContent = currency(netThisPeriod);
  if (leftEl) leftEl.textContent = currency(advanceLeftAfter);
}

async function refreshEmpSummary(container, employeeId, from, to) {
  const [productions, items] = await Promise.all([
    getProductionsByEmployee(employeeId, from, to),
    getItems(),
  ]);
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));

  const byItem = {};
  const byItemDay = {};
  const byItemNight = {};
  const byDateItemShift = [];
  productions.forEach((p) => {
    const qty = p.quantity || 0;
    const shift = p.shift === "night" ? "night" : "day";
    byItem[p.itemId] = (byItem[p.itemId] || 0) + qty;
    if (shift === "night") {
      byItemNight[p.itemId] = (byItemNight[p.itemId] || 0) + qty;
    } else {
      byItemDay[p.itemId] = (byItemDay[p.itemId] || 0) + qty;
    }
    byDateItemShift.push({
      date: p.date,
      itemId: p.itemId,
      itemName: itemMap[p.itemId] ? itemMap[p.itemId].name : p.itemId,
      shift,
      qty,
    });
  });

  const itemIds = [...new Set(Object.keys(byItem))];
  const cumulativeRows = itemIds
    .map((itemId) => ({
      itemName: itemMap[itemId] ? itemMap[itemId].name : itemId,
      dayQty: byItemDay[itemId] || 0,
      nightQty: byItemNight[itemId] || 0,
      qty: byItem[itemId],
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  const byDateRows = byDateItemShift.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.itemName.localeCompare(b.itemName),
  );

  const cumulativeTable = container.querySelector("#empCumulativeTable");
  cumulativeTable.innerHTML =
    cumulativeRows.length === 0
      ? '<tr><td colspan="4" class="py-5 px-4 text-base text-gray-500 dark:text-gray-400 text-center">No production in this period.</td></tr>'
      : cumulativeRows
          .map(
            (r) =>
              `<tr class="border-b border-gray-100 dark:border-white/10">
                <td class="py-3 px-4 text-gray-900 dark:text-gray-100">${r.itemName}</td>
                <td class="text-right py-3 px-4 text-gray-700 dark:text-gray-300">${number(r.dayQty)}</td>
                <td class="text-right py-3 px-4 text-gray-700 dark:text-gray-300">${number(r.nightQty)}</td>
                <td class="text-right py-3 px-4 font-medium text-gray-900 dark:text-gray-100">${number(r.qty)}</td>
              </tr>`,
          )
          .join("");

  const byDateTable = container.querySelector("#empByDateTable");
  byDateTable.innerHTML =
    byDateRows.length === 0
      ? '<tr><td colspan="4" class="py-5 px-4 text-base text-gray-500 dark:text-gray-400 text-center">No production in this period.</td></tr>'
      : byDateRows
          .map(
            (r) =>
              `<tr class="border-b border-gray-100 dark:border-white/10">
                <td class="py-3 px-4 text-gray-700 dark:text-gray-300">${r.date}</td>
                <td class="py-3 px-4 text-gray-900 dark:text-gray-100">${r.itemName}</td>
                <td class="py-3 px-4 text-gray-600 dark:text-gray-400">${r.shift}</td>
                <td class="text-right py-3 px-4 text-gray-900 dark:text-gray-100">${number(r.qty)}</td>
              </tr>`,
          )
          .join("");
}

async function refreshProductionTable(container, employeeId, from, to) {
  const [productions, items] = await Promise.all([
    getProductionsByEmployee(employeeId, from, to),
    getItems(),
  ]);
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));
  const tbody = container.querySelector("#productionTable");
  tbody.innerHTML = productions
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => {
      const item = itemMap[p.itemId];
      const rate = item ? item.rate || 0 : 0;
      const value = (p.quantity || 0) * rate;
      const shift = p.shift === "night" ? "Night" : "Day";
      return `
        <tr class="border-b border-gray-100 dark:border-white/10" data-prod-id="${p.id}">
          <td class="py-3 pr-4 text-gray-900 dark:text-gray-100">${dateDisplay(p.date)}</td>
          <td class="py-3 px-4 text-gray-900 dark:text-gray-100">${item ? item.name : p.itemId}</td>
          <td class="py-3 px-4 text-gray-600 dark:text-gray-400">${shift}</td>
          <td class="text-right py-3 px-4 text-gray-900 dark:text-gray-100">${number(p.quantity)}</td>
          <td class="text-right py-3 px-4 text-gray-700 dark:text-gray-300">${currency(value)}</td>
          <td class="py-3 pl-4"><button type="button" class="btn-icon btn-icon-delete delete-prod" title="Delete entry" aria-label="Delete entry">${iconTrash}</button></td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".delete-prod").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const id = row.getAttribute("data-prod-id");
      if (id && confirm("Delete this production entry?")) {
        await deleteProduction(id);
        row.remove();
        const [from, to] = container
          .querySelector("#periodSelect")
          .value.split("|");
        refreshSalaryPreview(container, employeeId, from, to);
        refreshEmpSummary(container, employeeId, from, to);
      }
    });
  });
}

async function refreshAdvancesTable(container, employeeId, from, to) {
  const advances = await getAdvancesByEmployee(employeeId, from, to);
  const tbody = container.querySelector("#advancesTable");
  tbody.innerHTML = advances
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (a) =>
        `<tr class="border-b border-gray-100 dark:border-white/10" data-adv-id="${a.id}">
          <td class="py-3 pr-4 text-gray-900 dark:text-gray-100">${dateDisplay(a.date)}</td>
          <td class="text-right py-3 px-4 text-gray-900 dark:text-gray-100">${currency(a.amount)}</td>
          <td class="py-3 pl-4"><button type="button" class="btn-icon btn-icon-delete delete-adv" title="Delete advance" aria-label="Delete advance">${iconTrash}</button></td>
        </tr>`,
    )
    .join("");

  tbody.querySelectorAll(".delete-adv").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const id = row.getAttribute("data-adv-id");
      if (id && confirm("Delete this advance?")) {
        await deleteAdvance(id);
        row.remove();
        const [from, to] = container
          .querySelector("#periodSelect")
          .value.split("|");
        refreshSalaryPreview(container, employeeId, from, to);
      }
    });
  });
}
