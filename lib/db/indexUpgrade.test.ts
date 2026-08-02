/**
 * The upgrade an existing factory install will actually run.
 *
 * The indexes that make queries cheap are new, but the object stores holding
 * years of data are not. `createSchema` only ever created a store when it was
 * absent, so a v10 database would have kept its index-less `attendance` store
 * forever and every "indexed" read would have silently fallen back to a full
 * scan — the fix would have looked applied and done nothing.
 *
 * These run against fake-indexeddb through the real `lib/db/indexeddb.ts`, so
 * the upgrade transaction, `createIndex` and `IDBKeyRange` are genuinely
 * exercised rather than modelled.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DB_NAME, METADATA_STORE, STORES } from "./schema";
import { INDEXES } from "./indexes";

/** The v10 layout, reproduced as it shipped: no indexes on attendance. */
const V10_STORES_WITH_INDEXES: Record<string, [string, string | string[], boolean][]> = {
  [STORES.PRODUCTIONS]: [
    ["by_date", "date", false],
    ["by_employee", "employeeId", false],
    ["by_item", "itemId", false],
    ["employee_date", ["employeeId", "date"], false],
  ],
  [STORES.ADVANCES]: [
    ["by_employee", "employeeId", false],
    ["by_date", "date", false],
  ],
  [STORES.ADVANCE_DEDUCTIONS]: [
    ["by_employee", "employeeId", false],
    ["employee_period", ["employeeId", "periodFrom"], true],
  ],
  [STORES.SALARY_RECORDS]: [
    ["by_employee", "employeeId", false],
    ["by_month", "month", false],
  ],
  [STORES.INVENTORY_MOVEMENTS]: [["by_item", "itemId", false]],
};

const LEGACY_ATTENDANCE = [
  { id: "att_0003", employeeId: "e1", date: "2025-01-03", status: "present" },
  { id: "att_0001", employeeId: "e1", date: "2025-01-01", status: "present" },
  { id: "att_0002", employeeId: "e2", date: "2025-01-01", status: "absent" },
  // Two rows for the same employee+date, as pre-upsert databases contain.
  { id: "att_dup_b", employeeId: "e1", date: "2025-02-10", status: "present" },
  { id: "att_dup_a", employeeId: "e1", date: "2025-02-10", status: "absent" },
  { id: "att_nodate", employeeId: "e1" },
];

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

/** Creates a database in the shape v10 left behind, and fills it. */
function createV10Database(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 10);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [METADATA_STORE, ...Object.values(STORES)]) {
        const store = db.createObjectStore(name, { keyPath: "id" });
        for (const [indexName, keyPath, unique] of V10_STORES_WITH_INDEXES[name] ?? []) {
          store.createIndex(indexName, keyPath, { unique });
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORES.ATTENDANCE, "readwrite");
      const store = tx.objectStore(STORES.ATTENDANCE);
      for (const row of LEGACY_ATTENDANCE) store.put(row);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

beforeEach(async () => {
  try {
    const { openDB } = await import("./indexeddb");
    const db = (await openDB()) as IDBDatabase | undefined;
    db?.close?.();
  } catch {
    // no prior connection
  }
  vi.resetModules();
  await deleteDb();
  await createV10Database();
});

describe("upgrading a v10 database", () => {
  it("adds the missing indexes to stores that already existed", async () => {
    const { openDB } = await import("./indexeddb");
    const db = (await openDB()) as IDBDatabase;

    for (const [storeName, spec] of Object.entries(INDEXES)) {
      const store = db.transaction(storeName).objectStore(storeName);
      for (const indexName of Object.keys(spec)) {
        expect(
          store.indexNames.contains(indexName),
          `${storeName}.${indexName} missing after upgrade`
        ).toBe(true);
      }
    }
  });

  it("keeps every existing row", async () => {
    const { getAll } = await import("./indexeddb");
    const rows = await getAll(STORES.ATTENDANCE);
    expect(rows).toHaveLength(LEGACY_ATTENDANCE.length);
  });

  it("preserves the unique flag on the one index that has it", async () => {
    const { openDB } = await import("./indexeddb");
    const db = (await openDB()) as IDBDatabase;
    const store = db
      .transaction(STORES.ADVANCE_DEDUCTIONS)
      .objectStore(STORES.ADVANCE_DEDUCTIONS);
    expect(store.index("employee_period").unique).toBe(true);
    expect(store.index("by_employee").unique).toBe(false);
  });

  it("serves the new attendance indexes over data written before they existed", async () => {
    const { getByIndex } = await import("./indexeddb");

    const january = await getByIndex(
      STORES.ATTENDANCE,
      "by_date",
      "2025-01-01",
      "2025-01-31"
    );
    expect(january.map((r) => r.id)).toEqual([
      "att_0001",
      "att_0002",
      "att_0003",
    ]);

    const e1 = await getByIndex(
      STORES.ATTENDANCE,
      "employee_date",
      ["e1", "2025-01-01"],
      ["e1", "2025-12-31"]
    );
    expect(e1.map((r) => r.id)).toEqual([
      "att_0001",
      "att_0003",
      "att_dup_a",
      "att_dup_b",
    ]);
  });

  it("orders duplicates by primary key, so last-row-wins picks the same row as a full scan", async () => {
    const { getByIndex, getAll } = await import("./indexeddb");
    const scanned = (await getAll(STORES.ATTENDANCE)).filter(
      (a) => a.employeeId === "e1" && a.date === "2025-02-10"
    );
    const indexed = await getByIndex(
      STORES.ATTENDANCE,
      "employee_date",
      ["e1", "2025-02-10"],
      ["e1", "2025-02-10"]
    );
    expect(indexed).toEqual(scanned);
    expect(indexed[indexed.length - 1].id).toBe(
      scanned[scanned.length - 1].id
    );
  });

  it("skips rows missing an indexed field, matching the filter it replaced", async () => {
    const { getByIndex } = await import("./indexeddb");
    const all = await getByIndex(
      STORES.ATTENDANCE,
      "by_date",
      "1900-01-01",
      "2999-12-31"
    );
    expect(all.some((r) => r.id === "att_nodate")).toBe(false);
  });
});
