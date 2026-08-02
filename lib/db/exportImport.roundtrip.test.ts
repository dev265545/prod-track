/**
 * Backup round-trip through the REAL IndexedDB adapter (fake-indexeddb).
 *
 * exportImport.transaction.test.ts covers the same logic against an in-memory
 * Map stand-in; this file exercises the actual storage path — keyPath,
 * transactions, getAll — with the real business services writing the data, so
 * a shape the store rejects (or silently reshapes) is caught here rather than
 * by a user whose restore came back wrong.
 *
 * What has to survive a backup and restore:
 *  - employees, attendance, production, inventory (including BOTH sticker
 *    codes and the per-item sticker count),
 *  - app settings,
 *  - and, crucially, this install's credentials, which must NOT come back from
 *    the file: a restore that reset the admin password was a real bug.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// See legacyImportIntegration.test.ts for why the close/reset/delete dance is
// needed: lib/db/indexeddb.ts caches its open handle at module scope.
beforeEach(async () => {
  const { DB_NAME } = await import("./schema");
  try {
    const { openDB } = await import("./adapter");
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

/** Write one of everything a factory actually has. */
async function seedBusinessData() {
  const { saveEmployee } = await import("../services/employeeService");
  const { saveAttendance } = await import("../services/attendanceService");
  const { saveItem } = await import("../services/itemService");
  const { saveProduction } = await import("../services/productionService");
  const { saveInventoryItem, addMovement } = await import(
    "../services/inventoryService"
  );
  const { saveAppSettings } = await import("../services/appSettingsService");

  const employee = await saveEmployee({
    name: "Asha <Kumari>",
    isActive: true,
    monthlySalary: 15000,
    employeeType: "salaried",
  });

  await saveAttendance({
    employeeId: String(employee.id),
    date: "2026-07-01",
    status: "present",
    hoursExtra: 2,
  });

  const item = await saveItem({ name: "Cap 28mm", rate: 10 });

  await saveProduction({
    employeeId: String(employee.id),
    itemId: String(item.id),
    date: "2026-07-01",
    quantity: 120,
    shift: "day",
  });

  const inventoryItem = await saveInventoryItem({
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
  await addMovement({
    itemId: inventoryItem.id,
    date: "2026-07-02",
    type: "inward",
    qty: 60,
  });

  await saveAppSettings({
    companyName: "Shree Plastics",
    stickerMultiplier: 5,
    lowStockWarningsEnabled: false,
  });

  return { employeeId: String(employee.id), itemId: String(item.id) };
}

/** Everything the user would notice missing, in one comparable object. */
async function snapshot() {
  const { getAll, STORES } = await import("./adapter");
  const { getAppSettings } = await import("../services/appSettingsService");
  const stores: Record<string, unknown[]> = {};
  for (const name of Object.values(STORES)) {
    if (name === STORES.AUDIT_LOG) continue; // grows on its own, by design
    stores[name] = (await getAll(name)).sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );
  }
  return { stores, settings: await getAppSettings() };
}

describe("JSON backup round-trip via the real IndexedDB adapter", () => {
  it("brings back employees, attendance, production, inventory and settings unchanged", async () => {
    await seedBusinessData();
    const before = await snapshot();

    const { exportDatabase, importDatabase } = await import("./exportImport");
    // Serialise for real: a backup is a file on disk, not a live object.
    const backup = JSON.parse(JSON.stringify(await exportDatabase()));

    const { clearAllData } = await import("./exportImport");
    const { resetAppSettings } = await import("../services/appSettingsService");
    await clearAllData();
    await resetAppSettings();

    await importDatabase(backup);

    expect(await snapshot()).toEqual(before);
  });

  it("keeps both sticker codes and stickersPerUnit on the restored item", async () => {
    await seedBusinessData();
    const { exportDatabase, importDatabase, clearAllData } = await import(
      "./exportImport"
    );
    const backup = JSON.parse(JSON.stringify(await exportDatabase()));
    await clearAllData();
    await importDatabase(backup);

    const { getInventoryItems, stickerCodesFor } = await import(
      "../services/inventoryService"
    );
    const restored = (await getInventoryItems()).find((i) => i.code === "C1")!;
    expect(stickerCodesFor(restored)).toEqual(["S35", "S41"]);
    expect(restored.stickersPerUnit).toBe(3);
    expect(restored.boxCode).toBe("B4");
    expect(restored.polyCode).toBe("R2");
  });

  it("restores the settings that were backed up, not this install's", async () => {
    await seedBusinessData();
    const { exportDatabase, importDatabase } = await import("./exportImport");
    const backup = JSON.parse(JSON.stringify(await exportDatabase()));
    expect(backup.appSettings.companyName).toBe("Shree Plastics");

    const { saveAppSettings, getAppSettings } = await import(
      "../services/appSettingsService"
    );
    await saveAppSettings({ companyName: "Someone Else", stickerMultiplier: 1 });

    await importDatabase(backup);

    const settings = await getAppSettings();
    expect(settings.companyName).toBe("Shree Plastics");
    expect(settings.stickerMultiplier).toBe(5);
    expect(settings.lowStockWarningsEnabled).toBe(false);
  });

  it("never carries credentials in the file, and never resets them on import", async () => {
    const { put, get } = await import("./adapter");
    const { METADATA_STORE } = await import("./schema");
    await put(METADATA_STORE, {
      id: "_app",
      passwordHash: "this-install-only",
      sessionNonce: 7,
    });
    await seedBusinessData();

    const { exportDatabase, importDatabase } = await import("./exportImport");
    const backup = JSON.parse(JSON.stringify(await exportDatabase()));

    // The password hash must not be anywhere in the exported file.
    expect(JSON.stringify(backup)).not.toContain("this-install-only");

    await importDatabase(backup);

    const app = await get(METADATA_STORE, "_app");
    expect(app).toMatchObject({
      passwordHash: "this-install-only",
      sessionNonce: 7,
    });
  });

  it("leaves the database untouched when the import fails", async () => {
    await seedBusinessData();
    const before = await snapshot();

    const { importDatabase } = await import("./exportImport");
    const { DB_VERSION } = await import("./schema");

    // Valid enough to get past validation, then a row without an id in a
    // later store — writeRows has already cleared it by the time it throws.
    const bad = {
      version: 1,
      schemaVersion: DB_VERSION,
      exportedAt: new Date().toISOString(),
      stores: { employees: [{ id: "x", name: "X" }], attendance: null },
    };
    // `attendance: null` fails validation outright: nothing may be cleared.
    await expect(
      importDatabase(bad as never),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back every store when a write throws part-way through", async () => {
    await seedBusinessData();
    const before = await snapshot();

    const adapter = await import("./adapter");
    const { importDatabase, exportDatabase } = await import("./exportImport");
    const backup = JSON.parse(JSON.stringify(await exportDatabase()));
    // Make the backup visibly different, so a successful import would show.
    backup.stores.employees = [{ id: "ghost", name: "Ghost" }];

    const realPut = adapter.put;
    let calls = 0;
    const spy = vi.spyOn(adapter, "put").mockImplementation(async (...args) => {
      // Fail one write part-way through (a transient error), so the rollback's
      // own writes can land and every cleared store comes back.
      if (++calls === 2) throw new Error("disk full");
      return realPut(...args);
    });

    await expect(importDatabase(backup)).rejects.toThrow("disk full");
    spy.mockRestore();

    expect(await snapshot()).toEqual(before);
  });
});

describe("validateExportData guards the auto-import path", () => {
  it("rejects a file from a newer schema rather than importing half of it", async () => {
    const { validateExportData } = await import("./exportImport");
    const { DB_VERSION } = await import("./schema");
    const result = validateExportData({
      version: 1,
      schemaVersion: DB_VERSION + 1,
      stores: {},
    });
    expect(result.valid).toBe(false);
  });
});
