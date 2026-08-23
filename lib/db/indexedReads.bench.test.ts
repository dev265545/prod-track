import { describe, expect, it, vi } from "vitest";
import { STORES } from "@/lib/db/schema";

/**
 * Measures the indexed read path against the `getAll` + JS filter it replaced,
 * on a dataset the size a real factory reaches after two years.
 *
 * The stand-in adapter below is built to model the two costs that actually
 * dominate on IndexedDB, so the milliseconds mean something:
 *
 * 1. **Per-row deserialisation.** IndexedDB structured-clones every record it
 *    hands back. Rows are therefore stored here as JSON strings and parsed on
 *    read, so a query pays in proportion to the rows it *returns*. A fake that
 *    returned live object references would make `getAll` look free, which is
 *    exactly the illusion that let this problem survive.
 * 2. **Index seek.** Index reads binary-search a sorted key array rather than
 *    walking the store, modelling a B-tree range scan.
 *
 * Absolute numbers are not a Chrome 109 prediction — structured clone is not
 * `JSON.parse`, and a real store pays disk I/O this does not. The ratio between
 * the two columns is the claim being made.
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
  const reads = { getAll: 0, getByIndex: 0, rowsScanned: 0 };

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

  /** Sorted (indexKey, row) pairs — the fake's equivalent of a B-tree. */
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

  /** First position whose key is >= `bound`. */
  const lowerBound = (
    list: { key: unknown }[],
    bound: unknown,
  ) => {
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
        reads.getAll = 0;
        reads.getByIndex = 0;
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
        reads.getAll += 1;
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
        reads.getByIndex += 1;
        const list = indexFor(store, indexName);
        const out: Row[] = [];
        for (let i = lowerBound(list, lower); i < list.length; i += 1) {
          if (cmp(list[i].key as never, upper as never) > 0) break;
          out.push(JSON.parse(list[i].entry.json) as Row);
        }
        reads.rowsScanned += out.length;
        // Already in index order, exactly as IndexedDB returns it.
        return out;
      },
      get: async (store: string, id: string) => {
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
  getAllAttendanceByDate,
  getAttendanceByEmployeeAndDate,
  getAttendanceByEmployeeInRange,
  getAttendanceInRange,
} from "@/lib/services/attendanceService";
import {
  getProductionsByDate,
  getProductionsByEmployee,
  getProductionsInRange,
} from "@/lib/services/productionService";
import { getAdvancesByEmployee } from "@/lib/services/advanceService";
import { getDeductionsByEmployee } from "@/lib/services/advanceDeductionService";

type Row = Record<string, unknown>;

const EMPLOYEE_COUNT = 60;
const YEARS = 2;
const REPEATS = 8;

function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

