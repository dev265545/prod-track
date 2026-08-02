import { describe, expect, it, vi } from "vitest";
import { STORES } from "@/lib/db/schema";

/**
 * What the audit viewer costs on a log the size a real factory reaches.
 *
 * Commit 8b69c84 wired 38 mutation sites to `record()`. At roughly 200 actions
 * a day — a couple of hundred attendance marks, production entries, advances
 * and stock movements — two years is ~146,000 entries, and every one of them
 * used to be structured-cloned out of IndexedDB to draw a page of fifty.
 *
 * The stand-in adapter models the two costs that dominate there, exactly as
 * `indexedReads.bench.test.ts` does:
 *
 * 1. **Per-row deserialisation.** Rows are stored as JSON strings and parsed
 *    on read, so a query pays in proportion to the rows it *returns*. A fake
 *    handing back live references would make `getAll` look free.
 * 2. **Index seek.** Range reads binary-search a sorted key array; a cursor
 *    with a limit stops at the page boundary and parses nothing beyond it, and
 *    `countByIndex` walks keys without parsing anything at all — which is what
 *    `IDBIndex.count` really does.
 *
 * Absolute milliseconds are not a Chrome 109 prediction. The row counts are
 * exact, and they are what scales with years of data.
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
  const reads = { getAll: 0, getByIndex: 0, countByIndex: 0, rowsParsed: 0 };

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

  /** First position whose key is > `bound`. */
  const upperBound = (list: { key: unknown }[], bound: unknown) => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cmp(list[mid].key as never, bound as never) <= 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  return {
    adapter: {
      STORES: S,
      reads,
      resetCounters: () => {
        reads.getAll = 0;
        reads.getByIndex = 0;
        reads.countByIndex = 0;
        reads.rowsParsed = 0;
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
        reads.rowsParsed += out.length;
        return out;
      },
      getByIndex: async (
        store: string,
        indexName: string,
        lower: unknown,
        upper: unknown,
        options?: { direction?: "next" | "prev"; limit?: number; offset?: number },
      ) => {
        reads.getByIndex += 1;
        const list = indexFor(store, indexName);
        const from = lowerBound(list, lower);
        const to = upperBound(list, upper); // exclusive
        const out: Row[] = [];
        const limit = options?.limit ?? Infinity;
        const offset = options?.offset ?? 0;
        if (options?.direction === "prev") {
          // A reverse cursor: it starts at the far end and stops when the page
          // is full. Nothing past the page boundary is ever deserialised.
          let skipped = 0;
          for (let i = to - 1; i >= from && out.length < limit; i -= 1) {
            if (skipped < offset) {
              skipped += 1;
              continue;
            }
            out.push(JSON.parse(list[i].entry.json) as Row);
          }
        } else {
          let skipped = 0;
          for (let i = from; i < to && out.length < limit; i += 1) {
            if (skipped < offset) {
              skipped += 1;
              continue;
            }
            out.push(JSON.parse(list[i].entry.json) as Row);
          }
        }
        reads.rowsParsed += out.length;
        return out;
      },
      countByIndex: async (
        store: string,
        indexName: string,
        lower: unknown,
        upper: unknown,
      ) => {
        // Keys only. `IDBIndex.count` never materialises a record, so this
        // adds nothing to `rowsParsed` — that is the whole claim being made
        // about the retention preview.
        reads.countByIndex += 1;
        const list = indexFor(store, indexName);
        return upperBound(list, upper) - lowerBound(list, lower);
      },
      get: async () => null,
      put: async () => undefined,
      remove: async () => undefined,
      clear: async () => undefined,
      deleteWhere: async () => 0,
    },
  };
});

vi.mock("@/lib/db/adapter", () => adapter);

import {
  countEntriesBefore,
  listAuditEntries,
  queryAuditEntries,
  readCountEntriesBefore,
  summariseHealth,
  readAuditLogHealth,
} from "@/lib/services/auditService";
import {
  AUDIT_PAGE_SIZE,
  EMPTY_FILTER,
  filterEntries,
  paginate,
  type AuditFilter,
} from "@/lib/services/auditLogView";

