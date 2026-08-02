/**
 * Pure maths behind the "how long to run a machine" tool.
 *
 * All of this used to live inline in `app/machine/page.tsx` — inside `useMemo`
 * bodies and JSX expressions — where nothing could reach it. The service layer
 * (`itemComboService`) owns the per-combo arithmetic; this module owns the
 * screen-level arithmetic on top of it: picking the item to make, turning a
 * target quantity plus a machine-per-item assignment into rows, adding those
 * rows up, and formatting seconds for a person to read.
 *
 * Nothing here touches the database or React, so it is all unit-testable.
 */

import {
  calculateComponentNeedsForTarget,
  calculateMachineRuntimeSeconds,
  calculateTopUpPlan,
  findBottleneckItemId,
  type ItemCombo,
} from "@/lib/services/itemComboService";
import {
  findMachineProblems,
  type Machine,
  type MachineProblem,
} from "@/lib/services/machineService";

/** The two lookups the machine screen builds off the raw item rows. */
export interface ItemLookups {
  /** Stock by item id — what the combo maths reads. */
  itemsById: Record<string, { stock?: number }>;
  /** Display name by item id — what the operator reads. */
  itemNameById: Record<string, string>;
}

export function buildItemLookups(
  items: Record<string, unknown>[],
): ItemLookups {
  const itemsById: Record<string, { stock?: number }> = {};
  const itemNameById: Record<string, string> = {};
  for (const item of items) {
    const id = item.id as string;
    itemsById[id] = item as { stock?: number };
    itemNameById[id] = item.name as string;
  }
  return { itemsById, itemNameById };
}

/**
 * Seconds as a workshop would say them: under a minute keeps one decimal
 * (a cycle can genuinely be 4.5s), a minute or more rounds to whole seconds.
 */
