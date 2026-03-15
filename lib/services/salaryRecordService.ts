import { getAll, put, STORES } from "@/lib/db/adapter";

const STORE = STORES.SALARY_RECORDS;

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

export async function saveSalaryRecord(
  record: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!record.id)
    record.id =
      "sal_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  await put(STORE, record);
  return record;
}

export async function saveSalaryRecords(
  records: Record<string, unknown>[],
): Promise<void> {
  for (const record of records) {
    await saveSalaryRecord(record);
  }
}
