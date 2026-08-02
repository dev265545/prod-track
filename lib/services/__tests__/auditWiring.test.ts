/**
 * The audit log is only worth having if the entries are readable and there is
 * exactly one per thing that happened. These tests cover the three sites where
 * getting that wrong costs the most:
 *
 * - a payroll override, because it is a human replacing a computed wage;
 * - a retention purge, because the rows it deletes are gone for good;
 * - a stock movement, because it is the highest-volume write in the app and
 *   the easiest place to accidentally log N entries for one action.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORES } from "@/lib/db/schema";
import {
  isHumanSummary,
  type AuditEntry,
  type AuditFieldChange,
} from "../auditService";

const { mockGet, mockGetAll, mockGetByIndex, mockPut, mockRemove, mockDeleteWhere } =
  vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockGetAll: vi.fn(),
    mockGetByIndex: vi.fn(),
    mockPut: vi.fn(),
    mockRemove: vi.fn(),
    mockDeleteWhere: vi.fn(),
  }));

vi.mock("@/lib/db/adapter", () => ({
  STORES,
  get: mockGet,
  getAll: mockGetAll,
  getByIndex: mockGetByIndex,
  put: mockPut,
  remove: mockRemove,
  deleteWhere: mockDeleteWhere,
}));

/** Every audit entry written since the last reset. */
function auditEntries(): AuditEntry[] {
  return mockPut.mock.calls
    .filter((call) => call[0] === STORES.AUDIT_LOG)
    .map((call) => call[1] as AuditEntry);
}

/** The single entry, asserting there is exactly one. */
function onlyEntry(): AuditEntry {
  const entries = auditEntries();
  expect(entries).toHaveLength(1);
  return entries[0];
}

function changedFields(entry: AuditEntry): string[] {
  return (entry.diff as AuditFieldChange[]).map((c) => c.field).sort();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue(null);
  mockGetAll.mockResolvedValue([]);
  mockGetByIndex.mockResolvedValue([]);
  mockPut.mockResolvedValue(undefined);
  mockRemove.mockResolvedValue(undefined);
  mockDeleteWhere.mockResolvedValue(0);
});

describe("a payroll override", () => {
  it("writes one readable entry naming the employee, with only the drivers that moved", async () => {
    const { saveSalarySheetOverride } = await import(
      "../salarySheetOverrideService"
    );
    mockGet.mockImplementation(async (store: string, id: string) =>
      store === STORES.EMPLOYEES && id === "emp_1"
        ? { id: "emp_1", name: "Rakesh" }
        : null,
    );

    await saveSalarySheetOverride({
      employeeId: "emp_1",
      year: 2026,
      month: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
      overrides: { presentDays: 12 },
    });
    await vi.waitFor(() => expect(auditEntries()).toHaveLength(1));

    const entry = onlyEntry();
    expect(entry.action).toBe("salary.override.set");
    expect(entry.summary).toContain("Rakesh");
    // The id must never surface as prose.
    expect(entry.summary).not.toContain("emp_1");
    expect(isHumanSummary(entry.summary)).toBe(true);
    // Scoped to what actually changed — not the whole record, and not `id`,
    // `updatedAt` or any other internal column.
    expect(changedFields(entry)).toEqual(["presentDays"]);
  });

  it("says the corrections were removed when the override is emptied", async () => {
    const { clearSalarySheetOverride } = await import(
      "../salarySheetOverrideService"
    );
    mockGetAll.mockResolvedValue([
      {
        id: "salary_sheet_override:emp_1:2026:2:2026-03-01:2026-03-15",
        employeeId: "emp_1",
        year: 2026,
        month: 2,
        fromDate: "2026-03-01",
        toDate: "2026-03-15",
        overrides: { presentDays: 12 },
      },
    ]);
    mockGet.mockImplementation(async (store: string) =>
      store === STORES.EMPLOYEES ? { id: "emp_1", name: "Rakesh" } : null,
    );

    await clearSalarySheetOverride("emp_1", 2026, 2, "2026-03-01", "2026-03-15");
    await vi.waitFor(() => expect(auditEntries()).toHaveLength(1));

    const entry = onlyEntry();
    expect(entry.action).toBe("salary.override.clear");
    expect(entry.summary).toContain("Rakesh");
    expect(isHumanSummary(entry.summary)).toBe(true);
    expect(changedFields(entry)).toEqual(["presentDays"]);
  });
});

