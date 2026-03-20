import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";

const STORE = STORES.EMPLOYEES;

export async function getEmployees(
  activeOnly = false
): Promise<Record<string, unknown>[]> {
  const list = await getAll(STORE);
  if (activeOnly) return list.filter((e) => e.isActive !== false);
  return list;
}

export async function getEmployee(
  id: string
): Promise<Record<string, unknown> | null> {
  return get(STORE, id);
}

/** Saves employee. Supports shiftId (string) and monthlySalary (number) for rate calculation. */
export async function saveEmployee(
  emp: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!emp.id) {
    emp.id =
      "emp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
    emp.createdAt = new Date().toISOString().slice(0, 10);
  }
  if (emp.isActive === undefined) emp.isActive = true;
  await put(STORE, emp);
  return emp;
}

export async function deleteEmployee(id: string): Promise<void> {
  await remove(STORE, id);
}
