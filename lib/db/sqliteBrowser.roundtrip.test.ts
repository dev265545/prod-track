/**
 * SQLite `.db` backup round-trip.
 *
 * The real sql.js engine is used (loaded the Node way, since `sqlJsLoader`
 * deliberately refuses to run outside a browser), on top of the real
 * IndexedDB adapter — so this exercises the actual bytes a user downloads
 * from Settings and hands back to Restore.
 *
 * The `.db` file is the export path used by the Tauri/portable builds, where
 * a JSON backup of a large factory is unwieldy. It has to carry the same
 * things the JSON backup does, minus credentials.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./sqlJsLoader", async (importOriginal) => {
  const original = await importOriginal<typeof import("./sqlJsLoader")>();
  return {
    ...original,
    // sql.js runs perfectly well under Node; only the app's loader is
    // browser-only (it fetches the wasm from the same origin).
    getSqlJsModule: async () => {
      const initSqlJs = (await import("sql.js")).default;
      return (await initSqlJs()) as unknown as import("./sqlJsLoader").SqlJsModule;
    },
  };
});

beforeEach(async () => {
  const { DB_NAME } = await import("./schema");
  try {
    const { openDB } = await import("./adapter");
    const db = (await openDB()) as IDBDatabase | undefined;
    db?.close?.();
  } catch {
    /* first test in the file */
  }
  vi.resetModules();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

async function seed() {
  const { saveEmployee } = await import("../services/employeeService");
  const { saveInventoryItem } = await import("../services/inventoryService");
  const { saveAppSettings } = await import("../services/appSettingsService");

  await saveEmployee({ name: "Asha", isActive: true, monthlySalary: 15000 });
  await saveInventoryItem({
    code: "C1",
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
  await saveAppSettings({
    companyName: "Shree Plastics",
    stickerMultiplier: 5,
  });
}

/** Export to .db bytes, then read them back as ExportData. */
async function roundTrip() {
  const { exportDatabaseToSqlite, importDatabaseFromSqliteBuffer } =
    await import("./sqliteBrowser");
  const bytes = await exportDatabaseToSqlite();
  // Copy into a standalone ArrayBuffer, as a file read would produce.
  const buffer = bytes.slice().buffer as ArrayBuffer;
  return importDatabaseFromSqliteBuffer(buffer);
}

describe("SQLite .db backup round-trip", () => {
  it("carries the business stores back out again", async () => {
    await seed();
    const data = await roundTrip();

    expect(data.stores.employees).toHaveLength(1);
    expect(data.stores.employees[0]).toMatchObject({ name: "Asha" });
    expect(data.stores.inventory_items[0]).toMatchObject({
      code: "C1",
      stickerCodes: ["S35", "S41"],
      stickersPerUnit: 3,
    });
    expect(data.schemaVersion).toBeGreaterThan(0);
  });

  it("carries app settings, which the JSON backup also carries", async () => {
    await seed();
    const data = await roundTrip();
    expect(data.appSettings).toMatchObject({
      companyName: "Shree Plastics",
      stickerMultiplier: 5,
    });
  });

  it("never writes credentials into the file", async () => {
    const { put } = await import("./adapter");
    const { METADATA_STORE } = await import("./schema");
    await put(METADATA_STORE, {
      id: "_app",
      passwordHash: "this-install-only",
    });
    await seed();

    const { exportDatabaseToSqlite } = await import("./sqliteBrowser");
    const bytes = await exportDatabaseToSqlite();
    expect(Buffer.from(bytes).toString("latin1")).not.toContain(
      "this-install-only",
    );
  });

  it("restores through importDatabase without disturbing the password", async () => {
    const { put, get } = await import("./adapter");
    const { METADATA_STORE } = await import("./schema");
    await put(METADATA_STORE, { id: "_app", passwordHash: "keep-me" });
    await seed();

    const data = await roundTrip();

    const { clearAllData, importDatabase } = await import("./exportImport");
    const { resetAppSettings, getAppSettings } = await import(
      "../services/appSettingsService"
    );
    await clearAllData();
    await resetAppSettings();

    await importDatabase(data);

    const { getEmployees } = await import("../services/employeeService");
    expect(await getEmployees()).toHaveLength(1);
    expect((await getAppSettings()).companyName).toBe("Shree Plastics");
    expect(await get(METADATA_STORE, "_app")).toMatchObject({
      passwordHash: "keep-me",
    });
  });

  it("reads an older .db that has no _metadata table at all", async () => {
    const { getSqlJsModule } = await import("./sqlJsLoader");
    const SQL = await getSqlJsModule();
    const db = new SQL.Database();
    db.run(
      `CREATE TABLE "employees" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`,
    );
    db.run(`INSERT INTO "employees" (id, data) VALUES (:id, :data)`, {
      ":id": "e1",
      ":data": JSON.stringify({ id: "e1", name: "Old" }),
    });
    const bytes = db.export();
    db.close();

    const { importDatabaseFromSqliteBuffer } = await import("./sqliteBrowser");
    const data = await importDatabaseFromSqliteBuffer(
      bytes.slice().buffer as ArrayBuffer,
    );
    expect(data.stores.employees[0]).toMatchObject({ name: "Old" });
    // No settings in the file means "keep this install's" — not "reset them".
    expect(data.appSettings).toBeUndefined();
  });
});
