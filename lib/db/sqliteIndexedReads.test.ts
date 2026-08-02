/**
 * The SQLite backends' index reads, proved against the JS implementation they
 * replace.
 *
 * `getByIndex`/`countByIndex` used to be `getAll(store)` + `matchesIndexRange`
 * in JavaScript. They are now `WHERE (k_a, k_b) BETWEEN (?, ?) AND (?, ?)` over
 * VIRTUAL generated columns with real SQLite indexes. That is a rewrite of the
 * one thing payroll reads through, so the old expression is kept here verbatim
 * and swept over generated data: for every store, index, and bound, the two must
 * return the SAME rows in the SAME order, and the same count.
 *
 * These run the real `sqliteFileAdapter` on the real sql.js engine, over a fake
 * file handle holding the database bytes in memory — so the CREATE TABLE, the
 * ALTER TABLE, the index build and the query are all the ones that ship.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORES } from "./schema";
import {
  applyIndexReadOptions,
  getIndexKeyPath,
  INDEXES,
  matchesIndexRange,
  planSqliteIndexQuery,
  sortByIndexOrder,
  sqliteIndexSchemaStatements,
  type IndexKey,
  type IndexReadOptions,
} from "./indexes";
import type { SqlJsModule } from "./sqlJsLoader";

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Harness: the real adapter, over an in-memory "file".
// ---------------------------------------------------------------------------

/** sql.js runs fine under Node; only the app's loader is browser-only. */
async function loadSqlJs(): Promise<SqlJsModule> {
  const initSqlJs = (await import("sql.js")).default;
  return (await initSqlJs()) as unknown as SqlJsModule;
}

vi.mock("./sqlJsLoader", async (importOriginal) => {
  const original = await importOriginal<typeof import("./sqlJsLoader")>();
  return {
    ...original,
    getSqlJsModule: async () => {
      const initSqlJs = (await import("sql.js")).default;
      return (await initSqlJs()) as unknown as import("./sqlJsLoader").SqlJsModule;
    },
  };
});

/** Just enough FileSystemFileHandle for the adapter, backed by a Uint8Array. */
class MemoryFileHandle {
  name = "prodtrack-test.db";
  bytes: Uint8Array;
  constructor(bytes: Uint8Array = new Uint8Array()) {
    this.bytes = bytes;
  }
  async queryPermission() {
    return "granted" as const;
  }
  async requestPermission() {
    return "granted" as const;
  }
  async getFile() {
    const copy = new Uint8Array(this.bytes);
    return { arrayBuffer: async () => copy.buffer } as unknown as File;
  }
  async createWritable() {
    return {
      write: async (chunk: Uint8Array) => {
        this.bytes = new Uint8Array(chunk);
      },
      close: async () => {},
    };
  }
}

let handle: MemoryFileHandle;
let openAdapterModule: typeof import("./sqliteFileAdapter") | null = null;

vi.mock("./sqliteFileHandleStore", () => ({
  getStoredMainSqliteHandle: async () => ({
    handle: handle as unknown as FileSystemFileHandle,
    info: { displayName: "prodtrack-test.db" },
  }),
  saveMainSqliteHandle: async () => {},
  clearStoredMainSqliteHandle: async () => {},
}));

async function openAdapter(bytes?: Uint8Array) {
  // Close the previous instance first: it holds a 30s safety-flush interval
  // that would otherwise keep the test process awake.
  await openAdapterModule?.forgetSqliteFileAndClose().catch(() => {});
  handle = new MemoryFileHandle(bytes ?? new Uint8Array());
  vi.resetModules();
  const adapter = await import("./sqliteFileAdapter");
  await adapter.openDB();
  openAdapterModule = adapter;
  return adapter;
}

// ---------------------------------------------------------------------------
// The dataset. Every edge case the two implementations could disagree on.
// ---------------------------------------------------------------------------

