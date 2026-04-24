/**
 * ProdTrack Lite - Production report
 * Cumulative by item + by date (quantity only). Periods with data only.
 */

import { getProductionsInRange, getProductions } from '../services/productionService.js';
import { getItems } from '../services/itemService.js';
import { getPeriodForDate, getPeriodsWithData } from '../utils/date.js';
import { number } from '../utils/formatter.js';
import { dateDisplay } from '../utils/formatter.js';

/**
 * Build HTML for printable production report.
 * @param {string} fromDate
 * @param {string} toDate
 * @param {'day'|'night'|'both'} filter - 'day' = day shift only, 'night' = night only, 'both' = both sessions
 * Offline-friendly: inline styles only.
 */
async function getPrintableProductionReportHtml(fromDate, toDate, filter = 'both') {
  const [productions, items] = await Promise.all([
    getProductionsInRange(fromDate, toDate),
    getItems(),
  ]);
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));

  const byItem = {};
  const byItemDay = {};
  const byItemNight = {};
  const byDateItemDay = {};
  const byDateItemNight = {};
  productions.forEach((p) => {
    const qty = p.quantity || 0;
    const shift = p.shift === 'night' ? 'night' : 'day';
    byItem[p.itemId] = (byItem[p.itemId] || 0) + qty;
    const key = `${p.date}|${p.itemId}`;
    if (shift === 'night') {
      byItemNight[p.itemId] = (byItemNight[p.itemId] || 0) + qty;
      if (!byDateItemNight[key]) byDateItemNight[key] = { date: p.date, itemId: p.itemId, qty: 0 };
      byDateItemNight[key].qty += qty;
    } else {
      byItemDay[p.itemId] = (byItemDay[p.itemId] || 0) + qty;
      if (!byDateItemDay[key]) byDateItemDay[key] = { date: p.date, itemId: p.itemId, qty: 0 };
      byDateItemDay[key].qty += qty;
    }
  });

  const itemIds = [...new Set(Object.keys(byItem))];
  const cumulativeRows = itemIds
    .map((itemId) => ({
      itemId,
      itemName: itemMap[itemId] ? itemMap[itemId].name : itemId,
      dayQty: byItemDay[itemId] || 0,
      nightQty: byItemNight[itemId] || 0,
      qty: byItem[itemId],
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  const datesDay = [...new Set(productions.filter((p) => p.shift !== 'night').map((p) => p.date))].sort();
  const datesNight = [...new Set(productions.filter((p) => p.shift === 'night').map((p) => p.date))].sort();

  const printStyles =
    'body{margin:0;font-family:system-ui,sans-serif;font-size:12px;color:#0a0a0a;background:#fff;padding:16px}.mb-4{margin-bottom:12px}.mb-6{margin-bottom:20px}.text-2xl{font-size:1.5rem;font-weight:700}.text-sm{font-size:0.75rem}.text-lg{font-size:1.125rem}.text-gray-600{color:#52525b}.border{border:1px solid #e4e4e7}.w-full{width:100%}.table{width:100%;font-size:11px;border-collapse:collapse}.table th,.table td{padding:4px 6px;text-align:left;border:1px solid #e4e4e7}.table th{background:#f4f4f5;font-weight:600}.text-right{text-align:right}.no-print{display:none!important}@media print{body*{visibility:hidden}#printArea,#printArea *{visibility:visible}#printArea{position:absolute;left:0;top:0;width:100%;font-size:11px}}';

  const matrixHeaderCells = cumulativeRows.map((i) => `<th class="border text-right" style="padding:4px 6px;white-space:nowrap">${i.itemName}</th>`).join('');
  function matrixBodyRows(datesSorted, byDateItem) {
    return datesSorted.length === 0
      ? `<tr><td colspan="${cumulativeRows.length + 1}" class="border" style="padding:6px;text-align:center;color:#71717a">No production.</td></tr>`
      : datesSorted
          .map(
            (date) =>
              `<tr><td class="border" style="padding:4px 6px;white-space:nowrap;font-weight:500">${date}</td>${cumulativeRows
                .map((i) => {
                  const qty = byDateItem[`${date}|${i.itemId}`]?.qty ?? '';
                  return `<td class="border text-right" style="padding:4px 6px">${qty !== '' ? number(qty) : '—'}</td>`;
                })
                .join('')}</tr>`
          )
          .join('');
  }

  const periodLabel = `${dateDisplay(fromDate)} – ${dateDisplay(toDate)}`;
  const filterLabel = filter === 'day' ? ' (Day shift only)' : filter === 'night' ? ' (Night shift only)' : '';

  let cumulativeRowsHtml;
  let cumulativeTableHeader;
  let matrixSection = '';

  if (filter === 'day') {
    cumulativeRowsHtml =
      cumulativeRows.length === 0
        ? '<tr><td colspan="2" class="border" style="padding:6px;color:#71717a">No production in this period.</td></tr>'
        : cumulativeRows
            .map((r) => `<tr><td class="border" style="padding:4px 6px">${r.itemName}</td><td class="border text-right" style="padding:4px 6px">${number(r.dayQty)}</td></tr>`)
            .join('');
    cumulativeTableHeader = '<tr class="border"><th class="border" style="padding:6px">Item</th><th class="border text-right" style="padding:6px">Day</th></tr>';
    matrixSection = `<h2 class="text-lg" style="font-weight:600;margin-bottom:6px">By date – Day shift (matrix)</h2><table class="table w-full mb-6"><thead><tr class="border"><th class="border" style="padding:4px 6px">Date</th>${matrixHeaderCells}</tr></thead><tbody>${matrixBodyRows(datesDay, byDateItemDay)}</tbody></table>`;
  } else if (filter === 'night') {
    cumulativeRowsHtml =
      cumulativeRows.length === 0
        ? '<tr><td colspan="2" class="border" style="padding:6px;color:#71717a">No production in this period.</td></tr>'
        : cumulativeRows
            .map((r) => `<tr><td class="border" style="padding:4px 6px">${r.itemName}</td><td class="border text-right" style="padding:4px 6px">${number(r.nightQty)}</td></tr>`)
            .join('');
    cumulativeTableHeader = '<tr class="border"><th class="border" style="padding:6px">Item</th><th class="border text-right" style="padding:6px">Night</th></tr>';
    matrixSection = `<h2 class="text-lg" style="font-weight:600;margin-bottom:6px">By date – Night shift (matrix)</h2><table class="table w-full mb-6"><thead><tr class="border"><th class="border" style="padding:4px 6px">Date</th>${matrixHeaderCells}</tr></thead><tbody>${matrixBodyRows(datesNight, byDateItemNight)}</tbody></table>`;
  } else {
    cumulativeRowsHtml =
      cumulativeRows.length === 0
        ? '<tr><td colspan="4" class="border" style="padding:6px;color:#71717a">No production in this period.</td></tr>'
        : cumulativeRows
            .map(
              (r) =>
                `<tr><td class="border" style="padding:4px 6px">${r.itemName}</td><td class="border text-right" style="padding:4px 6px">${number(r.dayQty)}</td><td class="border text-right" style="padding:4px 6px">${number(r.nightQty)}</td><td class="border text-right" style="padding:4px 6px">${number(r.qty)}</td></tr>`
            )
            .join('');
    cumulativeTableHeader =
      '<tr class="border"><th class="border" style="padding:6px">Item</th><th class="border text-right" style="padding:6px">Day</th><th class="border text-right" style="padding:6px">Night</th><th class="border text-right" style="padding:6px">Total</th></tr>';
    matrixSection = `<h2 class="text-lg" style="font-weight:600;margin-bottom:6px">By date – Day shift (matrix)</h2><table class="table w-full mb-6"><thead><tr class="border"><th class="border" style="padding:4px 6px">Date</th>${matrixHeaderCells}</tr></thead><tbody>${matrixBodyRows(datesDay, byDateItemDay)}</tbody></table><h2 class="text-lg" style="font-weight:600;margin-bottom:6px">By date – Night shift (matrix)</h2><table class="table w-full mb-6"><thead><tr class="border"><th class="border" style="padding:4px 6px">Date</th>${matrixHeaderCells}</tr></thead><tbody>${matrixBodyRows(datesNight, byDateItemNight)}</tbody></table>`;
  }

  const cumulativeDesc =
    filter === 'day'
      ? 'Day-shift quantity per item (all employees).'
      : filter === 'night'
        ? 'Night-shift quantity per item (all employees).'
        : 'Day and night quantity per item (all employees).';

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Production report – ${periodLabel}</title><style>${printStyles}</style></head><body id="printArea"><div style="max-width:100%;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px"><div><h1 class="text-2xl">ProdTrack Lite</h1><p class="text-sm text-gray-600">Production report${filterLabel}</p></div><div class="text-sm text-right"><p><strong>Period:</strong> ${periodLabel}</p></div></div><h2 class="text-lg" style="font-weight:600;margin-bottom:6px">Cumulative by item</h2><p class="text-sm text-gray-600 mb-4">${cumulativeDesc}</p><table class="table w-full mb-6"><thead>${cumulativeTableHeader}</thead><tbody>${cumulativeRowsHtml}</tbody></table>${matrixSection}<p class="text-xs text-gray-600 no-print" style="margin-top:16px">Generated by ProdTrack Lite. Use Ctrl+P to print or save as PDF.</p></div></body></html>`;

  return html;
}

export function renderReports(container) {
  container.innerHTML = `
    <div class="space-y-8">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Production report</h1>
        <div class="flex flex-wrap items-center gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Period</label>
            <select id="reportsPeriod" class="rounded-xl border-2 border-gray-300 dark:border-white/20 bg-white text-gray-900 dark:text-gray-100 px-4 py-3 text-base min-w-[240px] focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
              <option value="">Loading…</option>
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
          <div class="flex items-end">
            <button type="button" id="printReportBtn" class="rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 text-base font-medium focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">Print report</button>
          </div>
        </div>
      </div>

      <p id="reportsNoData" class="text-base text-gray-500 dark:text-gray-400 py-4 hidden">No production data yet. Add production from the Dashboard or Employee pages.</p>

      <div id="reportsContent" class="space-y-8 hidden">
        <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Cumulative by item</h2>
          <p class="text-base text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">Day and night quantity per item in the selected period (all employees).</p>
          <div class="overflow-x-auto">
            <table class="w-full text-base">
              <thead>
                <tr class="border-b-2 border-gray-200 dark:border-white/10">
                  <th class="text-left py-4 pr-4 font-semibold text-gray-700 dark:text-gray-300">Item</th>
                  <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Day</th>
                  <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Night</th>
                  <th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300">Total</th>
                </tr>
              </thead>
              <tbody id="cumulativeTable"></tbody>
            </table>
          </div>
        </div>

        <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">By date – Day shift (matrix)</h2>
          <p class="text-base text-gray-500 dark:text-gray-400 mb-5">Rows = dates, columns = items. Day-shift quantity only.</p>
          <div class="overflow-x-auto">
            <table class="w-full text-base border-collapse" id="byDateMatrixDayTable">
              <thead id="byDateMatrixDayHead"></thead>
              <tbody id="byDateMatrixDayBody"></tbody>
            </table>
          </div>
        </div>

        <div class="bg-white dark-card shadow-md rounded-2xl p-8 border border-gray-200 dark:border-white/10">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">By date – Night shift (matrix)</h2>
          <p class="text-base text-gray-500 dark:text-gray-400 mb-5">Rows = dates, columns = items. Night-shift quantity only.</p>
          <div class="overflow-x-auto">
            <table class="w-full text-base border-collapse" id="byDateMatrixNightTable">
              <thead id="byDateMatrixNightHead"></thead>
              <tbody id="byDateMatrixNightBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  loadPeriodsAndRefresh(container);
}

async function loadPeriodsAndRefresh(container) {
  const productions = await getProductions();
  const periodsWithData = getPeriodsWithData(productions);
  const periodSelect = container.querySelector('#reportsPeriod');
  const noDataEl = container.querySelector('#reportsNoData');
  const contentEl = container.querySelector('#reportsContent');

  if (periodsWithData.length === 0) {
    periodSelect.innerHTML = '<option value="">No periods with data</option>';
    noDataEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }

  noDataEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  const currentPeriod = getPeriodForDate(new Date().toISOString().slice(0, 10));
  const selectedFrom = periodsWithData.some((p) => p.from === currentPeriod.from)
    ? currentPeriod.from
    : periodsWithData[periodsWithData.length - 1]?.from;

  periodSelect.innerHTML = periodsWithData
    .map((p) => `<option value="${p.from}|${p.to}" ${p.from === selectedFrom ? 'selected' : ''}>${p.label}</option>`)
    .join('');

  periodSelect.addEventListener('change', () => refreshReport(container, periodSelect.value));

  container.querySelector('#printReportBtn').addEventListener('click', async () => {
    const periodValue = periodSelect.value;
    if (!periodValue) return;
    const [from, to] = periodValue.split('|');
    const scope = container.querySelector('#printScope').value || 'both';
    const html = await getPrintableProductionReportHtml(from, to, scope);
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  });

  refreshReport(container, periodSelect.value);
}

async function refreshReport(container, periodValue) {
  const [from, to] = periodValue.split('|');
  const [productions, items] = await Promise.all([
    getProductionsInRange(from, to),
    getItems(),
  ]);

  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));

  const byItem = {};
  const byItemDay = {};
  const byItemNight = {};
  const byDateItemDay = {};
  const byDateItemNight = {};
  productions.forEach((p) => {
    const qty = p.quantity || 0;
    const shift = p.shift === 'night' ? 'night' : 'day';
    byItem[p.itemId] = (byItem[p.itemId] || 0) + qty;
    const key = `${p.date}|${p.itemId}`;
    if (shift === 'night') {
      byItemNight[p.itemId] = (byItemNight[p.itemId] || 0) + qty;
      if (!byDateItemNight[key]) byDateItemNight[key] = { date: p.date, itemId: p.itemId, qty: 0 };
      byDateItemNight[key].qty += qty;
    } else {
      byItemDay[p.itemId] = (byItemDay[p.itemId] || 0) + qty;
      if (!byDateItemDay[key]) byDateItemDay[key] = { date: p.date, itemId: p.itemId, qty: 0 };
      byDateItemDay[key].qty += qty;
    }
  });

  const itemIds = [...new Set(Object.keys(byItem))];
  const cumulativeRows = itemIds
    .map((itemId) => ({
      itemId,
      itemName: itemMap[itemId] ? itemMap[itemId].name : itemId,
      dayQty: byItemDay[itemId] || 0,
      nightQty: byItemNight[itemId] || 0,
      qty: byItem[itemId],
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  const datesDay = [...new Set(productions.filter((p) => p.shift !== 'night').map((p) => p.date))].sort();
  const datesNight = [...new Set(productions.filter((p) => p.shift === 'night').map((p) => p.date))].sort();

  const cumulativeTable = container.querySelector('#cumulativeTable');
  cumulativeTable.innerHTML = cumulativeRows
    .map(
      (r) =>
        `<tr class="border-b border-gray-100 dark:border-white/10">
          <td class="py-3 pr-4 text-gray-900 dark:text-gray-100">${r.itemName}</td>
          <td class="text-right py-3 px-4 text-gray-700 dark:text-gray-300">${number(r.dayQty)}</td>
          <td class="text-right py-3 px-4 text-gray-700 dark:text-gray-300">${number(r.nightQty)}</td>
          <td class="text-right py-3 px-4 font-medium text-gray-900 dark:text-gray-100">${number(r.qty)}</td>
        </tr>`
    )
    .join('');

  function renderMatrix(theadEl, tbodyEl, cumulativeRows, datesSorted, byDateItem) {
    theadEl.innerHTML = `<tr class="border-b-2 border-gray-200 dark:border-white/10">
      <th class="text-left py-4 px-4 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap sticky left-0 bg-white dark:bg-[#0c0c0c] border-r border-gray-200 dark:border-white/10">Date</th>
      ${cumulativeRows.map((i) => `<th class="text-right py-4 px-4 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">${i.itemName}</th>`).join('')}
    </tr>`;
    tbodyEl.innerHTML =
      datesSorted.length === 0
        ? '<tr><td colspan="' + (cumulativeRows.length + 1) + '" class="py-5 px-4 text-base text-center text-gray-500 dark:text-gray-400">No production in this period.</td></tr>'
        : datesSorted
            .map(
              (date) =>
                `<tr class="border-b border-gray-100 dark:border-white/10">
                  <td class="py-3 px-4 text-gray-700 dark:text-gray-300 whitespace-nowrap sticky left-0 bg-white dark:bg-[#0c0c0c] border-r border-gray-200 dark:border-white/10 font-medium">${date}</td>
                  ${cumulativeRows.map((i) => {
                    const qty = byDateItem[`${date}|${i.itemId}`]?.qty ?? '';
                    return `<td class="text-right py-3 px-4 text-gray-900 dark:text-gray-100">${qty !== '' ? number(qty) : '—'}</td>`;
                  }).join('')}
                </tr>`
            )
            .join('');
  }

  renderMatrix(
    container.querySelector('#byDateMatrixDayHead'),
    container.querySelector('#byDateMatrixDayBody'),
    cumulativeRows,
    datesDay,
    byDateItemDay
  );
  renderMatrix(
    container.querySelector('#byDateMatrixNightHead'),
    container.querySelector('#byDateMatrixNightBody'),
    cumulativeRows,
    datesNight,
    byDateItemNight
  );
}
