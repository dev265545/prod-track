import { getByIndex, get, put, remove, STORES } from "@/lib/db/adapter";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { employeeName } from "./auditNames";

const STORE = STORES.ATTENDANCE;

/** Fields of an attendance row a human would care to see change. */
const ATTENDANCE_AUDIT_FIELDS = [
  "status",
  "date",
  "hoursExtra",
  "hoursReduced",
  "note",
] as const;

function attendanceStatusPhrase(row: Record<string, unknown>): string {
  const status = typeof row.status === "string" ? row.status : "";
  if (status === "present") return "marked present";
  if (status === "absent") return "marked absent";
  if (status) return `marked ${status}`;
  return "updated";
}

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
  let before: Record<string, unknown> | null;
  if (!record.id) {
    const existing = await getAttendanceByEmployeeAndDate(
      record.employeeId as string,
      record.date as string
    );
    record.id =
      (existing?.id as string | undefined) ??
      "att_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
    before = existing ?? null;
  } else {
    before = await get(STORE, record.id as string);
  }
  await put(STORE, record);
  void logAttendanceSave(before, record);
  return record;
}

async function logAttendanceSave(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Promise<void> {
  const who = await employeeName(after.employeeId as string);
  void auditRecord(
    before ? AUDIT_ACTIONS.attendanceUpdate : AUDIT_ACTIONS.attendanceMark,
    "attendance",
    after.id as string,
    `${who} was ${attendanceStatusPhrase(after)} on ${after.date}`,
    diffEntity(before, after, ATTENDANCE_AUDIT_FIELDS),
  );
}

export async function deleteAttendance(id: string): Promise<void> {
  const before = await get(STORE, id);
  await remove(STORE, id);
  void logAttendanceDelete(before, id);
}

async function logAttendanceDelete(
  before: Record<string, unknown> | null,
  id: string,
): Promise<void> {
  const who = await employeeName(before?.employeeId as string | undefined);
  const when = before?.date ? ` on ${before.date}` : "";
  void auditRecord(
    AUDIT_ACTIONS.attendanceClear,
    "attendance",
    id,
    `Attendance for ${who}${when} was removed`,
    diffEntity(before, null, ATTENDANCE_AUDIT_FIELDS),
  );
}
