import { getAll, get, getByIndex, put, remove, STORES } from "@/lib/db/adapter";
import { METADATA_STORE } from "@/lib/db/schema";
import { stockKindFor } from "@/lib/services/inventoryStockKind";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "@/lib/services/auditService";
import { plural } from "@/lib/services/auditNames";

const ITEMS_STORE = STORES.INVENTORY_ITEMS;
const MOVEMENTS_STORE = STORES.INVENTORY_MOVEMENTS;
const INVENTORY_IMPORT_HASH_KEY = "inventory_import_hash";

export type InventoryCategory =
  | "box"
  | "dana"
  | "poly"
  | "container"
  | "sticker"
  | "glass";
export type InventoryUnit = "pcs" | "kg";

export interface InventoryItem {
  id: string;
  code: string; // product code e.g. RT04, B1, S19
  name: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  weightPerUnit?: number; // kg per piece, for poly pcs<->kg conversion
  lowStockThreshold: number; // default 100
  openingStock: number; // baseline; live stock = opening + movements
  boxCode?: string; // BOM: referenced raw box code
  /** BOM: primary sticker code. Mirrors `stickerCodes[0]`; kept as its own
   * field so databases and code written before multi-sticker support still
   * read correctly. */
  stickerCode?: string;
  /** BOM: every sticker code this item consumes. The source workbook's
   * Container sheet holds two (columns O and P) for a handful of rows;
   * Glass holds one. Undefined on rows written before this field existed —
   * use {@link stickerCodesFor}, never this field directly. */
  stickerCodes?: string[];
  polyCode?: string; // BOM: referenced poly code
  /** BOM: stickers consumed per produced unit. Undefined on rows written
   * before this field existed; those fall back to DEFAULT_STICKERS_PER_UNIT. */
  stickersPerUnit?: number;
  rate?: number; // legacy production/pay rate carried into the canonical catalog
  isFavorite?: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export type MovementType = "inward" | "outward" | "adjustment";

export interface InventoryMovement {
  id: string;
  itemId: string;
  date: string; // ISO yyyy-mm-dd
  type: MovementType;
  qty: number; // adjustment may be negative
  note?: string;
  createdAt: number;
}

/**
 * `layer` is the internal name for "bought in and consumed" versus "made and
 * sold"; `canProduce` and the packing bill of materials both hang off it, so
 * the field stays. The split itself lives in `inventoryStockKind`, which also
 * carries the words the operator actually reads — nothing shows "raw" or
 * "finished" on screen.
 */
export const INVENTORY_CATEGORIES: {
  value: InventoryCategory;
  layer: "raw" | "finished";
}[] = (["box", "dana", "poly", "container", "sticker", "glass"] as const).map(
  (value) => ({
    value,
    layer: stockKindFor(value) === "made" ? "finished" : "raw",
  }),
);

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const rows = await getAll(ITEMS_STORE);
  return (rows as unknown as InventoryItem[]).map((item) => ({
    ...item,
    isActive: item.isActive !== false,
    isFavorite: item.isFavorite === true,
  }));
}

export async function getInventoryItem(
  id: string
): Promise<InventoryItem | null> {
  const row = await get(ITEMS_STORE, id);
  return (row as unknown as InventoryItem) ?? null;
}

/** Stock-item fields worth putting in front of a human. */
const INVENTORY_ITEM_AUDIT_FIELDS = [
  "code",
  "name",
  "category",
  "unit",
  "openingStock",
  "lowStockThreshold",
  "weightPerUnit",
  "boxCode",
  "stickerCodes",
  "polyCode",
  "stickersPerUnit",
  "rate",
  "isActive",
] as const;

/**
 * Write a stock item without auditing it.
 *
 * For the spreadsheet importers and the legacy migration, which touch hundreds
 * of rows in one operator action and write a single entry with counts instead.
 */
