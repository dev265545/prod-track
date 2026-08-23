import { describe, it, expect } from "vitest";
import {
  countRecentShown,
  orderPickerItems,
  rankPickerItems,
  type PickerSearchItem,
} from "@/lib/utils/pickerSearch";

const CATALOG: PickerSearchItem[] = [
  { id: "1", name: "Round Tin", code: "RT04", rate: 2 },
  { id: "2", name: "Square Jar", code: "S41", rate: null },
  { id: "3", name: "Bottle", code: "B1", rate: 5 },
  { id: "4", name: "Sports Bottle Cap", rate: 1 },
  { id: "5", name: "Big Round Tin", code: "RT08", rate: 3 },
];

describe("rankPickerItems", () => {
  it("finds an item by the code printed on the stock", () => {
    expect(rankPickerItems(CATALOG, "RT04").map((i) => i.id)).toEqual(["1"]);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(rankPickerItems(CATALOG, "  rt04 ").map((i) => i.id)).toEqual(["1"]);
  });

  it("ranks a code prefix above a name substring", () => {
    // "b1" is the code of Bottle; it is also inside no name, so add a case
    // where both kinds of match exist for the same query.
    const ids = rankPickerItems(CATALOG, "s").map((i) => i.id);
    // S41 (code prefix) must come before the name matches.
    expect(ids[0]).toBe("2");
    expect(ids).toContain("4");
  });

  it("matches a substring in the middle of a name", () => {
    expect(rankPickerItems(CATALOG, "tin").map((i) => i.id).sort()).toEqual([
      "1",
      "5",
    ]);
  });

  it("returns items with no code at all when the name matches", () => {
    expect(rankPickerItems(CATALOG, "sports").map((i) => i.id)).toEqual(["4"]);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(rankPickerItems(CATALOG, "zzz")).toEqual([]);
  });

  it("returns nothing for an empty query", () => {
    expect(rankPickerItems(CATALOG, "   ")).toEqual([]);
  });

  it("gives back the caller's own objects, not adapted copies", () => {
    expect(rankPickerItems(CATALOG, "RT04")[0]).toBe(CATALOG[0]);
  });
});

describe("orderPickerItems", () => {
  it("shows the whole list when the search box is empty", () => {
    expect(orderPickerItems(CATALOG, "").map((i) => i.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("floats recently used items to the top, most recent first", () => {
    expect(orderPickerItems(CATALOG, "", ["3", "5"]).map((i) => i.id)).toEqual([
      "3",
      "5",
      "1",
      "2",
      "4",
    ]);
  });

  it("never repeats an item that is both recent and in the list", () => {
    const ids = orderPickerItems(CATALOG, "", ["1", "1", "3"]).map((i) => i.id);
    expect(ids).toEqual(["1", "3", "2", "4", "5"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ignores recent ids that are no longer in the catalogue", () => {
    expect(orderPickerItems(CATALOG, "", ["gone", "3"]).map((i) => i.id)).toEqual(
      ["3", "1", "2", "4", "5"],
    );
  });

  it("drops the recent ordering once the operator types", () => {
    expect(orderPickerItems(CATALOG, "RT04", ["3"]).map((i) => i.id)).toEqual([
      "1",
    ]);
  });
});

describe("countRecentShown", () => {
  it("counts only the recent ids present in the list", () => {
    expect(countRecentShown(CATALOG, ["3", "5", "gone"])).toBe(2);
  });

  it("is zero with no recent ids", () => {
    expect(countRecentShown(CATALOG)).toBe(0);
  });
});
