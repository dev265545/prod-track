import { beforeAll, describe, expect, it, vi } from "vitest";
import { STORES } from "@/lib/db/schema";

/**
 * Proof that reading the audit log through the `by_timestamp` index shows the
 * owner exactly what reading all of it did.
 *
 * The baseline below — "load every entry newest-first, `filterEntries`,
 * `paginate`" — is the code the audit page ran before the index existed. Every
 * assertion here compares the new query against that expression element for
 * element, because the log is evidence: a page that quietly omits an entry is
 * worse than a slow one.
 */

const { adapter } = await vi.hoisted(async () => {
  const { createMemoryAdapter } = await import("@/lib/db/testing/memoryAdapter");
  return { adapter: createMemoryAdapter() };
});

vi.mock("@/lib/db/adapter", () => adapter);

import {
  collectAuditEntries,
  listAuditEntries,
  listAuditRoles,
  queryAuditEntries,
  readAuditLogHealth,
  readCountEntriesBefore,
  countEntriesBefore,
  summariseHealth,
  type AuditEntry,
} from "@/lib/services/auditService";
import {
  AUDIT_PAGE_SIZE,
  EMPTY_FILTER,
  filterEntries,
  paginate,
  rolesPresent,
  type AuditFilter,
} from "@/lib/services/auditLogView";

/**
 * The pre-index page: everything into memory, then filter, then slice.
 *
 * Entries with no timestamp are dropped from the baseline because the index
 * defines the log's universe — IndexedDB omits a record with no index key, so
 * an undatable entry cannot appear in a chronological view. That is the one
 * deliberate difference, and it is asserted on its own below.
 */
async function legacyPage(filter: AuditFilter, page: number) {
  const all = (await listAuditEntries()).filter(
    (e: AuditEntry) => typeof e.timestamp === "string",
  );
  return paginate(filterEntries(all, filter), page, AUDIT_PAGE_SIZE);
}

const ACTIONS = [
  "attendance.mark",
  "production.create",
  "advance.create",
  "employee.update",
  "inventory.inward",
  "settings.update",
  // Not in AUDIT_ACTIONS: an entry restored from another build. It must keep
  // bucketing to "other" rather than disappearing from the log.
  "teleport.engage",
];

const ROLES = ["admin", "worker", null];

