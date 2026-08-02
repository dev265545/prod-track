/**
 * What the "what was made?" picker offers, and what each choice is worth.
 *
 * The app has two item lists that grew up separately:
 *
 *  - `items` (STORES.ITEMS) — {name, rate}. This is the list PAY reads:
 *    `salaryService` multiplies a production row's quantity by
 *    `items[itemId].rate`. A production row must therefore always point at a
 *    row in this store, whatever the operator picked from.
 *  - `inventory_items` — {code, category, stock, BOM}. This is the list STOCK
 *    reads. An item added here never showed up in Production, which is exactly
 *    the complaint this module answers.
 *
 * They are joined by the `legacy_inventory_item_map` row in `_metadata`
 * ({legacyItemId: inventoryItemId}), written by `inventoryMigration`.
 *
 * The rule here: the picker's *contents* follow the
 * `productionInventoryLinkEnabled` setting, but the row that gets saved always
 * carries a legacy item id and a known rate. A toggle must never change what a
 * worker is paid.
 */

import { get, put } from "@/lib/db/adapter";
import { METADATA_STORE } from "@/lib/db/schema";
import { getAppSettings } from "./appSettingsService";
import { getItems, saveItem } from "./itemService";
import { getInventoryItems, type InventoryItem } from "./inventoryService";
import { normalizeCatalogKey } from "./inventoryCatalog";

export const LEGACY_ITEM_MAP_ID = "legacy_inventory_item_map";

/** Stock categories that are a finished product someone can be paid to make. */
const FINISHED_CATEGORIES = new Set(["container", "glass"]);

export interface LegacyItemRow {
  id?: unknown;
  name?: unknown;
  rate?: unknown;
}

export type CatalogSource = "items" | "inventory";

export interface ProductionCatalogEntry {
  /** Stable value for the <Select>. Not necessarily an id in either store. */
  id: string;
  name: string;
  /** Stock code, shown so the operator recognises the item off the shelf. */
  code?: string;
  /** Pay rate per piece, or null when nothing in either list supplies one. */
  rate: number | null;
  /** The `items` row this saves against; null when one must still be created. */
  legacyItemId: string | null;
  /** The stock row to draw down; null when this item has no stock counterpart. */
  inventoryItemId: string | null;
}

export interface ProductionCatalog {
  source: CatalogSource;
  entries: ProductionCatalogEntry[];
  /**
   * Stock items the production list has never heard of. Empty when the link is
   * on (they are all in `entries` then) — this is what makes "where are the two
   * items I added?" answerable while the link is off.
   */
  unlinkedInventoryNames: string[];
}

export type LegacyItemMap = Record<string, string>;

