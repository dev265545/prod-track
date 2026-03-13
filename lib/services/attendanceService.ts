import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";

const STORE = STORES.ATTENDANCE;

export async function getAttendanceByEmployeeAndDate(
  employeeId: string,
  date: string
): Promise<Record<string, unknown> | null> {
  const all = await getAll(STORE);
  return (
    all.find(
      (a) =>
        (a.employeeId as string) === employeeId && (a.date as string) === date
    ) ?? null
  );
}

export async function getAttendanceByEmployeeInRange(
  employeeId: string,
  fromDate: string,
  toDate: string
): Promise<Record<string, unknown>[]> {
  const all = await getAll(STORE);
  return all.filter(
    (a) =>
      (a.employeeId as string) === employeeId &&
      (a.date as string) >= fromDate &&
      (a.date as string) <= toDate
  );
}

export async function getAllAttendanceByDate(
  date: string
): Promise<Record<string, unknown>[]> {
  const all = await getAll(STORE);
  return all.filter((a) => (a.date as string) === date);
}

export async function saveAttendance(
  record: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!record.id) {
    record.id =
      "att_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }
  await put(STORE, record);
  return record;
}

export async function deleteAttendance(id: string): Promise<void> {
  await remove(STORE, id);
}