function seed() {
  let seq = 0;
  const cursor = new Date(Date.UTC(2025, 0, 1, 6, 0, 0));
  for (let day = 0; day < 120; day += 1) {
    for (let n = 0; n < 5; n += 1) {
      const ts = new Date(cursor.getTime() + n * 3_600_000).toISOString();
      const action = ACTIONS[seq % ACTIONS.length];
      void adapter.put(STORES.AUDIT_LOG, {
        id: `audit_${String(seq).padStart(5, "0")}`,
        timestamp: ts,
        action,
        entity: "thing",
        entityId: `x${seq}`,
        summary: `Somebody changed thing number ${seq}`,
        role: ROLES[seq % ROLES.length],
        userId: null,
      });
      seq += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  // A malformed row, as a restored backup can contain: the index skips rows
  // with no key, exactly as the old `.filter()` on a `yyyy-mm-dd` slice did.
  void adapter.put(STORES.AUDIT_LOG, {
    id: "audit_broken",
    action: "attendance.mark",
    entity: "thing",
    entityId: null,
    summary: "An entry with no timestamp at all",
    role: "admin",
    userId: null,
  });
}

beforeAll(seed);

const FILTERS: [string, AuditFilter][] = [
  ["no filter", EMPTY_FILTER],
  ["one month", { ...EMPTY_FILTER, from: "2025-02-01", to: "2025-02-28" }],
  ["open-ended from", { ...EMPTY_FILTER, from: "2025-04-01" }],
  ["open-ended to", { ...EMPTY_FILTER, to: "2025-01-10" }],
  ["one day", { ...EMPTY_FILTER, from: "2025-03-05", to: "2025-03-05" }],
  ["category only", { ...EMPTY_FILTER, category: "money" }],
  ["unknown action bucket", { ...EMPTY_FILTER, category: "other" }],
  ["role only", { ...EMPTY_FILTER, role: "worker" }],
  ["text only", { ...EMPTY_FILTER, search: "number 42" }],
  [
    "date + category + role + text",
    {
      from: "2025-02-01",
      to: "2025-03-31",
      category: "attendance",
      role: "admin",
      search: "thing",
    },
  ],
];

describe("queryAuditEntries matches the whole-log read it replaced", () => {
  for (const [name, filter] of FILTERS) {
    it(`${name}: same rows, order, totals and paging`, async () => {
      for (const page of [1, 2, 5, 999]) {
        const expected = await legacyPage(filter, page);
        const actual = await queryAuditEntries(filter, page);
        expect(actual.rows, `${name} page ${page}`).toEqual(expected.rows);
        expect(actual.total).toBe(expected.total);
        expect(actual.pageCount).toBe(expected.pageCount);
        expect(actual.page).toBe(expected.page);
        expect(actual.firstIndex).toBe(expected.firstIndex);
        expect(actual.lastIndex).toBe(expected.lastIndex);
        expect(actual.truncated).toBe(false);
      }
    });
  }

  it("keeps an action this build has never heard of visible", async () => {
    const page = await queryAuditEntries(
      { ...EMPTY_FILTER, category: "other" },
      1,
    );
    expect(page.total).toBeGreaterThan(0);
    expect(page.rows.every((r) => r.action === "teleport.engage")).toBe(true);
  });

  it("returns entries newest first", async () => {
    const page = await queryAuditEntries(EMPTY_FILTER, 1);
    const stamps = page.rows.map((r) => r.timestamp);
    expect([...stamps].sort().reverse()).toEqual(stamps);
  });

  it("omits an entry with no timestamp, which the index cannot place", async () => {
    const all = await queryAuditEntries(EMPTY_FILTER, 1);
    expect(all.total).toBe(120 * 5);
    // Still in the store: nothing here deletes it, and the whole-log export
    // path still carries it out to the owner.
    const stored = await listAuditEntries();
    expect(stored).toHaveLength(120 * 5 + 1);
    expect(stored.some((e: AuditEntry) => e.id === "audit_broken")).toBe(true);
  });

  it("does not throw on that entry when filtering in memory", () => {
    const broken = { id: "x", summary: "no stamp here at all" } as unknown as AuditEntry;
    expect(() => filterEntries([broken], EMPTY_FILTER)).not.toThrow();
    expect(filterEntries([broken], { ...EMPTY_FILTER, from: "2025-01-01" })).toEqual([]);
  });
});

describe("bounded reads", () => {
  it("reads one page, not the log, for a date-only query", async () => {
    adapter.resetCounters();
    const page = await queryAuditEntries(EMPTY_FILTER, 1);
    expect(page.rows).toHaveLength(AUDIT_PAGE_SIZE);
    expect(adapter.reads.getAll).toBe(0);
    expect(adapter.reads.rowsScanned).toBe(AUDIT_PAGE_SIZE);
  });

  it("never calls the unbounded read for a filtered query either", async () => {
    adapter.resetCounters();
    await queryAuditEntries({ ...EMPTY_FILTER, search: "thing" }, 1);
    expect(adapter.reads.getAll).toBe(0);
  });

  it("counts a retention preview without deserialising an entry", async () => {
    adapter.resetCounters();
    const cutoff = "2025-03-01T00:00:00.000Z";
    const n = await readCountEntriesBefore(cutoff);
    expect(adapter.reads.getAll).toBe(0);
    expect(adapter.reads.rowsScanned).toBe(0);
    expect(n).toBe(countEntriesBefore(await listAuditEntries(), cutoff));
  });

  it("keeps the cutoff instant itself, like the array count", async () => {
    const entries = await listAuditEntries();
    for (const e of [entries[10], entries[400], entries[599]]) {
      expect(await readCountEntriesBefore(e.timestamp)).toBe(
        countEntriesBefore(entries, e.timestamp),
      );
    }
  });

  it("reports the same health as summarising every entry", async () => {
    const entries = (await listAuditEntries()).filter(
      (e: AuditEntry) => typeof e.timestamp === "string",
    );
    adapter.resetCounters();
    const health = await readAuditLogHealth();
    expect(adapter.reads.getAll).toBe(0);
    expect(adapter.reads.rowsScanned).toBe(1);
    const legacy = summariseHealth(entries);
    expect(health).toEqual(legacy);
  });

  it("offers the same roles the whole-log scan offered", async () => {
    expect(await listAuditRoles()).toEqual(
      rolesPresent(await listAuditEntries()),
    );
  });
});

describe("truncation is reported, never silent", () => {
  it("says so when a filtered search hits the cap", async () => {
    const filter = { ...EMPTY_FILTER, search: "thing" };
    const capped = await collectAuditEntries(filter, 40);
    expect(capped.truncated).toBe(true);
    expect(capped.entries).toHaveLength(40);
    // The cap takes the newest, so the export is a suffix of the full result.
    const full = await collectAuditEntries(filter, 10_000);
    expect(full.truncated).toBe(false);
    expect(capped.entries).toEqual(full.entries.slice(0, 40));
  });
});