function toRate(value: unknown): number | null {
  const rate = typeof value === "number" ? value : Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * What one piece pays, given both lists.
 *
 * The `items` row wins whenever there is one. That is the row the Items screen
 * writes and the row `salaryService` multiplies by, so this is the only
 * ordering under which the number the owner reads is the number that gets
 * paid. The stock row's `rate` is never typed by anyone — only the legacy
 * migration and the spreadsheet import ever set it — so it acts purely as a
 * *seed* for a stock item that has no `items` row yet. Reading it first (as
 * this did originally) meant that editing the price on Items changed the
 * screen and not the pay packet, because the stale migrated copy still won.
 *
 * Exported so the precedence itself is a tested fact, not a line buried in a
 * loop.
 */
export function resolveEntryRate(
  legacyRate: unknown,
  inventoryRate: unknown,
): number | null {
  return toRate(legacyRate) ?? toRate(inventoryRate);
}

function isFinishedGood(item: InventoryItem): boolean {
  return FINISHED_CATEGORIES.has(item.category) && item.isActive !== false;
}

/**
 * Build the picker contents from both lists plus the map. Pure: everything it
 * needs is an argument, so the whole rule set is unit-testable.
 */
export function resolveProductionCatalog(options: {
  linkEnabled: boolean;
  legacyItems: LegacyItemRow[];
  inventoryItems: InventoryItem[];
  map: LegacyItemMap;
}): ProductionCatalog {
  const { linkEnabled, legacyItems, inventoryItems, map } = options;

  const legacyById = new Map<string, LegacyItemRow>();
  for (const row of legacyItems) {
    if (typeof row.id === "string" && row.id) legacyById.set(row.id, row);
  }

  const legacyEntry = (row: LegacyItemRow): ProductionCatalogEntry => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    rate: toRate(row.rate),
    legacyItemId: String(row.id),
    inventoryItemId: map[String(row.id)] ?? null,
  });

  if (!linkEnabled) {
    // Off: production is the simple item list and nothing else. The stock list
    // is still consulted for one thing only — telling the owner which stock
    // items are missing here, so nothing he added is invisible.
    return {
      source: "items",
      entries: [...legacyById.values()].map(legacyEntry),
      unlinkedInventoryNames: unlinkedInventoryItems(
        legacyItems,
        inventoryItems,
        map,
      ).map((item) => item.name || item.code),
    };
  }

  // On: every finished stock item is offered, so anything added in Inventory is
  // immediately available here.
  const inventoryToLegacy = new Map<string, string>();
  for (const [legacyId, inventoryId] of Object.entries(map)) {
    if (legacyById.has(legacyId)) inventoryToLegacy.set(inventoryId, legacyId);
  }

  const entries: ProductionCatalogEntry[] = [];
  const usedLegacy = new Set<string>();

  for (const item of inventoryItems) {
    if (!isFinishedGood(item)) continue;
    const legacyId =
      inventoryToLegacy.get(item.id) ??
      matchLegacyIdByName(item, legacyById) ??
      null;
    if (legacyId) usedLegacy.add(legacyId);
    const legacy = legacyId ? legacyById.get(legacyId) : undefined;
    entries.push({
      id: item.id,
      name: item.name || item.code,
      code: item.code || undefined,
      // See `resolveEntryRate`: the paired `items` row wins, the stock row's
      // migrated rate is only a seed. Never a silent 0 — null means "ask
      // before saving".
      rate: resolveEntryRate(legacy?.rate, item.rate),
      legacyItemId: legacyId,
      inventoryItemId: item.id,
    });
  }

  // Legacy-only items stay in the list. Dropping them would make work
  // unrecordable — and unpayable — the moment the switch is flipped.
  for (const row of legacyById.values()) {
    if (usedLegacy.has(String(row.id))) continue;
    entries.push(legacyEntry(row));
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { source: "inventory", entries, unlinkedInventoryNames: [] };
}

/**
 * Last-resort pairing when the map has no row: same name, ignoring case,
 * spaces and punctuation. Only used to *display* a rate and to reuse an
 * existing `items` row rather than creating a duplicate.
 */
function matchLegacyIdByName(
  item: InventoryItem,
  legacyById: Map<string, LegacyItemRow>,
): string | null {
  const key = normalizeCatalogKey(item.name);
  if (!key) return null;
  const hits = [...legacyById.entries()].filter(
    ([, row]) => normalizeCatalogKey(row.name) === key,
  );
  return hits.length === 1 ? hits[0][0] : null;
}

/** Stock items with no counterpart in the production `items` list. */
export function unlinkedInventoryItems(
  legacyItems: LegacyItemRow[],
  inventoryItems: InventoryItem[],
  map: LegacyItemMap,
): InventoryItem[] {
  const legacyIds = new Set(
    legacyItems
      .map((row) => (typeof row.id === "string" ? row.id : ""))
      .filter(Boolean),
  );
  const legacyNames = new Set(
    legacyItems.map((row) => normalizeCatalogKey(row.name)).filter(Boolean),
  );
  const mappedInventoryIds = new Set(
    Object.entries(map)
      .filter(([legacyId]) => legacyIds.has(legacyId))
      .map(([, inventoryId]) => inventoryId),
  );
  return inventoryItems.filter(
    (item) =>
      isFinishedGood(item) &&
      !mappedInventoryIds.has(item.id) &&
      !legacyNames.has(normalizeCatalogKey(item.name)),
  );
}

export async function readLegacyItemMap(): Promise<LegacyItemMap> {
  try {
    const row = await get(METADATA_STORE, LEGACY_ITEM_MAP_ID);
    return row?.map && typeof row.map === "object"
      ? (row.map as LegacyItemMap)
      : {};
  } catch (error) {
    // An empty map is the correct answer for a fresh install, so `{}` stays the
    // fallback. But it is NOT the same as a failed read: this map is the only
    // link between the pay item and the stock item, and `saveProductionEntry`
    // treats "no stock counterpart" as an ordinary state. So a read failure here
    // silently skips the stock deduction for every entry until it recovers —
    // production recorded, stock untouched, nothing said. That is the exact
    // failure this connector already had once. Say it out loud.
    console.error(
      "[productionCatalog] could not read the item pairing map; " +
        "production entries will not draw down stock until this succeeds",
      error,
    );
    return {};
  }
}

