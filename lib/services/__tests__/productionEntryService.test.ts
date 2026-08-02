import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  saveProductionSilently,
  deleteProduction,
  produceFinishedGood,
  getAppSettings,
  readLegacyItemMap,
} = vi.hoisted(() => ({
  getAppSettings: vi.fn(async () => ({ productionInventoryLinkEnabled: true })),
  readLegacyItemMap: vi.fn(async (): Promise<Record<string, string>> => ({ "item-1": "inv-1" })),
  // The entry service writes the row silently and logs one audit entry
  // itself, so this is the export it calls.
  saveProductionSilently: vi.fn(async (record: Record<string, unknown>) => ({
    row: { id: "prod-1", ...record },
    before: null,
  })),
  deleteProduction: vi.fn(async () => undefined),
  produceFinishedGood: vi.fn(
    async (): Promise<import("../inventoryService").ProduceResult> => ({
      finishedItemId: "item-1",
      qty: 12,
      deducted: [],
      missing: [],
    }),
  ),
}));

vi.mock("../productionService", () => ({ saveProductionSilently, deleteProduction }));
vi.mock("../inventoryService", () => ({ produceFinishedGood }));
vi.mock("../appSettingsService", () => ({ getAppSettings }));
vi.mock("../productionCatalog", () => ({ readLegacyItemMap }));

import { saveProductionEntry } from "../productionEntryService";

beforeEach(() => {
  saveProductionSilently.mockClear();
  deleteProduction.mockClear();
  produceFinishedGood.mockClear();
  getAppSettings.mockClear();
  readLegacyItemMap.mockClear();
});

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
    const result = await saveProductionEntry({
      employeeId: "emp-1", itemId: "item-1", date: "2026-07-29", shift: "night", quantity: 12, note: "Line 2",
    });
    expect(saveProductionSilently).toHaveBeenCalledWith(expect.objectContaining({ shift: "night", note: "Line 2" }));
    // The stock row id from the legacy map, never the pay item id: the two
    // stores use different id spaces, so passing the pay id deducted nothing.
    expect(produceFinishedGood).toHaveBeenCalledWith("inv-1", 12, "2026-07-29", "Line 2");
    expect(result.production).toMatchObject({ id: "prod-1" });
    expect(result.inventory?.missing).toEqual([]);
  });

  it("passes unresolved BOM components back to the caller", async () => {
    produceFinishedGood.mockResolvedValueOnce({
      finishedItemId: "item-1",
      qty: 12,
      deducted: [],
      missing: [{ role: "poly" as const, code: "PL9" }],
    });

    const result = await saveProductionEntry({
      employeeId: "emp-1", itemId: "item-1", date: "2026-07-29", shift: "day", quantity: 12,
    });

    expect(result.inventory?.missing).toEqual([{ role: "poly", code: "PL9" }]);
  });

  it("still records the work when the item is not in the stock list", async () => {
    // The `items` store (name + rate, drives pay) is separate from
    // `inventory_items`; most production items exist in only one of them.
    // Treating "no stock counterpart" as a failure rolled the pay row back and
    // made production unrecordable for those items — the operator saw
    // "Nothing was saved" for an entry that should simply not touch stock.
    const notFound = Object.assign(new Error("not a stock item"), {
      code: "item-not-found",
    });
    produceFinishedGood.mockRejectedValueOnce(notFound);

    const result = await saveProductionEntry({
      employeeId: "emp-1", itemId: "item-1", date: "2026-07-29", shift: "day", quantity: 12,
    });

    expect(result.production).toMatchObject({ id: "prod-1" });
    expect(result.inventory).toBeNull();
    expect(deleteProduction).not.toHaveBeenCalled();
  });

  it("rolls the production row back when the inventory write fails", async () => {
    produceFinishedGood.mockRejectedValueOnce(new Error("disk full"));

    await expect(saveProductionEntry({
      employeeId: "emp-1", itemId: "item-1", date: "2026-07-29", shift: "day", quantity: 12,
    })).rejects.toThrow("disk full");

    expect(deleteProduction).toHaveBeenCalledWith("prod-1");
  });

  it("records the work but touches no stock when the link is switched off", async () => {
    getAppSettings.mockResolvedValueOnce({ productionInventoryLinkEnabled: false });

    const result = await saveProductionEntry({
      employeeId: "emp-1", itemId: "item-1", date: "2026-07-29", shift: "day", quantity: 12,
    });

    // Pay still gets its row; that must never depend on a setting.
    expect(saveProductionSilently).toHaveBeenCalledTimes(1);
    expect(produceFinishedGood).not.toHaveBeenCalled();
    expect(result.inventory).toBeNull();
  });

  it("skips the stock write when the item is not paired with a stock row", async () => {
    readLegacyItemMap.mockResolvedValueOnce({});

    const result = await saveProductionEntry({
      employeeId: "emp-1", itemId: "item-1", date: "2026-07-29", shift: "day", quantity: 12,
    });

    expect(produceFinishedGood).not.toHaveBeenCalled();
    expect(result.production).toMatchObject({ id: "prod-1" });
    expect(result.inventory).toBeNull();
  });

  it("uses an explicitly supplied stock row id without consulting the map", async () => {
    await saveProductionEntry({
      employeeId: "emp-1", itemId: "item-1", inventoryItemId: "inv-9",
      date: "2026-07-29", shift: "day", quantity: 5,
    });

    expect(produceFinishedGood).toHaveBeenCalledWith("inv-9", 5, "2026-07-29", undefined);
    expect(readLegacyItemMap).not.toHaveBeenCalled();
  });
});
