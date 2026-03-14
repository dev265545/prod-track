/**
 * ProdTrack Lite - Employees CRUD
 */

import { getAll, get, put, remove, STORES } from '../db/indexeddb.js';

const STORE = STORES.EMPLOYEES;

export async function getEmployees(activeOnly = false) {
  const list = await getAll(STORE);
  if (activeOnly) return list.filter((e) => e.isActive !== false);
  return list;
}

export async function getEmployee(id) {
  return get(STORE, id);
}

export async function saveEmployee(emp) {
  if (!emp.id) emp.id = 'emp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  if (emp.isActive === undefined) emp.isActive = true;
  await put(STORE, emp);
  return emp;
}

export async function deleteEmployee(id) {
  await remove(STORE, id);
}