export async function saveInventoryItemSilently(
  item: Partial<InventoryItem>
): Promise<InventoryItem> {
  const now = Date.now();
  const isNew = !item.id;
  const existing = item.id ? await getInventoryItem(item.id) : null;
  const stickerCodes = normalizedStickerCodes(item);
  const record: InventoryItem = {
    id:
      item.id ??
      "inv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9),
    code: item.code ?? "",
    name: item.name ?? "",
    category: item.category ?? "box",
    unit: item.unit ?? "pcs",
    weightPerUnit: item.weightPerUnit,
    lowStockThreshold: item.lowStockThreshold ?? 100,
    openingStock: item.openingStock ?? 0,
    boxCode: item.boxCode,
    stickerCode: stickerCodes[0],
    stickerCodes: stickerCodes.length > 0 ? stickerCodes : undefined,
    polyCode: item.polyCode,
    // Left undefined when not supplied so existing rows keep meaning "use the
    // default" rather than being silently frozen at today's default value.
    stickersPerUnit: item.stickersPerUnit ?? existing?.stickersPerUnit,
    rate: item.rate ?? existing?.rate,
    isFavorite: item.isFavorite ?? existing?.isFavorite ?? false,
    sortOrder: item.sortOrder ?? 0,
    isActive: item.isActive ?? true,
    createdAt: isNew ? now : item.createdAt ?? now,
    updatedAt: now,
  };
  await put(ITEMS_STORE, record as unknown as Record<string, unknown>);
  return record;
}

export async function saveInventoryItem(
  item: Partial<InventoryItem>
): Promise<InventoryItem> {
  const before = item.id ? await getInventoryItem(item.id) : null;
  const record = await saveInventoryItemSilently(item);
  const label = record.name || record.code || "with no name";
  void auditRecord(
    before
      ? AUDIT_ACTIONS.inventoryItemUpdate
      : AUDIT_ACTIONS.inventoryItemCreate,
    "inventory_items",
    record.id,
    before
      ? `Stock item ${label} was updated`
      : `Stock item ${label} was added to the stock list`,
    diffEntity(
      before as unknown as Record<string, unknown> | null,
      record as unknown as Record<string, unknown>,
      INVENTORY_ITEM_AUDIT_FIELDS,
    ),
  );
  return record;
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const before = await getInventoryItem(id);
  const toDelete = await getMovementsForItem(id);
  await Promise.all(toDelete.map((m) => remove(MOVEMENTS_STORE, m.id)));
  await remove(ITEMS_STORE, id);
  // One entry: deleting an item takes its movement history with it, and that
  // is one decision, not one decision per movement.
  void auditRecord(
    AUDIT_ACTIONS.inventoryItemDelete,
    "inventory_items",
    id,
    `Stock item ${before?.name || before?.code || "with no name"} was deleted, along with ${plural(toDelete.length, "stock movement", "stock movements")}`,
    diffEntity(
      before as unknown as Record<string, unknown> | null,
      null,
      INVENTORY_ITEM_AUDIT_FIELDS,
    ),
  );
}

/** Deletes ALL inventory items and ALL inventory movements. Used by the
 * "replace" import mode to wipe the slate clean before a fresh import. */
export async function clearInventory(): Promise<void> {
  const [items, movements] = await Promise.all([
    getInventoryItems(),
    getMovements(),
  ]);
  await Promise.all(movements.map((m) => remove(MOVEMENTS_STORE, m.id)));
  await Promise.all(items.map((i) => remove(ITEMS_STORE, i.id)));
  void auditRecord(
    AUDIT_ACTIONS.dataClear,
    "inventory_items",
    null,
    `The whole stock list was wiped: ${plural(items.length, "item", "items")} and ${plural(movements.length, "stock movement", "stock movements")}`,
    { itemsRemoved: items.length, movementsRemoved: movements.length },
  );
}

/** Stored content-hash of the last successfully imported inventory file,
 * used to short-circuit no-op re-imports. Mirrors lib/auth.ts's get/put
 * pattern against the shared `_metadata` store, using its own row id so it
 * doesn't disturb the password/app-metadata row. */
