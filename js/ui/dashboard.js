/**
 * ProdTrack Lite - Dashboard UI
 * Total production today, by item, quick add, salary summary.
 */

import { getDailyAggregated, saveProduction } from '../services/productionService.js';
import { getItems } from '../services/itemService.js';
import { getEmployees } from '../services/employeeService.js';
import { calculateSalaryForPeriod } from '../services/salaryService.js';
import { getDeductionForPeriod } from '../services/advanceDeductionService.js';
import { today, getPeriodForDate } from '../utils/date.js';
import { currency, number } from '../utils/formatter.js';

let onNavigate = () => {};

export function setDashboardNavigate(fn) {
  onNavigate = fn;
}

const iconView = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>';

export function renderDashboard(container) {
  const date = today();
  container.innerHTML = `
    <div class="space-y-8">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <div class="flex items-center gap-3">
          <label class="text-base font-medium text-gray-700 dark:text-gray-300">Date</label>
          <input type="date" id="dashboardDate" value="${date}" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
          <h2 class="text-base font-medium text-gray-600 dark:text-gray-400">Production today</h2>
          <p id="totalToday" class="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">—</p>
        </div>
        <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
          <h2 class="text-base font-medium text-gray-600 dark:text-gray-400">Value today</h2>
          <p id="valueToday" class="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">—</p>
        </div>
        <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
          <h2 class="text-base font-medium text-gray-600 dark:text-gray-400">Active employees</h2>
          <p id="activeEmployees" class="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">—</p>
        </div>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-5">Daily production by item</h2>
        <table class="w-full text-base">
          <thead>
            <tr class="border-b-2 border-gray-200 dark:border-white/10">
              <th class="text-left py-4 pr-4 font-semibold text-gray-700 dark:text-gray-300">Item</th>
              <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Day</th>
              <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Night</th>
              <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Total</th>
              <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Value</th>
            </tr>
          </thead>
          <tbody id="dailyTable"></tbody>
        </table>
        <p id="dailyEmpty" class="text-base text-gray-500 dark:text-gray-400 py-6 hidden">No production for this date.</p>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-5">Quick add production</h2>
        <form id="quickAddForm" class="flex flex-wrap gap-4 items-end">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Employee</label>
            <select id="quickEmp" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base w-48 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"></select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Item</label>
            <select id="quickItem" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base w-56 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"></select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Shift</label>
            <select id="quickShift" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
              <option value="day">Day</option>
              <option value="night">Night</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Qty</label>
            <input type="number" id="quickQty" min="1" value="1" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base w-24 focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date</label>
            <input type="date" id="quickDate" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base focus:ring-2 focus:ring-violet-500 focus:border-violet-500" value="${date}">
          </div>
          <button type="submit" class="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-base font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Add</button>
        </form>
      </div>

      <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Salary summary (current period)</h2>
        <p class="text-base text-gray-500 dark:text-gray-400 mb-5" id="periodLabel">—</p>
        <div class="overflow-x-auto">
          <table class="w-full text-base">
            <thead>
              <tr class="border-b-2 border-gray-200 dark:border-white/10">
                <th class="text-left py-4 pr-4 font-semibold text-gray-700 dark:text-gray-300">Employee</th>
                <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Gross</th>
                <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Advance to cut</th>
                <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Net</th>
                <th class="w-14 py-4 pl-4"></th>
              </tr>
            </thead>
            <tbody id="salaryTable"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const dashboardDateEl = container.querySelector('#dashboardDate');
  dashboardDateEl.addEventListener('change', () => refreshDashboard(container, dashboardDateEl.value));

  const quickForm = container.querySelector('#quickAddForm');
  quickForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const empId = container.querySelector('#quickEmp').value;
    const itemId = container.querySelector('#quickItem').value;
    const shift = container.querySelector('#quickShift').value;
    const qty = parseInt(container.querySelector('#quickQty').value, 10) || 1;
    const d = container.querySelector('#quickDate').value;
    if (!empId || !itemId) return;
    await saveProduction({ employeeId: empId, itemId, date: d, quantity: qty, shift: shift === 'night' ? 'night' : 'day' });
    container.querySelector('#quickQty').value = 1;
    refreshDashboard(container, dashboardDateEl.value);
  });

  loadDropdowns(container);
  refreshDashboard(container, date);
}

async function loadDropdowns(container) {
  const [employees, items] = await Promise.all([getEmployees(true), getItems()]);
  const empSelect = container.querySelector('#quickEmp');
  const itemSelect = container.querySelector('#quickItem');
  empSelect.innerHTML = '<option value="">Select…</option>' + employees.map((e) => `<option value="${e.id}">${e.name}</option>`).join('');
  itemSelect.innerHTML = '<option value="">Select…</option>' + items.map((i) => `<option value="${i.id}">${i.name}</option>`).join('');
}

async function refreshDashboard(container, date) {
  const [aggregated, items, employees, period] = await Promise.all([
    getDailyAggregated(date),
    getItems(),
    getEmployees(true),
    getPeriodForDate(date),
  ]);

  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));
  const { totals, day, night } = aggregated;
  let totalQty = 0;
  let totalValue = 0;
  const rows = [];
  for (const itemId of Object.keys(totals)) {
    const qty = totals[itemId];
    const dayQty = day[itemId] || 0;
    const nightQty = night[itemId] || 0;
    const item = itemMap[itemId];
    const rate = item ? (item.rate || 0) : 0;
    const value = qty * rate;
    totalQty += qty;
    totalValue += value;
    rows.push({ name: item ? item.name : itemId, dayQty, nightQty, qty, value });
  }

  container.querySelector('#totalToday').textContent = number(totalQty);
  container.querySelector('#valueToday').textContent = currency(totalValue);
  container.querySelector('#activeEmployees').textContent = String(employees.length);

  const tbody = container.querySelector('#dailyTable');
  const dailyEmpty = container.querySelector('#dailyEmpty');
  if (rows.length === 0) {
    tbody.innerHTML = '';
    dailyEmpty.classList.remove('hidden');
  } else {
    dailyEmpty.classList.add('hidden');
    tbody.innerHTML = rows.map((r) => `
      <tr class="border-b border-gray-100 dark:border-white/10">
        <td class="py-3 pr-4 text-gray-900 dark:text-gray-100">${r.name}</td>
        <td class="text-right py-3 px-4 text-gray-700 dark:text-gray-300">${number(r.dayQty)}</td>
        <td class="text-right py-3 px-4 text-gray-700 dark:text-gray-300">${number(r.nightQty)}</td>
        <td class="text-right py-3 px-4 font-medium text-gray-900 dark:text-gray-100">${number(r.qty)}</td>
        <td class="text-right py-3 px-4 text-gray-700 dark:text-gray-300">${currency(r.value)}</td>
      </tr>
    `).join('');
  }

  container.querySelector('#periodLabel').textContent = period.label;
  const salaryTable = container.querySelector('#salaryTable');
  const salaryRows = await Promise.all(
    employees.map(async (e) => {
      const s = await calculateSalaryForPeriod(e.id, date);
      const ded = await getDeductionForPeriod(e.id, period.from, period.to);
      const advanceToCut = ded?.amount ?? 0;
      const net = Math.max(0, s.gross - advanceToCut);
      return { ...e, salary: { ...s, advanceToCut, final: net } };
    })
  );
  salaryTable.innerHTML = salaryRows.map((r) => `
    <tr class="border-b border-gray-100 dark:border-white/10 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors" data-emp-id="${r.id}" role="button" tabindex="0" title="View employee">
      <td class="py-3 pr-4 text-gray-900 dark:text-gray-100">${r.name}</td>
      <td class="text-right py-3 px-4 text-gray-900 dark:text-gray-100">${currency(r.salary.gross)}</td>
      <td class="text-right py-3 px-4 text-gray-900 dark:text-gray-100">${currency(r.salary.advanceToCut)}</td>
      <td class="text-right py-3 px-4 font-medium text-gray-900 dark:text-gray-100">${currency(r.salary.final)}</td>
      <td class="py-3 pl-4">
        <button type="button" data-emp-id="${r.id}" class="btn-icon view-emp-btn" title="View employee" aria-label="View employee">${iconView}</button>
      </td>
    </tr>
  `).join('');

  salaryTable.querySelectorAll('tr[data-emp-id]').forEach((row) => {
    const empId = row.getAttribute('data-emp-id');
    const go = () => onNavigate('/employee/' + empId);
    row.addEventListener('click', (e) => {
      if (e.target.closest('.view-emp-btn')) return;
      go();
    });
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  salaryTable.querySelectorAll('.view-emp-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onNavigate('/employee/' + btn.getAttribute('data-emp-id'));
    });
  });
}
