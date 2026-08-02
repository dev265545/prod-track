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

/** The v10 layout, reproduced as it shipped: no indexes on attendance or audit_log. */
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

/**
 * Audit entries as an install that predates `audit_log.by_timestamp` holds
 * them: no index, and written in no particular primary-key order.
 */
const LEGACY_AUDIT = [
  { id: "aud_c", timestamp: "2025-03-01T09:00:00.000Z", action: "login.success", summary: "Somebody signed in" },
  { id: "aud_a", timestamp: "2025-01-01T09:00:00.000Z", action: "attendance.mark", summary: "Rakesh was marked present" },
  { id: "aud_d", timestamp: "2025-03-01T10:00:00.000Z", action: "teleport.engage", summary: "An action from another build" },
  { id: "aud_b", timestamp: "2025-02-01T09:00:00.000Z", action: "advance.create", summary: "An advance was paid out" },
  { id: "aud_nostamp", action: "attendance.mark", summary: "An entry with no timestamp" },
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
      const tx = db.transaction(
        [STORES.ATTENDANCE, STORES.AUDIT_LOG],
        "readwrite"
      );
      const store = tx.objectStore(STORES.ATTENDANCE);
      for (const row of LEGACY_ATTENDANCE) store.put(row);
      const audit = tx.objectStore(STORES.AUDIT_LOG);
      for (const row of LEGACY_AUDIT) audit.put(row);
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

/**
 * The audit log is the store that grows without bound, and it is read
 * newest-first a page at a time. These run the real cursor and the real
 * `IDBIndex.count` against entries written before the index existed.
 */
describe("the audit log's timestamp index, over pre-existing entries", () => {
  it("reads newest-first with a limit, without touching older rows", async () => {
    const { getByIndex } = await import("./indexeddb");
    const newest = await getByIndex(
      STORES.AUDIT_LOG,
      "by_timestamp",
      "",
      "\uffff",
      { direction: "prev", limit: 2 }
    );
    expect(newest.map((r) => r.id)).toEqual(["aud_d", "aud_c"]);
  });

  it("offsets into the descending order, which is how page 2 is fetched", async () => {
    const { getByIndex } = await import("./indexeddb");
    const page2 = await getByIndex(
      STORES.AUDIT_LOG,
      "by_timestamp",
      "",
      "\uffff",
      { direction: "prev", limit: 2, offset: 2 }
    );
    expect(page2.map((r) => r.id)).toEqual(["aud_b", "aud_a"]);
  });

  it("bounds a month the way the viewer's date filter does", async () => {
    const { getByIndex } = await import("./indexeddb");
    const march = await getByIndex(
      STORES.AUDIT_LOG,
      "by_timestamp",
      "2025-03-01",
      "2025-03-31\uffff",
      { direction: "prev" }
    );
    expect(march.map((r) => r.id)).toEqual(["aud_d", "aud_c"]);
  });

  it("counts a range without returning any rows", async () => {
    const { countByIndex } = await import("./indexeddb");
    expect(
      await countByIndex(STORES.AUDIT_LOG, "by_timestamp", "", "\uffff")
    ).toBe(4);
    expect(
      await countByIndex(
        STORES.AUDIT_LOG,
        "by_timestamp",
        "",
        "2025-02-01T09:00:00.000Z"
      )
    ).toBe(2);
  });

  it("keeps an unknown action, so a restored backup stays readable", async () => {
    const { getByIndex } = await import("./indexeddb");
    const all = await getByIndex(STORES.AUDIT_LOG, "by_timestamp", "", "\uffff");
    expect(all.map((r) => r.action)).toContain("teleport.engage");
  });

  it("leaves the undatable entry in the store, though the index omits it", async () => {
    const { getAll, getByIndex } = await import("./indexeddb");
    expect(await getAll(STORES.AUDIT_LOG)).toHaveLength(LEGACY_AUDIT.length);
    const indexed = await getByIndex(
      STORES.AUDIT_LOG,
      "by_timestamp",
      "",
      "\uffff"
    );
    expect(indexed.some((r) => r.id === "aud_nostamp")).toBe(false);
  });
});
