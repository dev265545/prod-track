/**
 * ProdTrack Lite - Inventory Excel import/export
 */
import type * as XLSX from "xlsx";

/** SheetJS is ~1MB; load it on demand so it stays out of the initial bundle. */
async function loadXlsx() {
  return import("xlsx");
}
import {
  getInventoryItems,
  saveInventoryItemSilently,
  addMovementSilently,
  getMovementsForItem,
  deleteMovementSilently,
  getStockLevels,
  getStockLevelsWithMovements,
  clearInventory,
  getInventoryImportHash,
  setInventoryImportHash,
  stickerCodesFor,
  INVENTORY_CATEGORIES,
  type InventoryCategory,
  type InventoryItem,
  type InventoryMovement,
} from "./inventoryService";
import { isLegacyWorkbook, importLegacyWorkbook } from "./legacyInventoryImport";
import { hashArrayBuffer } from "@/lib/utils/hash";
import { AUDIT_ACTIONS, record as auditRecord } from "./auditService";
import { plural } from "./auditNames";

/** Note stamped on every movement this importer creates, so a re-import can
 * find and remove its own prior movements before adding fresh ones — this is
 * what makes re-importing the same workbook idempotent. Mirrors
 * LEGACY_IMPORT_NOTE in legacyInventoryImport.ts. */
const EXCEL_IMPORT_NOTE = "Imported from Excel";

function categoryLabel(cat: InventoryCategory): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function isFinished(cat: InventoryCategory): boolean {
  return INVENTORY_CATEGORIES.find((c) => c.value === cat)?.layer === "finished";
}

function sumByType(
  movements: InventoryMovement[],
  itemId: string,
  type: "inward" | "outward"
): number {
  return movements
    .filter((m) => m.itemId === itemId && m.type === type)
    .reduce((sum, m) => sum + m.qty, 0);
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type StockLevelRow = Awaited<ReturnType<typeof getStockLevels>>[number];

/**
 * Build a multi-sheet Excel workbook, one sheet per category, from already
 * loaded stock levels + movements. Pure (no I/O), so it's separated out from
 * exportInventoryToWorkbook to be independently testable.
 */
export async function buildInventoryWorkbook(
  stockLevels: StockLevelRow[],
  movements: InventoryMovement[]
): Promise<XLSX.WorkBook> {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();

  for (const { value: category } of INVENTORY_CATEGORIES) {
    const items = stockLevels.filter((i) => i.category === category);
    const finished = isFinished(category);

    const baseHeader = [
      "Code",
      "Name",
      "Unit",
      "Opening",
      "Inward",
      "Outward",
      "Closing",
      "Threshold",
      "Status",
    ];
    // Finished goods carry their bill of materials. Both sticker codes and the
    // per-unit sticker count get their own columns: exporting only the first
    // code silently dropped the second one on the next import.
    const header = finished
      ? [
          ...baseHeader,
          "Box Code",
          "Sticker Code",
          "Sticker Code 2",
          "Stickers Per Unit",
          "Poly Code",
        ]
      : baseHeader;

    const rows: (string | number)[][] = [header];

    for (const item of items) {
      const inward = sumByType(movements, item.id, "inward");
      const outward = sumByType(movements, item.id, "outward");
      const row: (string | number)[] = [
        item.code,
        item.name,
        item.unit,
        item.openingStock,
        inward,
        outward,
        item.currentStock,
        item.lowStockThreshold,
        item.isLow ? "LOW" : "OK",
      ];
      if (finished) {
        const stickers = stickerCodesFor(item);
        row.push(
          item.boxCode ?? "",
          stickers[0] ?? "",
          stickers[1] ?? "",
          // Blank, not 0: no override must stay no override on re-import.
          item.stickersPerUnit === undefined ? "" : item.stickersPerUnit,
          item.polyCode ?? "",
        );
      }
      rows.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, categoryLabel(category));
  }

  return wb;
}

/**
 * Export all inventory items to a multi-sheet Excel workbook, one sheet per
 * category, and trigger a browser download.
 */
export async function exportInventoryToWorkbook(): Promise<void> {
  const { levels: stockLevels, movements } =
    await getStockLevelsWithMovements();

  const wb = await buildInventoryWorkbook(stockLevels, movements);


  const XLSX = await loadXlsx();
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/octet-stream",
  });
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerBrowserDownload(blob, `inventory-${dateStr}.xlsx`);
  void auditRecord(
    AUDIT_ACTIONS.inventoryExport,
    "inventory_items",
    null,
    `The stock list was downloaded as a spreadsheet (${plural(stockLevels.length, "item", "items")})`,
    { items: stockLevels.length, movements: movements.length },
  );
}

function findCategoryForSheet(sheetName: string): InventoryCategory | null {
  const lower = sheetName.trim().toLowerCase();
  const match = INVENTORY_CATEGORIES.find((c) => c.value === lower);
  return match ? match.value : null;
}

function num(v: unknown): number {
  return Number(v) || 0;
}

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

interface ParsedRow {
  [key: string]: unknown;
}

export type InventoryImportMode = "update" | "replace";

export interface InventoryImportResult {
  mode: InventoryImportMode;
  unchanged: boolean;
  itemsCreated: number;
  itemsUpdated: number;
  movementsCreated: number;
  skipped: string[];
}

/**
 * Parse an uploaded .xlsx file and upsert inventory items + movements from
 * each sheet whose name matches a known category.
 *
 * Two modes:
 * - "update" (default): upsert items by code+category, reconcile movements.
 *   Before doing anything, the raw file bytes are hashed; if the hash
 *   matches the last successful import's stored hash, nothing is touched
 *   and `unchanged: true` is returned.
 * - "replace": wipes ALL existing inventory items + movements first, then
 *   imports fresh from the file. Destructive.
 *
 * On a successful (non-unchanged) import, the file's hash is stored so a
 * subsequent identical "update" import can short-circuit.
 */
