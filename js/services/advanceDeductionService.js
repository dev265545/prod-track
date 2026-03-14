/**
 * ProdTrack Lite - Advance deductions (amount of advance to cut per 15-day period)
 * One record per employee per period: how much advance to deduct from that period's salary.
 */

import { getAll, put, STORES } from '../db/indexeddb.js';

const STORE = STORES.ADVANCE_DEDUCTIONS;

function deductionId(employeeId, periodFrom) {
  return `ded_${employeeId}_${periodFrom}`;
}

/**
 * Get all advance deductions for an employee (all periods).
 * @returns {Promise<Array<{ id, employeeId, periodFrom, periodTo, amount }>>}
 */
export async function getDeductionsByEmployee(employeeId) {
  const all = await getAll(STORE);
  return all.filter((d) => d.employeeId === employeeId);
}

/**
 * Get the advance deduction for one period (if any).
 * @returns {Promise<{ id, employeeId, periodFrom, periodTo, amount }|null>}
 */
export async function getDeductionForPeriod(employeeId, periodFrom, periodTo) {
  const all = await getDeductionsByEmployee(employeeId);
  return all.find((d) => d.periodFrom === periodFrom && d.periodTo === periodTo) ?? null;
}

/**
 * Save (upsert) advance deduction for a period.
 * @param {{ employeeId: string, periodFrom: string, periodTo: string, amount: number }}
 */
export async function saveDeduction({ employeeId, periodFrom, periodTo, amount }) {
  const id = deductionId(employeeId, periodFrom);
  const record = {
    id,
    employeeId,
    periodFrom,
    periodTo,
    amount: Number(amount) || 0,
  };
  await put(STORE, record);
  return record;
}
