import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { STORES } from "@/lib/db/schema";
import {
  getIndexKeyPath,
  matchesIndexRange,
  sortByIndexOrder,
} from "@/lib/db/indexes";

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
  isLegacyWorkbook,
  parseLegacyWorkbook,
  importLegacyWorkbook,
} from "../legacyInventoryImport";
import { getInventoryItems, getMovements } from "../inventoryService";

/** Build a synthetic legacy-shaped "Box, Dana, Poly (4)" sheet. */
function buildBoxDanaPolySheet(): (string | number)[][] {
  return [
    [" ", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], // blank row
    ["", "NAME OF BOXES ", "CU.FT", "B/C", "IN", "A", "B", "B/C", "BOX TYPE", "", "", "", "", "", "", "", "", "", ""], // section header
    [" ", " FANCY D RT 04", 4.5, 100, "", 10, 0, 90, "RT04", "", "", "", "", "", "", "", "", "", ""], // data row
    ["LOW", "XYZ", "", 0, "", "", "", 0, "-", "", "", "", "", "", "", "", "", "", ""], // placeholder row - skip
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], // blank row
    ["", "NAME OF DAANA ", "", "B/C", "", "", "", "B/C", "-", "", "", "", "", "", "", "", "", "", ""], // section header
    [" ", "H0 50 MN ", "", 200, "", 5, 5, 190, "-", "", "", "", "", "", "", "", "", "", ""], // dana data row
    ["", "POLYTHENE", "", "B/C (kg)", "", "A", "B", "B/C (kg)", "-", "-", "", "", "", "", "", "", "", "", ""], // section header
    ["LOW", "80 DIA PRINTED R 8", "", 50, "", 2, 0, 48, "R8", "-", 0.25, "", "", 0, 0, "", "", "", ""], // poly data row
  ];
}

function buildContainerSheet(): (string | number)[][] {
  return [
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "R.D CONTAINER + LID ", "OBC", "A", "B", "D", "B/C", "", "", "", "", "", "BOX CODE", "", "STICKER CODE", "", "", "POLY CODE", ""], // header
    ["RD-180-6", "RD-180ML-6.0[1000pcs] (R2/B4)", 58, "", "", 5, 53, "LOW", "", "", "", "", "B4", "", "S1", "", "", "R2", ""], // data
    // Real workbook rows like "5CP-B-300-24" carry a SECOND sticker code in
    // column P (index 15) that the original updateSTICKERS() macro also
    // deducted from. See docs/INVENTORY_EXCEL_ANALYSIS.md 5.1 Module10.
    ["5CP-B-300-24", "5 CP 300ML", 40, "", "", 0, 40, "LOW", "", "", "", "", "B4", "", "S35", "S41", "", "R2", ""], // data, two sticker codes
    ["", "R.C.T CONTAINER + LID ", "B/C", "", "", "", "B/C", "", "", "", "", "", "*", "", "*", "", "", "*", ""], // section header
    ["XYZ", "XYZ", 0, "", "", "", 0, "LOW", "", "", "", "", "*", "", "*", "", "", "*", ""], // placeholder - skip
  ];
}

function buildStickerSheet(): (string | number)[][] {
  return [
    ["", "", "", "", 1, 2, "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "R.CT STICKER ", "B/C", "IN", "A", "B", "B/C", "", "", "", "", "", "", "", "", "", "", "", "", ""], // header
    ["S19", "300, 400 ML 32 MM", 510, "", "", "", 510, " ", "", "", "", "", "", "", "", "", "", "", "", ""], // data
    ["/", "R.D STICKER", "B/C", "", "", "", "B/C", " ", "", "", "", "", "", "", "", "", "", "", "", ""], // section header with "/" code
    ["S1", "180 ML ", -384, "", "", "", -384, "LOW", "", "", "", "", "", "", "", "", "", "", "", ""], // data (negative opening)
  ];
}

function buildGlassSheet(): (string | number)[][] {
  return [
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "SMALL RECTANGULAR BOX[SSB]", "B/C", "A", "B", "D", "B/C", "", "", "", "", "", "BOX  CODE", "", "STICKER", "", "POLY CODE", "", ""], // header
    ["SSB-250", "SSB-250ML-7.0[1000pcs] 42mm R10/B16", 237, 53, "", "", 290, " ", "", "", "", "", "B16", "", "S51", "", "R10", "", ""], // data
    ["", "G STOCK", "B/C", "", "", "", "B/C", "", "", "", "", "", "*", "", "*", "", "*", "", ""], // section header
  ];
}

function buildSyntheticWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildBoxDanaPolySheet()),
    "Box, Dana, Poly (4)"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildContainerSheet()),
    "Container (3)"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildStickerSheet()),
    "Sticker (2)"
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Sheet1");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(buildGlassSheet()),
    "Glass"
  );
  return wb;
}

describe("isLegacyWorkbook", () => {
  it("detects the legacy sheet layout", () => {
    expect(isLegacyWorkbook(buildSyntheticWorkbook())).toBe(true);
  });

  it("returns false for the app's own export format", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Code"]]), "Box");
    expect(isLegacyWorkbook(wb)).toBe(false);
  });
});

describe("parseLegacyWorkbook", () => {
  it("skips blank rows, section headers, and placeholder rows", async () => {
    const { items } = await parseLegacyWorkbook(buildSyntheticWorkbook());
    const codes = items.map((i) => i.code);
    expect(codes).not.toContain("XYZ");
    // 1 box + 1 dana + 1 poly + 2 container + 2 sticker + 1 glass = 8
    expect(items.length).toBe(8);
  });

  it("categorizes rows by family/section within the combined sheet", async () => {
    const { items } = await parseLegacyWorkbook(buildSyntheticWorkbook());
    const box = items.find((i) => i.code === "RT04");
    const dana = items.find((i) => i.name === "H0 50 MN");
    const poly = items.find((i) => i.code === "R8");

    expect(box?.category).toBe("box");
    expect(box?.unit).toBe("pcs");
    expect(box?.openingStock).toBe(100);

    expect(dana?.category).toBe("dana");
    expect(dana?.unit).toBe("kg");
    expect(dana?.openingStock).toBe(200);

    expect(poly?.category).toBe("poly");
    expect(poly?.unit).toBe("kg");
    expect(poly?.weightPerUnit).toBe(0.25);
  });

  it("categorizes the single-family sheets correctly and captures BOM codes", async () => {
    const { items } = await parseLegacyWorkbook(buildSyntheticWorkbook());

    const container = items.find((i) => i.code === "RD-180-6");
    expect(container?.category).toBe("container");
    expect(container?.openingStock).toBe(58);
    expect(container?.boxCode).toBe("B4");
    expect(container?.stickerCode).toBe("S1");
    expect(container?.stickerCodes).toEqual(["S1"]);
    expect(container?.polyCode).toBe("R2");

    // Column P must not be dropped: both codes survive the import.
    const twoStickers = items.find((i) => i.code === "5CP-B-300-24");
    expect(twoStickers?.stickerCodes).toEqual(["S35", "S41"]);
    expect(twoStickers?.stickerCode).toBe("S35");

    const sticker = items.find((i) => i.code === "S1");
    expect(sticker?.category).toBe("sticker");
    expect(sticker?.openingStock).toBe(-384);

    const glass = items.find((i) => i.code === "SSB-250");
    expect(glass?.category).toBe("glass");
    expect(glass?.boxCode).toBe("B16");
    expect(glass?.stickerCode).toBe("S51");
    // Glass has no second sticker column in the source workbook.
    expect(glass?.stickerCodes).toEqual(["S51"]);
    expect(glass?.polyCode).toBe("R10");
  });

  it("produces pending movements for rows with inward/outward quantities", async () => {
    const { movements } = await parseLegacyWorkbook(buildSyntheticWorkbook());
    const boxMovement = movements.find((m) => m.code === "RT04");
    expect(boxMovement).toEqual({ code: "RT04", category: "box", type: "outward", qty: 10 });
  });
});

describe("importLegacyWorkbook", () => {
  it("upserts items and creates movements without throwing", async () => {
    store.clear();
    const result = await importLegacyWorkbook(buildSyntheticWorkbook());
    expect(result.itemsCreated).toBe(8);
    expect(result.itemsUpdated).toBe(0);

    const items = await getInventoryItems();
    expect(items.length).toBe(8);

    const movements = await getMovements();
    expect(movements.length).toBe(result.movementsCreated);
    expect(result.skipped).toEqual([]);
  });
});
