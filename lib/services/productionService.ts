import {
  getAll,
  get,
  getByIndex,
  put,
  remove,
  STORES,
  deleteWhere,
} from "@/lib/db/adapter";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { employeeName, itemName } from "./auditNames";

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
  return getByIndex(STORE, "by_date", date, date);
}

export async function getProductionsByEmployee(
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

export async function getProductionsInRange(
  fromDate: string,
  toDate: string
): Promise<Record<string, unknown>[]> {
  return getByIndex(STORE, "by_date", fromDate, toDate);
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

/** Fields of a production row worth showing a human. */
const PRODUCTION_AUDIT_FIELDS = [
  "date",
  "shift",
  "quantity",
  "note",
] as const;

/**
 * Write a production row without auditing it.
 *
 * For callers that describe the whole operator action themselves —
 * `productionEntryService` writes one "X made 400 lids" entry covering this
 * row plus the stock it moved, and logging here too would double it.
 */
export async function saveProductionSilently(
  prod: Record<string, unknown>
): Promise<{ row: Record<string, unknown>; before: Record<string, unknown> | null }> {
  let before: Record<string, unknown> | null = null;
  if (!prod.id)
    prod.id =
      "prod_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  else before = await get(STORE, prod.id as string);
  prod.shift = prod.shift === "night" ? "night" : "day";
  await put(STORE, prod);
  return { row: prod, before };
}

export async function saveProduction(
  prod: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { row, before } = await saveProductionSilently(prod);
  void logProductionSave(before, row);
  return row;
}

async function logProductionSave(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Promise<void> {
  const [who, what] = await Promise.all([
    employeeName(after.employeeId as string),
    itemName(after.itemId as string),
  ]);
  void auditRecord(
    before ? AUDIT_ACTIONS.productionUpdate : AUDIT_ACTIONS.productionCreate,
    "productions",
    after.id as string,
    `${who} made ${after.quantity} of ${what} on ${after.date} (${after.shift} shift)`,
    diffEntity(before, after, PRODUCTION_AUDIT_FIELDS),
  );
}

export async function deleteProduction(id: string): Promise<void> {
  const before = await get(STORE, id);
  await remove(STORE, id);
  void logProductionDelete(before, id);
}

async function logProductionDelete(
  before: Record<string, unknown> | null,
  id: string,
): Promise<void> {
  const [who, what] = await Promise.all([
    employeeName(before?.employeeId as string | undefined),
    itemName(before?.itemId as string | undefined),
  ]);
  void auditRecord(
    AUDIT_ACTIONS.productionDelete,
    "productions",
    id,
    `Work entry for ${who} on ${what} was deleted`,
    diffEntity(before, null, PRODUCTION_AUDIT_FIELDS),
  );
}

/**
 * Bulk delete for the Settings cleanup tool.
 *
 * Deliberately unaudited: only the cleanup card knows the cutoff the owner
 * chose, which categories were ticked and the counts shown before confirming,
 * so it writes the single `data.purge` entry that covers this call and the
 * advances one together. A second entry here would say less and double-count.
 */
export async function deleteProductionsBefore(
  beforeDate: string
): Promise<number> {
  return deleteWhere(
    STORE,
    (p) => (p.date as string) < beforeDate
  );
}
