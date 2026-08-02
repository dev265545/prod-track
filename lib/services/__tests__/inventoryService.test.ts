import { describe, expect, it, vi, beforeEach } from "vitest";
import { STORES } from "@/lib/db/schema";
import {
  getIndexKeyPath,
  matchesIndexRange,
  sortByIndexOrder,
} from "@/lib/db/indexes";

// In-memory store keyed by store name -> id -> record, mirroring the real
// db adapter's shape (see salarySheetOverrideService.test.ts for the
// vi.hoisted + vi.mock("@/lib/db/adapter") pattern this follows).
const { store, mockGetAll, mockGetByIndex, mockGet, mockPut, mockRemove } =
  vi.hoisted(() => {
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
    // Runs the production key-matching logic over the same in-memory rows, so
    // this stays a stand-in for the adapter rather than a second definition of
    // what an index range means.
    mockGetByIndex: vi.fn(
      async (
        name: string,
        indexName: string,
        lower: string | string[],
        upper: string | string[],
      ) => {
        const keyPath = getIndexKeyPath(name, indexName);
        if (!keyPath) throw new Error(`Unknown index ${name}.${indexName}`);
        return sortByIndexOrder(
          Array.from(tableFor(name).values()).filter((row) =>
            matchesIndexRange(row, keyPath, lower, upper),
          ),
          keyPath,
        );
      },
    ),
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
  getByIndex: mockGetByIndex,
  get: mockGet,
  put: mockPut,
  remove: mockRemove,
}));

import {
  computeStock,
  produceFinishedGood,
  saveInventoryItem,
  getMovementsForItem,
  getMovements,
  getInventoryItem,
  ProduceError,
  DEFAULT_STICKERS_PER_UNIT,
  type InventoryItem,
  type InventoryMovement,
} from "../inventoryService";

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

