import { describe, it, expect, beforeEach, vi } from "vitest";
import { STORES, METADATA_STORE } from "./schema";

/**
 * In-memory stand-in for the DB adapter. `failOn` lets a test make one store's
 * write throw so we can assert the rollback path.
 */
const db = new Map<string, Map<string, Record<string, unknown>>>();
let failOnPutIn: string | null = null;

function storeOf(name: string) {
  if (!db.has(name)) db.set(name, new Map());
  return db.get(name)!;
}

vi.mock("./adapter", async () => {
  const schema = await import("./schema");
  return {
    STORES: schema.STORES,
    getAll: async (name: string) => [...storeOf(name).values()],
    clear: async (name: string) => {
      storeOf(name).clear();
    },
    put: async (name: string, rec: Record<string, unknown>) => {
      if (failOnPutIn === name) {
        // Fail once (a transient write error), so the rollback writes can land.
        failOnPutIn = null;
        throw new Error(`boom writing ${name}`);
      }
      storeOf(name).set(String(rec.id), rec);
    },
    get: async (name: string, id: string) => storeOf(name).get(id) ?? null,
    remove: async (name: string, id: string) => {
      storeOf(name).delete(id);
    },
  };
});

const { exportDatabase, importDatabase, clearAllData } = await import(
  "./exportImport"
);

function seed(name: string, rows: Record<string, unknown>[]) {
  const s = storeOf(name);
  s.clear();
  for (const r of rows) s.set(String(r.id), r);
}

/** Let fire-and-forget audit writes settle before asserting on them. */
async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

function rowsIn(name: string) {
  return [...storeOf(name).values()];
}

function validExport(stores: Record<string, Record<string, unknown>[]>) {
  return {
    version: 1,
    schemaVersion: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    stores,
  };
}

beforeEach(() => {
  db.clear();
  failOnPutIn = null;
});

describe("importDatabase preserves credentials", () => {
  it("leaves the `_app` metadata row untouched", async () => {
    seed(METADATA_STORE, [
      { id: "_app", passwordHash: "secret-hash", onboardingComplete: true },
    ]);
    seed(STORES.EMPLOYEES, [{ id: "e1", name: "Old" }]);

    await importDatabase(
      validExport({ [STORES.EMPLOYEES]: [{ id: "e2", name: "New" }] }),
    );

    expect(rowsIn(METADATA_STORE)).toEqual([
      { id: "_app", passwordHash: "secret-hash", onboardingComplete: true },
    ]);
    expect(rowsIn(STORES.EMPLOYEES)).toEqual([{ id: "e2", name: "New" }]);
  });
});

describe("importDatabase is atomic", () => {
  it("rolls back every store when a later write throws", async () => {
    seed(STORES.EMPLOYEES, [{ id: "e1", name: "Original" }]);
    seed(STORES.ITEMS, [{ id: "i1", name: "OriginalItem" }]);
    failOnPutIn = STORES.ITEMS;

    await expect(
      importDatabase(
        validExport({
          [STORES.EMPLOYEES]: [{ id: "e9", name: "Imported" }],
          [STORES.ITEMS]: [{ id: "i9", name: "ImportedItem" }],
        }),
      ),
    ).rejects.toThrow(/boom writing/);

    expect(rowsIn(STORES.EMPLOYEES)).toEqual([{ id: "e1", name: "Original" }]);
    expect(rowsIn(STORES.ITEMS)).toEqual([{ id: "i1", name: "OriginalItem" }]);
  });

  it("does not wipe anything when validation fails", async () => {
    seed(STORES.EMPLOYEES, [{ id: "e1", name: "Original" }]);
    await expect(
      importDatabase({ version: 99, stores: {} } as never),
    ).rejects.toThrow(/Unsupported export version/);
    expect(rowsIn(STORES.EMPLOYEES)).toEqual([{ id: "e1", name: "Original" }]);
  });

  it("only touches stores present in the file", async () => {
    seed(STORES.EMPLOYEES, [{ id: "e1" }]);
    seed(STORES.ITEMS, [{ id: "i1" }]);
    await importDatabase(validExport({ [STORES.EMPLOYEES]: [{ id: "e2" }] }));
    expect(rowsIn(STORES.ITEMS)).toEqual([{ id: "i1" }]);
  });

  it("replaces (not merges) the contents of an imported store", async () => {
    seed(STORES.EMPLOYEES, [{ id: "e1" }, { id: "e2" }]);
    await importDatabase(validExport({ [STORES.EMPLOYEES]: [{ id: "e3" }] }));
    expect(rowsIn(STORES.EMPLOYEES)).toEqual([{ id: "e3" }]);
  });
});

