import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { nameOnRow } from "./auditNames";

const STORE = STORES.SHIFTS;

const SHIFT_AUDIT_FIELDS = [
  "name",
  "startTime",
  "endTime",
  "hoursPerDay",
] as const;

export async function getShifts(): Promise<Record<string, unknown>[]> {
  return getAll(STORE);
}

export async function getShift(
  id: string
): Promise<Record<string, unknown> | null> {
  return get(STORE, id);
}

export async function saveShift(
  shift: Record<string, unknown>
): Promise<Record<string, unknown>> {
  let before: Record<string, unknown> | null = null;
  if (!shift.id)
    shift.id =
      "shift_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  else before = await get(STORE, shift.id as string);
  await put(STORE, shift);
  void auditRecord(
    before ? AUDIT_ACTIONS.shiftUpdate : AUDIT_ACTIONS.shiftCreate,
    "shifts",
    shift.id as string,
    before
      ? `Timing ${nameOnRow(shift, "with no name")} was changed`
      : `Timing ${nameOnRow(shift, "with no name")} was created`,
    diffEntity(before, shift, SHIFT_AUDIT_FIELDS),
  );
  return shift;
}

export async function deleteShift(id: string): Promise<void> {
  const before = await get(STORE, id);
  await remove(STORE, id);
  void auditRecord(
    AUDIT_ACTIONS.shiftDelete,
    "shifts",
    id,
    `Timing ${nameOnRow(before, "with no name")} was deleted`,
    diffEntity(before, null, SHIFT_AUDIT_FIELDS),
  );
}