export async function getInventoryImportHash(): Promise<string | null> {
  const row = await get(METADATA_STORE, INVENTORY_IMPORT_HASH_KEY);
  const hash = row?.hash;
  return typeof hash === "string" ? hash : null;
}

export async function setInventoryImportHash(hash: string): Promise<void> {
  await put(METADATA_STORE, { id: INVENTORY_IMPORT_HASH_KEY, hash });
}

export async function getMovements(): Promise<InventoryMovement[]> {
  const rows = await getAll(MOVEMENTS_STORE);
  return rows as unknown as InventoryMovement[];
}

/**
 * Reads the `by_item` index rather than the whole movement store. This is
 * called once per item while importing a spreadsheet
 * (`inventoryExcel`, `legacyInventoryImport`), so scanning every movement each
 * time made import cost grow with the square of the catalogue.
 */
export async function getMovementsForItem(
  itemId: string
): Promise<InventoryMovement[]> {
  const rows = await getByIndex(MOVEMENTS_STORE, "by_item", itemId, itemId);
  return rows as unknown as InventoryMovement[];
}

/**
 * Write a movement without auditing it.
 *
 * Used by `produceFinishedGood` and the importers, which describe the whole
 * operation in one entry — auditing here as well would turn a single "made 400
 * lids" into one entry per BOM component.
 */
export async function addMovementSilently(
  m: Partial<InventoryMovement>
): Promise<InventoryMovement> {
  const record: InventoryMovement = {
    id:
      m.id ??
      "mov_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9),
    itemId: m.itemId ?? "",
    date: m.date ?? new Date().toISOString().slice(0, 10),
    type: m.type ?? "inward",
    qty: m.qty ?? 0,
    note: m.note,
    createdAt: m.createdAt ?? Date.now(),
  };
  await put(MOVEMENTS_STORE, record as unknown as Record<string, unknown>);
  return record;
}

const MOVEMENT_AUDIT_FIELDS = ["date", "type", "qty", "note"] as const;

export async function addMovement(
  m: Partial<InventoryMovement>
): Promise<InventoryMovement> {
  const record = await addMovementSilently(m);
  const item = await getInventoryItem(record.itemId);
  const label = item?.name || item?.code || "a stock item";
  const direction =
    record.type === "inward"
      ? `${record.qty} of ${label} came in`
      : record.type === "outward"
        ? `${record.qty} of ${label} went out`
        : `Stock of ${label} was adjusted by ${record.qty}`;
  void auditRecord(
    record.type === "outward"
      ? AUDIT_ACTIONS.inventoryOutward
      : AUDIT_ACTIONS.inventoryInward,
    "inventory_movements",
    record.id,
    `${direction} on ${record.date}`,
    diffEntity(
      null,
      record as unknown as Record<string, unknown>,
      MOVEMENT_AUDIT_FIELDS,
    ),
  );
  return record;
}

/** Delete a movement without auditing it — for the importers' reconcile step. */
export async function deleteMovementSilently(id: string): Promise<void> {
  await remove(MOVEMENTS_STORE, id);
}

export async function deleteMovement(id: string): Promise<void> {
  // Read the one row by primary key. Scanning the whole movement store to find
  // it cost the entire history on every delete.
  const before = (await get(MOVEMENTS_STORE, id)) as unknown as
    | InventoryMovement
    | null;
  await remove(MOVEMENTS_STORE, id);
  const item = before ? await getInventoryItem(before.itemId) : null;
  void auditRecord(
    AUDIT_ACTIONS.inventoryMovementDelete,
    "inventory_movements",
    id,
    `A stock movement for ${item?.name || item?.code || "a stock item"} was deleted`,
    diffEntity(
      (before ?? null) as unknown as Record<string, unknown> | null,
      null,
      MOVEMENT_AUDIT_FIELDS,
    ),
  );
}

export function computeStock(
  item: InventoryItem,
  movements: InventoryMovement[]
): number {
  let stock = item.openingStock ?? 0;
  for (const m of movements) {
    if (m.type === "inward") stock += m.qty;
    else if (m.type === "outward") stock -= m.qty;
    else if (m.type === "adjustment") stock += m.qty;
  }
  return stock;
}

