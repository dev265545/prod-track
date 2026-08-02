import { produceFinishedGood, type ProduceResult } from "./inventoryService";
import { saveProductionSilently } from "./productionService";
import { getAppSettings } from "./appSettingsService";
import { readLegacyItemMap } from "./productionCatalog";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "./auditService";
import { employeeName, itemName } from "./auditNames";

export type ProductionShift = "day" | "night";

export interface ProductionEntryInput {
  employeeId: string;
  /** Row in the `items` store. Always a legacy id: this is what pay reads. */
  itemId: string;
  /**
   * Stock row to draw down, when the caller already knows it. Omitted, the
   * legacy item map is consulted — the two stores use different ids, so
   * passing `itemId` straight to `produceFinishedGood` never matched anything.
   */
  inventoryItemId?: string | null;
  date: string;
  shift: ProductionShift | string;
  quantity: number;
  note?: string;
}

export interface ProductionEntryResult {
  production: Record<string, unknown>;
  /**
   * What the linked inventory write actually did, including BOM codes that
   * resolved to no item so the caller can warn the operator.
   *
   * `null` when this item has no counterpart in the stock list at all. The
   * production `items` store (name + rate, drives pay) is separate from
   * `inventory_items`, and plenty of items legitimately live in only one of
   * them — so "not a stock item" is an ordinary state, not a failure.
   */
  inventory: ProduceResult | null;
}

/**
 * Structural check rather than `instanceof ProduceError`.
 *
 * `instanceof` is unreliable across module boundaries — a test that mocks
 * `./inventoryService` leaves the class undefined, and the check then throws
 * rather than returning false. The code is the contract; match on it.
 */
function isItemNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "item-not-found"
  );
}

async function logProductionEntry(
  input: ProductionEntryInput,
  production: Record<string, unknown>,
): Promise<void> {
  const [who, what] = await Promise.all([
    employeeName(input.employeeId),
    itemName(input.itemId),
  ]);
  void auditRecord(
    AUDIT_ACTIONS.productionCreate,
    "productions",
    (production.id as string) ?? null,
    `${who} made ${input.quantity} of ${what} on ${input.date} (${input.shift} shift)`,
    diffEntity(null, production, ["date", "shift", "quantity", "note"]),
  );
}

export async function saveProductionEntry(
  input: ProductionEntryInput,
): Promise<ProductionEntryResult> {
  if (!input.employeeId) throw new Error("employee is required");
  if (!input.itemId) throw new Error("item is required");
  if (!input.date) throw new Error("date is required");
  if (input.shift !== "day" && input.shift !== "night") {
    throw new Error("shift is required");
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("quantity must be greater than zero");
  }

  const { row: production } = await saveProductionSilently({
    employeeId: input.employeeId,
    itemId: input.itemId,
    date: input.date,
    quantity: input.quantity,
    shift: input.shift,
    note: input.note?.trim() || undefined,
  });
  // The single record of what the operator actually did. `saveProduction`'s
  // own logging is skipped above so this daily path writes one entry, not two.
  void logProductionEntry(input, production);

  // Read at save time, never cached: an admin flipping the switch must take
  // effect on the very next entry.
  const settings = await getAppSettings();
  if (!settings.productionInventoryLinkEnabled) {
    // Off: the work is recorded and paid exactly as before, and stock is left
    // alone. Existing movements are never reversed.
    return { production, inventory: null };
  }

  const inventoryItemId =
    input.inventoryItemId ?? (await readLegacyItemMap())[input.itemId] ?? null;
  if (!inventoryItemId) return { production, inventory: null };

  try {
    // produceFinishedGood is itself all-or-nothing, so if it throws there are
    // no movements left to undo here — only the production row.
    const inventory = await produceFinishedGood(
      inventoryItemId,
      input.quantity,
      input.date,
      input.note,
    );
    return { production, inventory };
  } catch (error) {
    // An item with no stock counterpart is NOT a failed entry. Recording what
    // was made is the operator's actual intent and it succeeded; there is
    // simply no stock to draw down. Rolling back here meant production could
    // not be recorded at all for any item missing from `inventory_items` —
    // which is most of them, since the two stores are independent.
    if (isItemNotFound(error)) {
      return { production, inventory: null };
    }
    // Anything else means the deduction genuinely went wrong, so the pay row
    // must not survive on its own.
    const { deleteProduction } = await import("./productionService");
    if (production.id) await deleteProduction(String(production.id));
    throw error;
  }
}
