import { describe, it, expect, beforeEach, vi } from "vitest";
import { STORES } from "../../db/schema";

const rows: Record<string, unknown>[] = [];
let putShouldThrow = false;

vi.mock("../../db/adapter", async () => {
  const schema = await import("../../db/schema");
  return {
    STORES: schema.STORES,
    put: async (name: string, rec: Record<string, unknown>) => {
      if (putShouldThrow) throw new Error("db unavailable");
      expect(name).toBe(schema.STORES.AUDIT_LOG);
      rows.push(rec);
    },
    getAll: async () => [...rows],
    deleteWhere: async (
      name: string,
      predicate: (row: Record<string, unknown>) => boolean,
    ) => {
      expect(name).toBe(schema.STORES.AUDIT_LOG);
      const doomed = rows.filter(predicate);
      for (const row of doomed) rows.splice(rows.indexOf(row), 1);
      return doomed.length;
    },
  };
});

const {
  AUDIT_ACTIONS,
  AUDIT_SOFT_CAP,
  buildEntry,
  countEntriesBefore,
  diffEntity,
  isHumanSummary,
  listAuditEntries,
  pruneAuditEntriesBefore,
  record,
  summariseHealth,
} = await import("../auditService");

type Entry = Awaited<ReturnType<typeof listAuditEntries>>[number];

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null;
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
}
(globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage();

beforeEach(() => {
  rows.length = 0;
  putShouldThrow = false;
  localStorage.clear();
});

function entry(over: Partial<Entry>): Entry {
  return {
    id: over.id ?? "x",
    timestamp: over.timestamp ?? "2026-08-01T10:00:00.000Z",
    action: over.action ?? AUDIT_ACTIONS.loginSuccess,
    entity: over.entity ?? "auth",
    entityId: over.entityId ?? null,
    summary: over.summary ?? "Signed in as admin",
    role: over.role ?? "admin",
    userId: null,
    ...(over.diff !== undefined ? { diff: over.diff } : {}),
  };
}

describe("buildEntry", () => {
  it("stamps timestamp, role and a null userId reserved for real accounts", () => {
    localStorage.setItem("prodtrack_session_role", "admin");
    const e = buildEntry(
      AUDIT_ACTIONS.loginSuccess,
      "auth",
      "admin",
      "Signed in as admin",
    );
    expect(e.action).toBe("login.success");
    expect(e.entity).toBe("auth");
    expect(e.entityId).toBe("admin");
    expect(e.summary).toBe("Signed in as admin");
    expect(e.role).toBe("admin");
    expect(e.userId).toBeNull();
    expect(Number.isNaN(Date.parse(e.timestamp))).toBe(false);
    expect("diff" in e).toBe(false);
  });

  it("keeps the optional diff when supplied", () => {
    const e = buildEntry(
      AUDIT_ACTIONS.passwordChange,
      "auth",
      "admin",
      "Admin password was changed",
      { before: 1 },
    );
    expect(e.diff).toEqual({ before: 1 });
  });

  it("generates unique ids", () => {
    const ids = new Set(
      Array.from(
        { length: 50 },
        () =>
          buildEntry(AUDIT_ACTIONS.logout, "auth", null, "Signed out as admin")
            .id,
      ),
    );
    expect(ids.size).toBe(50);
  });

  it("records a null role when there is no session", () => {
    expect(
      buildEntry(
        AUDIT_ACTIONS.loginFailure,
        "auth",
        null,
        "Failed sign-in attempt",
      ).role,
    ).toBeNull();
  });

  it("warns but still stores when the summary is not plain language", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const e = buildEntry(
      AUDIT_ACTIONS.attendanceMark,
      "attendance",
      "a1",
      "attendance.update {id:a1}",
    );
    expect(warn).toHaveBeenCalled();
    expect(e.summary).toBe("attendance.update {id:a1}");
    warn.mockRestore();
  });
});

describe("isHumanSummary", () => {
  it("accepts a sentence an owner could read", () => {
    expect(
      isHumanSummary("Rakesh was marked present on 3 August by the admin"),
    ).toBe(true);
    expect(isHumanSummary("Signed in as admin")).toBe(true);
    expect(isHumanSummary("Worker password set for the first time")).toBe(true);
  });

  it("rejects serialised payloads and bare action ids", () => {
    expect(isHumanSummary("attendance.update for 3 people")).toBe(false);
    expect(isHumanSummary('{"id":"a1","present":true}')).toBe(false);
    expect(isHumanSummary("Saved [object Object] to disk")).toBe(false);
    expect(isHumanSummary("Marked undefined as present")).toBe(false);
  });

  it("rejects one-word and non-string summaries", () => {
    expect(isHumanSummary("updated")).toBe(false);
    expect(isHumanSummary("")).toBe(false);
    expect(isHumanSummary(null)).toBe(false);
    expect(isHumanSummary(42)).toBe(false);
  });
});

