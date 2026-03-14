import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";

const STORE = STORES.SHIFTS;

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
  if (!shift.id)
    shift.id =
      "shift_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  await put(STORE, shift);
  return shift;
}

export async function deleteShift(id: string): Promise<void> {
  await remove(STORE, id);
}
