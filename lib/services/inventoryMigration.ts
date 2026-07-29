import { getAll, get, put, STORES } from "@/lib/db/adapter";
import { METADATA_STORE } from "@/lib/db/schema";
import { getItems } from "./itemService";
import { getInventoryItems, saveInventoryItem, type InventoryItem } from "./inventoryService";
import { matchLegacyItem, mergeLegacyRate } from "./inventoryCatalog";

const MAP_ID = "legacy_inventory_item_map";

export interface InventoryMigrationReport {
  migrated: number;
  alreadyMapped: number;
  unmatched: string[];
  ambiguous: string[];
}

type ItemMap = Record<string, string>;

async function readMap(): Promise<ItemMap> {
  const row = await get(METADATA_STORE, MAP_ID);
  return row?.map && typeof row.map === "object" ? row.map as ItemMap : {};
}

export async function migrateLegacyItems(): Promise<InventoryMigrationReport> {
  const [legacyItems, inventoryItems, map] = await Promise.all([
    getItems(),
    getInventoryItems(),
    readMap(),
  ]);
  const report: InventoryMigrationReport = { migrated: 0, alreadyMapped: 0, unmatched: [], ambiguous: [] };
  const updatedItems = new Map(inventoryItems.map((item) => [item.id, item]));

  for (const legacy of legacyItems) {
    const legacyId = typeof legacy.id === "string" ? legacy.id : "";
    if (!legacyId) continue;
    if (map[legacyId]) {
      report.alreadyMapped += 1;
      continue;
    }
    const match = matchLegacyItem({ code: legacy.code, name: legacy.name, rate: legacy.rate }, [...updatedItems.values()]);
    if (!match) {
      report.unmatched.push(legacyId);
      continue;
    }
    if ("kind" in match) {
      report.ambiguous.push(legacyId);
      continue;
    }
    const merged = mergeLegacyRate(match, { rate: legacy.rate });
    if (merged !== match) {
      await saveInventoryItem(merged);
      updatedItems.set(merged.id, merged);
    }
    map[legacyId] = match.id;
    report.migrated += 1;
  }

  await put(METADATA_STORE, { id: MAP_ID, map });
  return report;
}

export async function resolveCanonicalItemId(itemId: string): Promise<string> {
  const map = await readMap();
  return map[itemId] ?? itemId;
}

export async function getCanonicalInventoryItems(): Promise<InventoryItem[]> {
  return getInventoryItems();
}