describe("a retention purge", () => {
  it("writes one entry naming both counts and the cutoff, and the services stay silent", async () => {
    const { deleteProductionsBefore } = await import("../productionService");
    const { deleteAdvancesBefore } = await import("../advanceService");
    const { recordPurge } = await import("../purgeAudit");

    mockDeleteWhere.mockResolvedValueOnce(120).mockResolvedValueOnce(7);
    const work = await deleteProductionsBefore("2026-01-01");
    const advances = await deleteAdvancesBefore("2026-01-01");

    // The low-level deletes deliberately log nothing: only the caller knows
    // the cutoff, the tick boxes and the counts the owner was shown.
    expect(auditEntries()).toHaveLength(0);

    recordPurge(
      `Old records were deleted: ${work} work entries and ${advances} advances from before 2026-01-01`,
      {
        cutoff: "2026-01-01",
        workEntriesRemoved: work,
        advancesRemoved: advances,
        workEntriesChosen: true,
        advancesChosen: true,
      },
    );
    await vi.waitFor(() => expect(auditEntries()).toHaveLength(1));

    const entry = onlyEntry();
    expect(entry.action).toBe("data.purge");
    expect(entry.summary).toContain("120");
    expect(entry.summary).toContain("7");
    expect(entry.summary).toContain("2026-01-01");
    expect(isHumanSummary(entry.summary)).toBe(true);
    expect(entry.diff).toMatchObject({
      cutoff: "2026-01-01",
      workEntriesRemoved: 120,
      advancesRemoved: 7,
    });
  });
});

describe("a stock movement", () => {
  it("writes one entry naming the item and the direction", async () => {
    const { addMovement } = await import("../inventoryService");
    mockGet.mockImplementation(async (store: string) =>
      store === STORES.INVENTORY_ITEMS
        ? { id: "inv_1", code: "RT04", name: "Round tub 400ml" }
        : null,
    );

    await addMovement({
      itemId: "inv_1",
      date: "2026-08-01",
      type: "outward",
      qty: 50,
    });
    await vi.waitFor(() => expect(auditEntries()).toHaveLength(1));

    const entry = onlyEntry();
    expect(entry.action).toBe("inventory.outward");
    expect(entry.summary).toContain("Round tub 400ml");
    expect(entry.summary).toContain("50");
    expect(entry.summary).not.toContain("inv_1");
    expect(isHumanSummary(entry.summary)).toBe(true);
    expect(changedFields(entry)).toEqual(["date", "qty", "type"]);
  });

  it("logs a produced item once, not once per component taken out of stock", async () => {
    const { produceFinishedGood } = await import("../inventoryService");
    const finished = {
      id: "inv_1",
      code: "RT04",
      name: "Round tub 400ml",
      category: "container",
      unit: "pcs",
      boxCode: "B1",
      stickerCodes: ["S19"],
      polyCode: "P3",
      lowStockThreshold: 100,
      openingStock: 0,
      sortOrder: 0,
      isActive: true,
      createdAt: 0,
      updatedAt: 0,
    };
    const components = [
      { ...finished, id: "inv_box", code: "B1", name: "Box 1", category: "box" },
      {
        ...finished,
        id: "inv_stk",
        code: "S19",
        name: "Sticker 19",
        category: "sticker",
      },
      {
        ...finished,
        id: "inv_poly",
        code: "P3",
        name: "Poly 3",
        category: "poly",
      },
    ];
    mockGet.mockImplementation(async (store: string, id: string) =>
      store === STORES.INVENTORY_ITEMS
        ? ([finished, ...components].find((i) => i.id === id) ?? null)
        : null,
    );
    mockGetAll.mockImplementation(async (store: string) =>
      store === STORES.INVENTORY_ITEMS ? [finished, ...components] : [],
    );

    const result = await produceFinishedGood("inv_1", 10, "2026-08-01");
    expect(result.deducted).toHaveLength(3);
    await vi.waitFor(() => expect(auditEntries()).toHaveLength(1));

    // Four movements were written — one in, three out — and exactly one entry
    // describes them, because the operator did one thing.
    const entry = onlyEntry();
    expect(entry.action).toBe("inventory.inward");
    expect(entry.summary).toContain("Round tub 400ml");
    expect(entry.summary).toContain("3 components");
    expect(isHumanSummary(entry.summary)).toBe(true);
  });
});
