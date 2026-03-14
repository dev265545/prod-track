/**
 * ProdTrack Lite - Productions CRUD & aggregation
 */

import { getAll, get, put, remove, STORES, deleteWhere } from '../db/indexeddb.js';

const STORE = STORES.PRODUCTIONS;

export async function getProductions() {
  return getAll(STORE);
}

export async function getProduction(id) {
  return get(STORE, id);
}

export async function getProductionsByDate(date) {
  const all = await getAll(STORE);
  return all.filter((p) => p.date === date);
}

export async function getProductionsByEmployee(employeeId, fromDate, toDate) {
  const all = await getAll(STORE);
  return all.filter(
    (p) =>
      p.employeeId === employeeId &&
      p.date >= fromDate &&
      p.date <= toDate
  );
}

export async function getProductionsInRange(fromDate, toDate) {
  const all = await getAll(STORE);
  return all.filter((p) => p.date >= fromDate && p.date <= toDate);
}

/**
 * Daily aggregated production (all employees) for a given date.
 * Returns { totals: { itemId: qty }, day: { itemId: qty }, night: { itemId: qty } }
 * Missing shift is treated as 'day'.
 */
export async function getDailyAggregated(date) {
  const list = await getProductionsByDate(date);
  const totals = {};
  const day = {};
  const night = {};
  list.forEach((p) => {
    const qty = p.quantity || 0;
    const shift = p.shift === 'night' ? 'night' : 'day';
    totals[p.itemId] = (totals[p.itemId] || 0) + qty;
    if (shift === 'night') {
      night[p.itemId] = (night[p.itemId] || 0) + qty;
    } else {
      day[p.itemId] = (day[p.itemId] || 0) + qty;
    }
  });
  return { totals, day, night };
}

export async function saveProduction(prod) {
  if (!prod.id) prod.id = 'prod_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  prod.shift = prod.shift === 'night' ? 'night' : 'day';
  await put(STORE, prod);
  return prod;
}

export async function deleteProduction(id) {
  await remove(STORE, id);
}

/**
 * Delete all productions before the given date (for historical cleanup).
 * @param {string} beforeDate - YYYY-MM-DD (exclusive)
 * @returns {Promise<number>} count deleted
 */
export async function deleteProductionsBefore(beforeDate) {
  return deleteWhere(STORE, (p) => p.date < beforeDate);
}
