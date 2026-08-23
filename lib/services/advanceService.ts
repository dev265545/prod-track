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
import { employeeName } from "./auditNames";

const STORE = STORES.ADVANCES;

export async function getAdvances(): Promise<Record<string, unknown>[]> {
  return getAll(STORE);
}

export async function getAdvancesByEmployee(
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

export async function getAdvance(
  id: string
): Promise<Record<string, unknown> | null> {
  return get(STORE, id);
}

/** Fields of an advance worth showing a human. */
const ADVANCE_AUDIT_FIELDS = ["date", "amount", "note"] as const;

export async function saveAdvance(
  adv: Record<string, unknown>
): Promise<Record<string, unknown>> {
  let before: Record<string, unknown> | null = null;
  if (!adv.id)
    adv.id =
      "adv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  else before = await get(STORE, adv.id as string);
  if (!adv.date) adv.date = new Date().toISOString().slice(0, 10);
  await put(STORE, adv);
  void logAdvanceSave(before, adv);
  return adv;
}

async function logAdvanceSave(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Promise<void> {
  const who = await employeeName(after.employeeId as string);
  void auditRecord(
    before ? AUDIT_ACTIONS.advanceUpdate : AUDIT_ACTIONS.advanceCreate,
    "advances",
    after.id as string,
    before
      ? `Advance for ${who} on ${after.date} was changed to ${after.amount}`
      : `${who} was given an advance of ${after.amount} on ${after.date}`,
    diffEntity(before, after, ADVANCE_AUDIT_FIELDS),
  );
}

export async function deleteAdvance(id: string): Promise<void> {
  const before = await get(STORE, id);
  await remove(STORE, id);
  void logAdvanceDelete(before, id);
}

async function logAdvanceDelete(
  before: Record<string, unknown> | null,
  id: string,
): Promise<void> {
  const who = await employeeName(before?.employeeId as string | undefined);
  const amount = before?.amount;
  void auditRecord(
    AUDIT_ACTIONS.advanceDelete,
    "advances",
    id,
    amount === undefined
      ? `An advance for ${who} was deleted`
      : `Advance of ${amount} for ${who} was deleted`,
    diffEntity(before, null, ADVANCE_AUDIT_FIELDS),
  );
}

/**
 * Bulk delete for the Settings cleanup tool. Unaudited on purpose — see the
 * matching note on `deleteProductionsBefore`; the cleanup card writes one
 * `data.purge` entry covering both calls.
 */
export async function deleteAdvancesBefore(
  beforeDate: string
): Promise<number> {
  return deleteWhere(STORE, (a) => (a.date as string) < beforeDate);
}
