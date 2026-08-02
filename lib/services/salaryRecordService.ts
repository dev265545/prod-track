import { getAll, get, put, STORES } from "@/lib/db/adapter";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { plural } from "./auditNames";

const STORE = STORES.SALARY_RECORDS;

const SALARY_RECORD_AUDIT_FIELDS = [
  "month",
  "salary",
  "dailyWage",
  "totalDaysWorking",
  "paidSundays",
  "holidays",
  "advancePaid",
  "amount",
] as const;

export interface SalaryRecord {
  id: string;
  empName: string;
  designation?: string;
  month: string;
  shiftType: string;
  shiftId?: string;
  salary: number;
  dailyWage: number;
  ratePerHour: number;
  totalDaysWorking: number;
  paidSundays: number;
  holidays: number;
  advancePaid: number;
  amount: number;
  employeeId?: string;
}

export async function getSalaryRecords(): Promise<Record<string, unknown>[]> {
  return getAll(STORE);
}

export async function getSalaryRecordsByEmployee(
  employeeId: string,
): Promise<Record<string, unknown>[]> {
  const all = await getAll(STORE);
  return all.filter((r) => (r.employeeId as string) === employeeId);
}

export async function getSalaryRecordsByEmpNameAndMonth(
  empName: string,
  month: string,
): Promise<Record<string, unknown>[]> {
  const all = await getAll(STORE);
  return all.filter(
    (r) => (r.empName as string) === empName && (r.month as string) === month,
  );
}

/** Write one salary record without auditing it — see `saveSalaryRecords`. */
async function putSalaryRecord(
  record: Record<string, unknown>,
): Promise<{ row: Record<string, unknown>; before: Record<string, unknown> | null }> {
  let before: Record<string, unknown> | null = null;
  if (!record.id)
    record.id =
      "sal_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  else before = await get(STORE, record.id as string);
  await put(STORE, record);
  return { row: record, before };
}

export async function saveSalaryRecord(
  record: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { row, before } = await putSalaryRecord(record);
  void auditRecord(
    AUDIT_ACTIONS.salaryRecordSave,
    "salary_records",
    row.id as string,
    `Salary for ${row.empName ?? "an employee"} for ${row.month} was saved as ${row.amount}`,
    diffEntity(before, row, SALARY_RECORD_AUDIT_FIELDS),
  );
  return row;
}

/**
 * Saving a whole month at once. One entry with the count, never one per
 * employee — a 60-person factory would otherwise bury every other action in
 * the log every time payroll is finalised.
 */
export async function saveSalaryRecords(
  records: Record<string, unknown>[],
): Promise<void> {
  for (const record of records) {
    await putSalaryRecord(record);
  }
  if (records.length === 0) return;
  const month = records[0]?.month;
  void auditRecord(
    AUDIT_ACTIONS.salaryRecordSave,
    "salary_records",
    null,
    `Salary was saved for ${plural(records.length, "employee", "employees")} for ${month}`,
    { count: records.length, month },
  );
}
