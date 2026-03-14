/**
 * ProdTrack Lite - Advances (salary advances) CRUD
 */

import { getAll, get, put, remove, STORES, deleteWhere } from '../db/indexeddb.js';

const STORE = STORES.ADVANCES;

export async function getAdvances() {
  return getAll(STORE);
}

export async function getAdvancesByEmployee(employeeId, fromDate, toDate) {
  const all = await getAll(STORE);
  return all.filter(
    (a) =>
      a.employeeId === employeeId &&
      a.date >= fromDate &&
      a.date <= toDate
  );
}

export async function getAdvance(id) {
  return get(STORE, id);
}

export async function saveAdvance(adv) {
  if (!adv.id) adv.id = 'adv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  if (!adv.date) adv.date = new Date().toISOString().slice(0, 10);
  await put(STORE, adv);
  return adv;
}

export async function deleteAdvance(id) {
  await remove(STORE, id);
}

/**
 * Delete all advances before the given date (for historical cleanup).
 * @param {string} beforeDate - YYYY-MM-DD (exclusive)
 * @returns {Promise<number>} count deleted
 */
export async function deleteAdvancesBefore(beforeDate) {
  return deleteWhere(STORE, (a) => a.date < beforeDate);
}
