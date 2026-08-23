import { describe, expect, it } from "vitest";
import {
  STOCK_KIND_CATEGORIES,
  STOCK_KIND_LABEL_KEY,
  STOCK_KIND_SHORT_KEY,
  countStockKinds,
  stockKindFor,
} from "@/lib/services/inventoryStockKind";
import { messages } from "@/lib/i18n/messages";
import type { InventoryCategory } from "@/lib/services/inventoryService";

describe("stockKindFor", () => {
  it("treats box, dana, poly and sticker as things the factory buys", () => {
    for (const c of ["box", "dana", "poly", "sticker"] as InventoryCategory[]) {
      expect(stockKindFor(c)).toBe("bought");
    }
  });

  it("treats container and glass as things the factory makes", () => {
    expect(stockKindFor("container")).toBe("made");
    expect(stockKindFor("glass")).toBe("made");
  });

  it("covers every category exactly once", () => {
    expect(STOCK_KIND_CATEGORIES).toHaveLength(6);
    expect(new Set(STOCK_KIND_CATEGORIES).size).toBe(6);
  });
});

describe("countStockKinds", () => {
  it("counts each kind and ignores unknown categories", () => {
    const rows = [
      { category: "box" },
      { category: "dana" },
      { category: "glass" },
      { category: "nonsense" },
    ] as { category: InventoryCategory }[];
    expect(countStockKinds(rows)).toEqual({ bought: 2, made: 1 });
  });

  it("returns zeroes for an empty list", () => {
    expect(countStockKinds([])).toEqual({ bought: 0, made: 0 });
  });
});

describe("wording", () => {
  it("has en and hi text for every kind label, free of developer words", () => {
    const keys = [
      ...Object.values(STOCK_KIND_LABEL_KEY),
      ...Object.values(STOCK_KIND_SHORT_KEY),
    ];
    for (const key of keys) {
      for (const locale of ["en", "hi"] as const) {
        const text = messages[locale][key];
        expect(text.length).toBeGreaterThan(0);
        expect(text.toLowerCase()).not.toContain("raw");
        expect(text.toLowerCase()).not.toContain("finished");
      }
    }
  });
});