describe("clearAllData", () => {
  it("wipes business stores but keeps the audit log and the `_app` row", async () => {
    seed(METADATA_STORE, [{ id: "_app", passwordHash: "secret-hash" }]);
    seed(STORES.EMPLOYEES, [{ id: "e1" }]);
    seed(STORES.PRODUCTIONS, [{ id: "p1" }]);
    seed(STORES.AUDIT_LOG, [{ id: "a1", action: "login.success" }]);

    await clearAllData();
    await flush();

    expect(rowsIn(STORES.EMPLOYEES)).toEqual([]);
    expect(rowsIn(STORES.PRODUCTIONS)).toEqual([]);
    expect(rowsIn(METADATA_STORE)).toEqual([
      { id: "_app", passwordHash: "secret-hash" },
    ]);
    // The pre-existing entry survives, and the wipe itself is recorded.
    const audit = rowsIn(STORES.AUDIT_LOG);
    expect(audit.some((r) => r.id === "a1")).toBe(true);
    expect(audit.some((r) => r.action === "data.clear")).toBe(true);
  });
});

describe("exportDatabase", () => {
  it("exports every store and records an audit entry", async () => {
    seed(STORES.EMPLOYEES, [{ id: "e1" }]);
    const data = await exportDatabase();
    await flush();
    expect(data.stores[STORES.EMPLOYEES]).toEqual([{ id: "e1" }]);
    expect(
      rowsIn(STORES.AUDIT_LOG).some((r) => r.action === "data.export"),
    ).toBe(true);
  });
});

describe("app settings travel with the backup", () => {
  it("exports the settings row alongside the stores", async () => {
    seed(METADATA_STORE, [
      { id: "app_settings", productionInventoryLinkEnabled: false },
    ]);
    const data = await exportDatabase();
    expect(data.appSettings?.productionInventoryLinkEnabled).toBe(false);
    // Credentials are still not exported.
    expect(JSON.stringify(data)).not.toContain("passwordHash");
  });

  it("restores settings without disturbing the `_app` credential row", async () => {
    seed(METADATA_STORE, [
      { id: "_app", passwordHash: "secret-hash", onboardingComplete: true },
    ]);

    await importDatabase({
      ...validExport({ [STORES.EMPLOYEES]: [] }),
      appSettings: {
        id: "app_settings",
        version: 1,
        productionInventoryLinkEnabled: false,
      } as never,
    });

    const meta = rowsIn(METADATA_STORE);
    expect(meta.find((r) => r.id === "_app")).toMatchObject({
      passwordHash: "secret-hash",
    });
    expect(meta.find((r) => r.id === "app_settings")).toMatchObject({
      productionInventoryLinkEnabled: false,
      // Missing fields are filled in on the way in, never left undefined.
      stickerMultiplier: 2,
    });
  });

  it("leaves this install's settings alone when the backup predates them", async () => {
    seed(METADATA_STORE, [
      { id: "app_settings", productionInventoryLinkEnabled: false },
    ]);
    await importDatabase(validExport({ [STORES.EMPLOYEES]: [] }));
    expect(
      rowsIn(METADATA_STORE).find((r) => r.id === "app_settings"),
    ).toMatchObject({ productionInventoryLinkEnabled: false });
  });
});
