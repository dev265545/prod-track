/**
 * ProdTrack Lite - Legacy Excel importer
 *
 * Parses the ORIGINAL factory workbook (5-sheet layout: "Box, Dana, Poly
 * (4)", "Container (3)", "Sticker (2)", "Sheet1", "Glass") that predates
 * ProdTrack's own export format, and maps it onto the InventoryItem /
 * InventoryMovement model.
 *
 * The legacy sheets are messy: section/group header rows, blank rows,
 * placeholder "XYZ" rows for deleted items, and shifting column layouts
 * per sheet. Column positions below were determined empirically by
 * dumping the real factory file with `XLSX.utils.sheet_to_json(sheet,
 * { header: 1 })` and inspecting the raw rows - see the PR description /
 * task notes for the dumps. Nothing here is guessed blind.
 */
import type * as XLSX from "xlsx";

/** SheetJS is ~1MB; load it on demand so it stays out of the initial bundle. */
async function loadXlsx() {
  return import("xlsx");
}
import {
  getInventoryItems,
  saveInventoryItem,
  addMovement,
  getMovementsForItem,
  deleteMovement,
  type InventoryCategory,
  type InventoryItem,
  type InventoryUnit,
} from "./inventoryService";

/** Note tag stamped on every movement this importer creates, so a re-import
 * can find and remove its own prior movements before adding fresh ones -
 * this is what makes re-importing the same file idempotent. */
const LEGACY_IMPORT_NOTE = "Imported from legacy Excel";

const LEGACY_SHEET_NAMES = [
  "Box, Dana, Poly (4)",
  "Container (3)",
  "Sticker (2)",
  "Glass",
];

/** True if the workbook looks like the original factory .xlsm export. */
export function isLegacyWorkbook(wb: XLSX.WorkBook): boolean {
  const names = wb.SheetNames.map((n) => n.trim());
  return LEGACY_SHEET_NAMES.some((legacyName) => names.includes(legacyName));
}

function num(v: unknown): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrUndefined(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim().replace(/\s+/g, " ");
}

/** Row is a valid numeric opening-stock cell (as opposed to a text header like "B/C"). */
function isNumericCell(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return false;
  return Number.isFinite(Number(v));
}

const PLACEHOLDER_NAMES = new Set(["XYZ", "YXZ", "-", ""]);

function isPlaceholder(name: string): boolean {
  return PLACEHOLDER_NAMES.has(name.toUpperCase());
}

/** Turn an arbitrary product name into a short, stable, readable code. */
function slugCode(name: string, usedCodes: Set<string>): string {
  let base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 12);
  if (!base) base = "ITEM";
  let code = base;
  let i = 2;
  while (usedCodes.has(code)) {
    code = `${base}${i}`;
    i++;
  }
  usedCodes.add(code);
  return code;
}

export type LegacyItem = Omit<InventoryItem, "id" | "createdAt" | "updatedAt">;

export interface LegacyMovement {
  code: string;
  category: InventoryCategory;
  type: "inward" | "outward";
  qty: number;
}

interface ParseResult {
  items: LegacyItem[];
  movements: LegacyMovement[];
}

/**
 * Parse the combined "Box, Dana, Poly (4)" sheet. Three product families
 * are stacked in one sheet, separated by section-header rows (e.g. "NAME
 * OF BOXES", "NAME OF DAANA", "POLYTHENE"/"NAME OF POLYTHENE"). We track
 * the active family as we walk rows and switch on header keyword match.
 *
 * Verified column layout (0-indexed via sheet_to_json(header:1)):
 *   col0  flag ("LOW" or blank) - ignored
 *   col1  name (code is often embedded as a trailing token for box/poly)
 *   col2  CU.FT / volume (box only) - ignored
 *   col3  opening stock
 *   col4  inward
 *   col5  outward (variant A)
 *   col6  outward (variant B)
 *   col7  closing (derived, not used - we recompute from opening+movements)
 *   col8  code (box: RTxx/Bxx, poly: Rxx; dana rows always have "-" here)
 *   col10 weightPerUnit factor, kg/pc (poly only; "-"/"empty"/blank otherwise)
 */