export async function importInventoryFromFile(
  file: File,
  opts?: { mode?: InventoryImportMode }
): Promise<InventoryImportResult> {
  const mode: InventoryImportMode = opts?.mode ?? "update";
  const buffer = await file.arrayBuffer();
  const hash = hashArrayBuffer(buffer);

  if (mode === "update") {
    const storedHash = await getInventoryImportHash();
    if (storedHash !== null && storedHash === hash) {
      return {
        mode,
        unchanged: true,
        itemsCreated: 0,
        itemsUpdated: 0,
        movementsCreated: 0,
        skipped: [],
      };
    }
  }

  if (mode === "replace") {
    await clearInventory();
  }

  const XLSX = await loadXlsx();
  const wb = XLSX.read(buffer, { type: "array" });

  if (isLegacyWorkbook(wb)) {
    const result = await importLegacyWorkbook(wb);
    await setInventoryImportHash(hash);
    logInventoryImport(file.name, mode, result);
    return { mode, unchanged: false, ...result };
  }

  const existingItems = await getInventoryItems();
  const byKey = new Map<string, InventoryItem>();
  for (const item of existingItems) {
    byKey.set(`${item.category}:${item.code.toLowerCase()}`, item);
  }

  let itemsCreated = 0;
  let itemsUpdated = 0;
  let movementsCreated = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const sheetName of wb.SheetNames) {
    const category = findCategoryForSheet(sheetName);
    if (!category) continue;

    const sheet = wb.Sheets[sheetName];
    const rows: ParsedRow[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    for (const row of rows) {
      const code = str(row["Code"]);
      if (!code) continue; // skip empty rows

      const name = str(row["Name"]) || code;
      const unit = str(row["Unit"]).toLowerCase() === "kg" ? "kg" : "pcs";
      const opening = num(row["Opening"]);
      const inward = num(row["Inward"]);
      const outward = num(row["Outward"]);
      const threshold = row["Threshold"] !== undefined && row["Threshold"] !== ""
        ? num(row["Threshold"])
        : undefined;
      const boxCode = str(row["Box Code"]) || undefined;
      const stickerCodes = [
        str(row["Sticker Code"]),
        str(row["Sticker Code 2"]),
      ].filter((c) => c !== "");
      const stickersPerUnitCell = row["Stickers Per Unit"];
      const stickersPerUnit =
        stickersPerUnitCell === undefined ||
        stickersPerUnitCell === null ||
        stickersPerUnitCell === "" ||
        !Number.isFinite(Number(stickersPerUnitCell))
          ? undefined
          : Number(stickersPerUnitCell);
      const polyCode = str(row["Poly Code"]) || undefined;

      const key = `${category}:${code.toLowerCase()}`;
      const existing = byKey.get(key);

      const saved = await saveInventoryItemSilently({
        id: existing?.id,
        code,
        name,
        category,
        unit,
        openingStock: opening,
        lowStockThreshold: threshold ?? existing?.lowStockThreshold ?? 100,
        boxCode,
        stickerCodes: stickerCodes.length > 0 ? stickerCodes : undefined,
        stickersPerUnit,
        polyCode,
        sortOrder: existing?.sortOrder ?? 0,
        isActive: existing?.isActive ?? true,
      });

      if (existing) {
        itemsUpdated++;
      } else {
        itemsCreated++;
        byKey.set(key, saved);
      }

      // The Inward/Outward cells are this item's TOTAL movement, not a delta,
      // so the file is the source of truth and its numbers replace whatever
      // movement rows are on record — they do not stack on top of them.
      // Adding to them instead is what made an owner's own export re-import to
      // double the stock: opening 40 + 60 in - 10 out came back as 140.
      for (const prior of await getMovementsForItem(saved.id)) {
        await deleteMovementSilently(prior.id);
      }

      if (inward > 0) {
        await addMovementSilently({
          itemId: saved.id,
          date: today,
          type: "inward",
          qty: inward,
          note: EXCEL_IMPORT_NOTE,
        });
        movementsCreated++;
      }
      if (outward > 0) {
        await addMovementSilently({
          itemId: saved.id,
          date: today,
          type: "outward",
          qty: outward,
          note: EXCEL_IMPORT_NOTE,
        });
        movementsCreated++;
      }
    }
  }

  await setInventoryImportHash(hash);
  const result = { itemsCreated, itemsUpdated, movementsCreated, skipped: [] };
  logInventoryImport(file.name, mode, result);
  return { mode, unchanged: false, ...result };
}

/**
 * One entry per imported file, with counts.
 *
 * The item and movement writes underneath deliberately use the silent
 * variants: a 300-row workbook is one thing the operator did, and 300 entries
 * would make the log useless for everything else that happened that day.
 */
function logInventoryImport(
  fileName: string,
  mode: InventoryImportMode,
  result: {
    itemsCreated: number;
    itemsUpdated: number;
    movementsCreated: number;
    skipped: string[];
  },
): void {
  const how =
    mode === "replace"
      ? "replacing the whole stock list"
      : "updating the stock list";
  void auditRecord(
    AUDIT_ACTIONS.inventoryImport,
    "inventory_items",
    null,
    `A stock spreadsheet was imported, ${how}: ${result.itemsCreated} items added, ${result.itemsUpdated} updated, ${result.movementsCreated} stock movements written`,
    {
      fileName,
      mode,
      itemsCreated: result.itemsCreated,
      itemsUpdated: result.itemsUpdated,
      movementsCreated: result.movementsCreated,
      rowsSkipped: result.skipped.length,
    },
  );
}
