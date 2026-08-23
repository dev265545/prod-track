import { describe, expect, it } from "vitest";
import {
  buildProductionRoster,
  isProductionEmployee,
  pendingProductionRows,
  summarizeProductionRoster,
  type ProductionRosterEmployee,
  type ProductionRosterRecord,
} from "./productionRoster";

const DATE = "2026-04-10";

function emp(
  id: string,
  overrides: Partial<ProductionRosterEmployee> = {},
): ProductionRosterEmployee {
  return { id, name: id.toUpperCase(), employeeType: "production", ...overrides };
}

function prod(
  employeeId: string,
  overrides: Partial<ProductionRosterRecord> = {},
): ProductionRosterRecord {
  return {
    employeeId,
    itemId: "item_a",
    date: DATE,
    quantity: 10,
    shift: "day",
    ...overrides,
  };
}

describe("isProductionEmployee", () => {
  it("is true only for the production pay type", () => {
    expect(isProductionEmployee({ employeeType: "production" })).toBe(true);
    expect(isProductionEmployee({ employeeType: "salaried" })).toBe(false);
    expect(isProductionEmployee({ employeeType: "operator" })).toBe(false);
    expect(isProductionEmployee({})).toBe(false);
  });
});

describe("buildProductionRoster", () => {
  it("lists only active production employees, in the given order", () => {
    const rows = buildProductionRoster({
      date: DATE,
      employees: [
        emp("p1"),
        emp("s1", { employeeType: "salaried" }),
        emp("o1", { employeeType: "operator" }),
        emp("p2", { isActive: false }),
        emp("p3"),
      ],
      productions: [],
    });
    expect(rows.map((r) => r.employeeId)).toEqual(["p1", "p3"]);
  });

  it("marks a person with no lines as not recorded", () => {
    const [row] = buildProductionRoster({
      date: DATE,
      employees: [emp("p1")],
      productions: [],
    });
    expect(row.recorded).toBe(false);
    expect(row.lines).toBe(0);
    expect(row.totalQty).toBe(0);
    expect(row.itemIds).toEqual([]);
  });

  it("totals quantity across items and splits it by shift", () => {
    const [row] = buildProductionRoster({
      date: DATE,
      employees: [emp("p1")],
      productions: [
        prod("p1", { itemId: "item_a", quantity: 10, shift: "day" }),
        prod("p1", { itemId: "item_b", quantity: 5, shift: "night" }),
        prod("p1", { itemId: "item_a", quantity: 2, shift: "day" }),
      ],
    });
    expect(row.recorded).toBe(true);
    expect(row.lines).toBe(3);
    expect(row.totalQty).toBe(17);
    expect(row.dayQty).toBe(12);
    expect(row.nightQty).toBe(5);
    expect(row.itemIds).toEqual(["item_a", "item_b"]);
  });

  it("treats a missing or unknown shift as day, matching saveProduction", () => {
    const [row] = buildProductionRoster({
      date: DATE,
      employees: [emp("p1")],
      productions: [
        prod("p1", { quantity: 4, shift: undefined }),
        prod("p1", { quantity: 3, shift: "morning" }),
      ],
    });
    expect(row.dayQty).toBe(7);
    expect(row.nightQty).toBe(0);
  });

  it("ignores lines belonging to another date", () => {
    const [row] = buildProductionRoster({
      date: DATE,
      employees: [emp("p1")],
      productions: [
        prod("p1", { date: "2026-04-09", quantity: 99 }),
        prod("p1", { quantity: 6 }),
      ],
    });
    expect(row.lines).toBe(1);
    expect(row.totalQty).toBe(6);
  });

  it("counts a zero-quantity line as written down", () => {
    const [row] = buildProductionRoster({
      date: DATE,
      employees: [emp("p1")],
      productions: [prod("p1", { quantity: 0 })],
    });
    expect(row.recorded).toBe(true);
    expect(row.totalQty).toBe(0);
  });

  it("does not attribute one person's lines to another", () => {
    const rows = buildProductionRoster({
      date: DATE,
      employees: [emp("p1"), emp("p2")],
      productions: [prod("p1", { quantity: 8 })],
    });
    expect(rows[0].totalQty).toBe(8);
    expect(rows[1].recorded).toBe(false);
  });
});

describe("summarizeProductionRoster", () => {
  const rows = buildProductionRoster({
    date: DATE,
    employees: [emp("p1"), emp("p2"), emp("p3"), emp("p4")],
    productions: [prod("p1", { quantity: 10 }), prod("p3", { quantity: 5 })],
  });

  it("counts recorded, pending and total made", () => {
    const summary = summarizeProductionRoster(rows);
    expect(summary).toEqual({
      total: 4,
      recorded: 2,
      pending: 2,
      totalQty: 15,
      percent: 50,
    });
  });

  it("reports 100% when there is nobody to record", () => {
    expect(summarizeProductionRoster([]).percent).toBe(100);
    expect(summarizeProductionRoster([]).pending).toBe(0);
  });

  it("names the pending people in roster order", () => {
    expect(pendingProductionRows(rows).map((r) => r.employeeId)).toEqual([
      "p2",
      "p4",
    ]);
  });
});
