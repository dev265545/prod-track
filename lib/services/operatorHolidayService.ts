import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";

export interface OperatorHoliday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
}

const STORE = STORES.OPERATOR_NATIONAL_HOLIDAYS;

export async function getAllOperatorHolidays(): Promise<OperatorHoliday[]> {
  return getAll(STORE) as unknown as Promise<OperatorHoliday[]>;
}

export async function getOperatorHolidayByDate(
  date: string
): Promise<OperatorHoliday | null> {
  const all = await getAllOperatorHolidays();
  return all.find((h) => h.date === date) ?? null;
}

export async function getOperatorHolidaysInRange(
  fromDate: string,
  toDate: string
): Promise<OperatorHoliday[]> {
  const all = await getAllOperatorHolidays();
  return all.filter((h) => h.date >= fromDate && h.date <= toDate);
}

export async function saveOperatorHoliday(
  holiday: Record<string, unknown>
): Promise<OperatorHoliday> {
  if (!holiday.id) {
    holiday.id =
      "op_hol_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }
  await put(STORE, holiday);
  return holiday as unknown as OperatorHoliday;
}

export async function deleteOperatorHoliday(id: string): Promise<void> {
  await remove(STORE, id);
}
