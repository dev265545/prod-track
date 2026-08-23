import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `saveAttendance` is a read-then-write upsert, and the roster now calls it
 * concurrently — a bulk fill runs several at once, and a tap can land while one
 * is in flight. The identity of an attendance row is `(employeeId, date)`, so
 * the only thing that must never happen is two rows for the same person on the
 * same day: payroll folds attendance into a map and silently pays whichever it
 * reads last.
 *
 * These tests drive the concurrency directly rather than through the screen,
 * because the window is between the lookup and the `put` — a place no UI test
 * can aim at.
 */

const getByIndex = vi.fn();
const get = vi.fn();
const put = vi.fn();
const remove = vi.fn();

vi.mock("@/lib/db/adapter", () => ({
  getByIndex: (...a: unknown[]) => getByIndex(...a),
  get: (...a: unknown[]) => get(...a),
  put: (...a: unknown[]) => put(...a),
  remove: (...a: unknown[]) => remove(...a),
  STORES: { ATTENDANCE: "attendance" },
}));
vi.mock("./auditService", () => ({
  AUDIT_ACTIONS: { attendanceMark: "m", attendanceUpdate: "u", attendanceClear: "c" },
  diffEntity: () => ({}),
  record: () => Promise.resolve(),
}));
vi.mock("./auditNames", () => ({ employeeName: () => Promise.resolve("Asha") }));

import { saveAttendance } from "./attendanceService";

/** A store that behaves like the real one: the index sees what `put` wrote. */
function fakeStore() {
  const rows: Record<string, unknown>[] = [];
  getByIndex.mockImplementation(async (_store, _index, lo: string[]) => {
    // Yield, so a caller that has not been serialised gets to interleave here.
    await Promise.resolve();
    return rows.filter((r) => r.employeeId === lo[0] && r.date === lo[1]);
  });
  get.mockImplementation(async (_store, id: string) =>
    rows.find((r) => r.id === id) ?? null,
  );
  put.mockImplementation(async (_store, record: Record<string, unknown>) => {
    const at = rows.findIndex((r) => r.id === record.id);
    if (at === -1) rows.push({ ...record });
    else rows[at] = { ...record };
  });
  return rows;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveAttendance under concurrency", () => {
  it("leaves one row when the same day is saved twice at once", async () => {
    const rows = fakeStore();

    // The rapid double tap: "here", then "not here", before the first lands.
    const first = saveAttendance({ employeeId: "e1", date: "2026-08-02", status: "present" });
    const second = saveAttendance({ employeeId: "e1", date: "2026-08-02", status: "absent" });
    await Promise.all([first, second]);

    expect(rows).toHaveLength(1);
    // Last tap wins, which is what the operator just pressed.
    expect(rows[0].status).toBe("absent");
  });

  it("does not serialise different people", async () => {
    const rows = fakeStore();
    await Promise.all([
      saveAttendance({ employeeId: "e1", date: "2026-08-02", status: "present" }),
      saveAttendance({ employeeId: "e2", date: "2026-08-02", status: "present" }),
      saveAttendance({ employeeId: "e1", date: "2026-08-01", status: "present" }),
    ]);
    expect(rows).toHaveLength(3);
  });

  it("does not let a failed save swallow the one queued behind it", async () => {
    fakeStore();
    put.mockRejectedValueOnce(new Error("disk full"));

    const first = saveAttendance({ employeeId: "e1", date: "2026-08-02", status: "present" });
    const second = saveAttendance({ employeeId: "e1", date: "2026-08-02", status: "absent" });

    await expect(first).rejects.toThrow("disk full");
    // The successor still runs, and reports its own outcome.
    await expect(second).resolves.toMatchObject({ status: "absent" });
  });
});
