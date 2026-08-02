import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { nameOnRow } from "./auditNames";

const STORE = STORES.FACTORY_HOLIDAYS;

const HOLIDAY_AUDIT_FIELDS = ["name", "date"] as const;

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
  const existingId = holiday.id ? String(holiday.id) : null;
  if (!holiday.id) {
    holiday.id =
      "hol_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }
  const before = existingId ? await get(STORE, existingId) : null;
  await put(STORE, holiday);
  void auditRecord(
    // The catalogue has no "holiday update": a holiday is a date being
    // declared, and re-declaring it is the same statement made again.
    AUDIT_ACTIONS.holidayCreate,
    "factory_holidays",
    holiday.id as string,
    `Factory holiday ${nameOnRow(holiday, "with no name")} was set for ${holiday.date}`,
    diffEntity(before, holiday, HOLIDAY_AUDIT_FIELDS),
  );
  return holiday;
}

export async function deleteHoliday(id: string): Promise<void> {
  const before = await get(STORE, id);
  await remove(STORE, id);
  void auditRecord(
    AUDIT_ACTIONS.holidayDelete,
    "factory_holidays",
    id,
    `Factory holiday ${nameOnRow(before, "with no name")} on ${before?.date ?? "an unknown date"} was removed`,
    diffEntity(before, null, HOLIDAY_AUDIT_FIELDS),
  );
}