async function parseBoxDanaPolySheet(
  ws: XLSX.WorkSheet,
  usedCodes: Set<string>
): Promise<ParseResult> {
  const XLSX = await loadXlsx();
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  });

  const items: LegacyItem[] = [];
  const movements: LegacyMovement[] = [];

  let family: "box" | "dana" | "poly" = "box";
  let sortOrder = 0;

  for (const row of rows) {
    const name = str(row[1]);
    if (!name) continue;

    const openingCell = row[3];
    const isHeaderRow = !isNumericCell(openingCell);

    if (isHeaderRow) {
      const lower = name.toLowerCase();
      if (lower.includes("poly")) family = "poly";
      else if (lower.includes("dana") || lower.includes("daana")) family = "dana";
      else if (lower.includes("box")) family = "box";
      continue; // section header, not a data row
    }

    if (isPlaceholder(name)) continue;

    const opening = num(openingCell);
    const inward = num(row[4]);
    const outwardA = num(row[5]);
    const outwardB = num(row[6]);
    const outward = outwardA + outwardB;

    const rawCode = str(row[8]);
    const code =
      rawCode && rawCode !== "-" ? rawCode : slugCode(name, usedCodes);
    if (!usedCodes.has(code)) usedCodes.add(code);

    const unit: InventoryUnit = family === "box" ? "pcs" : "kg";
    const weightPerUnit =
      family === "poly" ? numOrUndefined(row[10]) : undefined;

    items.push({
      code,
      name,
      category: family,
      unit,
      weightPerUnit,
      lowStockThreshold: 100,
      openingStock: opening,
      sortOrder: sortOrder++,
      isActive: true,
    });

    if (inward > 0) movements.push({ code, category: family, type: "inward", qty: inward });
    if (outward > 0) movements.push({ code, category: family, type: "outward", qty: outward });
  }

  return { items, movements };
}

interface SimpleSheetConfig {
  category: InventoryCategory;
  codeCol: number;
  nameCol: number;
  openingCol: number;
  inwardCols: number[];
  outwardCols: number[];
  boxCodeCol?: number;
  /** Sticker-code columns in priority order. Container carries two
   * (O and P); Glass carries one. See docs/INVENTORY_EXCEL_ANALYSIS.md
   * 5.1 Module10 `updateSTICKERS()`. */
  stickerCodeCols?: number[];
  polyCodeCol?: number;
}

/**
 * Generic parser for the single-family sheets (Container, Sticker,
 * Glass). Each has its own group/section header rows and blank
 * separator rows, but a consistent column layout for data rows.
 */
