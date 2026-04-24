import {
  getAll,
  get,
  put,
  remove,
  STORES,
  deleteWhere,
} from "@/lib/db/adapter";

const STORE = STORES.ADVANCES;

export async function getAdvances(): Promise<Record<string, unknown>[]> {
  return getAll(STORE);
}

export async function getAdvancesByEmployee(
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

export async function getAdvance(
  id: string
): Promise<Record<string, unknown> | null> {
  return get(STORE, id);
}

export async function saveAdvance(
  adv: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!adv.id)
    adv.id =
      "adv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  if (!adv.date) adv.date = new Date().toISOString().slice(0, 10);
  await put(STORE, adv);
  return adv;
}

export async function deleteAdvance(id: string): Promise<void> {
  await remove(STORE, id);
}

export async function deleteAdvancesBefore(
  beforeDate: string
): Promise<number> {
  return deleteWhere(STORE, (a) => (a.date as string) < beforeDate);
}
