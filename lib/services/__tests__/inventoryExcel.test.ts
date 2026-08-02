import { describe, expect, it, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { STORES } from "@/lib/db/schema";

const { store, mockGetAll, mockGet, mockPut, mockRemove } = vi.hoisted(() => {
  const store = new Map<string, Map<string, Record<string, unknown>>>();
  const tableFor = (name: string) => {
    let t = store.get(name);
    if (!t) {
      t = new Map();
      store.set(name, t);
    }
    return t;
  };
  return {
    store,
    mockGetAll: vi.fn(async (name: string) => Array.from(tableFor(name).values())),
    mockGet: vi.fn(async (name: string, id: string) => tableFor(name).get(id) ?? null),
    mockPut: vi.fn(async (name: string, record: Record<string, unknown>) => {
      tableFor(name).set(record.id as string, record);
    }),
    mockRemove: vi.fn(async (name: string, id: string) => {
      tableFor(name).delete(id);
    }),
  };
});

vi.mock("@/lib/db/adapter", () => ({
  STORES,
  getAll: mockGetAll,
  get: mockGet,
  put: mockPut,
  remove: mockRemove,
}));

import {
  saveInventoryItem,
  addMovement,
  getStockLevels,
  getMovements,
  type InventoryItem,
} from "../inventoryService";
import { buildInventoryWorkbook, importInventoryFromFile } from "../inventoryExcel";

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: overrides.id ?? "item_1",
    code: overrides.code ?? "X1",
    name: overrides.name ?? "Item X1",
    category: overrides.category ?? "box",
    unit: overrides.unit ?? "pcs",
    lowStockThreshold: overrides.lowStockThreshold ?? 100,
    openingStock: overrides.openingStock ?? 0,
    sortOrder: overrides.sortOrder ?? 0,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    ...overrides,
  };
}

beforeEach(() => {
  store.clear();
  mockGetAll.mockClear();
  mockGet.mockClear();
  mockPut.mockClear();
  mockRemove.mockClear();
});

describe("buildInventoryWorkbook", () => {
  it("builds one sheet per category with a header row and a data row per item", async () => {
    await saveInventoryItem(baseItem({ id: "box_1", code: "B1", category: "box", openingStock: 40 }));
    await addMovement({ itemId: "box_1", date: "2026-01-01", type: "inward", qty: 10 });
    await addMovement({ itemId: "box_1", date: "2026-01-02", type: "outward", qty: 5 });

    const stockLevels = await getStockLevels();
    const movements = await getMovements();

    const wb = await buildInventoryWorkbook(stockLevels, movements);

    expect(wb.SheetNames).toEqual([
      "Box",
      "Dana",
      "Poly",
      "Container",
      "Sticker",
      "Glass",
    ]);

    const boxSheet = wb.Sheets["Box"];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(boxSheet, {
      header: 1,
      defval: "",
    });

    expect(rows[0]).toEqual([
      "Code",
      "Name",
      "Unit",
      "Opening",
      "Inward",
      "Outward",
      "Closing",
      "Threshold",
      "Status",
    ]);
    // opening 40 + inward 10 - outward 5 = 45, which is below the threshold of 100 -> LOW
    expect(rows[1]).toEqual(["B1", "Item X1", "pcs", 40, 10, 5, 45, 100, "LOW"]);
  });

  it("adds BOM columns for finished-layer categories", async () => {
    await saveInventoryItem(
      baseItem({
        id: "glass_1",
        code: "G1",
        category: "glass",
        boxCode: "B1",
        stickerCode: "S1",
        polyCode: "P1",
      })
    );
    const stockLevels = await getStockLevels();
    const movements = await getMovements();
    const wb = await buildInventoryWorkbook(stockLevels, movements);

    const glassSheet = wb.Sheets["Glass"];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(glassSheet, {
      header: 1,
      defval: "",
    });
    expect(rows[0]).toContain("Box Code");
    expect(rows[1]).toEqual(
      expect.arrayContaining(["G1", "B1", "S1", "P1"])
    );
  });
});

describe("importInventoryFromFile", () => {
  function makeWorkbookFile(sheetName: string, rows: Record<string, unknown>[]): File {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    return new File([buf], "import.xlsx", {
      type: "application/octet-stream",
    });
  }

  it("creates new items and inward/outward movements from a category sheet", async () => {
    const file = makeWorkbookFile("Box", [
      {
        Code: "B2",
        Name: "Box Two",
        Unit: "pcs",
        Opening: 20,
        Inward: 15,
        Outward: 3,
        Threshold: 50,
      },
    ]);

    const result = await importInventoryFromFile(file);

    expect(result).toEqual({
      mode: "update",
      unchanged: false,
      itemsCreated: 1,
      itemsUpdated: 0,
      movementsCreated: 2,
      skipped: [],
    });

    const stockLevels = await getStockLevels();
    const created = stockLevels.find((i) => i.code === "B2");
    expect(created).toBeTruthy();
    expect(created?.openingStock).toBe(20);
    expect(created?.lowStockThreshold).toBe(50);
    // 20 opening + 15 inward - 3 outward = 32
    expect(created?.currentStock).toBe(32);
  });

  it("updates an existing item (matched by category+code) instead of duplicating it", async () => {
    await saveInventoryItem(
      baseItem({ id: "box_existing", code: "B3", category: "box", openingStock: 5, lowStockThreshold: 10 })
    );

    const file = makeWorkbookFile("Box", [
      { Code: "B3", Name: "Box Three Updated", Unit: "pcs", Opening: 8 },
    ]);

    const result = await importInventoryFromFile(file);

    expect(result.itemsCreated).toBe(0);
    expect(result.itemsUpdated).toBe(1);

    const stockLevels = await getStockLevels();
    const items = stockLevels.filter((i) => i.code === "B3");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Box Three Updated");
    expect(items[0].openingStock).toBe(8);
    // Threshold column omitted in the sheet -> keeps existing item's threshold.
    expect(items[0].lowStockThreshold).toBe(10);
  });

  it("skips sheets whose name doesn't match a known category", async () => {
    const file = makeWorkbookFile("NotACategory", [{ Code: "Z1", Name: "Zed" }]);
    const result = await importInventoryFromFile(file);
    expect(result).toEqual({
      mode: "update",
      unchanged: false,
      itemsCreated: 0,
      itemsUpdated: 0,
      movementsCreated: 0,
      skipped: [],
    });
  });
});
