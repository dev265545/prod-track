/**
 * Excel export -> re-import round-trip, through the REAL IndexedDB adapter
 * (fake-indexeddb), the same way legacyImportIntegration.test.ts works.
 *
 * The point of a round-trip test rather than "does export produce a sheet":
 * a column that the exporter never writes, or that the importer never reads,
 * looks perfectly fine on both sides in isolation and quietly loses data the
 * moment an owner exports, edits and re-imports their stock file. That is
 * exactly how the second sticker code and the per-item sticker count used to
 * disappear.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import path from "node:path";
import { readFileSync } from "node:fs";

// See legacyImportIntegration.test.ts for why the close/reset/delete dance is
// needed: lib/db/indexeddb.ts caches its open handle at module scope.
beforeEach(async () => {
  const { DB_NAME } = await import("@/lib/db/schema");
  try {
    const { openDB } = await import("@/lib/db/adapter");
    const db = (await openDB()) as IDBDatabase | undefined;
    db?.close?.();
  } catch {
    /* first test in the file: nothing open yet */
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

/** Turn a workbook into the File the import entry point takes. */
function workbookToFile(wb: XLSX.WorkBook, name = "inventory.xlsx"): File {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([buf], name, { type: "application/octet-stream" });
}

/** The fields a round-trip must preserve, in a comparable shape. */
async function snapshotInventory() {
  const { getInventoryItems, getStockLevels, stickerCodesFor } = await import(
    "@/lib/services/inventoryService"
  );
  const items = await getInventoryItems();
  const levels = await getStockLevels();
  const stockById = new Map(levels.map((l) => [l.id, l.currentStock]));
  return items
    .map((item) => ({
      code: item.code,
      name: item.name,
      category: item.category,
      unit: item.unit,
      openingStock: item.openingStock,
      lowStockThreshold: item.lowStockThreshold,
      boxCode: item.boxCode ?? undefined,
      polyCode: item.polyCode ?? undefined,
      stickerCodes: stickerCodesFor(item),
      stickersPerUnit: item.stickersPerUnit,
      currentStock: stockById.get(item.id) ?? 0,
    }))
    .sort((a, b) =>
      `${a.category}:${a.code}`.localeCompare(`${b.category}:${b.code}`),
    );
}