const EMPLOYEES = ["e1", "e2", "e10", "", "e3"];
const DATES = [
  "2024-12-31",
  "2025-01-01",
  "2025-01-02",
  "2025-06-30",
  "2026-01-01",
];

/**
 * Rows for one store, keyed on `employeeId`/`date`-shaped fields plus the
 * awkward cases: a missing field, an explicit null, a number where a string is
 * expected, an empty string, and duplicate keys under different ids.
 */
function seedRows(prefix: string, fields: string[]): Row[] {
  const rows: Row[] = [];
  let n = 0;
  const id = () => `${prefix}_${String((n += 1)).padStart(4, "0")}`;
  for (const employeeId of EMPLOYEES) {
    for (const date of DATES) {
      const row: Row = { id: id() };
      for (const f of fields) {
        row[f] = f === "employeeId" || f === "itemId" ? employeeId : date;
      }
      rows.push(row);
      // A duplicate index key under a different primary key: this is what pins
      // the tie-break payroll's "last row wins" fold depends on.
      rows.push({ ...row, id: id(), duplicate: true });
    }
  }
  // Missing / null / non-string keys: IndexedDB omits these from the index
  // entirely, and so must the SQL.
  rows.push({ id: id() });
  for (const f of fields) {
    rows.push({ id: id(), [f]: null });
    rows.push({ id: id(), [f]: 42 });
    rows.push({ id: id(), [f]: { nested: "no" } });
    rows.push({ id: id(), [f]: "" });
    // Exactly one part of a compound key present, and present with a value
    // strictly inside the swept range. This is the row that catches a missing
    // NULL guard: SQLite's row-value comparison short-circuits on a decisive
    // earlier element, so `('e2', NULL) >= ('e1', 'anything')` is TRUE and this
    // row would be returned from a range IndexedDB omits it from.
    rows.push({
      id: id(),
      [f]: f === "employeeId" || f === "itemId" ? "e2" : "2025-01-02",
    });
  }
  return rows;
}

/** Fields any index of `store` keys on. */
function fieldsOf(store: string): string[] {
  const out: string[] = [];
  for (const spec of Object.values(INDEXES[store])) {
    for (const f of typeof spec.keyPath === "string" ? [spec.keyPath] : spec.keyPath) {
      if (!out.includes(f)) out.push(f);
    }
  }
  return out;
}

/** The pre-change implementation, copied verbatim from tauriDb.ts / sqliteFileAdapter.ts. */
function legacyGetByIndex(
  rows: Row[],
  store: string,
  indexName: string,
  lower: IndexKey,
  upper: IndexKey,
  options?: IndexReadOptions,
): Row[] {
  const keyPath = getIndexKeyPath(store, indexName)!;
  return applyIndexReadOptions(
    sortByIndexOrder(
      rows.filter((row) => matchesIndexRange(row, keyPath, lower, upper)),
      keyPath,
    ),
    options,
  );
}

function legacyCountByIndex(
  rows: Row[],
  store: string,
  indexName: string,
  lower: IndexKey,
  upper: IndexKey,
): number {
  const keyPath = getIndexKeyPath(store, indexName)!;
  return rows.filter((row) => matchesIndexRange(row, keyPath, lower, upper)).length;
}