/* -------------------------------------------------------------------------
 * A log two years old, at the rate the wiring commit made real.
 * ---------------------------------------------------------------------- */

const ENTRIES_PER_DAY = 200;
const DAYS = 730;
const REPEATS = 3;

const ACTIONS = [
  "attendance.mark",
  "attendance.update",
  "production.create",
  "production.update",
  "advance.create",
  "deduction.set",
  "employee.update",
  "inventory.inward",
  "inventory.outward",
  "salary.override.set",
  "settings.update",
  "item.update",
];
const ROLES = ["admin", "worker"];
const NAMES = ["Rakesh", "Sunita", "Imran", "Devi", "Prakash", "Anita"];

function seed() {
  adapter.reset();
  let seq = 0;
  const day = new Date(Date.UTC(2024, 0, 1));
  for (let d = 0; d < DAYS; d += 1) {
    const base = day.getTime();
    for (let n = 0; n < ENTRIES_PER_DAY; n += 1) {
      // Spread across a 10-hour shift, so a day is a contiguous key run.
      const ts = new Date(base + 6 * 3_600_000 + n * 180_000).toISOString();
      adapter.seedRow(STORES.AUDIT_LOG, {
        id: `aud_${String(seq).padStart(7, "0")}`,
        timestamp: ts,
        action: ACTIONS[seq % ACTIONS.length],
        entity: "record",
        entityId: `rec_${seq % 5000}`,
        summary: `${NAMES[seq % NAMES.length]} changed record ${seq} on the shop floor`,
        role: ROLES[seq % ROLES.length],
        userId: null,
        diff: [{ field: "quantity", before: seq % 40, after: (seq % 40) + 1 }],
      });
      seq += 1;
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return seq;
}

const TOTAL = seed();

/** Time `fn` over `REPEATS` runs, reporting the rows the last run parsed. */
async function measure(fn: () => Promise<unknown>) {
  await fn();
  adapter.resetCounters();
  await fn();
  const parsed = adapter.reads.rowsParsed;
  const getAlls = adapter.reads.getAll;
  const started = performance.now();
  for (let i = 0; i < REPEATS; i += 1) await fn();
  const ms = (performance.now() - started) / REPEATS;
  return { parsed, getAlls, ms };
}

const rows: string[] = [];
function report(
  label: string,
  before: { parsed: number; ms: number },
  after: { parsed: number; ms: number },
) {
  const factor = after.parsed === 0 ? "∞" : (before.parsed / after.parsed).toFixed(0);
  rows.push(
    `${label.padEnd(30)} ${String(before.parsed).padStart(9)} -> ${String(after.parsed).padStart(6)}` +
      `   (${factor}x)   ${before.ms.toFixed(1)}ms -> ${after.ms.toFixed(2)}ms`,
  );
}

/* -------------------------------------------------------------------------
 * The three things the viewer does.
 * ---------------------------------------------------------------------- */

/** The pre-index page: the whole log into memory, then filter, then slice. */
async function legacyPage(filter: AuditFilter, page: number) {
  const all = await listAuditEntries();
  return paginate(filterEntries(all, filter), page, AUDIT_PAGE_SIZE);
}

describe(`audit log reads on ${TOTAL.toLocaleString("en")} entries`, () => {
  it("seeded two years at 200 entries a day", () => {
    expect(adapter.size(STORES.AUDIT_LOG)).toBe(DAYS * ENTRIES_PER_DAY);
  });

  it("opening the viewer reads one page instead of the log", async () => {
    const before = await measure(() => legacyPage(EMPTY_FILTER, 1));
    const after = await measure(() => queryAuditEntries(EMPTY_FILTER, 1));
    report("open the viewer", before, after);

    expect(before.parsed).toBe(TOTAL);
    expect(after.parsed).toBe(AUDIT_PAGE_SIZE);
    expect(after.getAlls).toBe(0);
    // Same fifty rows, same order.
    const b = await legacyPage(EMPTY_FILTER, 1);
    const a = await queryAuditEntries(EMPTY_FILTER, 1);
    expect(a.rows).toEqual(b.rows);
    expect(a.total).toBe(b.total);
  });

  it("paging deeper stays one page, not a growing slice", async () => {
    const after = await measure(() => queryAuditEntries(EMPTY_FILTER, 40));
    expect(after.parsed).toBe(AUDIT_PAGE_SIZE);
    expect(after.getAlls).toBe(0);
    const b = await legacyPage(EMPTY_FILTER, 40);
    const a = await queryAuditEntries(EMPTY_FILTER, 40);
    expect(a.rows).toEqual(b.rows);
  });

  it("filtering to one month reads that month's page", async () => {
    const filter: AuditFilter = {
      ...EMPTY_FILTER,
      from: "2025-03-01",
      to: "2025-03-31",
    };
    const before = await measure(() => legacyPage(filter, 1));
    const after = await measure(() => queryAuditEntries(filter, 1));
    report("filter to one month", before, after);

    expect(before.parsed).toBe(TOTAL);
    expect(after.parsed).toBe(AUDIT_PAGE_SIZE);
    const b = await legacyPage(filter, 1);
    const a = await queryAuditEntries(filter, 1);
    expect(a.rows).toEqual(b.rows);
    expect(a.total).toBe(b.total);
    expect(a.total).toBe(31 * ENTRIES_PER_DAY);
  });

  it("a text search inside one month reads that month, not the log", async () => {
    const filter: AuditFilter = {
      ...EMPTY_FILTER,
      from: "2025-03-01",
      to: "2025-03-31",
      search: "Sunita",
    };
    const before = await measure(() => legacyPage(filter, 1));
    const after = await measure(() => queryAuditEntries(filter, 1));
    report("search within one month", before, after);

    expect(before.parsed).toBe(TOTAL);
    // The month itself: text is not index-served, so its rows are examined.
    expect(after.parsed).toBe(31 * ENTRIES_PER_DAY);
    const b = await legacyPage(filter, 1);
    const a = await queryAuditEntries(filter, 1);
    expect(a.rows).toEqual(b.rows);
    expect(a.truncated).toBe(false);
  });

  it("an unbounded text search is capped, and says so", async () => {
    const filter: AuditFilter = { ...EMPTY_FILTER, search: "Sunita" };
    const before = await measure(() => legacyPage(filter, 1));
    const after = await measure(() => queryAuditEntries(filter, 1));
    report("search, no date range", before, after);

    expect(before.parsed).toBe(TOTAL);
    // AUDIT_SCAN_LIMIT + 1: the extra row is how "there is more" is detected.
    expect(after.parsed).toBe(10_001);
    const a = await queryAuditEntries(filter, 1);
    expect(a.truncated).toBe(true);
  });

  it("the retention preview counts keys and parses nothing", async () => {
    const cutoff = "2025-01-01T00:00:00.000Z";
    const before = await measure(async () =>
      countEntriesBefore(await listAuditEntries(), cutoff),
    );
    const after = await measure(() => readCountEntriesBefore(cutoff));
    report("retention preview", before, after);

    expect(before.parsed).toBe(TOTAL);
    expect(after.parsed).toBe(0);
    expect(await readCountEntriesBefore(cutoff)).toBe(
      countEntriesBefore(await listAuditEntries(), cutoff),
    );
  });

  it("the retention card's header costs one row", async () => {
    const before = await measure(async () =>
      summariseHealth(await listAuditEntries()),
    );
    const after = await measure(() => readAuditLogHealth());
    report("retention header (count+age)", before, after);

    expect(before.parsed).toBe(TOTAL);
    expect(after.parsed).toBe(1);
    expect(await readAuditLogHealth()).toEqual(
      summariseHealth(await listAuditEntries()),
    );
  });

  it("prints the table", () => {
    console.log(
      `\naudit_log — ${TOTAL.toLocaleString("en")} entries (200/day x 2 years)\n` +
        `${"".padEnd(30)} ${"rows parsed".padStart(9)}    ${"        "}          per call\n` +
        rows.join("\n") +
        "\n",
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});