describe("inventory Excel export -> import round-trip", () => {
  it("re-imports its own export to exactly the same data", async () => {
    const { saveInventoryItem, addMovement, getStockLevels, getMovements } =
      await import("@/lib/services/inventoryService");
    const { buildInventoryWorkbook, importInventoryFromFile } = await import(
      "@/lib/services/inventoryExcel"
    );

    // A finished item with the full bill of materials, plus a raw one.
    const cap = await saveInventoryItem({
      code: "C1",
      name: "Cap 28mm",
      category: "container",
      unit: "pcs",
      openingStock: 40,
      lowStockThreshold: 25,
      boxCode: "B4",
      stickerCodes: ["S35", "S41"],
      stickersPerUnit: 3,
      polyCode: "R2",
      sortOrder: 0,
      isActive: true,
    });
    await saveInventoryItem({
      code: "B4",
      name: "Box Four",
      category: "box",
      unit: "pcs",
      openingStock: 100,
      lowStockThreshold: 10,
      sortOrder: 0,
      isActive: true,
    });
    await addMovement({
      itemId: cap.id,
      date: "2026-07-01",
      type: "inward",
      qty: 60,
    });
    await addMovement({
      itemId: cap.id,
      date: "2026-07-02",
      type: "outward",
      qty: 10,
    });

    const before = await snapshotInventory();
    expect(before.find((i) => i.code === "C1")?.stickerCodes).toEqual([
      "S35",
      "S41",
    ]);

    const wb = await buildInventoryWorkbook(
      await getStockLevels(),
      await getMovements(),
    );
    const result = await importInventoryFromFile(workbookToFile(wb));

    // Same codes, so everything is an update — no duplicates.
    expect(result.itemsCreated).toBe(0);
    expect(result.itemsUpdated).toBe(2);
    expect(await snapshotInventory()).toEqual(before);
  });

  it("does not mistake its own export for the legacy factory workbook", async () => {
    // ProdTrack's export writes one sheet per category, "Glass" among them.
    // Matching legacy workbooks on the name "Glass" made the app route its own
    // export to the legacy importer, which found none of the legacy sheets and
    // imported nothing at all — an owner's edited stock file vanished silently.
    const { saveInventoryItem, getStockLevels, getMovements } = await import(
      "@/lib/services/inventoryService"
    );
    const { buildInventoryWorkbook } = await import(
      "@/lib/services/inventoryExcel"
    );
    const { isLegacyWorkbook } = await import(
      "@/lib/services/legacyInventoryImport"
    );

    await saveInventoryItem({
      code: "G1",
      name: "Glass jar",
      category: "glass",
      unit: "pcs",
      openingStock: 7,
      lowStockThreshold: 10,
      sortOrder: 0,
      isActive: true,
    });
    const wb = await buildInventoryWorkbook(
      await getStockLevels(),
      await getMovements(),
    );

    expect(wb.SheetNames).toContain("Glass");
    expect(isLegacyWorkbook(wb)).toBe(false);

    // …while the real factory file still is one.
    const legacyWb = XLSX.read(readFileSync(FIXTURE_PATH), { type: "buffer" });
    expect(isLegacyWorkbook(legacyWb)).toBe(true);
  });

  it("imports the rows of its own export instead of silently importing zero", async () => {
    const { saveInventoryItem, getStockLevels, getMovements } = await import(
      "@/lib/services/inventoryService"
    );
    const { buildInventoryWorkbook, importInventoryFromFile } = await import(
      "@/lib/services/inventoryExcel"
    );

    await saveInventoryItem({
      code: "G2",
      name: "Glass jar two",
      category: "glass",
      unit: "pcs",
      openingStock: 7,
      lowStockThreshold: 10,
      sortOrder: 0,
      isActive: true,
    });
    const wb = await buildInventoryWorkbook(
      await getStockLevels(),
      await getMovements(),
    );
    const result = await importInventoryFromFile(workbookToFile(wb));
    expect(result.itemsCreated + result.itemsUpdated).toBe(1);
  });

  it("is idempotent: export -> import -> export leaves the stock untouched", async () => {
    // The Inward/Outward cells are running totals, not deltas. Adding them as
    // fresh movements on top of the existing ones doubled the stock on every
    // re-import: 40 opening + 60 in - 10 out came back as 140, then 240.
    const { saveInventoryItem, addMovement, getStockLevels, getMovements } =
      await import("@/lib/services/inventoryService");
    const { buildInventoryWorkbook, importInventoryFromFile } = await import(
      "@/lib/services/inventoryExcel"
    );

    const cap = await saveInventoryItem({
      code: "C9",
      name: "Cap 28mm",
      category: "container",
      unit: "pcs",
      openingStock: 40,
      lowStockThreshold: 25,
      stickerCodes: ["S35", "S41"],
      stickersPerUnit: 3,
      sortOrder: 0,
      isActive: true,
    });
    await addMovement({
      itemId: cap.id,
      date: "2026-07-01",
      type: "inward",
      qty: 60,
    });
    await addMovement({
      itemId: cap.id,
      date: "2026-07-02",
      type: "outward",
      qty: 10,
    });

    const stockOf = async () =>
      (await getStockLevels()).find((l) => l.code === "C9")!.currentStock;
    expect(await stockOf()).toBe(90);

    const before = await snapshotInventory();
    const exportRows = async () => {
      const wb = await buildInventoryWorkbook(
        await getStockLevels(),
        await getMovements(),
      );
      return {
        wb,
        rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(
          wb.Sheets["Container"],
        ),
      };
    };

    // Re-importing identical bytes short-circuits on the stored hash, which
    // would make this test pass without the import ever running. Clear it so
    // the real import path executes on every cycle.
    const { setInventoryImportHash } = await import(
      "@/lib/services/inventoryService"
    );

    const first = await exportRows();
    // Two full cycles: one import can look stable by luck, two cannot.
    await importInventoryFromFile(workbookToFile(first.wb), { mode: "update" });
    expect(await stockOf()).toBe(90);
    const second = await exportRows();
    await setInventoryImportHash("");
    await importInventoryFromFile(workbookToFile(second.wb), { mode: "update" });
    expect(await stockOf()).toBe(90);
    const third = await exportRows();

    expect(second.rows).toEqual(first.rows);
    expect(third.rows).toEqual(first.rows);
    expect(await snapshotInventory()).toEqual(before);
  });

  it("keeps the second sticker code and stickersPerUnit across the round-trip", async () => {
    const { saveInventoryItem, getStockLevels, getMovements, stickerCodesFor } =
      await import("@/lib/services/inventoryService");
    const { buildInventoryWorkbook, importInventoryFromFile } = await import(
      "@/lib/services/inventoryExcel"
    );

    await saveInventoryItem({
      code: "C2",
      name: "Two stickers",
      category: "container",
      unit: "pcs",
      openingStock: 5,
      lowStockThreshold: 10,
      stickerCodes: ["S35", "S41"],
      stickersPerUnit: 4,
      sortOrder: 0,
      isActive: true,
    });

    const wb = await buildInventoryWorkbook(
      await getStockLevels(),
      await getMovements(),
    );
    // The workbook itself must carry both codes and the count.
    const sheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets["Container"],
    );
    const row = sheet.find((r) => r["Code"] === "C2")!;
    expect(row["Sticker Code"]).toBe("S35");
    expect(row["Sticker Code 2"]).toBe("S41");
    expect(row["Stickers Per Unit"]).toBe(4);

    await importInventoryFromFile(workbookToFile(wb));

    const { getInventoryItems } = await import(
      "@/lib/services/inventoryService"
    );
    const reimported = (await getInventoryItems()).find((i) => i.code === "C2")!;
    expect(stickerCodesFor(reimported)).toEqual(["S35", "S41"]);
    expect(reimported.stickersPerUnit).toBe(4);
  });

  it("leaves stickersPerUnit unset when the item never had an override", async () => {
    const { saveInventoryItem, getStockLevels, getMovements } = await import(
      "@/lib/services/inventoryService"
    );
    const { buildInventoryWorkbook, importInventoryFromFile } = await import(
      "@/lib/services/inventoryExcel"
    );

    await saveInventoryItem({
      code: "C3",
      name: "Default stickers",
      category: "container",
      unit: "pcs",
      openingStock: 1,
      lowStockThreshold: 10,
      stickerCodes: ["S1"],
      sortOrder: 0,
      isActive: true,
    });

    const wb = await buildInventoryWorkbook(
      await getStockLevels(),
      await getMovements(),
    );
    await importInventoryFromFile(workbookToFile(wb));

    const { getInventoryItems } = await import(
      "@/lib/services/inventoryService"
    );
    const item = (await getInventoryItems()).find((i) => i.code === "C3")!;
    // Blank cell must stay "no override", not become 0.
    expect(item.stickersPerUnit).toBeUndefined();
  });

  it("re-exports the real legacy workbook after importing it, without losing sticker codes", async () => {
    const { importInventoryFromFile } = await import(
      "@/lib/services/inventoryExcel"
    );
    const legacyFile = new File(
      [readFileSync(FIXTURE_PATH)],
      "legacy-inventory.xlsm",
      { type: "application/octet-stream" },
    );
    const legacyResult = await importInventoryFromFile(legacyFile);
    expect(legacyResult.itemsCreated).toBeGreaterThan(200);

    const before = await snapshotInventory();
    const twoStickers = before.filter((i) => i.stickerCodes.length === 2);
    expect(twoStickers.length).toBeGreaterThan(0);

    const { buildInventoryWorkbook } = await import(
      "@/lib/services/inventoryExcel"
    );
    const { getStockLevels, getMovements } = await import(
      "@/lib/services/inventoryService"
    );
    const wb = await buildInventoryWorkbook(
      await getStockLevels(),
      await getMovements(),
    );
    await importInventoryFromFile(workbookToFile(wb));

    expect(await snapshotInventory()).toEqual(before);
  });
});
