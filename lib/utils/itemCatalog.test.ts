import { describe, expect, it } from "vitest";
import {
  countUnpricedItems,
  filterItemRows,
  itemMatchesQuery,
  isStockRow,
  normalizeItemRows,
  stockItemRow,
  validateStockRate,
  rateToInput,
  readStoredRate,
  sortItemRows,
  validateRate,
  type ItemRow,
} from "./itemCatalog";

function item(partial: Partial<ItemRow> & { id: string }): ItemRow {
  return { name: partial.id, rate: null, ...partial };
}

describe("readStoredRate", () => {
  it("keeps zero apart from unset", () => {
    expect(readStoredRate(0)).toBe(0);
    expect(readStoredRate(undefined)).toBeNull();
    expect(readStoredRate(null)).toBeNull();
    expect(readStoredRate("")).toBeNull();
  });

  it("reads numeric strings written by older builds", () => {
    expect(readStoredRate("12.5")).toBe(12.5);
  });

  it("treats junk and negatives as unset rather than as a number", () => {
    expect(readStoredRate("abc")).toBeNull();
    expect(readStoredRate(-4)).toBeNull();
    expect(readStoredRate(Number.NaN)).toBeNull();
  });
});

describe("normalizeItemRows", () => {
  it("keeps name, code and rate, and drops rows with no id", () => {
    const rows = normalizeItemRows([
      { id: "a", name: "Round Tin", code: "RT04", rate: 3 },
      { name: "no id", rate: 1 },
    ]);
    expect(rows).toEqual([
      { id: "a", name: "Round Tin", code: "RT04", rate: 3, origin: "items" },
    ]);
  });

  it("drops a blank code instead of showing an empty chip", () => {
    expect(normalizeItemRows([{ id: "a", name: "X", code: "  " }])[0].code)
      .toBeUndefined();
  });

  it("carries a stored zero through as zero, not as unset", () => {
    expect(normalizeItemRows([{ id: "a", name: "X", rate: 0 }])[0].rate).toBe(0);
  });
});

describe("sortItemRows", () => {
  it("puts unpriced items first, then sorts by name", () => {
    const sorted = sortItemRows([
      item({ id: "1", name: "Bottle", rate: 2 }),
      item({ id: "2", name: "Zinc lid", rate: null }),
      item({ id: "3", name: "Anchor", rate: 5 }),
      item({ id: "4", name: "Cap", rate: null }),
    ]);
    expect(sorted.map((r) => r.name)).toEqual([
      "Cap",
      "Zinc lid",
      "Anchor",
      "Bottle",
    ]);
  });

  it("sorts a zero rate with the priced items, not with the unset ones", () => {
    const sorted = sortItemRows([
      item({ id: "1", name: "Aaa", rate: 0 }),
      item({ id: "2", name: "Zzz", rate: null }),
    ]);
    expect(sorted.map((r) => r.name)).toEqual(["Zzz", "Aaa"]);
  });

  it("ignores case when ordering names", () => {
    const sorted = sortItemRows([
      item({ id: "1", name: "banana", rate: 1 }),
      item({ id: "2", name: "Apple", rate: 1 }),
    ]);
    expect(sorted.map((r) => r.name)).toEqual(["Apple", "banana"]);
  });

  it("does not mutate the input", () => {
    const rows = [item({ id: "1", name: "B", rate: 1 }), item({ id: "2", name: "A", rate: 1 })];
    sortItemRows(rows);
    expect(rows.map((r) => r.name)).toEqual(["B", "A"]);
  });
});

describe("itemMatchesQuery", () => {
  const tin = item({ id: "1", name: "Round Tin", code: "RT04", rate: 3 });

  it("matches on a part of the name, ignoring case and spaces", () => {
    expect(itemMatchesQuery(tin, "round tin")).toBe(true);
    expect(itemMatchesQuery(tin, "ROUNDTIN")).toBe(true);
    expect(itemMatchesQuery(tin, "tin")).toBe(true);
  });

  it("matches on the code written on the item", () => {
    expect(itemMatchesQuery(tin, "rt04")).toBe(true);
    expect(itemMatchesQuery(tin, "rt-04")).toBe(true);
  });

  it("matches Hindi names", () => {
    const hindi = item({ id: "2", name: "गोल डिब्बा", rate: 2 });
    expect(itemMatchesQuery(hindi, "डिब्बा")).toBe(true);
    expect(itemMatchesQuery(hindi, "बोतल")).toBe(false);
  });

  it("returns everything for an empty or punctuation-only query", () => {
    expect(itemMatchesQuery(tin, "")).toBe(true);
    expect(itemMatchesQuery(tin, "   ")).toBe(true);
  });

  it("does not match an unrelated word", () => {
    expect(itemMatchesQuery(tin, "bottle")).toBe(false);
  });

  it("survives an item with no code", () => {
    expect(itemMatchesQuery(item({ id: "3", name: "Cap" }), "rt04")).toBe(false);
  });
});

