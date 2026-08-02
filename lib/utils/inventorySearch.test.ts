import { describe, expect, it } from "vitest";
import {
  normalizeSearchText,
  scoreInventoryMatch,
  searchInventoryItems,
} from "./inventorySearch";

interface Row {
  code: string;
  name: string;
  category: string;
}

const items: Row[] = [
  { code: "RT04", name: "Round Tin 4 inch", category: "container" },
  { code: "RT041", name: "Round Tin 4.1 inch", category: "container" },
  { code: "S41", name: "Sticker 41", category: "sticker" },
  { code: "B1", name: "Box Small", category: "box" },
  { code: "P9", name: "Poly Bag 9", category: "poly" },
  { code: "D2", name: "Dana Natural", category: "dana" },
];

const byCode = (rows: Row[]) => rows.map((r) => r.code);

describe("normalizeSearchText", () => {
  it("trims and lower-cases", () => {
    expect(normalizeSearchText("  RT04 ")).toBe("rt04");
  });

  it("handles nullish input", () => {
    expect(normalizeSearchText(undefined)).toBe("");
    expect(normalizeSearchText(null)).toBe("");
  });
});

describe("scoreInventoryMatch", () => {
  const item = { code: "RT04", name: "Round Tin 4 inch" };

  it("does not match an empty or whitespace query", () => {
    expect(scoreInventoryMatch(item, "")).toBeNull();
    expect(scoreInventoryMatch(item, "   ")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(scoreInventoryMatch(item, "zzz")).toBeNull();
  });

  it("ranks an exact code above a code prefix", () => {
    const exact = scoreInventoryMatch(item, "rt04")!;
    const prefix = scoreInventoryMatch({ code: "RT041", name: "x" }, "rt04")!;
    expect(exact).toBeGreaterThan(prefix);
  });

  it("ranks a code prefix above a name substring", () => {
    const codePrefix = scoreInventoryMatch(item, "rt")!;
    const nameSub = scoreInventoryMatch(item, "tin")!;
    expect(codePrefix).toBeGreaterThan(nameSub);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(scoreInventoryMatch(item, "  ROUND ")).toBe(
      scoreInventoryMatch(item, "round"),
    );
  });

  it("tolerates a blank code or name", () => {
    expect(scoreInventoryMatch({ code: "", name: "Box" }, "box")).not.toBeNull();
    expect(scoreInventoryMatch({ code: "B1", name: "" }, "b1")).not.toBeNull();
    expect(scoreInventoryMatch({ code: "", name: "" }, "b")).toBeNull();
  });
});

describe("searchInventoryItems", () => {
  it("returns nothing for an empty query", () => {
    expect(searchInventoryItems(items, "")).toEqual([]);
    expect(searchInventoryItems(items, "   ")).toEqual([]);
  });

  it("finds an item by exact code regardless of category", () => {
    expect(byCode(searchInventoryItems(items, "S41"))).toEqual(["S41"]);
    expect(searchInventoryItems(items, "S41")[0].category).toBe("sticker");
  });

  it("matches on code prefix, exact first", () => {
    expect(byCode(searchInventoryItems(items, "rt04"))).toEqual([
      "RT04",
      "RT041",
    ]);
  });

  it("matches on name substring, case-insensitively", () => {
    expect(byCode(searchInventoryItems(items, "tin"))).toEqual([
      "RT04",
      "RT041",
    ]);
  });

  it("searches across all categories at once", () => {
    const categories = searchInventoryItems(items, "1").map((r) => r.category);
    expect(categories).toContain("sticker");
    expect(categories).toContain("box");
  });

  it("ignores surrounding whitespace", () => {
    expect(byCode(searchInventoryItems(items, "  b1  "))).toEqual(["B1"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(searchInventoryItems(items, "nothinghere")).toEqual([]);
  });

  it("honours the limit", () => {
    expect(searchInventoryItems(items, "rt", { limit: 1 })).toHaveLength(1);
  });

  it("does not mutate the input array", () => {
    const copy = [...items];
    searchInventoryItems(items, "rt");
    expect(items).toEqual(copy);
  });

  it("breaks score ties by name", () => {
    const tied: Row[] = [
      { code: "X9", name: "Zebra Box", category: "box" },
      { code: "X8", name: "Apple Box", category: "box" },
    ];
    expect(byCode(searchInventoryItems(tied, "box"))).toEqual(["X8", "X9"]);
  });
});
