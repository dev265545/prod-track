import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { nameOnRow } from "./auditNames";

export interface OperatorHoliday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
}

const STORE = STORES.OPERATOR_NATIONAL_HOLIDAYS;

const OPERATOR_HOLIDAY_AUDIT_FIELDS = ["name", "date"] as const;

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
  const before = holiday.id ? await get(STORE, String(holiday.id)) : null;
  if (!holiday.id) {
    holiday.id =
      "op_hol_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }
  await put(STORE, holiday);
  void auditRecord(
    AUDIT_ACTIONS.holidayCreate,
    "operator_national_holidays",
    holiday.id as string,
    `Operator holiday ${nameOnRow(holiday, "with no name")} was set for ${holiday.date}`,
    diffEntity(before, holiday, OPERATOR_HOLIDAY_AUDIT_FIELDS),
  );
  return holiday as unknown as OperatorHoliday;
}

export async function deleteOperatorHoliday(id: string): Promise<void> {
  const before = await get(STORE, id);
  await remove(STORE, id);
  void auditRecord(
    AUDIT_ACTIONS.holidayDelete,
    "operator_national_holidays",
    id,
    `Operator holiday ${nameOnRow(before, "with no name")} on ${before?.date ?? "an unknown date"} was removed`,
    diffEntity(before, null, OPERATOR_HOLIDAY_AUDIT_FIELDS),
  );
}
