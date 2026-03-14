import {
  getAll,
  get,
  put,
  remove,
  STORES,
  deleteWhere,
} from "@/lib/db/adapter";

const STORE = STORES.PRODUCTIONS;

export async function getProductions(): Promise<Record<string, unknown>[]> {
  return getAll(STORE);
}

export async function getProduction(
  id: string
): Promise<Record<string, unknown> | null> {
  return get(STORE, id);
}

export async function getProductionsByDate(
  date: string
): Promise<Record<string, unknown>[]> {
  const all = await getAll(STORE);
  return all.filter((p) => (p.date as string) === date);
}

export async function getProductionsByEmployee(
  employeeId: string,
  fromDate: string,
  toDate: string
): Promise<Record<string, unknown>[]> {
  const all = await getAll(STORE);
  return all.filter(
    (p) =>
      (p.employeeId as string) === employeeId &&
      (p.date as string) >= fromDate &&
      (p.date as string) <= toDate
  );
}

export async function getProductionsInRange(
  fromDate: string,
  toDate: string
): Promise<Record<string, unknown>[]> {
  const all = await getAll(STORE);
  return all.filter(
    (p) =>
      (p.date as string) >= fromDate && (p.date as string) <= toDate
  );
}

export async function getDailyAggregated(date: string): Promise<{
  totals: Record<string, number>;
  day: Record<string, number>;
  night: Record<string, number>;
}> {
  const list = await getProductionsByDate(date);
  const totals: Record<string, number> = {};
  const day: Record<string, number> = {};
  const night: Record<string, number> = {};
  list.forEach((p) => {
    const qty = (p.quantity as number) || 0;
    const shift = p.shift === "night" ? "night" : "day";
    const itemId = p.itemId as string;
    totals[itemId] = (totals[itemId] || 0) + qty;
    if (shift === "night") {
      night[itemId] = (night[itemId] || 0) + qty;
    } else {
      day[itemId] = (day[itemId] || 0) + qty;
    }
  });
  return { totals, day, night };
}

export async function saveProduction(
  prod: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!prod.id)
    prod.id =
      "prod_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  prod.shift = prod.shift === "night" ? "night" : "day";
  await put(STORE, prod);
  return prod;
}

export async function deleteProduction(id: string): Promise<void> {
  await remove(STORE, id);
}

export async function deleteProductionsBefore(
  beforeDate: string
): Promise<number> {
  return deleteWhere(
    STORE,
    (p) => (p.date as string) < beforeDate
  );
}
