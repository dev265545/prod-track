import { describe, expect, it } from "vitest";
import {
  formatInventoryQuantity,
  isSelectableInventoryItem,
  matchLegacyItem,
  mergeLegacyRate,
  normalizeCatalogKey,
} from "../inventoryCatalog";
import type { InventoryItem } from "../inventoryService";

const item = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "inv-1",
  code: "BOX-01",
  name: "Small Box",
  category: "box",
  unit: "pcs",
  lowStockThreshold: 10,
  openingStock: 0,
  sortOrder: 0,
  isActive: true,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe("inventory catalog helpers", () => {
  it("normalizes codes and names for matching", () => {
    expect(normalizeCatalogKey(" Box- 01 ")).toBe("box01");
    expect(normalizeCatalogKey("Small Box")).toBe("smallbox");
  });

  it("matches legacy items by code before name", () => {
    const items = [item(), item({ id: "inv-2", code: "OTHER", name: "Small Box" })];
    const match = matchLegacyItem({ code: "box 01", name: "Different" }, items);
    expect(match && "id" in match ? match.id : null).toBe("inv-1");
  });

  it("returns no match for ambiguous name-only rows", () => {
    const items = [item(), item({ id: "inv-2", code: "OTHER", name: "Small Box" })];
    expect(matchLegacyItem({ name: "small box" }, items)).toEqual({ kind: "ambiguous", items });
  });

  it("does not overwrite an existing canonical rate", () => {
    expect(mergeLegacyRate(item({ rate: 12 }), { rate: 18 }).rate).toBe(12);
    expect(mergeLegacyRate(item(), { rate: 18 }).rate).toBe(18);
  });

  it("formats quantities to two decimal places without trailing zeroes", () => {
    expect(formatInventoryQuantity(10)).toBe("10");
    expect(formatInventoryQuantity(10.126)).toBe("10.13");
  });

  it("excludes archived items from new production selectors", () => {
    expect(isSelectableInventoryItem(item())).toBe(true);
    expect(isSelectableInventoryItem(item({ isActive: false }))).toBe(false);
  });
});
