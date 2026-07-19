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

export async function backfillEmployeeTypes(): Promise<{ updated: string[] }> {
  const employees = await getEmployees();
  const updated: string[] = [];

  for (const emp of employees) {
    if (emp.employeeType) continue;

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
