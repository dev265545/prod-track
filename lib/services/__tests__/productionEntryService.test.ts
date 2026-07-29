import { describe, expect, it, vi } from "vitest";

const { saveProduction, produceFinishedGood } = vi.hoisted(() => ({
  saveProduction: vi.fn(async (record: Record<string, unknown>) => ({ id: "prod-1", ...record })),
  produceFinishedGood: vi.fn(async () => undefined),
}));

vi.mock("../productionService", () => ({ saveProduction }));
vi.mock("../inventoryService", () => ({ produceFinishedGood }));

import { saveProductionEntry } from "../productionEntryService";

describe("saveProductionEntry", () => {
  it("requires a shift and positive quantity", async () => {
    await expect(saveProductionEntry({
      employeeId: "emp-1", itemId: "item-1", date: "2026-07-29", shift: "", quantity: 1,
    })).rejects.toThrow("shift");
    await expect(saveProductionEntry({
      employeeId: "emp-1", itemId: "item-1", date: "2026-07-29", shift: "day", quantity: 0,
    })).rejects.toThrow("quantity");
  });

  it("writes production and inventory output as one entry", async () => {
    await saveProductionEntry({
      employeeId: "emp-1", itemId: "item-1", date: "2026-07-29", shift: "night", quantity: 12, note: "Line 2",
    });
    expect(saveProduction).toHaveBeenCalledWith(expect.objectContaining({ shift: "night", note: "Line 2" }));
    expect(produceFinishedGood).toHaveBeenCalledWith("item-1", 12, "2026-07-29", "Line 2");
  });
});
