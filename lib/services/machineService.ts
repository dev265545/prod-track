import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";

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

export async function saveMachine(
  machine: Record<string, unknown>
): Promise<Machine> {
  if (!machine.id) {
    machine.id =
      "machine_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
    if (machine.cycleTimeSeconds === undefined) {
      machine.cycleTimeSeconds = 1.0;
    }
  }
  await put(STORE, machine);
  return machine as unknown as Machine;
}

export async function deleteMachine(id: string): Promise<void> {
  await remove(STORE, id);
}
