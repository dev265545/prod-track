import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { nameOnRow } from "./auditNames";

export interface ItemComboComponent {
  itemId: string;
  ratio: number; // units of this item per 1 unit of the combo, default 1
}

export interface ItemCombo {
  id: string;
  name: string;
  components: ItemComboComponent[];
}

const STORE = STORES.ITEM_COMBOS;

export async function getItemCombos(): Promise<ItemCombo[]> {
  return getAll(STORE) as unknown as Promise<ItemCombo[]>;
}

export async function getItemCombo(id: string): Promise<ItemCombo | null> {
  return get(STORE, id) as unknown as Promise<ItemCombo | null>;
}

const COMBO_AUDIT_FIELDS = ["name", "components"] as const;

export async function saveItemCombo(
  combo: Record<string, unknown>
): Promise<ItemCombo> {
  let before: Record<string, unknown> | null = null;
  if (!combo.id) {
    combo.id =
      "combo_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  } else {
    before = await get(STORE, combo.id as string);
  }
  const components = (combo.components as ItemComboComponent[] | undefined) ?? [];
  combo.components = components.map((c) => ({
    itemId: c.itemId,
    ratio: c.ratio || 1,
  }));
  await put(STORE, combo);
  void auditRecord(
    before ? AUDIT_ACTIONS.itemUpdate : AUDIT_ACTIONS.itemCreate,
    "item_combos",
    combo.id as string,
    before
      ? `Item set ${nameOnRow(combo, "with no name")} was updated`
      : `Item set ${nameOnRow(combo, "with no name")} was created`,
    diffEntity(before, combo, COMBO_AUDIT_FIELDS),
  );
  return combo as unknown as ItemCombo;
}

export async function deleteItemCombo(id: string): Promise<void> {
  const before = await get(STORE, id);
  await remove(STORE, id);
  void auditRecord(
    AUDIT_ACTIONS.itemDelete,
    "item_combos",
    id,
    `Item set ${nameOnRow(before, "with no name")} was deleted`,
    diffEntity(before, null, COMBO_AUDIT_FIELDS),
  );
}

function unitsPossible(
  component: ItemComboComponent,
  itemsById: Record<string, { stock?: number }>,
): number {
  const stock = itemsById[component.itemId]?.stock ?? 0;
  const ratio = component.ratio || 1;
  return stock / ratio;
}

/** The scarcest component of a combo right now — the item worth producing more of. */
export function findBottleneckItemId(
  combo: ItemCombo,
  itemsById: Record<string, { stock?: number }>,
): string {
  if (combo.components.length === 0) return "";
  let bottleneckItemId = combo.components[0].itemId;
  let bottleneckUnits = unitsPossible(combo.components[0], itemsById);
  for (const component of combo.components.slice(1)) {
    const units = unitsPossible(component, itemsById);
    if (units < bottleneckUnits) {
      bottleneckUnits = units;
      bottleneckItemId = component.itemId;
    }
  }
  return bottleneckItemId;
}

/**
 * A machine can only complete whole cycles — it can't run for a fraction of
 * one. Each cycle yields `cavities` pieces, so the runtime for `pieces` is
 * always a whole number of cycles rounded up, never a fractional cycle.
 */
export function calculateMachineRuntimeSeconds(
  pieces: number,
  cavities: number,
  cycleTimeSeconds: number,
): number {
  if (pieces <= 0 || cavities <= 0 || cycleTimeSeconds <= 0) return 0;
  const cycles = Math.ceil(pieces / cavities);
  return cycles * cycleTimeSeconds;
}

/**
 * A machine PRODUCES `producedItemId`. This answers: how long do we need to
 * run it to top that item up so it stops being the bottleneck for `combo`,
 * matching (not exceeding) what the other components' current stock allows.
 */
export function calculateTopUpPlan(
  combo: ItemCombo,
  itemsById: Record<string, { stock?: number }>,
  producedItemId: string,
  machine: { cavities: number; cycleTimeSeconds: number },
): {
  inCombo: boolean;
  bottleneckItemId: string;
  bottleneckUnits: number;
  producedUnitsPossible: number;
  neededPieces: number;
  runtimeSeconds: number;
  resultingComboUnits: number;
} {
  const producedComponent = combo.components.find(
    (c) => c.itemId === producedItemId,
  );
  const others = combo.components.filter((c) => c.itemId !== producedItemId);

  if (!producedComponent || others.length === 0) {
    return {
      inCombo: false,
      bottleneckItemId: "",
      bottleneckUnits: 0,
      producedUnitsPossible: 0,
      neededPieces: 0,
      runtimeSeconds: 0,
      resultingComboUnits: 0,
    };
  }

  let bottleneckItemId = others[0].itemId;
  let bottleneckUnits = unitsPossible(others[0], itemsById);
  for (const component of others.slice(1)) {
    const units = unitsPossible(component, itemsById);
    if (units < bottleneckUnits) {
      bottleneckUnits = units;
      bottleneckItemId = component.itemId;
    }
  }

  const producedRatio = producedComponent.ratio || 1;
  const producedUnitsPossible = unitsPossible(producedComponent, itemsById);
  const neededUnits = Math.max(0, bottleneckUnits - producedUnitsPossible);
  const neededPieces = Math.ceil(neededUnits * producedRatio);
  const runtimeSeconds = calculateMachineRuntimeSeconds(
    neededPieces,
    machine.cavities,
    machine.cycleTimeSeconds,
  );
  const resultingComboUnits = Math.min(bottleneckUnits, producedUnitsPossible + neededUnits);

  return {
    inCombo: true,
    bottleneckItemId,
    bottleneckUnits,
    producedUnitsPossible,
    neededPieces,
    runtimeSeconds,
    resultingComboUnits,
  };
}

/** Given a target combo output quantity, how many more pieces of each component are needed. */
export function calculateComponentNeedsForTarget(
  combo: ItemCombo,
  itemsById: Record<string, { stock?: number }>,
  targetComboUnits: number,
): Array<{
  itemId: string;
  ratio: number;
  currentStock: number;
  neededTotalPieces: number;
  neededAdditionalPieces: number;
}> {
  return combo.components.map((component) => {
    const ratio = component.ratio || 1;
    const currentStock = itemsById[component.itemId]?.stock ?? 0;
    const neededTotalPieces = Math.max(0, targetComboUnits) * ratio;
    const neededAdditionalPieces = Math.max(0, neededTotalPieces - currentStock);
    return {
      itemId: component.itemId,
      ratio,
      currentStock,
      neededTotalPieces,
      neededAdditionalPieces,
    };
  });
}