/** Bound pairs to sweep, per key arity. */
function boundsFor(keyPath: string | string[]): [IndexKey, IndexKey][] {
  if (typeof keyPath === "string") {
    const values = keyPath === "employeeId" || keyPath === "itemId" ? EMPLOYEES : DATES;
    const lo = keyPath === "employeeId" || keyPath === "itemId" ? "" : "0000-00-00";
    const hi = "￿";
    return [
      [lo, hi], // everything
      ["", ""], // the empty-string key alone
      [values[1], values[1]], // a single key
      [values[1], values[3]], // a middle slice
      ["zzzz", "zzzzz"], // matches nothing
      [hi, lo], // inverted: matches nothing
      [values[0], values[0]], // the first key alone
    ];
  }
  const lo = keyPath.map((f) => (f === "employeeId" ? "" : "0000-00-00"));
  const hi = keyPath.map(() => "￿");
  return [
    [lo, hi],
    [["e1", "0000-00-00"], ["e1", "￿"]], // one employee, all dates
    [["e1", "2025-01-01"], ["e1", "2025-01-02"]], // one employee, a slice
    [["e1", "2025-01-01"], ["e1", "2025-01-01"]], // a single compound key
    [["", ""], ["", ""]], // both parts empty
    [["e1", "2030-01-01"], ["e1", "2031-01-01"]], // matches nothing
    [["e1", "￿"], ["e1", "0000-00-00"]], // inverted
    [["e1", "2025-06-30"], ["e2", "2025-01-01"]], // spans employees — the case
    //   a naive concatenated key gets wrong
    // A range whose bounds straddle the half-keyed rows above, in both
    // directions: strictly above the lower bound's first part, and strictly
    // below the upper bound's.
    [["e1", "2025-01-01"], ["e3", "2025-01-01"]],
    [["", "2025-01-02"], ["e3", "2025-01-02"]],
  ];
}

const READ_OPTIONS: (IndexReadOptions | undefined)[] = [
  undefined,
  { direction: "next" },
  { direction: "prev" },
  { limit: 3 },
  { limit: 0 },
  { offset: 2 },
  { offset: 1000 },
  { direction: "prev", limit: 5, offset: 2 },
  { direction: "next", limit: 4, offset: 3 },
  { limit: 2.7, offset: -1 },
];