async function parseSimpleSheet(
  ws: XLSX.WorkSheet,
  config: SimpleSheetConfig,
  usedCodes: Set<string>
): Promise<ParseResult> {
  const XLSX = await loadXlsx();
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  });

  const items: LegacyItem[] = [];
  const movements: LegacyMovement[] = [];
  let sortOrder = 0;

  for (const row of rows) {
    const rawCode = str(row[config.codeCol]);
    const name = str(row[config.nameCol]) || rawCode;
    if (!name && !rawCode) continue;
    if (rawCode === "/" || rawCode === "*") continue;

    const openingCell = row[config.openingCol];
    if (!isNumericCell(openingCell)) continue; // section header / separator row

    if (isPlaceholder(name) && isPlaceholder(rawCode)) continue;

    const opening = num(openingCell);
    const inward = config.inwardCols.reduce((sum, c) => sum + num(row[c]), 0);
    const outward = config.outwardCols.reduce((sum, c) => sum + num(row[c]), 0);

    const code =
      rawCode && !isPlaceholder(rawCode) ? rawCode : slugCode(name, usedCodes);
    if (!usedCodes.has(code)) usedCodes.add(code);

    const boxCode =
      config.boxCodeCol !== undefined
        ? str(row[config.boxCodeCol]).replace(/^\*$/, "") || undefined
        : undefined;
    const stickerCodes = (config.stickerCodeCols ?? [])
      .map((c) => str(row[c]).replace(/^\*$/, ""))
      .filter((c) => c !== "");
    const polyCode =
      config.polyCodeCol !== undefined
        ? str(row[config.polyCodeCol]).replace(/^\*$/, "") || undefined
        : undefined;

    items.push({
      code,
      name,
      category: config.category,
      unit: "pcs",
      lowStockThreshold: 100,
      openingStock: opening,
      boxCode: boxCode || undefined,
      stickerCode: stickerCodes[0],
      stickerCodes: stickerCodes.length > 0 ? stickerCodes : undefined,
      polyCode: polyCode || undefined,
      sortOrder: sortOrder++,
      isActive: true,
    });

    if (inward > 0)
      movements.push({ code, category: config.category, type: "inward", qty: inward });
    if (outward > 0)
      movements.push({ code, category: config.category, type: "outward", qty: outward });
  }

  return { items, movements };
}

/**
 * Pure parser: reads the legacy workbook and returns items + pending
 * movements keyed by code+category (so callers can link them to saved
 * item ids after upserting).
 */
export async function parseLegacyWorkbook(wb: XLSX.WorkBook): Promise<{
  items: LegacyItem[];
  movements: LegacyMovement[];
}> {
  const items: LegacyItem[] = [];
  const movements: LegacyMovement[] = [];
  const usedCodes = new Set<string>();

  const boxDanaPolySheetName = wb.SheetNames.find((n) =>
    n.trim().startsWith("Box, Dana, Poly")
  );
  if (boxDanaPolySheetName) {
    const res = await parseBoxDanaPolySheet(wb.Sheets[boxDanaPolySheetName], usedCodes);
    items.push(...res.items);
    movements.push(...res.movements);
  }

  const containerSheetName = wb.SheetNames.find((n) =>
    n.trim().startsWith("Container")
  );
  if (containerSheetName) {
    // Verified layout: code=0, name=1, opening=2, inward=[3,4], outward=[5],
    // boxCode=12, stickerCode=14 AND 15 (two codes), polyCode=17.
    const res = await parseSimpleSheet(
      wb.Sheets[containerSheetName],
      {
        category: "container",
        codeCol: 0,
        nameCol: 1,
        openingCol: 2,
        inwardCols: [3, 4],
        outwardCols: [5],
        boxCodeCol: 12,
        stickerCodeCols: [14, 15],
        polyCodeCol: 17,
      },
      usedCodes
    );
    items.push(...res.items);
    movements.push(...res.movements);
  }

  const stickerSheetName = wb.SheetNames.find((n) =>
    n.trim().startsWith("Sticker")
  );
  if (stickerSheetName) {
    // Verified layout: code=0, name=1, opening=2, inward=[3], outward=[4,5].
    const res = await parseSimpleSheet(
      wb.Sheets[stickerSheetName],
      {
        category: "sticker",
        codeCol: 0,
        nameCol: 1,
        openingCol: 2,
        inwardCols: [3],
        outwardCols: [4, 5],
      },
      usedCodes
    );
    items.push(...res.items);
    movements.push(...res.movements);
  }

  const glassSheetName = wb.SheetNames.find((n) => n.trim() === "Glass");
  if (glassSheetName) {
    // Verified layout: code=0, name=1, opening=2, inward=[3,4], outward=[5],
    // boxCode=12, stickerCode=14 (single code only), polyCode=16.
    const res = await parseSimpleSheet(
      wb.Sheets[glassSheetName],
      {
        category: "glass",
        codeCol: 0,
        nameCol: 1,
        openingCol: 2,
        inwardCols: [3, 4],
        outwardCols: [5],
        boxCodeCol: 12,
        stickerCodeCols: [14],
        polyCodeCol: 16,
      },
      usedCodes
    );
    items.push(...res.items);
    movements.push(...res.movements);
  }

  return { items, movements };
}

