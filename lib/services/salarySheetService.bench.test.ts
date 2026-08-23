import { describe, expect, it, vi } from "vitest";
import { STORES, METADATA_STORE } from "@/lib/db/schema";

/**
 * What one employee's salary row costs to read.
 *
 * `getSalarySheetRowForEmployee` used to call `getSalarySheetForRange` and pick
 * a single row out of the result, so opening one employee paid for the entire
 * factory: every employee's attendance for the period, plus one advance-deduction
 * lookup per employee. The employee page calls it twice per load.
 *
 * The stand-in adapter models the two costs that dominate on IndexedDB, exactly
 * as `lib/db/indexedReads.bench.test.ts` does — see its header for why:
 * rows are stored as JSON and parsed on read, so a query pays in proportion to
 * the rows it *returns*, and index reads binary-search a sorted key array.
 * The claim being made here is the ratio between the columns, not the absolute
 * milliseconds.
 */

const { adapter } = await vi.hoisted(async () => {
  const { STORES: S } = await import("@/lib/db/schema");
  const { getIndexKeyPath: keyPathOf, compareIndexKeys: cmp } = await import(
    "@/lib/db/indexes"
  );

  type Row = Record<string, unknown>;
  type Entry = { id: string; json: string };

  const tables = new Map<string, Map<string, Entry>>();
  const indexes = new Map<string, { key: unknown; entry: Entry }[]>();
  const reads = { storeReads: 0, rowsScanned: 0 };

  const tableFor = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };

  const extract = (row: Row, keyPath: string | string[]) => {
    if (typeof keyPath === "string") {
      const v = row[keyPath];
      return typeof v === "string" ? v : undefined;
    }
    const parts: string[] = [];
    for (const p of keyPath) {
      const v = row[p];
      if (typeof v !== "string") return undefined;
      parts.push(v);
    }
    return parts;
  };

  const indexFor = (store: string, indexName: string) => {
    const cacheKey = `${store}/${indexName}`;
    const cached = indexes.get(cacheKey);
    if (cached) return cached;
    const keyPath = keyPathOf(store, indexName);
    if (!keyPath) throw new Error(`Unknown index ${store}.${indexName}`);
    const built: { key: unknown; entry: Entry }[] = [];
    for (const entry of tableFor(store).values()) {
      const key = extract(JSON.parse(entry.json) as Row, keyPath);
      if (key !== undefined) built.push({ key, entry });
    }
    built.sort((a, b) => {
      const c = cmp(a.key as never, b.key as never);
      return c !== 0 ? c : a.entry.id < b.entry.id ? -1 : 1;
    });
    indexes.set(cacheKey, built);
    return built;
  };

  const lowerBound = (list: { key: unknown }[], bound: unknown) => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cmp(list[mid].key as never, bound as never) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  return {
    adapter: {
      STORES: S,
      tables,
      reads,
      resetCounters: () => {
        reads.storeReads = 0;
        reads.rowsScanned = 0;
      },
      seedRow: (store: string, row: Row) => {
        indexes.clear();
        tableFor(store).set(row.id as string, {
          id: row.id as string,
          json: JSON.stringify(row),
        });
      },
      reset: () => {
        tables.clear();
        indexes.clear();
      },
      size: (store: string) => tableFor(store).size,
      getAll: async (store: string) => {
        reads.storeReads += 1;
        const out: Row[] = [];
        for (const entry of tableFor(store).values()) {
          out.push(JSON.parse(entry.json) as Row);
        }
        reads.rowsScanned += out.length;
        return out;
      },
      getByIndex: async (
        store: string,
        indexName: string,
        lower: unknown,
        upper: unknown,
      ) => {
        reads.storeReads += 1;
        const list = indexFor(store, indexName);
        const out: Row[] = [];
        for (let i = lowerBound(list, lower); i < list.length; i += 1) {
          if (cmp(list[i].key as never, upper as never) > 0) break;
          out.push(JSON.parse(list[i].entry.json) as Row);
        }
        reads.rowsScanned += out.length;
        return out;
      },
      get: async (store: string, id: string) => {
        reads.storeReads += 1;
        const e = tableFor(store).get(id);
        if (!e) return null;
        reads.rowsScanned += 1;
        return JSON.parse(e.json) as Row;
      },
      put: async () => undefined,
      remove: async () => undefined,
      clear: async () => undefined,
      deleteWhere: async () => 0,
    },
  };
});

vi.mock("@/lib/db/adapter", () => adapter);

import {
  getSalarySheetForRange,
  getSalarySheetRowForEmployee,
  type SalarySheetRow,
} from "@/lib/services/salarySheetService";

const EMPLOYEE_COUNT = 60;
const YEAR = 2025;
const MONTH = 5; // June 2025
const FROM = "2025-06-01";
const TO = "2025-06-30";
const REPEATS = 5;

function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

const EMPLOYEES = Array.from(
  { length: EMPLOYEE_COUNT },
  (_, i) => `emp_${pad(i, 4)}`,
);
const ONE_EMPLOYEE = EMPLOYEES[30];

