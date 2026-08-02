import { describe, expect, it } from "vitest";
import {
  resolveProductionCatalog,
  unlinkedInventoryItems,
  type LegacyItemMap,
} from "../productionCatalog";
import type { InventoryItem } from "../inventoryService";

function stock(partial: Partial<InventoryItem> & { id: string }): InventoryItem {
  return {
    code: partial.id.toUpperCase(),
    name: "Stock item",
    category: "container",
    unit: "pcs",
    lowStockThreshold: 100,
    openingStock: 0,
    sortOrder: 0,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

const legacyItems = [
  { id: "item-1", name: "Round 500ml", rate: 2.5 },
  { id: "item-2", name: "Legacy only", rate: 1 },
];
const inventoryItems = [
  stock({ id: "inv-1", code: "RT04", name: "Round 500ml" }),
  stock({ id: "inv-2", code: "GL7", name: "New glass jar", category: "glass" }),
  stock({ id: "inv-box", code: "B1", name: "Box", category: "box" }),
];
const map: LegacyItemMap = { "item-1": "inv-1" };

describe("resolveProductionCatalog — link off", () => {
  const catalog = resolveProductionCatalog({
    linkEnabled: false,
    legacyItems,
    inventoryItems,
    map,
  });

  it("offers exactly the simple item list", () => {
    expect(catalog.source).toBe("items");
    expect(catalog.entries.map((e) => e.id)).toEqual(["item-1", "item-2"]);
    expect(catalog.entries.every((e) => e.legacyItemId === e.id)).toBe(true);
  });

  it("names the stock items that are missing from it", () => {
    // This is the client's "where are the two items I added?" — with the link
    // off they cannot be picked, so they must at least be visible as a hint.
    expect(catalog.unlinkedInventoryNames).toEqual(["New glass jar"]);
  });
});

describe("resolveProductionCatalog — link on", () => {
  const catalog = resolveProductionCatalog({
    linkEnabled: true,
    legacyItems,
    inventoryItems,
    map,
  });

  it("offers every finished stock item, raw materials excluded", () => {
    expect(catalog.source).toBe("inventory");
    expect(catalog.entries.map((e) => e.name).sort()).toEqual([
      "Legacy only",
      "New glass jar",
      "Round 500ml",
    ]);
  });

  it("keeps legacy-only items so no work becomes unrecordable", () => {
    const legacyOnly = catalog.entries.find((e) => e.name === "Legacy only");
    expect(legacyOnly).toMatchObject({
      legacyItemId: "item-2",
      inventoryItemId: null,
      rate: 1,
    });
  });

  it("carries the paired legacy rate onto a mapped stock item", () => {
    expect(catalog.entries.find((e) => e.id === "inv-1")).toMatchObject({
      legacyItemId: "item-1",
      inventoryItemId: "inv-1",
      rate: 2.5,
    });
  });

  it("reports a null rate — never 0 — for a stock item nothing prices", () => {
    // A rate of 0 would save silently and pay the worker nothing.
    expect(catalog.entries.find((e) => e.id === "inv-2")).toMatchObject({
      legacyItemId: null,
      rate: null,
    });
  });

  // The paired `items` row wins on purpose. It is the row the Items screen
  // writes and the row pay is read from; the stock row's rate is only ever a
  // copy left behind by the migration or the import, so preferring it meant a
  // price changed on Items did nothing to the pay packet.
  it("prefers the paired legacy rate over the stock item's migrated copy", () => {
    const withRate = resolveProductionCatalog({
      linkEnabled: true,
      legacyItems,
      inventoryItems: [stock({ id: "inv-1", name: "Round 500ml", rate: 4 })],
      map,
    });
    expect(withRate.entries.find((e) => e.id === "inv-1")?.rate).toBe(2.5);
  });

  it("uses the stock item's rate when no legacy row supplies one", () => {
    const withRate = resolveProductionCatalog({
      linkEnabled: true,
      legacyItems,
      inventoryItems: [stock({ id: "inv-9", name: "Only in stock", rate: 4 })],
      map,
    });
    expect(withRate.entries.find((e) => e.id === "inv-9")?.rate).toBe(4);
  });

  it("pairs by name when the map has no row, avoiding a duplicate item", () => {
    const unmapped = resolveProductionCatalog({
      linkEnabled: true,
      legacyItems,
      inventoryItems: [stock({ id: "inv-1", name: "round  500ML" })],
      map: {},
    });
    expect(unmapped.entries.find((e) => e.id === "inv-1")).toMatchObject({
      legacyItemId: "item-1",
      rate: 2.5,
    });
    // ...and the paired legacy row is not offered a second time.
    expect(unmapped.entries.filter((e) => e.name === "Round 500ml")).toHaveLength(0);
  });

  it("treats a zero or missing rate as unpriced", () => {
    const zero = resolveProductionCatalog({
      linkEnabled: true,
      legacyItems: [{ id: "item-9", name: "Free", rate: 0 }],
      inventoryItems: [],
      map: {},
    });
    expect(zero.entries[0].rate).toBeNull();
  });
});

describe("unlinkedInventoryItems", () => {
  it("ignores raw materials and already-paired items", () => {
    expect(unlinkedInventoryItems(legacyItems, inventoryItems, map).map((i) => i.id)).toEqual([
      "inv-2",
    ]);
  });

  it("ignores an item paired only by name", () => {
    expect(
      unlinkedInventoryItems(legacyItems, [stock({ id: "inv-x", name: "Round 500ml" })], {}),
    ).toEqual([]);
  });

  it("skips archived stock items", () => {
    expect(
      unlinkedInventoryItems([], [stock({ id: "inv-z", name: "Old", isActive: false })], {}),
    ).toEqual([]);
  });
});
