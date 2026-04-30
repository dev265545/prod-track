import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import {
  getNextEmployeeSortOrder,
  sortEmployeesByCustomOrder,
} from "@/lib/utils/employeeOrder";

const STORE = STORES.EMPLOYEES;

export async function getEmployees(
  activeOnly = false
): Promise<Record<string, unknown>[]> {
  const list = await getAll(STORE);
  const sorted = sortEmployeesByCustomOrder(list);
  if (activeOnly) return sorted.filter((e) => e.isActive !== false);
  return sorted;
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
    const existingEmployees = await getAll(STORE);
    emp.id =
      "emp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
    emp.createdAt = new Date().toISOString().slice(0, 10);
    if (emp.sortOrder === undefined) {
      emp.sortOrder = getNextEmployeeSortOrder(existingEmployees);
    }
  }
  if (emp.isActive === undefined) emp.isActive = true;
  await put(STORE, emp);
  return emp;
}

export async function saveEmployeeSortOrder(
  orderedEmployeeIds: string[],
): Promise<void> {
  const employees = await getAll(STORE);
  const employeeMap = new Map(
    employees.map((employee) => [employee.id as string, employee]),
  );

  await Promise.all(
    orderedEmployeeIds.map(async (employeeId, index) => {
      const employee = employeeMap.get(employeeId);
      if (!employee) return;
      await put(STORE, {
        ...employee,
        sortOrder: index,
      });
    }),
  );
}

export async function deleteEmployee(id: string): Promise<void> {
  await remove(STORE, id);
}