describe("SQLite index reads match the JS implementation they replace", () => {
  const stores = Object.keys(INDEXES);
  let adapter: typeof import("./sqliteFileAdapter");
  const seeded = new Map<string, Row[]>();

  beforeEach(async () => {
    adapter = await openAdapter();
    seeded.clear();
    for (const store of stores) {
      const rows = seedRows(store.slice(0, 3), fieldsOf(store));
      seeded.set(store, rows);
      // Written newest-id-first, so insertion order is NOT id order: the
      // ties-broken-by-primary-key contract has to come from the ORDER BY, not
      // from the order SQLite happens to hand rows back in.
      for (const row of [...rows].reverse()) await adapter.put(store, row);
    }
  });

  for (const store of Object.keys(INDEXES)) {
    for (const indexName of Object.keys(INDEXES[store])) {
      it(`${store}.${indexName} returns identical rows and counts`, async () => {
        const rows = seeded.get(store)!;
        const keyPath = getIndexKeyPath(store, indexName)!;
        for (const [lower, upper] of boundsFor(keyPath)) {
          // Every bound in the sweep must be one SQL can actually express;
          // otherwise this test would silently be comparing JS with JS.
          expect(
            planSqliteIndexQuery(store, indexName, lower, upper),
            `${store}.${indexName} ${JSON.stringify([lower, upper])} fell back to the scan`,
          ).not.toBeNull();

          expect(await adapter.countByIndex(store, indexName, lower, upper)).toBe(
            legacyCountByIndex(rows, store, indexName, lower, upper),
          );

          for (const options of READ_OPTIONS) {
            const expected = legacyGetByIndex(
              rows,
              store,
              indexName,
              lower,
              upper,
              options,
            );
            const actual = await adapter.getByIndex(
              store,
              indexName,
              lower,
              upper,
              options,
            );
            expect(
              actual.map((r) => r.id),
              `${store}.${indexName} ${JSON.stringify([lower, upper, options])}`,
            ).toEqual(expected.map((r) => r.id));
            expect(actual).toEqual(expected);
          }
        }
      });
    }
  }

  it("skips a row whose data is not valid JSON rather than failing the read", async () => {
    // `getAll` has always swallowed an unparseable blob; the generated column
    // must agree (it is NULL, and every plan excludes NULL keys), or one
    // corrupt row would take a whole query down with it.
    const SQL = await loadSqlJs();
    const d = new SQL.Database();
    d.run(
      `CREATE TABLE IF NOT EXISTS "${STORES.ATTENDANCE}" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`,
    );
    d.run(
      `INSERT INTO "${STORES.ATTENDANCE}" (id, data) VALUES ('bad', 'not json at all')`,
    );
    d.run(`INSERT INTO "${STORES.ATTENDANCE}" (id, data) VALUES (?, ?)`, [
      "good",
      JSON.stringify({ id: "good", employeeId: "e1", date: "2025-01-01" }),
    ]);
    const bytes = d.export();
    d.close();

    const fresh = await openAdapter(bytes);
    expect((await fresh.getAll(STORES.ATTENDANCE)).map((r) => r.id)).toEqual(["good"]);
    expect(
      (
        await fresh.getByIndex(STORES.ATTENDANCE, "by_date", "0000-00-00", "\uffff")
      ).map((r) => r.id),
    ).toEqual(["good"]);
    expect(
      await fresh.countByIndex(STORES.ATTENDANCE, "by_date", "0000-00-00", "\uffff"),
    ).toBe(1);
  });

  it("falls back to the scan, correctly, for bounds SQL cannot express", async () => {
    // An array bound against a single-field key path: in IndexedDB's key
    // ordering arrays sort after every string, which SQL has no notion of.
    expect(planSqliteIndexQuery(STORES.ATTENDANCE, "by_date", ["a"], ["b"])).toBeNull();
    // A compound bound of the wrong arity.
    expect(
      planSqliteIndexQuery(STORES.ATTENDANCE, "employee_date", ["e1"], ["e1", "z"]),
    ).toBeNull();

    const rows = seeded.get(STORES.ATTENDANCE)!;
    for (const [lower, upper] of [
      [["a"], ["b"]] as [IndexKey, IndexKey],
      ["", "￿"] as [IndexKey, IndexKey],
    ]) {
      expect(
        await adapter.getByIndex(STORES.ATTENDANCE, "by_date", lower, upper),
      ).toEqual(legacyGetByIndex(rows, STORES.ATTENDANCE, "by_date", lower, upper));
      expect(
        await adapter.countByIndex(STORES.ATTENDANCE, "by_date", lower, upper),
      ).toBe(legacyCountByIndex(rows, STORES.ATTENDANCE, "by_date", lower, upper));
    }
  });

  it("rejects an index it does not know", async () => {
    await expect(
      adapter.getByIndex(STORES.ATTENDANCE, "by_nothing", "a", "b"),
    ).rejects.toThrow(/Unknown index/);
  });
});

// ---------------------------------------------------------------------------
// The upgrade an existing install runs.
// ---------------------------------------------------------------------------

