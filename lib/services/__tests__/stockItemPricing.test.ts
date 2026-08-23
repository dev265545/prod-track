/**
 * The one thing this whole change is for: a thing added on the Stock screen
 * must be priceable, and once priced must be payable.
 *
 * Before, `InventoryItem.rate` was written only by the legacy migration and
 * the spreadsheet import — no form set it — so a stock item created today had
 * no rate anywhere, the picker drew "no money set", `resolveSaveTarget`
 * refused with `no-rate`, and the Items screen (which lists `items` rows) did
 * not show it at all. The operator was told to do something he had no screen
 * for.
 *
 * These tests walk that exact road: find the unpriced stock item, price it the
 * way the Items screen does, and then assert production accepts it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, getItems, saveItem, getInventoryItems, getAppSettings } =
  vi.hoisted(() => {
    const store = {
      items: [] as Record<string, unknown>[],
      inventory: [] as unknown[],
      metadata: new Map<string, Record<string, unknown>>(),
      linkEnabled: true,
      nextId: 1,
    };
    return {
      store,
      getItems: vi.fn(async () => store.items),
      saveItem: vi.fn(async (item: Record<string, unknown>) => {
        const row = { id: `item-new-${store.nextId++}`, ...item };
        store.items.push(row);
        return row;
      }),
      getInventoryItems: vi.fn(
        async () => store.inventory as import("../inventoryService").InventoryItem[],
      ),
      getAppSettings: vi.fn(async () => ({
        productionInventoryLinkEnabled: store.linkEnabled,
      })),
    };
  });

vi.mock("../itemService", () => ({ getItems, saveItem }));
vi.mock("../inventoryService", () => ({ getInventoryItems }));
vi.mock("../appSettingsService", () => ({ getAppSettings }));
vi.mock("@/lib/db/adapter", () => ({
  get: async (_store: string, id: string) => store.metadata.get(id) ?? null,
  put: async (_store: string, row: Record<string, unknown>) => {
    store.metadata.set(String(row.id), row);
  },
}));

import type { InventoryItem } from "../inventoryService";
import {
  loadProductionCatalog,
  loadUnpairedStockItems,
  priceStockItem,
  resolveEntryRate,
  resolveSaveTarget,
} from "../productionCatalog";

function stock(partial: Partial<InventoryItem> & { id: string }): InventoryItem {
  return {
    code: partial.id.toUpperCase(),
    name: "Round tin 500ml",
    category: "container",
    unit: "pcs",
    lowStockThreshold: 100,
    openingStock: 0,
    sortOrder: 0,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as InventoryItem;
}

beforeEach(() => {
  store.items = [];
  store.inventory = [];
  store.metadata = new Map();
  store.linkEnabled = true;
  store.nextId = 1;
  saveItem.mockClear();
});

describe("rate precedence", () => {
  it("prefers the items row, because that is the row pay is read from", () => {
    expect(resolveEntryRate(3, 2)).toBe(3);
  });

  it("falls back to the stock row's migrated rate when there is no items row", () => {
    expect(resolveEntryRate(undefined, 2)).toBe(2);
  });

  it("treats a missing rate and a zero rate as the same unset thing", () => {
    expect(resolveEntryRate(0, 0)).toBeNull();
    expect(resolveEntryRate(null, undefined)).toBeNull();
    expect(resolveEntryRate("", "")).toBeNull();
    // Zero on the items row must not fall through to the stock seed either:
    // zero is "nobody has priced this", not "use the other number".
    expect(resolveEntryRate(0, 4)).toBe(4);
  });
});

describe("an item created in Stock today", () => {
  beforeEach(() => {
    store.inventory = [stock({ id: "inv-1", code: "RT04" })];
  });

  it("is offered by the picker but cannot be saved, because it has no price", async () => {
    const catalog = await loadProductionCatalog();
    const entry = catalog.entries.find((e) => e.inventoryItemId === "inv-1");
    expect(entry).toBeDefined();
    expect(entry!.rate).toBeNull();
    expect(entry!.legacyItemId).toBeNull();
    await expect(resolveSaveTarget(entry!)).resolves.toEqual({
      ok: false,
      reason: "no-rate",
    });
  });

  it("shows up on the Items screen as an unpriced row", async () => {
    const unpriced = await loadUnpairedStockItems();
    expect(unpriced.map((i) => i.id)).toEqual(["inv-1"]);
  });

  it("is accepted by production once it is priced on the Items screen", async () => {
    const priced = await priceStockItem(
      { id: "inv-1", name: "Round tin 500ml", code: "RT04" },
      2.5,
    );
    expect(priced.ok).toBe(true);

    const catalog = await loadProductionCatalog();
    const entry = catalog.entries.find((e) => e.inventoryItemId === "inv-1");
    expect(entry!.rate).toBe(2.5);
    expect(entry!.legacyItemId).not.toBeNull();
    await expect(resolveSaveTarget(entry!)).resolves.toEqual({
      ok: true,
      legacyItemId: entry!.legacyItemId,
      inventoryItemId: "inv-1",
    });
  });

  it("leaves the Items screen's waiting list once it is priced", async () => {
    await priceStockItem({ id: "inv-1", name: "Round tin 500ml" }, 2.5);
    await expect(loadUnpairedStockItems()).resolves.toEqual([]);
  });

  it("refuses to create an items row worth nothing", async () => {
    await expect(
      priceStockItem({ id: "inv-1", name: "Round tin 500ml" }, 0),
    ).resolves.toEqual({ ok: false, reason: "no-rate" });
    expect(saveItem).not.toHaveBeenCalled();
    expect(store.items).toEqual([]);
  });

  it("is priceable with the stock link switched off too", async () => {
    store.linkEnabled = false;
    // Off, the picker is the legacy list only — so this item is invisible
    // there, and the Items screen is the only place it can be given a price.
    const before = await loadProductionCatalog();
    expect(before.entries).toEqual([]);
    expect(before.unlinkedInventoryNames).toEqual(["Round tin 500ml"]);

    await priceStockItem({ id: "inv-1", name: "Round tin 500ml" }, 2.5);

    const after = await loadProductionCatalog();
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0].rate).toBe(2.5);
    expect(after.unlinkedInventoryNames).toEqual([]);
    await expect(resolveSaveTarget(after.entries[0])).resolves.toMatchObject({
      ok: true,
    });
  });
});

describe("a stock item carrying a migrated rate", () => {
  it("shows that rate until the Items screen overrides it, and then the new one is paid", async () => {
    store.inventory = [stock({ id: "inv-1", rate: 2 })];
    // Still listed on Items, seed rate and all, because that seed cannot be
    // edited anywhere else.
    const unpaired = await loadUnpairedStockItems();
    expect(unpaired.map((i) => i.rate)).toEqual([2]);
    let catalog = await loadProductionCatalog();
    expect(catalog.entries[0].rate).toBe(2);

    await priceStockItem({ id: "inv-1", name: "Round tin 500ml" }, 3);

    catalog = await loadProductionCatalog();
    // The number the owner just typed, not the stale migrated copy. This is
    // the whole point of the precedence: one screen, one number, one pay.
    expect(catalog.entries[0].rate).toBe(3);
  });
});
