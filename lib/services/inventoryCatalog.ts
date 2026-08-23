import type { InventoryItem } from "./inventoryService";

export interface LegacyCatalogItem {
  id?: string;
  code?: unknown;
  name?: unknown;
  rate?: unknown;
}

export type CatalogMatch =
  | InventoryItem
  | { kind: "ambiguous"; items: InventoryItem[] }
  | null;

export function normalizeCatalogKey(value: unknown): string {
  return String(value ?? "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function matchLegacyItem(
  legacy: LegacyCatalogItem,
  items: InventoryItem[]
): CatalogMatch {
  const code = normalizeCatalogKey(legacy.code);
  if (code) {
    const byCode = items.filter((item) => normalizeCatalogKey(item.code) === code);
    if (byCode.length === 1) return byCode[0];
    if (byCode.length > 1) return { kind: "ambiguous", items: byCode };
  }

  const name = normalizeCatalogKey(legacy.name);
  if (!name) return null;
  const byName = items.filter((item) => normalizeCatalogKey(item.name) === name);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) return { kind: "ambiguous", items: byName };
  return null;
}

export function mergeLegacyRate(
  item: InventoryItem,
  legacy: LegacyCatalogItem
): InventoryItem {
  const rate = typeof legacy.rate === "number" ? legacy.rate : Number(legacy.rate);
  if (item.rate != null || !Number.isFinite(rate)) return item;
  return { ...item, rate };
}

export function formatInventoryQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function isSelectableInventoryItem(item: InventoryItem): boolean {
  return item.isActive !== false;
}
