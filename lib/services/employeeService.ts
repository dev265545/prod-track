import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import {
  getNextEmployeeSortOrder,
  sortEmployeesByCustomOrder,
} from "@/lib/utils/employeeOrder";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { nameOnRow, plural } from "./auditNames";

const STORE = STORES.EMPLOYEES;

/**
 * Employee fields a human would want explained. Deliberately excludes `id`,
 * `createdAt` and `sortOrder` — internal bookkeeping, not "changes".
 */
const EMPLOYEE_AUDIT_FIELDS = [
  "name",
  "designation",
  "monthlySalary",
  "shiftId",
  "sundayCategoryId",
  "employeeType",
  "employeeTypeConfirmed",
  "requiredPresentDays",
  "sundayMultiplier",
  "isActive",
] as const;

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

/**
 * Saves employee. Supports shiftId (string) and monthlySalary (number) for rate calculation.
 *
 * Employees may also carry the following optional fields (no dedicated interface exists;
 * employees are stored as `Record<string, unknown>` throughout the app):
 * - `employeeType?: "salaried" | "production" | "operator"` - classification used to drive
 *   type-specific salary/attendance logic. See `lib/services/employeeTypeMigration.ts` for
 *   the inference rule used to backfill this on existing employees.
 * - `employeeTypeConfirmed?: boolean` - true once a human has confirmed an inferred
 *   `employeeType`; false when it was auto-inferred and not yet reviewed.
 * - `requiredPresentDays?: number` - operator-only. Number of present days required for
 *   full pay in a period, default 26.
 * - `sundayMultiplier?: number` - operator-only. Pay multiplier applied for Sunday work,
 *   e.g. 1.2 or 1.5.
 */
/**
 * Write an employee without auditing it. For bulk paths (the employee-type
 * backfill) that write one summary entry with a count instead of one entry
 * per person.
 */
export async function saveEmployeeSilently(
  emp: Record<string, unknown>
): Promise<{ row: Record<string, unknown>; before: Record<string, unknown> | null }> {
  let before: Record<string, unknown> | null = null;
  if (!emp.id) {
    const existingEmployees = await getAll(STORE);
    emp.id =
      "emp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
    emp.createdAt = new Date().toISOString().slice(0, 10);
    if (emp.sortOrder === undefined) {
      emp.sortOrder = getNextEmployeeSortOrder(existingEmployees);
    }
  } else {
    before = await get(STORE, emp.id as string);
  }
  if (emp.isActive === undefined) emp.isActive = true;
  await put(STORE, emp);
  return { row: emp, before };
}

export async function saveEmployee(
  emp: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { row, before } = await saveEmployeeSilently(emp);
  const changes = diffEntity(before, row, EMPLOYEE_AUDIT_FIELDS);
  const who = nameOnRow(row, "An employee");
  const typeChanged = changes.some((c) => c.field === "employeeType");
  if (!before) {
    void auditRecord(
      AUDIT_ACTIONS.employeeCreate,
      "employees",
      row.id as string,
      `${who} was added to the employee list`,
      changes,
    );
  } else if (typeChanged) {
    void auditRecord(
      AUDIT_ACTIONS.employeeTypeChange,
      "employees",
      row.id as string,
      `${who} was changed to the ${row.employeeType} job type`,
      changes,
    );
  } else {
    void auditRecord(
      AUDIT_ACTIONS.employeeUpdate,
      "employees",
      row.id as string,
      `Details for ${who} were updated`,
      changes,
    );
  }
  return row;
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

  // One entry for the whole drag, never one per row that shifted.
  void auditRecord(
    AUDIT_ACTIONS.employeeReorder,
    "employees",
    null,
    `The employee list was reordered (${plural(orderedEmployeeIds.length, "person", "people")})`,
    { count: orderedEmployeeIds.length },
  );
}

export async function deleteEmployee(id: string): Promise<void> {
  const before = await get(STORE, id);
  await remove(STORE, id);
  void auditRecord(
    AUDIT_ACTIONS.employeeDelete,
    "employees",
    id,
    `${nameOnRow(before, "An employee")} was removed from the employee list`,
    diffEntity(before, null, EMPLOYEE_AUDIT_FIELDS),
  );
}