function buildDates(): string[] {
  const dates: string[] = [];
  const cursor = new Date(Date.UTC(2024, 0, 1));
  for (let i = 0; i < YEARS * 365; i += 1) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

const DATES = buildDates();
const EMPLOYEES = Array.from(
  { length: EMPLOYEE_COUNT },
  (_, i) => `emp_${pad(i, 4)}`
);

const put = (store: string, row: Row) => adapter.seedRow(store, row);

function seed() {
  adapter.reset();
  let seq = 0;
  for (const date of DATES) {
    const isSunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
    for (const employeeId of EMPLOYEES) {
      seq += 1;
      const id = pad(seq, 8);
      put(STORES.ATTENDANCE, {
        id: `att_${id}`,
        employeeId,
        date,
        status: isSunday ? "absent" : "present",
        hoursWorked: 8,
      });
      // Not everyone produces every day; roughly two thirds do.
      if (seq % 3 !== 0) {
        put(STORES.PRODUCTIONS, {
          id: `prod_${id}`,
          employeeId,
          date,
          itemId: `item_${seq % 12}`,
          shift: seq % 2 === 0 ? "day" : "night",
          quantity: 40 + (seq % 25),
        });
      }
      // Most people take an advance twice a month.
      if (date.endsWith("-05") || date.endsWith("-20")) {
        put(STORES.ADVANCES, {
          id: `adv_${id}`,
          employeeId,
          date,
          amount: 500,
        });
      }
      if (seq % 7 === 0) {
        put(STORES.INVENTORY_MOVEMENTS, {
          id: `mov_${id}`,
          itemId: `item_${seq % 12}`,
          date,
          quantity: 10,
        });
      }
    }
  }
  for (const employeeId of EMPLOYEES) {
    for (let m = 0; m < YEARS * 12; m += 1) {
      const periodFrom = `${2024 + Math.floor(m / 12)}-${pad((m % 12) + 1, 2)}-01`;
      put(STORES.ADVANCE_DEDUCTIONS, {
        id: `ded_${employeeId}_${periodFrom}`,
        employeeId,
        periodFrom,
        periodTo: `${periodFrom.slice(0, 7)}-28`,
        amount: 250,
      });
    }
  }
}

/** The pre-change implementation, verbatim: read the store, filter in JS. */
const legacy = {
  attendanceInRange: async (from: string, to: string) => {
    const all = await adapter.getAll(STORES.ATTENDANCE);
    return all.filter(
      (a) => (a.date as string) >= from && (a.date as string) <= to
    );
  },
  attendanceByDate: async (date: string) => {
    const all = await adapter.getAll(STORES.ATTENDANCE);
    return all.filter((a) => (a.date as string) === date);
  },
  attendanceByEmployeeInRange: async (
    employeeId: string,
    from: string,
    to: string
  ) => {
    const all = await adapter.getAll(STORES.ATTENDANCE);
    return all.filter(
      (a) =>
        (a.employeeId as string) === employeeId &&
        (a.date as string) >= from &&
        (a.date as string) <= to
    );
  },
  attendanceByEmployeeAndDate: async (employeeId: string, date: string) => {
    const all = await adapter.getAll(STORES.ATTENDANCE);
    const matches = all.filter(
      (a) => (a.employeeId as string) === employeeId && (a.date as string) === date
    );
    return matches.length > 0 ? matches[matches.length - 1] : null;
  },
  productionsInRange: async (from: string, to: string) => {
    const all = await adapter.getAll(STORES.PRODUCTIONS);
    return all.filter(
      (p) => (p.date as string) >= from && (p.date as string) <= to
    );
  },
  productionsByDate: async (date: string) => {
    const all = await adapter.getAll(STORES.PRODUCTIONS);
    return all.filter((p) => (p.date as string) === date);
  },
  productionsByEmployee: async (
    employeeId: string,
    from: string,
    to: string
  ) => {
    const all = await adapter.getAll(STORES.PRODUCTIONS);
    return all.filter(
      (p) =>
        (p.employeeId as string) === employeeId &&
        (p.date as string) >= from &&
        (p.date as string) <= to
    );
  },
  advancesByEmployee: async (employeeId: string, from: string, to: string) => {
    const all = await adapter.getAll(STORES.ADVANCES);
    return all.filter(
      (a) =>
        (a.employeeId as string) === employeeId &&
        (a.date as string) >= from &&
        (a.date as string) <= to
    );
  },
  deductionsByEmployee: async (employeeId: string) => {
    const all = await adapter.getAll(STORES.ADVANCE_DEDUCTIONS);
    return all.filter((d) => d.employeeId === employeeId);
  },
};

type Measurement = {
  ms: number;
  rowsScanned: number;
  storeReads: number;
  resultRows: number;
};

async function measure(run: () => Promise<unknown>): Promise<Measurement> {
  await run(); // warm up, so JIT state is the same for both paths
  adapter.resetCounters();
  const started = performance.now();
  let resultRows = 0;
  for (let i = 0; i < REPEATS; i += 1) {
    const out = await run();
    resultRows = Array.isArray(out) ? out.length : out ? 1 : 0;
  }
  const ms = (performance.now() - started) / REPEATS;
  return {
    ms,
    rowsScanned: adapter.reads.rowsScanned / REPEATS,
    storeReads: (adapter.reads.getAll + adapter.reads.getByIndex) / REPEATS,
    resultRows,
  };
}

const MONTH_FROM = "2025-06-01";
const MONTH_TO = "2025-06-30";
const ONE_DAY = "2025-06-16";
const ONE_EMPLOYEE = EMPLOYEES[30];

const results: {
  scenario: string;
  before: Measurement;
  after: Measurement;
}[] = [];

describe("indexed reads vs getAll + filter, 60 employees x 2 years", () => {
  seed();

  const scenarios: [string, () => Promise<unknown>, () => Promise<unknown>][] = [
    [
      "attendance, one month (salary sheet)",
      () => legacy.attendanceInRange(MONTH_FROM, MONTH_TO),
      () => getAttendanceInRange(MONTH_FROM, MONTH_TO),
    ],
    [
      "attendance, one day (attendance screen)",
      () => legacy.attendanceByDate(ONE_DAY),
      () => getAllAttendanceByDate(ONE_DAY),
    ],
    [
      "attendance, one employee one month (employee page)",
      () => legacy.attendanceByEmployeeInRange(ONE_EMPLOYEE, MONTH_FROM, MONTH_TO),
      () => getAttendanceByEmployeeInRange(ONE_EMPLOYEE, MONTH_FROM, MONTH_TO),
    ],
    [
      "attendance, one employee one day (marking a day)",
      () => legacy.attendanceByEmployeeAndDate(ONE_EMPLOYEE, ONE_DAY),
      () => getAttendanceByEmployeeAndDate(ONE_EMPLOYEE, ONE_DAY),
    ],
    [
      "productions, one month (reports)",
      () => legacy.productionsInRange(MONTH_FROM, MONTH_TO),
      () => getProductionsInRange(MONTH_FROM, MONTH_TO),
    ],
    [
      "productions, one day (production entry)",
      () => legacy.productionsByDate(ONE_DAY),
      () => getProductionsByDate(ONE_DAY),
    ],
    [
      "productions, one employee one month",
      () => legacy.productionsByEmployee(ONE_EMPLOYEE, MONTH_FROM, MONTH_TO),
      () => getProductionsByEmployee(ONE_EMPLOYEE, MONTH_FROM, MONTH_TO),
    ],
    [
      "advances, one employee one month",
      () => legacy.advancesByEmployee(ONE_EMPLOYEE, MONTH_FROM, MONTH_TO),
      () => getAdvancesByEmployee(ONE_EMPLOYEE, MONTH_FROM, MONTH_TO),
    ],
    [
      "deductions, one employee",
      () => legacy.deductionsByEmployee(ONE_EMPLOYEE),
      () => getDeductionsByEmployee(ONE_EMPLOYEE),
    ],
  ];

  for (const [scenario, before, after] of scenarios) {
    it(`${scenario} — same rows, fewer read`, async () => {
      const b = await measure(before);
      const a = await measure(after);
      results.push({ scenario, before: b, after: a });
      expect(a.resultRows).toBe(b.resultRows);
      expect(a.rowsScanned).toBeLessThanOrEqual(b.rowsScanned);
    });
  }

  it("N+1: the salary sheet's per-employee deduction lookup", async () => {
    const b = await measure(async () => {
      const out: Row[] = [];
      for (const emp of EMPLOYEES) out.push(...(await legacy.deductionsByEmployee(emp)));
      return out;
    });
    const a = await measure(async () => {
      const out: Row[] = [];
      for (const emp of EMPLOYEES) out.push(...(await getDeductionsByEmployee(emp)));
      return out;
    });
    results.push({ scenario: `deductions for all ${EMPLOYEE_COUNT} employees (salary sheet N+1)`, before: b, after: a });
    expect(a.resultRows).toBe(b.resultRows);
    expect(a.rowsScanned).toBeLessThan(b.rowsScanned);
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
      "scenario                                          | rows read before | rows read after | ms before | ms after",
      "--------------------------------------------------|------------------|-----------------|-----------|---------",
      ...results.map(
        (r) =>
          `${r.scenario.padEnd(50)}| ${String(r.before.rowsScanned).padEnd(17)}| ${String(
            r.after.rowsScanned
          ).padEnd(16)}| ${r.before.ms.toFixed(3).padEnd(10)}| ${r.after.ms.toFixed(3)}`
      ),
      "",
    ];
    console.log(lines.join("\n"));
    expect(results.length).toBeGreaterThan(0);
  });
});
