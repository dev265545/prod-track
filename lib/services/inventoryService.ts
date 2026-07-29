import { getAll, get, put, remove, STORES } from "@/lib/db/adapter";
import { METADATA_STORE } from "@/lib/db/schema";

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
  stickerCode?: string; // BOM: referenced sticker code
  polyCode?: string; // BOM: referenced poly code
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

export const INVENTORY_CATEGORIES: {
  value: InventoryCategory;
  layer: "raw" | "finished";
}[] = [
  { value: "box", layer: "raw" },
  { value: "dana", layer: "raw" },
  { value: "poly", layer: "raw" },
  { value: "container", layer: "finished" },
  { value: "sticker", layer: "raw" },
  { value: "glass", layer: "finished" },
];

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

export async function saveInventoryItem(
  item: Partial<InventoryItem>
): Promise<InventoryItem> {
  const now = Date.now();
  const isNew = !item.id;
  const existing = item.id ? await getInventoryItem(item.id) : null;
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
    stickerCode: item.stickerCode,
    polyCode: item.polyCode,
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

export async function deleteInventoryItem(id: string): Promise<void> {
  const movements = await getMovements();
  const toDelete = movements.filter((m) => m.itemId === id);
  await Promise.all(toDelete.map((m) => remove(MOVEMENTS_STORE, m.id)));
  await remove(ITEMS_STORE, id);
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

export async function getMovementsForItem(
  itemId: string
): Promise<InventoryMovement[]> {
  const movements = await getMovements();
  return movements.filter((m) => m.itemId === itemId);
}

export async function addMovement(
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

export async function deleteMovement(id: string): Promise<void> {
  await remove(MOVEMENTS_STORE, id);
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

const STICKERS_PER_UNIT = 2;

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
 * reconciliation macros. Unknown/missing component codes are skipped
 * silently.
 */
export async function produceFinishedGood(
  finishedItemId: string,
  qty: number,
  date: string,
  note?: string,
): Promise<void> {
  if (qty <= 0) return;

  const finishedItem = await getInventoryItem(finishedItemId);
  if (!finishedItem) return;

  await addMovement({
    itemId: finishedItem.id,
    date,
    type: "inward",
    qty,
    note: note || `Auto: produced ${finishedItem.code} x${qty}`,
  });

  const items = await getInventoryItems();

  if (finishedItem.boxCode) {
    const boxItem = findComponentItem(items, finishedItem.boxCode, "box");
    if (boxItem) {
      await addMovement({
        itemId: boxItem.id,
        date,
        type: "outward",
        qty,
        note: note || `Auto: produced ${finishedItem.code} x${qty}`,
      });
    }
  }

  if (finishedItem.stickerCode) {
    const stickerItem = findComponentItem(items, finishedItem.stickerCode, "sticker");
    if (stickerItem) {
      await addMovement({
        itemId: stickerItem.id,
        date,
        type: "outward",
        qty: qty * STICKERS_PER_UNIT,
        note: note || `Auto: produced ${finishedItem.code} x${qty}`,
      });
    }
  }

  if (finishedItem.polyCode) {
    const polyItem = findComponentItem(items, finishedItem.polyCode, "poly");
    if (polyItem) {
      const deductQty = polyItem.weightPerUnit
        ? qty * polyItem.weightPerUnit
        : qty;
      await addMovement({
        itemId: polyItem.id,
        date,
        type: "outward",
        qty: deductQty,
        note: note || `Auto: produced ${finishedItem.code} x${qty}`,
      });
    }
  }
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
