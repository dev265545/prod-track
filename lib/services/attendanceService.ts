import { getByIndex, put, remove, STORES } from "@/lib/db/adapter";

const STORE = STORES.ATTENDANCE;

/**
 * The record that counts for one employee on one date.
 *
 * `saveAttendance` upserts, so there should only ever be one — but databases
 * written before that guarantee can still hold duplicates. When they do, the
 * **last** row wins, matching how `salarySheetService` folds attendance into a
 * `Map` keyed by employee+date (later entries overwrite earlier ones). Both
 * readers must agree, or a corrected day would display one way and be paid
 * another.
 */
export async function getAttendanceByEmployeeAndDate(
  employeeId: string,
  date: string
): Promise<Record<string, unknown> | null> {
  const matches = await getByIndex(
    STORE,
    "employee_date",
    [employeeId, date],
    [employeeId, date]
  );
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

export async function getAttendanceByEmployeeInRange(
  employeeId: string,
  fromDate: string,
  toDate: string
): Promise<Record<string, unknown>[]> {
  return getByIndex(
    STORE,
    "employee_date",
    [employeeId, fromDate],
    [employeeId, toDate]
  );
}

export async function getAllAttendanceByDate(
  date: string
): Promise<Record<string, unknown>[]> {
  return getByIndex(STORE, "by_date", date, date);
}

export async function getAttendanceInRange(
  fromDate: string,
  toDate: string
): Promise<Record<string, unknown>[]> {
  return getByIndex(STORE, "by_date", fromDate, toDate);
}

/**
 * Upsert one day's attendance. `(employeeId, date)` is the real identity of an
 * attendance row: marking the same day twice must replace the entry, not add a
 * second one. Without this, re-marking a day left two rows and the payroll
 * total depended on which one a given reader happened to pick.
 *
 * An explicit `record.id` still wins, so callers editing a known row keep it.
 */
export async function saveAttendance(
  record: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!record.id) {
    const existing = await getAttendanceByEmployeeAndDate(
      record.employeeId as string,
      record.date as string
    );
    record.id =
      (existing?.id as string | undefined) ??
      "att_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }
  await put(STORE, record);
  return record;
}

export async function deleteAttendance(id: string): Promise<void> {
  await remove(STORE, id);
}