/** Stickers consumed per produced unit when an item does not override it.
 * Matches the historical hardcoded factory rule. */
export const DEFAULT_STICKERS_PER_UNIT = 2;

/**
 * Every sticker code an item consumes, tolerating rows saved before
 * `stickerCodes` existed (which carry only the single `stickerCode`).
 * Duplicates and blanks are dropped so a code is never deducted twice.
 */
export function stickerCodesFor(
  item: Pick<InventoryItem, "stickerCode" | "stickerCodes">,
): string[] {
  const raw =
    Array.isArray(item.stickerCodes) && item.stickerCodes.length > 0
      ? item.stickerCodes
      : item.stickerCode
        ? [item.stickerCode]
        : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const code of raw) {
    const trimmed = typeof code === "string" ? code.trim() : "";
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Save-time normalization: accepts either shape, emits the canonical list. */
function normalizedStickerCodes(item: Partial<InventoryItem>): string[] {
  return stickerCodesFor({
    stickerCode: item.stickerCode,
    stickerCodes: item.stickerCodes,
  });
}

/** Resolves the effective sticker multiplier for an item, tolerating rows
 * saved before `stickersPerUnit` existed and rows holding junk values. */
export function stickersPerUnitFor(item: Pick<InventoryItem, "stickersPerUnit">): number {
  const value = item.stickersPerUnit;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return DEFAULT_STICKERS_PER_UNIT;
}

export type BomRole = "box" | "sticker" | "poly";

export interface DeductedComponent {
  role: BomRole;
  code: string;
  itemId: string;
  itemName: string;
  qty: number;
}

export interface MissingComponent {
  role: BomRole;
  code: string;
}

export interface ProduceResult {
  finishedItemId: string;
  qty: number;
  /** Components that resolved to a real item and were deducted. */
  deducted: DeductedComponent[];
  /** BOM codes that matched no inventory item, so nothing was deducted. */
  missing: MissingComponent[];
}

/** i18n key per BOM role, so UI layers can name the component the operator
 * knows ("poly", "sticker") when warning that it was not deducted. */
export const BOM_ROLE_MESSAGE_KEY = {
  box: "invSvcRoleBox",
  sticker: "invSvcRoleSticker",
  poly: "invSvcRolePoly",
} as const;

export type ProduceErrorCode = "invalid-qty" | "item-not-found";

/** Thrown instead of returning silently, so callers can never mistake a
 * no-op for a recorded production. */
export class ProduceError extends Error {
  readonly code: ProduceErrorCode;
  constructor(code: ProduceErrorCode, message: string) {
    super(message);
    this.name = "ProduceError";
    this.code = code;
  }
}

function findComponentItem(
  items: InventoryItem[],
  code: string,
  preferredCategory: InventoryCategory
): InventoryItem | undefined {
  const lower = code.toLowerCase();
  return (
    items.find(
      (i) => i.category === preferredCategory && i.code.toLowerCase() === lower
    ) ?? items.find((i) => i.code.toLowerCase() === lower)
  );
}

/**
 * Records production of a finished good and auto-deducts its BOM
 * components (box, sticker, poly), mirroring the original factory
 * reconciliation macros.
 *
 * Throws {@link ProduceError} rather than returning silently when there is
 * nothing to record, and reports unresolved BOM codes in `missing` so the UI
 * can tell the operator which component was *not* taken out of stock.
 *
 * The movement writes are all-or-nothing: the underlying adapters offer no
 * multi-row transaction, so a failure part-way through deletes the movements
 * already written instead of leaving inventory half-adjusted.
 */
export async function produceFinishedGood(
  finishedItemId: string,
  qty: number,
  date: string,
  note?: string,
): Promise<ProduceResult> {
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ProduceError(
      "invalid-qty",
      `Quantity must be greater than zero (got ${qty})`,
    );
  }

  const finishedItem = await getInventoryItem(finishedItemId);
  if (!finishedItem) {
    throw new ProduceError(
      "item-not-found",
      `Inventory item ${finishedItemId} was not found`,
    );
  }

  const items = await getInventoryItems();
  const defaultNote = `Auto: produced ${finishedItem.code} x${qty}`;
  const deducted: DeductedComponent[] = [];
  const missing: MissingComponent[] = [];

  // Resolve the whole BOM up front so nothing is written until we know what
  // the full set of writes is.
  const componentSpecs: Array<{ role: BomRole; code: string }> = [];
  if (finishedItem.boxCode) componentSpecs.push({ role: "box", code: finishedItem.boxCode });
  // Every sticker code, not just the first: the original updateSTICKERS()
  // macro deducted from Container columns O and P independently.
  for (const stickerCode of stickerCodesFor(finishedItem)) {
    componentSpecs.push({ role: "sticker", code: stickerCode });
  }
  if (finishedItem.polyCode) componentSpecs.push({ role: "poly", code: finishedItem.polyCode });

  const resolved: Array<{ role: BomRole; code: string; item: InventoryItem; qty: number }> = [];
  for (const spec of componentSpecs) {
    const componentItem = findComponentItem(items, spec.code, spec.role);
    if (!componentItem) {
      missing.push({ role: spec.role, code: spec.code });
      continue;
    }
    let deductQty = qty;
    if (spec.role === "sticker") deductQty = qty * stickersPerUnitFor(finishedItem);
    else if (spec.role === "poly" && componentItem.weightPerUnit)
      deductQty = qty * componentItem.weightPerUnit;
    resolved.push({ role: spec.role, code: spec.code, item: componentItem, qty: deductQty });
  }

  const written: string[] = [];
  try {
    const inward = await addMovementSilently({
      itemId: finishedItem.id,
      date,
      type: "inward",
      qty,
      note: note || defaultNote,
    });
    written.push(inward.id);

    for (const component of resolved) {
      const movement = await addMovementSilently({
        itemId: component.item.id,
        date,
        type: "outward",
        qty: component.qty,
        note: note || defaultNote,
      });
      written.push(movement.id);
      deducted.push({
        role: component.role,
        code: component.code,
        itemId: component.item.id,
        itemName: component.item.name,
        qty: component.qty,
      });
    }
  } catch (error) {
    // Compensate: undo every movement this call already wrote, so a partial
    // failure never leaves orphaned stock adjustments behind.
    for (const id of written) {
      try {
        await remove(MOVEMENTS_STORE, id);
      } catch (cleanupError) {
        console.error("[inventory] rollback of movement failed", id, cleanupError);
      }
    }
    throw error;
  }

  // One entry for the whole production: the finished good going in and every
  // BOM component coming out are a single act by a single person.
  void auditRecord(
    AUDIT_ACTIONS.inventoryInward,
    "inventory_movements",
    finishedItem.id,
    `${qty} of ${finishedItem.name || finishedItem.code} was produced on ${date}, taking ${plural(deducted.length, "component", "components")} out of stock`,
    {
      produced: qty,
      deducted: deducted.map((d) => ({
        component: d.itemName,
        qty: d.qty,
      })),
      notFound: missing.map((m) => m.code),
    },
  );

  return { finishedItemId: finishedItem.id, qty, deducted, missing };
}

export async function getStockLevels(): Promise<
  Array<InventoryItem & { currentStock: number; isLow: boolean }>
> {
  const [items, movements] = await Promise.all([
    getInventoryItems(),
    getMovements(),
  ]);

  const movementsByItem = new Map<string, InventoryMovement[]>();
  for (const m of movements) {
    const list = movementsByItem.get(m.itemId);
    if (list) list.push(m);
    else movementsByItem.set(m.itemId, [m]);
  }

  const enriched = items.map((item) => {
    const itemMovements = movementsByItem.get(item.id) ?? [];
    const currentStock = computeStock(item, itemMovements);
    return {
      ...item,
      currentStock,
      isLow: currentStock < item.lowStockThreshold,
    };
  });

  enriched.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.code.localeCompare(b.code);
  });

  return enriched;
}