describe("filterItemRows", () => {
  it("filters and keeps the unpriced-first order", () => {
    const rows = [
      item({ id: "1", name: "Tin big", rate: 4 }),
      item({ id: "2", name: "Tin small", rate: null }),
      item({ id: "3", name: "Bottle", rate: 2 }),
    ];
    expect(filterItemRows(rows, "tin").map((r) => r.name)).toEqual([
      "Tin small",
      "Tin big",
    ]);
  });
});

describe("countUnpricedItems", () => {
  it("counts only items with no rate at all", () => {
    expect(
      countUnpricedItems([
        item({ id: "1", rate: null }),
        item({ id: "2", rate: 0 }),
        item({ id: "3", rate: 7 }),
        item({ id: "4", rate: null }),
      ]),
    ).toBe(2);
  });
});

describe("validateRate", () => {
  it("accepts a plain number", () => {
    expect(validateRate("12")).toEqual({ ok: true, rate: 12 });
    expect(validateRate(" 12.50 ")).toEqual({ ok: true, rate: 12.5 });
  });

  it("treats a blank or half-typed box as 'not priced yet'", () => {
    expect(validateRate("")).toEqual({ ok: true, rate: null });
    expect(validateRate("   ")).toEqual({ ok: true, rate: null });
    expect(validateRate(".")).toEqual({ ok: true, rate: null });
  });

  it("rejects zero, because the entry screen would read it as no rate", () => {
    expect(validateRate("0")).toEqual({ ok: false, problem: "zero" });
    expect(validateRate("0.00")).toEqual({ ok: false, problem: "zero" });
  });

  it("rejects a negative rate", () => {
    expect(validateRate("-5")).toEqual({ ok: false, problem: "negative" });
  });

  it("rejects text", () => {
    expect(validateRate("abc")).toEqual({ ok: false, problem: "invalid" });
  });
});

describe("rateToInput", () => {
  it("shows an empty box for an unset rate and the number otherwise", () => {
    expect(rateToInput(null)).toBe("");
    expect(rateToInput(0)).toBe("0");
    expect(rateToInput(12.5)).toBe("12.5");
  });
});

describe("stock rows — items added on the Stock screen, waiting for a price", () => {
  it("namespaces the id so it can never collide with an items row", () => {
    const row = stockItemRow({ id: "inv-1", name: "Round tin", code: "RT04" });
    expect(row.id).toBe("stock:inv-1");
    expect(row.stockItemId).toBe("inv-1");
    expect(isStockRow(row)).toBe(true);
  });

  it("falls back to the code when the stock item has no name", () => {
    expect(stockItemRow({ id: "inv-1", name: "", code: "RT04" }).name).toBe("RT04");
  });

  it("shows no money when the stock item has none", () => {
    expect(stockItemRow({ id: "inv-1", name: "Tin" }).rate).toBeNull();
    // A migrated seed rate is real money and is shown as such.
    expect(stockItemRow({ id: "inv-1", name: "Tin", rate: 2.5 }).rate).toBe(2.5);
  });

  it("counts as unpriced work until it is given money", () => {
    const rows = [
      stockItemRow({ id: "inv-1", name: "Tin" }),
      stockItemRow({ id: "inv-2", name: "Jar", rate: 3 }),
    ];
    expect(countUnpricedItems(rows)).toBe(1);
    // Unpriced first, wherever it came from.
    expect(sortItemRows(rows)[0].name).toBe("Tin");
  });

  it("is searchable by its stock code like any other row", () => {
    const rows = [stockItemRow({ id: "inv-1", name: "Round tin", code: "RT04" })];
    expect(filterItemRows(rows, "rt04")).toHaveLength(1);
  });

  it("marks rows read from the items store as such", () => {
    expect(normalizeItemRows([{ id: "a", name: "X" }])[0].origin).toBe("items");
    expect(isStockRow(normalizeItemRows([{ id: "a", name: "X" }])[0])).toBe(false);
  });
});

describe("validateStockRate", () => {
  it("refuses blank, because there is no row yet to leave unpriced", () => {
    expect(validateStockRate("")).toEqual({ ok: false, problem: "missing" });
    expect(validateStockRate("   ")).toEqual({ ok: false, problem: "missing" });
  });

  it("still refuses zero with the same answer as everywhere else", () => {
    expect(validateStockRate("0")).toEqual({ ok: false, problem: "zero" });
  });

  it("accepts a real amount", () => {
    expect(validateStockRate("2.50")).toEqual({ ok: true, rate: 2.5 });
  });
});