describe("diffEntity", () => {
  const fields = ["name", "monthlySalary", "isActive"] as const;

  it("captures only the allowlisted fields that actually changed", () => {
    const changes = diffEntity(
      { id: "e1", name: "Rakesh", monthlySalary: 12000, isActive: true },
      { id: "e1", name: "Rakesh", monthlySalary: 13500, isActive: true },
      fields,
    );
    expect(changes).toEqual([
      { field: "monthlySalary", before: 12000, after: 13500 },
    ]);
  });

  it("never leaks a field outside the allowlist", () => {
    const changes = diffEntity(
      { id: "e1", passwordHash: "old", name: "A" },
      { id: "e2", passwordHash: "new", name: "B" },
      fields,
    );
    expect(changes.map((c) => c.field)).toEqual(["name"]);
  });

  it("treats a null before as a create and a null after as a delete", () => {
    expect(diffEntity(null, { name: "Sita" }, fields)).toEqual([
      { field: "name", before: null, after: "Sita" },
    ]);
    expect(diffEntity({ name: "Sita" }, null, fields)).toEqual([
      { field: "name", before: "Sita", after: null },
    ]);
  });

  it("returns nothing when the interesting fields are untouched", () => {
    const same = { id: "e1", name: "A", monthlySalary: 1, isActive: false };
    expect(diffEntity(same, { ...same, id: "e9" }, fields)).toEqual([]);
  });

  it("compares object values structurally rather than by reference", () => {
    expect(diffEntity({ name: { a: 1 } }, { name: { a: 1 } }, ["name"])).toEqual(
      [],
    );
    expect(
      diffEntity({ name: { a: 1 } }, { name: { a: 2 } }, ["name"]),
    ).toHaveLength(1);
  });
});

describe("record", () => {
  it("appends to the audit_log store", async () => {
    expect(
      await record(
        AUDIT_ACTIONS.loginSuccess,
        "auth",
        "admin",
        "Signed in as admin",
      ),
    ).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "login.success", entity: "auth" });
  });

  it("is append-only: a second call adds rather than replaces", async () => {
    await record(AUDIT_ACTIONS.loginFailure, "auth", null, "First bad attempt");
    await record(AUDIT_ACTIONS.loginFailure, "auth", null, "Second bad attempt");
    expect(rows.map((r) => r.summary)).toEqual([
      "First bad attempt",
      "Second bad attempt",
    ]);
  });

  it("never throws when the database is unavailable", async () => {
    putShouldThrow = true;
    await expect(
      record(AUDIT_ACTIONS.loginSuccess, "auth", "admin", "Signed in as admin"),
    ).resolves.toBe(false);
  });
});

describe("listAuditEntries", () => {
  it("returns entries newest first", async () => {
    rows.push(
      { id: "1", timestamp: "2026-01-01T00:00:00.000Z", summary: "old" },
      { id: "2", timestamp: "2026-06-01T00:00:00.000Z", summary: "new" },
    );
    const list = await listAuditEntries();
    expect(list.map((e) => e.summary)).toEqual(["new", "old"]);
  });
});

describe("retention", () => {
  it("reports size and the oldest surviving entry", () => {
    const health = summariseHealth([
      entry({ timestamp: "2026-06-01T00:00:00.000Z" }),
      entry({ timestamp: "2024-01-05T00:00:00.000Z" }),
    ]);
    expect(health.count).toBe(2);
    expect(health.oldest).toBe("2024-01-05T00:00:00.000Z");
    expect(health.cap).toBe(AUDIT_SOFT_CAP);
    expect(health.overCap).toBe(false);
  });

  it("flags a log past the soft cap without dropping anything", () => {
    const many = Array.from({ length: AUDIT_SOFT_CAP + 1 }, (_, i) =>
      entry({ id: String(i) }),
    );
    const health = summariseHealth(many);
    expect(health.overCap).toBe(true);
    expect(health.count).toBe(AUDIT_SOFT_CAP + 1);
  });

  it("counts what a prune would remove before removing it", () => {
    const entries = [
      entry({ timestamp: "2026-08-01T00:00:00.000Z" }),
      entry({ timestamp: "2024-08-01T00:00:00.000Z" }),
      entry({ timestamp: "2023-08-01T00:00:00.000Z" }),
    ];
    expect(countEntriesBefore(entries, "2025-01-01T00:00:00.000Z")).toBe(2);
    expect(entries).toHaveLength(3);
  });

  it("deletes only entries older than the cutoff", async () => {
    rows.push(
      { id: "keep", timestamp: "2026-08-01T00:00:00.000Z", summary: "recent" },
      { id: "drop", timestamp: "2023-08-01T00:00:00.000Z", summary: "ancient" },
    );
    const removed = await pruneAuditEntriesBefore("2025-01-01T00:00:00.000Z");
    expect(removed).toBe(1);
    expect(rows.some((r) => r.id === "drop")).toBe(false);
    expect(rows.some((r) => r.id === "keep")).toBe(true);
  });

  it("leaves behind its own record of the prune, with the count", async () => {
    rows.push({
      id: "drop",
      timestamp: "2023-08-01T00:00:00.000Z",
      summary: "ancient",
    });
    await pruneAuditEntriesBefore("2025-01-01T00:00:00.000Z");
    const audit = rows.filter((r) => r.action === "audit.prune");
    expect(audit).toHaveLength(1);
    expect(String(audit[0].summary)).toContain("1 old log entries");
    // The prune entry is newer than the cutoff, so it survives its own sweep.
    expect(rows).toHaveLength(1);
  });
});

describe("schema wiring", () => {
  it("exposes the audit_log store name", () => {
    expect(STORES.AUDIT_LOG).toBe("audit_log");
  });

  it("has no duplicate action strings in the catalogue", () => {
    const values = Object.values(AUDIT_ACTIONS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("names every action as group.verb so it can be categorised", () => {
    for (const value of Object.values(AUDIT_ACTIONS)) {
      expect(value).toMatch(/^[a-z]+(\.[a-z]+)+$|^logout$/);
    }
  });
});
