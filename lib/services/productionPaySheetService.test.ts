import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockGetEmployees,
  mockGetProductionsByEmployee,
  mockGetAdvancesByEmployee,
  mockGetItems,
  mockGetDeductionForPeriod,
} = vi.hoisted(() => ({
  mockGetEmployees: vi.fn(),
  mockGetProductionsByEmployee: vi.fn(),
  mockGetAdvancesByEmployee: vi.fn(),
  mockGetItems: vi.fn(),
  mockGetDeductionForPeriod: vi.fn(),
}));

vi.mock("./employeeService", () => ({
  getEmployees: mockGetEmployees,
  getEmployee: vi.fn(),
}));
vi.mock("./productionService", () => ({
  getProductionsByEmployee: mockGetProductionsByEmployee,
}));
vi.mock("./advanceService", () => ({
  getAdvancesByEmployee: mockGetAdvancesByEmployee,
}));
vi.mock("./itemService", () => ({
  getItems: mockGetItems,
}));
vi.mock("./advanceDeductionService", () => ({
  getDeductionForPeriod: mockGetDeductionForPeriod,
  getDeductionsByEmployee: vi.fn().mockResolvedValue([]),
}));

import { getProductionPaySheetForRange } from "./productionPaySheetService";

const FROM = "2026-04-01";
const TO = "2026-04-15";

function prod(
  employeeId: string,
  date: string,
  itemId: string,
  quantity: number,
  shift: "day" | "night",
): Record<string, unknown> {
  return { employeeId, date, itemId, quantity, shift };
}

describe("getProductionPaySheetForRange", () => {
  beforeEach(() => {
    mockGetEmployees.mockReset();
    mockGetProductionsByEmployee.mockReset().mockResolvedValue([]);
    mockGetAdvancesByEmployee.mockReset().mockResolvedValue([]);
    mockGetItems.mockReset().mockResolvedValue([
      { id: "i1", name: "Bolt", rate: 5 },
      { id: "i2", name: "Nut", rate: 2 },
    ]);
    mockGetDeductionForPeriod.mockReset().mockResolvedValue(null);
  });

  it("includes only production employees", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e1", name: "Asha", employeeType: "salaried" },
      { id: "e2", name: "Ravi", employeeType: "production" },
      { id: "e3", name: "Om", employeeType: "operator" },
      { id: "e4", name: "Sita" }, // no type => salaried
    ]);

    const sheet = await getProductionPaySheetForRange(FROM, TO);

    expect(sheet.rows.map((r) => r.id)).toEqual(["e2"]);
  });

  it("splits what a worker made into day and night shift, per item", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e2", name: "Ravi", employeeType: "production" },
    ]);
    mockGetProductionsByEmployee.mockResolvedValue([
      prod("e2", "2026-04-01", "i1", 10, "day"),
      prod("e2", "2026-04-02", "i1", 4, "night"),
      prod("e2", "2026-04-03", "i2", 20, "night"),
    ]);

    const sheet = await getProductionPaySheetForRange(FROM, TO);
    const row = sheet.rows[0];

    expect(row.items).toEqual([
      {
        itemName: "Bolt",
        rate: 5,
        dayQuantity: 10,
        nightQuantity: 4,
        totalQuantity: 14,
        amount: 70,
      },
      {
        itemName: "Nut",
        rate: 2,
        dayQuantity: 0,
        nightQuantity: 20,
        totalQuantity: 20,
        amount: 40,
      },
    ]);
    expect(row.dayQuantity).toBe(10);
    expect(row.nightQuantity).toBe(24);
    expect(row.totalQuantity).toBe(34);
    // 14 * 5 + 20 * 2
    expect(row.workAmount).toBe(110);
  });

  it("shows the advance to cut and takes it off the amount to pay", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e2", name: "Ravi", employeeType: "production" },
    ]);
    mockGetProductionsByEmployee.mockResolvedValue([
      prod("e2", "2026-04-01", "i1", 10, "day"),
    ]);
    mockGetAdvancesByEmployee.mockResolvedValue([
      { employeeId: "e2", date: "2026-04-05", amount: 200 },
    ]);
    mockGetDeductionForPeriod.mockResolvedValue({
      employeeId: "e2",
      periodFrom: FROM,
      periodTo: TO,
      amount: 20,
    });

    const sheet = await getProductionPaySheetForRange(FROM, TO);
    const row = sheet.rows[0];

    expect(row.workAmount).toBe(50);
    expect(row.advanceTaken).toBe(200);
    expect(row.advanceDeduction).toBe(20);
    expect(row.amountToPay).toBe(30);
  });

  it("never pays a negative amount when the advance to cut is larger", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e2", name: "Ravi", employeeType: "production" },
    ]);
    mockGetProductionsByEmployee.mockResolvedValue([
      prod("e2", "2026-04-01", "i1", 2, "day"),
    ]);
    mockGetDeductionForPeriod.mockResolvedValue({ amount: 500 });

    const sheet = await getProductionPaySheetForRange(FROM, TO);

    expect(sheet.rows[0].workAmount).toBe(10);
    expect(sheet.rows[0].amountToPay).toBe(0);
  });

  it("keeps a worker with no recorded work, with zeroes", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e2", name: "Ravi", employeeType: "production" },
    ]);

    const sheet = await getProductionPaySheetForRange(FROM, TO);

    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0].items).toEqual([]);
    expect(sheet.rows[0].workAmount).toBe(0);
    expect(sheet.rows[0].amountToPay).toBe(0);
  });

  it("totals every worker's shift quantities and money", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e2", name: "Ravi", employeeType: "production" },
      { id: "e5", name: "Kiran", employeeType: "production" },
    ]);
    mockGetProductionsByEmployee.mockImplementation(async (id: string) =>
      id === "e2"
        ? [prod("e2", "2026-04-01", "i1", 10, "day")]
        : [prod("e5", "2026-04-01", "i2", 5, "night")],
    );
    mockGetDeductionForPeriod.mockImplementation(async (id: string) =>
      id === "e2" ? { amount: 10 } : null,
    );

    const sheet = await getProductionPaySheetForRange(FROM, TO);

    expect(sheet.totals.dayQuantity).toBe(10);
    expect(sheet.totals.nightQuantity).toBe(5);
    expect(sheet.totals.totalQuantity).toBe(15);
    expect(sheet.totals.workAmount).toBe(60); // 50 + 10
    expect(sheet.totals.advanceDeduction).toBe(10);
    expect(sheet.totals.amountToPay).toBe(50); // 40 + 10
  });

  it("keeps two rates for the same item apart", async () => {
    mockGetEmployees.mockResolvedValue([
      { id: "e2", name: "Ravi", employeeType: "production" },
    ]);
    mockGetItems.mockResolvedValue([
      { id: "i1", name: "Bolt", rate: 5 },
      { id: "i1b", name: "Bolt", rate: 7 },
    ]);
    mockGetProductionsByEmployee.mockResolvedValue([
      prod("e2", "2026-04-01", "i1", 10, "day"),
      prod("e2", "2026-04-02", "i1b", 10, "day"),
    ]);

    const sheet = await getProductionPaySheetForRange(FROM, TO);

    expect(sheet.rows[0].items).toHaveLength(2);
    expect(sheet.rows[0].workAmount).toBe(120);
  });
});