function seed() {
  adapter.reset();
  adapter.seedRow(STORES.SHIFTS, {
    id: "shift_day",
    name: "Day",
    hoursPerDay: 8,
  });
  EMPLOYEES.forEach((id, i) => {
    adapter.seedRow(STORES.EMPLOYEES, {
      id,
      name: `Worker ${i}`,
      isActive: true,
      sortOrder: i,
      monthlySalary: 30000,
      shiftId: "shift_day",
      // A third are Operators, so the day-by-day Sunday-premium engine — the
      // most expensive row builder — is well represented.
      employeeType: i % 3 === 0 ? "operator" : "salaried",
      requiredPresentDays: 26,
      sundayMultiplier: 1.2,
    });
  });

  // Two years of attendance, so the month read has to find its slice in a
  // store the size a real factory reaches.
  const cursor = new Date(Date.UTC(2024, 0, 1));
  let seq = 0;
  for (let d = 0; d < 2 * 365; d += 1) {
    const date = cursor.toISOString().slice(0, 10);
    const isSunday = cursor.getUTCDay() === 0;
    for (const employeeId of EMPLOYEES) {
      seq += 1;
      adapter.seedRow(STORES.ATTENDANCE, {
        id: `att_${pad(seq, 8)}`,
        employeeId,
        date,
        status: isSunday && seq % 5 !== 0 ? "absent" : "present",
        hoursWorked: 8,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const employeeId of EMPLOYEES) {
    for (let m = 0; m < 24; m += 1) {
      const periodFrom = `${2024 + Math.floor(m / 12)}-${pad((m % 12) + 1, 2)}-01`;
      adapter.seedRow(STORES.ADVANCE_DEDUCTIONS, {
        id: `ded_${employeeId}_${periodFrom}`,
        employeeId,
        periodFrom,
        periodTo: `${periodFrom.slice(0, 7)}-30`,
        amount: 250,
      });
    }
  }

  adapter.seedRow(STORES.FACTORY_HOLIDAYS, { id: "h1", date: "2025-06-10" });
  adapter.seedRow(STORES.OPERATOR_NATIONAL_HOLIDAYS, {
    id: "oh1",
    name: "National",
    date: "2025-06-17",
  });
  adapter.seedRow(METADATA_STORE, {
    id: "app_settings",
    version: 1,
    defaultSundayPremiumRequiredDays: 26,
    defaultSundayPremiumMultiplier: 1.2,
  });
}

type Measurement = { ms: number; rowsScanned: number; storeReads: number };

async function measure(run: () => Promise<unknown>): Promise<Measurement> {
  await run(); // warm up, so JIT state is the same for both paths
  adapter.resetCounters();
  const started = performance.now();
  for (let i = 0; i < REPEATS; i += 1) await run();
  const ms = (performance.now() - started) / REPEATS;
  return {
    ms,
    rowsScanned: adapter.reads.rowsScanned / REPEATS,
    storeReads: adapter.reads.storeReads / REPEATS,
  };
}

/** The pre-change implementation, verbatim: build the sheet, pick one row. */
async function legacyRowForEmployee(
  employeeId: string,
): Promise<SalarySheetRow | undefined> {
  const result = await getSalarySheetForRange(YEAR, MONTH, FROM, TO);
  return result.rows.find((r) => r.id === employeeId);
}

const results: { scenario: string; before: Measurement; after: Measurement }[] =
  [];

describe(`salary sheet reads, ${EMPLOYEE_COUNT} employees x 2 years`, () => {
  seed();

  it("one employee's row costs a fraction of what the whole sheet costs", async () => {
    const legacyRow = await legacyRowForEmployee(ONE_EMPLOYEE);
    const newRow = await getSalarySheetRowForEmployee(
      ONE_EMPLOYEE,
      YEAR,
      MONTH,
      FROM,
      TO,
    );
    // The measurement is only worth anything if the answer did not change.
    expect(newRow).toEqual(legacyRow);

    const before = await measure(() => legacyRowForEmployee(ONE_EMPLOYEE));
    const after = await measure(() =>
      getSalarySheetRowForEmployee(ONE_EMPLOYEE, YEAR, MONTH, FROM, TO),
    );
    results.push({ scenario: "one employee's row", before, after });

    // 60 deduction reads collapse to 1; the sheet-wide attendance scan
    // collapses to one employee's slice of the index.
    expect(after.storeReads).toBeLessThan(before.storeReads / 5);
    expect(after.rowsScanned).toBeLessThan(before.rowsScanned / 10);
  });

  it("reports the whole-sheet cost, which this change does not move", async () => {
    const sheet = await measure(() =>
      getSalarySheetForRange(YEAR, MONTH, FROM, TO),
    );
    results.push({
      scenario: `whole sheet, ${EMPLOYEE_COUNT} employees`,
      before: sheet,
      after: sheet,
    });
    expect((await getSalarySheetForRange(YEAR, MONTH, FROM, TO)).rows).toHaveLength(
      EMPLOYEE_COUNT,
    );
  });

  it("prints the before/after table", () => {
    const sizes = Array.from(adapter.tables.keys())
      .filter((name) => adapter.size(name) > 0)
      .map((name) => `${name}=${adapter.size(name)}`)
      .join("  ");
    const lines = [
      "",
      `Dataset: ${sizes}`,
      "",
      "scenario                     | store reads before | after | rows read before | after | ms before | ms after",
      "-----------------------------|--------------------|-------|------------------|-------|-----------|---------",
      ...results.map(
        (r) =>
          `${r.scenario.padEnd(29)}| ${String(r.before.storeReads).padEnd(19)}| ${String(
            r.after.storeReads,
          ).padEnd(6)}| ${String(r.before.rowsScanned).padEnd(17)}| ${String(
            r.after.rowsScanned,
          ).padEnd(6)}| ${r.before.ms.toFixed(3).padEnd(10)}| ${r.after.ms.toFixed(3)}`,
      ),
      "",
    ];
    console.log(lines.join("\n"));
    expect(results.length).toBe(2);
  });
});