async function writeLegacyItemMapEntry(
  legacyItemId: string,
  inventoryItemId: string,
): Promise<void> {
  const map = await readLegacyItemMap();
  map[legacyItemId] = inventoryItemId;
  await put(METADATA_STORE, { id: LEGACY_ITEM_MAP_ID, map });
}

/** Everything the production screen needs about "what can be made". */
export async function loadProductionCatalog(): Promise<ProductionCatalog> {
  const [settings, legacyItems, inventoryItems, map] = await Promise.all([
    getAppSettings(),
    getItems(),
    getInventoryItems().catch(() => [] as InventoryItem[]),
    readLegacyItemMap(),
  ]);
  return resolveProductionCatalog({
    linkEnabled: settings.productionInventoryLinkEnabled,
    legacyItems: legacyItems as LegacyItemRow[],
    inventoryItems,
    map,
  });
}

/**
 * Finished-goods stock items that no `items` row covers yet — the rows the
 * Items screen adds to its list so they can be given a price.
 *
 * "Unpaired", not "unpriced": a stock row may already carry a rate put there
 * by the migration or the import, and it is still listed, because that seed
 * lives on a screen with no money box and the owner must be able to change
 * it. Pricing one creates the `items` row, and it drops out of here.
 *
 * Read whatever the link setting says, deliberately: with the link ON these
 * are the items the picker draws a "no money set" chip against, and with it
 * OFF they are the items Settings warns are missing from production. Both
 * complaints are answered on the same screen, so there is still exactly one
 * place a price is typed.
 */
export async function loadUnpairedStockItems(): Promise<InventoryItem[]> {
  const [legacyItems, inventoryItems, map] = await Promise.all([
    getItems(),
    getInventoryItems().catch(() => [] as InventoryItem[]),
    readLegacyItemMap(),
  ]);
  return unlinkedInventoryItems(
    legacyItems as LegacyItemRow[],
    inventoryItems,
    map,
  );
}

export type SaveTargetResult =
  | { ok: true; legacyItemId: string; inventoryItemId: string | null }
  | { ok: false; reason: "no-rate" };

/**
 * Turn a picked catalogue entry into the ids a production row is saved with.
 *
 * A stock item that has never been produced before has no `items` row, so one
 * is created on first use with the resolved rate — that is what makes an item
 * added in Inventory both selectable *and* payable. Without a rate there is
 * nothing honest to create, so the caller is told to ask for one instead of
 * writing a row worth zero rupees.
 */
export async function resolveSaveTarget(
  entry: ProductionCatalogEntry,
): Promise<SaveTargetResult> {
  if (entry.legacyItemId) {
    return {
      ok: true,
      legacyItemId: entry.legacyItemId,
      inventoryItemId: entry.inventoryItemId,
    };
  }
  if (entry.rate == null) return { ok: false, reason: "no-rate" };

  const created = await saveItem({
    name: entry.name,
    rate: entry.rate,
    code: entry.code,
  });
  const legacyItemId = String(created.id);
  if (entry.inventoryItemId) {
    await writeLegacyItemMapEntry(legacyItemId, entry.inventoryItemId);
  }
  return { ok: true, legacyItemId, inventoryItemId: entry.inventoryItemId };
}

/**
 * Give a stock item its price: create the paired `items` row and record the
 * pairing.
 *
 * This is the Items screen's write path for a stock item that has never been
 * produced, and it deliberately goes through {@link resolveSaveTarget} rather
 * than round its own `saveItem` call. Pricing and first-production then create
 * the row by exactly the same code, so an item priced here is by construction
 * an item production will accept.
 *
 * The rate must be a real one. `null` (nothing typed) and `0` are both refused
 * upstream by `validateRate`; refusing them here too means no `items` row is
 * ever born worth nothing, which is the state this whole module exists to keep
 * off the screen.
 */
export async function priceStockItem(
  stock: { id: string; name: string; code?: string },
  rate: number,
): Promise<SaveTargetResult> {
  return resolveSaveTarget({
    id: stock.id,
    name: stock.name,
    code: stock.code,
    rate: rate > 0 ? rate : null,
    legacyItemId: null,
    inventoryItemId: stock.id,
  });
}