describe("upgrading a database written before the index columns existed", () => {
  /** The shipped v12 layout: `(id, data)` and nothing else. */
  async function buildOldShapeDb(rowsByStore: Map<string, Row[]>): Promise<Uint8Array> {
    const SQL = await loadSqlJs();
    const d = new SQL.Database();
    d.run(
      `CREATE TABLE IF NOT EXISTS "_metadata" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`,
    );
    for (const table of Object.values(STORES)) {
      d.run(
        `CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`,
      );
    }
    d.run(
      `INSERT OR REPLACE INTO "_metadata" (id, data) VALUES ('_schema', '{"id":"_schema","schemaVersion":12}')`,
    );
    for (const [store, rows] of rowsByStore) {
      for (const row of rows) {
        d.run(`INSERT OR REPLACE INTO "${store}" (id, data) VALUES (?, ?)`, [
          row.id as string,
          JSON.stringify(row),
        ]);
      }
    }
    const bytes = d.export();
    d.close();
    return bytes;
  }

  function oldShapeData(): Map<string, Row[]> {
    const m = new Map<string, Row[]>();
    for (const store of Object.keys(INDEXES)) {
      m.set(store, seedRows(store.slice(0, 3), fieldsOf(store)));
    }
    // A store with no indexes at all must survive the upgrade untouched too.
    m.set(STORES.EMPLOYEES, [
      { id: "emp_1", name: "Rakesh", isActive: true },
      { id: "emp_2", name: "Sita", isActive: false },
    ]);
    return m;
  }

  it("keeps every row and answers every index query correctly afterwards", async () => {
    const data = oldShapeData();
    const adapter = await openAdapter(await buildOldShapeDb(data));

    for (const [store, rows] of data) {
      const after = await adapter.getAll(store);
      expect(after.length, `${store} lost rows`).toBe(rows.length);
      expect(
        [...after].sort((a, b) => String(a.id).localeCompare(String(b.id))),
      ).toEqual([...rows].sort((a, b) => String(a.id).localeCompare(String(b.id))));
    }

    for (const store of Object.keys(INDEXES)) {
      const rows = data.get(store)!;
      for (const indexName of Object.keys(INDEXES[store])) {
        const keyPath = getIndexKeyPath(store, indexName)!;
        for (const [lower, upper] of boundsFor(keyPath)) {
          expect(
            await adapter.getByIndex(store, indexName, lower, upper),
          ).toEqual(legacyGetByIndex(rows, store, indexName, lower, upper));
          expect(
            await adapter.countByIndex(store, indexName, lower, upper),
          ).toBe(legacyCountByIndex(rows, store, indexName, lower, upper));
        }
      }
    }
  });

  it("is idempotent: reopening the upgraded file changes nothing", async () => {
    const data = oldShapeData();
    let adapter = await openAdapter(await buildOldShapeDb(data));
    const first = await adapter.getAll(STORES.ATTENDANCE);
    const upgraded = handle.bytes;

    // Second open runs the same ALTER/CREATE INDEX pass over a file that
    // already has the columns. It must neither throw nor duplicate anything.
    adapter = await openAdapter(upgraded);
    expect(await adapter.getAll(STORES.ATTENDANCE)).toEqual(first);
    adapter = await openAdapter(handle.bytes);
    expect(await adapter.getAll(STORES.ATTENDANCE)).toEqual(first);
  });

  it("indexes rows written after the upgrade, not just the ones backfilled", async () => {
    const adapter = await openAdapter(await buildOldShapeDb(oldShapeData()));
    await adapter.put(STORES.ATTENDANCE, {
      id: "att_new",
      employeeId: "e1",
      date: "2025-03-15",
      status: "present",
    });
    const found = await adapter.getByIndex(
      STORES.ATTENDANCE,
      "employee_date",
      ["e1", "2025-03-15"],
      ["e1", "2025-03-15"],
    );
    expect(found.map((r) => r.id)).toEqual(["att_new"]);
  });

  it("creates a real SQLite index, so a range read is a seek and not a scan", async () => {
    // Without this the change would look applied and do nothing — exactly what
    // the JS `getAll` + filter path was.
    const SQL = await loadSqlJs();
    const db = new SQL.Database();
    db.run(
      `CREATE TABLE IF NOT EXISTS "${STORES.ATTENDANCE}" (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)`,
    );
    for (const sql of sqliteIndexSchemaStatements(STORES.ATTENDANCE, ["id", "data"])) {
      db.run(sql);
    }
    const plan = planSqliteIndexQuery(
      STORES.ATTENDANCE,
      "employee_date",
      ["e1", "2025-01-01"],
      ["e1", "2025-01-02"],
    )!;
    const explained = db.exec(
      `EXPLAIN QUERY PLAN SELECT id, data FROM "${STORES.ATTENDANCE}" ` +
        `WHERE ${plan.where} ORDER BY ${plan.orderBy}`,
    );
    const text = JSON.stringify(explained[0]?.values ?? []);
    expect(text).toContain("idx_attendance_employee_date");
    expect(text).not.toContain("SCAN");
    db.close();
  });
});
