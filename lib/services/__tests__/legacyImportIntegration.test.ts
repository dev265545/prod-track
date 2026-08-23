/**
 * Full integration test: import -> persist -> readback through the REAL
 * IndexedDB adapter (backed by fake-indexeddb, not a hand-rolled mock),
 * exercising the actual legacy factory workbook file.
 *
 * Unlike inventoryService.test.ts / legacyInventoryImport.test.ts (which
 * mock @/lib/db/adapter with an in-memory Map), this test imports the
 * real lib/db/indexeddb.ts module against a fake IndexedDB implementation
 * so the whole storage path - keyPath, transactions, put/get/getAll - is
 * genuinely exercised.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import * as XLSX from "xlsx";

// Each test gets a clean database: fake-indexeddb keeps a registry of
// databases across the process, so delete + reopen between tests.
//
// lib/db/indexeddb.ts caches its open IDBDatabase handle at module scope
// (dbInstance). Two things are needed for a clean slate on every test:
//  1. Explicitly close() the previous test's still-open connection first -
//     otherwise indexedDB.deleteDatabase() only fires "blocked" (it never
//     actually completes), and once a delete is stuck pending, any
//     subsequent open() call queues behind it and hangs forever.
//  2. vi.resetModules() so the NEXT test's dynamic imports get a fresh
//     lib/db/indexeddb.ts module instance (dbInstance reset to null),
//     rather than reusing the now-closed cached handle from step 1.
beforeEach(async () => {
  const { DB_NAME } = await import("@/lib/db/schema");
  try {
    const { openDB } = await import("@/lib/db/adapter");
    const db = (await openDB()) as IDBDatabase | undefined;
    db?.close?.();
  } catch {
    // no prior connection yet (first test in the file) - nothing to close
  }
  vi.resetModules();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

const FIXTURE_PATH = path.join(__dirname, "fixtures", "legacy-inventory.xlsm");

describe("legacy inventory import - full integration via real IndexedDB adapter", () => {
  // Column P of the Container sheet holds a SECOND, different sticker code
  // on exactly four rows of the real workbook. The original VBA
  // updateSTICKERS() read columns O *and* P; the first port read only O, so
  // S41 was imported nowhere and never deducted.
  it("imports BOTH sticker codes for the container rows that have two", async () => {
    const { importLegacyWorkbook } = await import(
      "@/lib/services/legacyInventoryImport"
    );
    const { getInventoryItems, stickerCodesFor } = await import(
      "@/lib/services/inventoryService"
    );

    await importLegacyWorkbook(XLSX.readFile(FIXTURE_PATH));

    const containers = (await getInventoryItems()).filter(
      (i) => i.category === "container"
    );
    const twoStickers = containers.filter((i) => stickerCodesFor(i).length === 2);

    // Measured directly from the fixture: 4 rows, all with differing codes.
    expect(twoStickers).toHaveLength(4);
    for (const item of twoStickers) {
      const [first, second] = stickerCodesFor(item);
      expect(first.toUpperCase()).not.toBe(second.toUpperCase());
      expect(second.toUpperCase()).toBe("S41");
      // The legacy single-code field still resolves, to the first code.
      expect(item.stickerCode).toBe(first);
    }

    // Glass never uses the second column.
    const glass = (await getInventoryItems()).filter((i) => i.category === "glass");
    expect(glass.every((i) => stickerCodesFor(i).length <= 1)).toBe(true);
  });

  it("persists ~271 items with correct per-category counts and round-trips known items", async () => {
    // Re-import fresh each test run since indexeddb.ts caches an open db
    // handle at module scope; but since vitest gives each test file its
    // own module registry per run (not per test), we instead rely on the
    // deleteDatabase above and the fact that indexeddb.ts's dbInstance
    // cache still points at a (now-deleted) db. To be safe we import
    // indexeddb fresh via resetModules.
    const { importLegacyWorkbook } = await import(
      "@/lib/services/legacyInventoryImport"
    );
    const { getStockLevels } = await import("@/lib/services/inventoryService");

    const wb = XLSX.readFile(FIXTURE_PATH);

    const result = await importLegacyWorkbook(wb);
    expect(result.skipped).toEqual([]);

    const stockLevels = await getStockLevels();

    // --- total count ---
    expect(stockLevels.length).toBeGreaterThanOrEqual(250);

    // --- per-category counts ---
    const countByCategory = (cat: string) =>
      stockLevels.filter((i) => i.category === cat).length;

    expect(countByCategory("box")).toBeGreaterThanOrEqual(20);
    expect(countByCategory("container")).toBeGreaterThanOrEqual(60);
    expect(countByCategory("sticker")).toBeGreaterThanOrEqual(50);
    expect(countByCategory("glass")).toBeGreaterThanOrEqual(50);
    expect(countByCategory("poly")).toBeGreaterThanOrEqual(15);
    expect(countByCategory("dana")).toBeGreaterThanOrEqual(15);

    // --- known item round-trips ---
    const rt04 = stockLevels.find((i) => i.code.toUpperCase() === "RT04");
    expect(rt04).toBeTruthy();

    const container = stockLevels.find(
      (i) => i.category === "container" && i.code.toUpperCase() === "RD-180-6"
    );
    expect(container).toBeTruthy();
    expect(
      container?.boxCode || container?.stickerCode || container?.polyCode
    ).toBeTruthy();

    const polyWithWeight = stockLevels.find(
      (i) => i.category === "poly" && (i.weightPerUnit ?? 0) > 0
    );
    expect(polyWithWeight).toBeTruthy();

    // currentStock reflects openingStock (+/- any movements) for a sampled item
    const sample = stockLevels[0];
    expect(sample.currentStock).toBe(sample.currentStock); // sanity: defined number
    expect(typeof sample.currentStock).toBe("number");
    // Directly verify computeStock semantics against the persisted item +
    // its movements, for a real sampled item.
    const { getMovementsForItem, computeStock } = await import(
      "@/lib/services/inventoryService"
    );
    const movements = await getMovementsForItem(sample.id);
    const expectedStock = computeStock(sample, movements);
    expect(sample.currentStock).toBe(expectedStock);

    // --- second import must be fully idempotent ---
    // Note: the workbook contains some duplicate code+category rows within
    // a single import pass itself (result.itemsUpdated above is > 0 even
    // on the very first import), so itemsUpdated on re-import will equal
    // the *total row count* parsed from the sheets, not the distinct item
    // count. What matters for "no duplication" is: itemsCreated stays 0,
    // the persisted item count is unchanged, AND the total movement count
    // is unchanged (the importer must clear its own prior movements before
    // recreating them, rather than accumulating duplicates on every run).
    const countBeforeSecondImport = stockLevels.length;
    const movementsBeforeSecondImport = await getMovementsForItem(sample.id);
    const totalMovementsBeforeSecondImport = (
      await Promise.all(stockLevels.map((i) => getMovementsForItem(i.id)))
    ).reduce((sum, ms) => sum + ms.length, 0);

    const wb2 = XLSX.readFile(FIXTURE_PATH);
    const result2 = await importLegacyWorkbook(wb2);
    expect(result2.itemsCreated).toBe(0);

    const stockLevelsAfterSecondImport = await getStockLevels();
    expect(stockLevelsAfterSecondImport.length).toBe(countBeforeSecondImport);

    const totalMovementsAfterSecondImport = (
      await Promise.all(
        stockLevelsAfterSecondImport.map((i) => getMovementsForItem(i.id))
      )
    ).reduce((sum, ms) => sum + ms.length, 0);
    expect(totalMovementsAfterSecondImport).toBe(totalMovementsBeforeSecondImport);

    const sampleAfterSecondImport = stockLevelsAfterSecondImport.find(
      (i) => i.id === sample.id
    );
    expect(sampleAfterSecondImport).toBeTruthy();
    expect(sampleAfterSecondImport?.currentStock).toBe(sample.currentStock);

    const movementsAfterSecondImport = await getMovementsForItem(sample.id);
    expect(movementsAfterSecondImport.length).toBe(
      movementsBeforeSecondImport.length
    );
  });
});

describe("importInventoryFromFile - modes and hash short-circuit", () => {
  it("update mode: re-importing the identical file is a no-op (hash short-circuit)", async () => {
    const { importInventoryFromFile } = await import(
      "@/lib/services/inventoryExcel"
    );
    const { getInventoryItems, getMovements } = await import(
      "@/lib/services/inventoryService"
    );

    const buffer = await import("node:fs").then((fs) =>
      fs.readFileSync(FIXTURE_PATH)
    );
    const makeFile = () =>
      new File([new Uint8Array(buffer)], "legacy-inventory.xlsm", {
        type: "application/octet-stream",
      });

    const first = await importInventoryFromFile(makeFile(), { mode: "update" });
    expect(first.unchanged).toBe(false);
    expect(first.itemsCreated).toBeGreaterThan(0);

    const itemsAfterFirst = await getInventoryItems();
    const movementsAfterFirst = await getMovements();

    const second = await importInventoryFromFile(makeFile(), { mode: "update" });
    expect(second.unchanged).toBe(true);
    expect(second.itemsCreated).toBe(0);
    expect(second.itemsUpdated).toBe(0);
    expect(second.movementsCreated).toBe(0);

    const itemsAfterSecond = await getInventoryItems();
    const movementsAfterSecond = await getMovements();
    expect(itemsAfterSecond.length).toBe(itemsAfterFirst.length);
    expect(movementsAfterSecond.length).toBe(movementsAfterFirst.length);
  });

  it("replace mode: re-importing after an update import does not double items/movements", async () => {
    const { importInventoryFromFile } = await import(
      "@/lib/services/inventoryExcel"
    );
    const { getInventoryItems, getMovements } = await import(
      "@/lib/services/inventoryService"
    );

    const buffer = await import("node:fs").then((fs) =>
      fs.readFileSync(FIXTURE_PATH)
    );
    const makeFile = () =>
      new File([new Uint8Array(buffer)], "legacy-inventory.xlsm", {
        type: "application/octet-stream",
      });

    const updateResult = await importInventoryFromFile(makeFile(), {
      mode: "update",
    });
    expect(updateResult.unchanged).toBe(false);

    const itemsAfterUpdate = await getInventoryItems();
    const movementsAfterUpdate = await getMovements();

    const replaceResult = await importInventoryFromFile(makeFile(), {
      mode: "replace",
    });
    expect(replaceResult.unchanged).toBe(false);

    const itemsAfterReplace = await getInventoryItems();
    const movementsAfterReplace = await getMovements();

    expect(itemsAfterReplace.length).toBe(itemsAfterUpdate.length);
    expect(movementsAfterReplace.length).toBe(movementsAfterUpdate.length);
  });

  it("replace mode clears manually-added items that aren't in the imported file", async () => {
    const { importInventoryFromFile } = await import(
      "@/lib/services/inventoryExcel"
    );
    const { saveInventoryItem, getInventoryItems } = await import(
      "@/lib/services/inventoryService"
    );

    const buffer = await import("node:fs").then((fs) =>
      fs.readFileSync(FIXTURE_PATH)
    );
    const makeFile = () =>
      new File([new Uint8Array(buffer)], "legacy-inventory.xlsm", {
        type: "application/octet-stream",
      });

    await importInventoryFromFile(makeFile(), { mode: "update" });
    const pureImportCount = (await getInventoryItems()).length;

    await saveInventoryItem({
      code: "MANUAL-ITEM",
      name: "Manually added",
      category: "box",
      unit: "pcs",
      openingStock: 1,
      lowStockThreshold: 1,
      sortOrder: 0,
      isActive: true,
    });
    const countWithManualItem = (await getInventoryItems()).length;
    expect(countWithManualItem).toBe(pureImportCount + 1);

    await importInventoryFromFile(makeFile(), { mode: "replace" });

    const itemsAfterReplace = await getInventoryItems();
    expect(itemsAfterReplace.some((i) => i.code === "MANUAL-ITEM")).toBe(
      false
    );
    expect(itemsAfterReplace.length).toBe(pureImportCount);
  });
});
