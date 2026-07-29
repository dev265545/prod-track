import { produceFinishedGood } from "./inventoryService";
import { saveProduction } from "./productionService";

export type ProductionShift = "day" | "night";

export interface ProductionEntryInput {
  employeeId: string;
  itemId: string;
  date: string;
  shift: ProductionShift | string;
  quantity: number;
  note?: string;
}

export async function saveProductionEntry(
  input: ProductionEntryInput,
): Promise<Record<string, unknown>> {
  if (!input.employeeId) throw new Error("employee is required");
  if (!input.itemId) throw new Error("item is required");
  if (!input.date) throw new Error("date is required");
  if (input.shift !== "day" && input.shift !== "night") {
    throw new Error("shift is required");
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("quantity must be greater than zero");
  }

  const production = await saveProduction({
    employeeId: input.employeeId,
    itemId: input.itemId,
    date: input.date,
    quantity: input.quantity,
    shift: input.shift,
    note: input.note?.trim() || undefined,
  });

  try {
    await produceFinishedGood(input.itemId, input.quantity, input.date, input.note);
    return production;
  } catch (error) {
    const { deleteProduction } = await import("./productionService");
    if (production.id) await deleteProduction(String(production.id));
    throw error;
  }
}
