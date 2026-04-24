import { describe, expect, it } from "vitest";
import { DB_VERSION } from "./schema";
import { validateExportData } from "./exportImport";

describe("validateExportData", () => {
  const minimalStores = {
    items: [],
    employees: [],
    productions: [],
    advances: [],
    advance_deductions: [],
    shifts: [],
    salary_records: [],
    factory_holidays: [],
    attendance: [],
  };

  it("accepts a well-formed export at current schema", () => {
    const r = validateExportData({
      version: 1,
      schemaVersion: DB_VERSION,
      exportedAt: "2026-04-01T00:00:00.000Z",
      stores: minimalStores,
    });
    expect(r.valid).toBe(true);
  });

  it("rejects wrong export version", () => {
    const r = validateExportData({
      version: 99,
      schemaVersion: DB_VERSION,
      exportedAt: "x",
      stores: minimalStores,
    });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Unsupported export version/);
  });

  it("rejects schema newer than app", () => {
    const r = validateExportData({
      version: 1,
      schemaVersion: DB_VERSION + 1,
      exportedAt: "x",
      stores: minimalStores,
    });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/newer version/);
  });

  it("rejects invalid store record", () => {
    const r = validateExportData({
      version: 1,
      schemaVersion: 1,
      exportedAt: "x",
      stores: { ...minimalStores, items: [{} as object] },
    });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/invalid record/);
  });
});