export function formatRunDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) {
    const rounded = Math.round(seconds * 10) / 10;
    return `${rounded}s`;
  }
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}m ${secs}s`;
}

export interface TopUpView {
  /** Item the tool decided to make — the scarcest one in the set right now. */
  producedItemId: string;
  /** False when the set has fewer than two usable components. */
  inCombo: boolean;
  /** The item that runs short first among the *others*. */
  shortestItemId: string;
  /** Whole sets the shortest item is enough for. */
  shortestItemSets: number;
  /** Whole sets the produced item is currently enough for. */
  producedItemSets: number;
  /** Pieces to make, always a whole piece. */
  neededPieces: number;
  /** null when the chosen machine cannot run — never 0, which reads as instant. */
  runtimeSeconds: number | null;
  /** Empty when the machine is fine; otherwise what the operator must fill in. */
  machineProblems: MachineProblem[];
  /** Whole sets available once the run is done. */
  setsAfterRun: number;
  /** Nothing to do: stock is already level. */
  alreadyEnough: boolean;
}

/**
 * Resolve the "top up" tab for one set + one machine. Returns null when the
 * operator has not picked both yet.
 */
export function resolveTopUpView(
  combo: ItemCombo | null,
  machine: Machine | null,
  itemsById: Record<string, { stock?: number }>,
): TopUpView | null {
  if (!combo || !machine) return null;
  const producedItemId = findBottleneckItemId(combo, itemsById);
  if (!producedItemId) return null;
  const plan = calculateTopUpPlan(combo, itemsById, producedItemId, {
    cavities: machine.cavities,
    cycleTimeSeconds: machine.cycleTimeSeconds,
  });
  return {
    producedItemId,
    inCombo: plan.inCombo,
    shortestItemId: plan.bottleneckItemId,
    shortestItemSets: Math.floor(plan.bottleneckUnits),
    producedItemSets: Math.floor(plan.producedUnitsPossible),
    neededPieces: Math.ceil(plan.neededPieces),
    runtimeSeconds: plan.runtimeSeconds,
    machineProblems: plan.machineProblems,
    setsAfterRun: Math.floor(plan.resultingComboUnits),
    alreadyEnough: plan.neededPieces <= 0,
  };
}

export interface TargetRow {
  itemId: string;
  /** Pieces of this item per one finished set. */
  ratio: number;
  currentStock: number;
  /** Pieces still to make, rounded up to a whole piece. */
  neededPieces: number;
  /** "" when no machine has been picked for this row. */
  machineId: string;
  /**
   * null when no machine has been picked for this row, *or* when the machine
   * picked cannot run. `machineProblems` tells the two apart.
   */
  runtimeSeconds: number | null;
  /**
   * Empty when no machine is picked or the machine is fine; otherwise what
   * that machine needs filled in before it can be planned with.
   */
  machineProblems: MachineProblem[];
}

export interface TargetPlan {
  rows: TargetRow[];
  /**
   * Longest single machine's total. Different machines run at the same time,
   * so the wait is the busiest machine, not the sum of all of them; a machine
   * picked for two rows does those two runs one after the other.
   */
  totalSeconds: number;
  /** At least one row has a machine, so a total can be shown. */
  hasAssignments: boolean;
  /**
   * A row still needing pieces has no *usable* machine — none picked, one that
   * no longer exists, or one that cannot run — so the total is understated.
   */
  missingAssignment: boolean;
}

/** The machines in a plan that were picked but cannot run, worst problem first. */
export function unusableMachinesInPlan(
  plan: TargetPlan,
  machines: Machine[],
): Array<{ machineId: string; name: string; problems: MachineProblem[] }> {
  const seen = new Set<string>();
  const out: Array<{
    machineId: string;
    name: string;
    problems: MachineProblem[];
  }> = [];
  for (const row of plan.rows) {
    if (row.machineProblems.length === 0 || seen.has(row.machineId)) continue;
    seen.add(row.machineId);
    out.push({
      machineId: row.machineId,
      name:
        machines.find((m) => m.id === row.machineId)?.name ?? row.machineId,
      problems: row.machineProblems,
    });
  }
  return out;
}

export function buildTargetPlan(
  combo: ItemCombo | null,
  itemsById: Record<string, { stock?: number }>,
  machines: Machine[],
  targetSets: number,
  machineByItemId: Record<string, string>,
): TargetPlan {
  if (!combo) {
    return {
      rows: [],
      totalSeconds: 0,
      hasAssignments: false,
      missingAssignment: false,
    };
  }

  const needs = calculateComponentNeedsForTarget(combo, itemsById, targetSets);
  const perMachineSeconds = new Map<string, number>();
  let missingAssignment = false;

  const rows = needs.map((need) => {
    const machineId = machineByItemId[need.itemId] ?? "";
    const machine = machines.find((m) => m.id === machineId) ?? null;
    const neededPieces = Math.ceil(need.neededAdditionalPieces);
    const machineProblems = machine ? findMachineProblems(machine) : [];
    // A machine that cannot run contributes nothing to the busiest-machine
    // maximum and nothing to any machine's running total. Counting it as 0
    // would make it the fastest choice on the panel.
    const runtimeSeconds = machine
      ? calculateMachineRuntimeSeconds(
          neededPieces,
          machine.cavities,
          machine.cycleTimeSeconds,
        )
      : null;

    if (runtimeSeconds === null) {
      if (need.neededAdditionalPieces > 0) missingAssignment = true;
    } else {
      perMachineSeconds.set(
        machineId,
        (perMachineSeconds.get(machineId) ?? 0) + runtimeSeconds,
      );
    }

    return {
      itemId: need.itemId,
      ratio: need.ratio,
      currentStock: need.currentStock,
      neededPieces,
      machineId,
      runtimeSeconds,
      machineProblems,
    };
  });

  return {
    rows,
    totalSeconds:
      perMachineSeconds.size > 0 ? Math.max(...perMachineSeconds.values()) : 0,
    hasAssignments: perMachineSeconds.size > 0,
    missingAssignment,
  };
}
