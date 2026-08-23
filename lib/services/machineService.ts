import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { nameOnRow } from "./auditNames";

export interface Machine {
  id: string;
  name: string;
  cavities: number; // pieces produced per stroke
  cycleTimeSeconds: number; // seconds per stroke, default 1.0
}

/**
 * What is wrong with a machine record, if anything. Both numbers must be a
 * real, positive number for the machine to be able to make anything at all:
 * zero pieces per shot means it never yields a piece, and zero seconds per
 * shot means a shot takes no time, which no machine does.
 */
export type MachineProblem = "cavities" | "cycleTime";

function isUsableNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * The single answer to "can this machine run?", used by the save guard, the
 * runtime maths and the screen alike so they can never disagree.
 *
 * Deliberately takes a loose shape: it is run against rows read back from the
 * database, which pre-date the save guard and may hold anything.
 */
export function findMachineProblems(
  machine: { cavities?: unknown; cycleTimeSeconds?: unknown } | null | undefined,
): MachineProblem[] {
  const problems: MachineProblem[] = [];
  if (!machine) return problems;
  if (!isUsableNumber(machine.cavities)) problems.push("cavities");
  if (!isUsableNumber(machine.cycleTimeSeconds)) problems.push("cycleTime");
  return problems;
}

/** True when the machine's two numbers can actually produce a run time. */
export function isMachineUsable(
  machine: { cavities?: unknown; cycleTimeSeconds?: unknown } | null | undefined,
): boolean {
  return findMachineProblems(machine).length === 0;
}

/**
 * Thrown by `saveMachine` for a record that could never run. Carries the
 * problems so the caller can name them to the operator rather than showing a
 * generic failure.
 */
export class MachineValidationError extends Error {
  readonly problems: MachineProblem[];
  constructor(problems: MachineProblem[]) {
    super(`Machine cannot run: ${problems.join(", ")}`);
    this.name = "MachineValidationError";
    this.problems = problems;
  }
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
  // A machine that cannot run must not reach the store: every reader of it
  // would have to invent a number, and the calculator's "0s" reads as the
  // fastest machine on the floor rather than a broken record.
  const problems = findMachineProblems(machine);
  if (problems.length > 0) throw new MachineValidationError(problems);
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
