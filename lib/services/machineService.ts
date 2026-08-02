import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { nameOnRow } from "./auditNames";

export interface Machine {
  id: string;
  name: string;
  cavities: number; // pieces produced per stroke
  cycleTimeSeconds: number; // seconds per stroke, default 1.0
}

const STORE = STORES.MACHINES;

export async function getMachines(): Promise<Machine[]> {
  return getAll(STORE) as unknown as Promise<Machine[]>;
}

export async function getMachine(id: string): Promise<Machine | null> {
  return get(STORE, id) as unknown as Promise<Machine | null>;
}

const MACHINE_AUDIT_FIELDS = ["name", "cavities", "cycleTimeSeconds"] as const;

export async function saveMachine(
  machine: Record<string, unknown>
): Promise<Machine> {
  let before: Record<string, unknown> | null = null;
  if (machine.id) before = await get(STORE, machine.id as string);
  if (!machine.id) {
    machine.id =
      "machine_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
    if (machine.cycleTimeSeconds === undefined) {
      machine.cycleTimeSeconds = 1.0;
    }
  }
  await put(STORE, machine);
  void auditRecord(
    before ? AUDIT_ACTIONS.machineUpdate : AUDIT_ACTIONS.machineCreate,
    "machines",
    machine.id as string,
    before
      ? `Machine ${nameOnRow(machine, "with no name")} was updated`
      : `Machine ${nameOnRow(machine, "with no name")} was added`,
    diffEntity(before, machine, MACHINE_AUDIT_FIELDS),
  );
  return machine as unknown as Machine;
}

export async function deleteMachine(id: string): Promise<void> {
  const before = await get(STORE, id);
  await remove(STORE, id);
  void auditRecord(
    AUDIT_ACTIONS.machineDelete,
    "machines",
    id,
    `Machine ${nameOnRow(before, "with no name")} was deleted`,
    diffEntity(before, null, MACHINE_AUDIT_FIELDS),
  );
}