function movement(overrides: Partial<InventoryMovement> = {}): InventoryMovement {
  return {
    id: overrides.id ?? "mov_" + Math.random().toString(36).slice(2),
    itemId: overrides.itemId ?? "item_1",
    date: overrides.date ?? "2026-01-01",
    type: overrides.type ?? "inward",
    qty: overrides.qty ?? 0,
    createdAt: overrides.createdAt ?? 1,
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

describe("computeStock", () => {
  it("is opening stock when there are no movements", () => {
    expect(computeStock(baseItem({ openingStock: 50 }), [])).toBe(50);
  });

  it("adds inward, subtracts outward, and adds signed adjustments", () => {
    const item = baseItem({ openingStock: 100 });
    const movements: InventoryMovement[] = [
      movement({ type: "inward", qty: 30 }),
      movement({ type: "outward", qty: 20 }),
      movement({ type: "adjustment", qty: -5 }),
      movement({ type: "adjustment", qty: 10 }),
      movement({ type: "inward", qty: 7 }),
    ];
    // 100 + 30 - 20 - 5 + 10 + 7 = 122
    expect(computeStock(item, movements)).toBe(122);
  });

  it("handles a negative outward-heavy ledger going below zero", () => {
    const item = baseItem({ openingStock: 5 });
    const movements: InventoryMovement[] = [movement({ type: "outward", qty: 20 })];
    expect(computeStock(item, movements)).toBe(-15);
  });
});

describe("produceFinishedGood", () => {
  async function seedBom() {
    const finished = await saveInventoryItem(
      baseItem({
        id: "finished_1",
        code: "GLASS1",
        category: "glass",
        boxCode: "BOX1",
        stickerCode: "STK1",
        polyCode: "POLY1",
      })
    );
    const box = await saveInventoryItem(
      baseItem({ id: "box_1", code: "BOX1", category: "box", openingStock: 1000 })
    );
    const sticker = await saveInventoryItem(
      baseItem({ id: "sticker_1", code: "STK1", category: "sticker", openingStock: 1000 })
    );
    const polyNoWeight = await saveInventoryItem(
      baseItem({ id: "poly_1", code: "POLY1", category: "poly", openingStock: 1000 })
    );
    return { finished, box, sticker, polyNoWeight };
  }

  it("adds an inward movement on the finished item for the produced qty", async () => {
    await seedBom();
    await produceFinishedGood("finished_1", 10, "2026-02-01");

    const finishedMovements = await getMovementsForItem("finished_1");
    expect(finishedMovements).toHaveLength(1);
    expect(finishedMovements[0]).toMatchObject({ type: "inward", qty: 10 });
  });

  it("deducts box qty 1:1, sticker qty 1:2, and poly 1:1 when weightPerUnit is unset", async () => {
    await seedBom();
    await produceFinishedGood("finished_1", 10, "2026-02-01");

    const boxMovements = await getMovementsForItem("box_1");
    const stickerMovements = await getMovementsForItem("sticker_1");
    const polyMovements = await getMovementsForItem("poly_1");

    expect(boxMovements).toHaveLength(1);
    expect(boxMovements[0]).toMatchObject({ type: "outward", qty: 10 });

    expect(stickerMovements).toHaveLength(1);
    expect(stickerMovements[0]).toMatchObject({ type: "outward", qty: 20 });

    expect(polyMovements).toHaveLength(1);
    expect(polyMovements[0]).toMatchObject({ type: "outward", qty: 10 });
  });

  it("deducts poly by qty * weightPerUnit when weightPerUnit is set", async () => {
    const finished = await saveInventoryItem(
      baseItem({
        id: "finished_2",
        code: "GLASS2",
        category: "glass",
        polyCode: "POLY2",
      })
    );
    await saveInventoryItem(
      baseItem({
        id: "poly_2",
        code: "POLY2",
        category: "poly",
        openingStock: 1000,
        weightPerUnit: 0.25,
      })
    );

    await produceFinishedGood(finished.id, 10, "2026-02-01");

    const polyMovements = await getMovementsForItem("poly_2");
    expect(polyMovements).toHaveLength(1);
    // 10 pcs * 0.25 kg/unit = 2.5 kg
    expect(polyMovements[0]).toMatchObject({ type: "outward", qty: 2.5 });
  });

  it("reports every resolved component in `deducted`", async () => {
    await seedBom();
    const result = await produceFinishedGood("finished_1", 10, "2026-02-01");

    expect(result.missing).toEqual([]);
    expect(result.deducted).toEqual([
      { role: "box", code: "BOX1", itemId: "box_1", itemName: "Item X1", qty: 10 },
      {
        role: "sticker",
        code: "STK1",
        itemId: "sticker_1",
        itemName: "Item X1",
        qty: 20,
      },
      {
        role: "poly",
        code: "POLY1",
        itemId: "poly_1",
        itemName: "Item X1",
        qty: 10,
      },
    ]);
  });

  it("throws a typed error for qty <= 0 and writes nothing", async () => {
    await seedBom();
    mockPut.mockClear();

    for (const bad of [0, -5, Number.NaN]) {
      await expect(
        produceFinishedGood("finished_1", bad, "2026-02-01")
      ).rejects.toMatchObject({ code: "invalid-qty" });
    }

    expect(await getMovementsForItem("finished_1")).toHaveLength(0);
    expect(await getMovementsForItem("box_1")).toHaveLength(0);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("throws a typed error when the finished item does not exist", async () => {
    await expect(
      produceFinishedGood("does_not_exist", 5, "2026-02-01")
    ).rejects.toBeInstanceOf(ProduceError);
    await expect(
      produceFinishedGood("does_not_exist", 5, "2026-02-01")
    ).rejects.toMatchObject({ code: "item-not-found" });

    expect(await getInventoryItem("does_not_exist")).toBeNull();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("reports unknown BOM component codes as `missing` instead of skipping silently", async () => {
    const finished = await saveInventoryItem(
      baseItem({
        id: "finished_3",
        code: "GLASS3",
        category: "glass",
        boxCode: "NOPE",
        polyCode: "PL9",
      })
    );

    const result = await produceFinishedGood(finished.id, 5, "2026-02-01");

    expect(result.deducted).toEqual([]);
    expect(result.missing).toEqual([
      { role: "box", code: "NOPE" },
      { role: "poly", code: "PL9" },
    ]);
    // The finished good is still recorded; only the components are unresolved.
    expect(await getMovementsForItem("finished_3")).toHaveLength(1);
  });

  // The original workbook's Module10 `updateSTICKERS()` matched Container
  // columns O *and* P (two distinct sticker codes) and Glass column O
  // against the Sticker sheet, deducting `value * 2` for each. Four
  // container rows in the shipped fixture carry a second, different code.
  it("deducts every sticker code, not just the first", async () => {
    await saveInventoryItem(
      baseItem({
        id: "finished_multi",
        code: "5CP-B-300-24",
        category: "container",
        stickerCodes: ["S35", "S41"],
      })
    );
    await saveInventoryItem(
      baseItem({ id: "sticker_35", code: "S35", category: "sticker" })
    );
    await saveInventoryItem(
      baseItem({ id: "sticker_41", code: "S41", category: "sticker" })
    );

    const result = await produceFinishedGood("finished_multi", 10, "2026-02-01");

    expect(result.missing).toEqual([]);
    expect(result.deducted).toEqual([
      expect.objectContaining({ role: "sticker", code: "S35", qty: 20 }),
      expect.objectContaining({ role: "sticker", code: "S41", qty: 20 }),
    ]);
    expect((await getMovementsForItem("sticker_35"))[0]).toMatchObject({ qty: 20 });
    expect((await getMovementsForItem("sticker_41"))[0]).toMatchObject({ qty: 20 });
  });

  it("reports each unresolved sticker code separately", async () => {
    await saveInventoryItem(
      baseItem({
        id: "finished_multi2",
        code: "C2",
        category: "container",
        stickerCodes: ["S35", "GONE"],
      })
    );
    await saveInventoryItem(
      baseItem({ id: "sticker_35", code: "S35", category: "sticker" })
    );

    const result = await produceFinishedGood("finished_multi2", 3, "2026-02-01");
    expect(result.missing).toEqual([{ role: "sticker", code: "GONE" }]);
    expect(result.deducted).toHaveLength(1);
  });

  it("still reads legacy rows that only have the single stickerCode field", async () => {
    // Written straight into the store, exactly as a database created before
    // `stickerCodes` existed would hold it: no such key at all.
    const legacyRow = baseItem({
      id: "finished_legacy",
      code: "OLD",
      category: "container",
      stickerCode: "S35",
    });
    await mockPut(STORES.INVENTORY_ITEMS, legacyRow as unknown as Record<string, unknown>);
    expect((await getInventoryItem("finished_legacy"))?.stickerCodes).toBeUndefined();

    await saveInventoryItem(
      baseItem({ id: "sticker_35", code: "S35", category: "sticker" })
    );

    const result = await produceFinishedGood("finished_legacy", 10, "2026-02-01");
    expect(result.deducted).toEqual([
      expect.objectContaining({ role: "sticker", code: "S35", qty: 20 }),
    ]);
  });

  it("keeps stickerCode mirrored to the first stickerCodes entry on save", async () => {
    const saved = await saveInventoryItem(
      baseItem({ id: "mirror_1", category: "container", stickerCodes: ["A1", "A2"] })
    );
    expect(saved.stickerCode).toBe("A1");
    expect(saved.stickerCodes).toEqual(["A1", "A2"]);

    // And the reverse: a single-code save populates the list.
    const legacyShape = await saveInventoryItem(
      baseItem({ id: "mirror_2", category: "container", stickerCode: "B1" })
    );
    expect(legacyShape.stickerCodes).toEqual(["B1"]);
  });

  it("uses the per-item stickersPerUnit override", async () => {
    await saveInventoryItem(
      baseItem({
        id: "finished_4",
        code: "GLASS4",
        category: "glass",
        stickerCode: "STK1",
        stickersPerUnit: 3,
      })
    );
    await saveInventoryItem(
      baseItem({ id: "sticker_1", code: "STK1", category: "sticker" })
    );

    const result = await produceFinishedGood("finished_4", 10, "2026-02-01");

    expect(result.deducted[0]).toMatchObject({ role: "sticker", qty: 30 });
    expect((await getMovementsForItem("sticker_1"))[0]).toMatchObject({ qty: 30 });
  });

  it("honours a stickersPerUnit of 0 (no sticker used)", async () => {
    await saveInventoryItem(
      baseItem({
        id: "finished_5",
        code: "GLASS5",
        category: "glass",
        stickerCode: "STK1",
        stickersPerUnit: 0,
      })
    );
    await saveInventoryItem(
      baseItem({ id: "sticker_1", code: "STK1", category: "sticker" })
    );

    const result = await produceFinishedGood("finished_5", 10, "2026-02-01");

    expect(result.deducted[0]).toMatchObject({ role: "sticker", qty: 0 });
  });

  it("falls back to the default multiplier for existing items with no stickersPerUnit", async () => {
    // Legacy row: written straight into the store without the new field.
    await saveInventoryItem(
      baseItem({
        id: "finished_6",
        code: "GLASS6",
        category: "glass",
        stickerCode: "STK1",
      })
    );
    await saveInventoryItem(
      baseItem({ id: "sticker_1", code: "STK1", category: "sticker" })
    );

    expect((await getInventoryItem("finished_6"))?.stickersPerUnit).toBeUndefined();

    const result = await produceFinishedGood("finished_6", 10, "2026-02-01");
    expect(result.deducted[0]).toMatchObject({
      qty: 10 * DEFAULT_STICKERS_PER_UNIT,
    });
  });

  it("ignores a nonsensical stickersPerUnit and uses the default", async () => {
    await saveInventoryItem(
      baseItem({
        id: "finished_7",
        code: "GLASS7",
        category: "glass",
        stickerCode: "STK1",
        stickersPerUnit: -4,
      })
    );
    await saveInventoryItem(
      baseItem({ id: "sticker_1", code: "STK1", category: "sticker" })
    );

    const result = await produceFinishedGood("finished_7", 10, "2026-02-01");
    expect(result.deducted[0]).toMatchObject({
      qty: 10 * DEFAULT_STICKERS_PER_UNIT,
    });
  });

  it("rolls back already-written movements when a later write fails", async () => {
    await seedBom();
    mockPut.mockClear();

    // Fail on the third movement write (finished inward, box outward, then boom).
    let movementWrites = 0;
    const realPut = mockPut.getMockImplementation()!;
    mockPut.mockImplementation(async (name: string, record: Record<string, unknown>) => {
      if (name === STORES.INVENTORY_MOVEMENTS) {
        movementWrites += 1;
        if (movementWrites === 3) throw new Error("disk full");
      }
      const table = store.get(name) ?? new Map<string, Record<string, unknown>>();
      store.set(name, table);
      table.set(record.id as string, record);
    });

    await expect(
      produceFinishedGood("finished_1", 10, "2026-02-01")
    ).rejects.toThrow("disk full");
    mockPut.mockImplementation(realPut);

    // Nothing is left half-written: no orphaned inward or outward movements.
    expect(await getMovements()).toHaveLength(0);
  });
});
