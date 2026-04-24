import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";

const STORE = STORES.FACTORY_HOLIDAYS;

export async function getAllHolidays(): Promise<Record<string, unknown>[]> {
  return getAll(STORE);
}

export async function getHolidayByDate(
  date: string
): Promise<Record<string, unknown> | null> {
  const all = await getAll(STORE);
  return all.find((h) => (h.date as string) === date) ?? null;
}

export async function getHolidaysInRange(
  fromDate: string,
  toDate: string
): Promise<Record<string, unknown>[]> {
  const all = await getAll(STORE);
  return all.filter(
    (h) =>
      (h.date as string) >= fromDate && (h.date as string) <= toDate
  );
}

export async function saveHoliday(
  holiday: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!holiday.id) {
    holiday.id =
      "hol_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }
  await put(STORE, holiday);
  return holiday;
}

export async function deleteHoliday(id: string): Promise<void> {
  await remove(STORE, id);
}
