import { getEmployees, saveEmployee } from "./employeeService";
import { getProductionsByEmployee } from "./productionService";

export type EmployeeType = "salaried" | "production" | "operator";

/**
 * Infers an employee's type from the data available for them.
 *
 * Rule (per product decision):
 * - has a monthly salary -> always "salaried" (wins even if production records also exist,
 *   i.e. the ambiguous "has both" case defaults to Salaried).
 * - no monthly salary but has production records -> "production".
 * - neither signal present -> "salaried" (ambiguous default).
 */
export function inferEmployeeType(input: {
  hasMonthlySalary: boolean;
  hasProductionRecords: boolean;
}): EmployeeType {
  if (input.hasMonthlySalary) return "salaried";
  if (input.hasProductionRecords) return "production";
  return "salaried";
}

/**
 * Gives every untyped employee a *guessed* type so the salary sheet stops
 * silently treating them as salaried.
 *
 * The guess is never a confirmation: `employeeTypeConfirmed` is always written
 * as `false`, so the dashboard keeps asking a human to review it. Only an
 * explicit human action (employees page, or the dashboard review dialog) sets
 * `employeeTypeConfirmed: true`.
 *
 * Safe to call repeatedly — employees that already have a type, or that a human
 * already confirmed, are skipped.
 */
export async function backfillEmployeeTypes(): Promise<{ updated: string[] }> {
  const employees = await getEmployees();
  const updated: string[] = [];

  for (const emp of employees) {
    // Idempotent: anything already typed, or already signed off by a human,
    // is left exactly as-is so this is safe to run on every dashboard load.
    if (emp.employeeType) continue;
    if (emp.employeeTypeConfirmed === true) continue;

    const hasMonthlySalary =
      typeof emp.monthlySalary === "number" && emp.monthlySalary > 0;

    const productions = await getProductionsByEmployee(
      emp.id as string,
      "0000-01-01",
      "9999-12-31"
    );
    const hasProductionRecords = productions.length > 0;

    const employeeType = inferEmployeeType({
      hasMonthlySalary,
      hasProductionRecords,
    });

    await saveEmployee({
      ...emp,
      employeeType,
      employeeTypeConfirmed: false,
    });

    updated.push(emp.id as string);
  }

  return { updated };
}