/**
 * Upserts items (matching existing items by code+category) and creates
 * movements from a legacy workbook. Never throws on a bad row - problems
 * are collected into `skipped` instead.
 */
export async function importLegacyWorkbook(wb: XLSX.WorkBook): Promise<{
  itemsCreated: number;
  itemsUpdated: number;
  movementsCreated: number;
  skipped: string[];
}> {
  const skipped: string[] = [];
  let itemsCreated = 0;
  let itemsUpdated = 0;
  let movementsCreated = 0;

  let parsed: { items: LegacyItem[]; movements: LegacyMovement[] };
  try {
    parsed = await parseLegacyWorkbook(wb);
  } catch (err) {
    return {
      itemsCreated: 0,
      itemsUpdated: 0,
      movementsCreated: 0,
      skipped: [`Failed to parse workbook: ${String(err)}`],
    };
  }

  const existingItems = await getInventoryItems();
  const byKey = new Map<string, InventoryItem>();
  for (const item of existingItems) {
    byKey.set(`${item.category}:${item.code.toLowerCase()}`, item);
  }

  const today = new Date().toISOString().slice(0, 10);
  const savedIdByKey = new Map<string, string>();

  for (const item of parsed.items) {
    const key = `${item.category}:${item.code.toLowerCase()}`;
    try {
      const existing = byKey.get(key);
      const saved = await saveInventoryItem({
        id: existing?.id,
        code: item.code,
        name: item.name,
        category: item.category,
        unit: item.unit,
        weightPerUnit: item.weightPerUnit,
        openingStock: item.openingStock,
        lowStockThreshold: existing?.lowStockThreshold ?? item.lowStockThreshold,
        boxCode: item.boxCode,
        stickerCode: item.stickerCode,
        stickerCodes: item.stickerCodes,
        polyCode: item.polyCode,
        sortOrder: existing?.sortOrder ?? item.sortOrder,
        isActive: existing?.isActive ?? true,
      });
      if (existing) itemsUpdated++;
      else itemsCreated++;
      byKey.set(key, saved);
      savedIdByKey.set(key, saved.id);
    } catch (err) {
      skipped.push(`Item ${item.category}:${item.code} - ${String(err)}`);
    }
  }

  // Group movements by item so we only clear+recreate each item's legacy
  // movements once, regardless of how many inward/outward rows it has.
  const movementsByItemId = new Map<string, LegacyMovement[]>();
  for (const mv of parsed.movements) {
    const key = `${mv.category}:${mv.code.toLowerCase()}`;
    const itemId = savedIdByKey.get(key) ?? byKey.get(key)?.id;
    if (!itemId) {
      skipped.push(`Movement ${key} - no matching item`);
      continue;
    }
    const list = movementsByItemId.get(itemId);
    if (list) list.push(mv);
    else movementsByItemId.set(itemId, [mv]);
  }

  for (const [itemId, movements] of movementsByItemId) {
    try {
      const existingMovements = await getMovementsForItem(itemId);
      const priorLegacyMovements = existingMovements.filter(
        (m) => m.note === LEGACY_IMPORT_NOTE
      );
      for (const m of priorLegacyMovements) {
        await deleteMovement(m.id);
      }
    } catch (err) {
      skipped.push(`Reconcile movements for ${itemId} - ${String(err)}`);
      continue;
    }

    for (const mv of movements) {
      try {
        await addMovement({
          itemId,
          date: today,
          type: mv.type,
          qty: mv.qty,
          note: LEGACY_IMPORT_NOTE,
        });
        movementsCreated++;
      } catch (err) {
        skipped.push(`Movement ${itemId} - ${String(err)}`);
      }
    }
  }

  return { itemsCreated, itemsUpdated, movementsCreated, skipped };
}
