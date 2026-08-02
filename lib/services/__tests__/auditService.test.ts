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
  };
});

const { record, buildEntry, listAuditEntries } = await import("../auditService");

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

describe("buildEntry", () => {
  it("stamps timestamp, role and a null userId reserved for real accounts", () => {
    localStorage.setItem("prodtrack_session_role", "admin");
    const e = buildEntry("login.success", "auth", "admin", "Signed in");
    expect(e.action).toBe("login.success");
    expect(e.entity).toBe("auth");
    expect(e.entityId).toBe("admin");
    expect(e.summary).toBe("Signed in");
    expect(e.role).toBe("admin");
    expect(e.userId).toBeNull();
    expect(Number.isNaN(Date.parse(e.timestamp))).toBe(false);
    expect("diff" in e).toBe(false);
  });

  it("keeps the optional diff when supplied", () => {
    const e = buildEntry("password.change", "auth", "admin", "changed", {
      before: 1,
    });
    expect(e.diff).toEqual({ before: 1 });
  });

  it("generates unique ids", () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => buildEntry("a", "b", null, "c").id),
    );
    expect(ids.size).toBe(50);
  });

  it("records a null role when there is no session", () => {
    expect(buildEntry("login.failure", "auth", null, "nope").role).toBeNull();
  });
});

describe("record", () => {
  it("appends to the audit_log store", async () => {
    expect(await record("login.success", "auth", "admin", "Signed in")).toBe(
      true,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "login.success", entity: "auth" });
  });

  it("is append-only: a second call adds rather than replaces", async () => {
    await record("login.failure", "auth", null, "one");
    await record("login.failure", "auth", null, "two");
    expect(rows.map((r) => r.summary)).toEqual(["one", "two"]);
  });

  it("never throws when the database is unavailable", async () => {
    putShouldThrow = true;
    await expect(
      record("login.success", "auth", "admin", "Signed in"),
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

describe("schema wiring", () => {
  it("exposes the audit_log store name", () => {
    expect(STORES.AUDIT_LOG).toBe("audit_log");
  });
});
