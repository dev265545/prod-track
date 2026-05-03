import { describe, expect, it, vi, beforeEach } from "vitest";
import { STORES } from "@/lib/db/schema";

const {
  mockPut,
  mockRemove,
  mockGetAll,
  mockGetHolidaysInRange,
} = vi.hoisted(() => ({
  mockPut: vi.fn(),
  mockRemove: vi.fn(),
  mockGetAll: vi.fn(),
  mockGetHolidaysInRange: vi.fn(),
}));

vi.mock("@/lib/db/adapter", () => ({
  STORES,
  getAll: mockGetAll,
  put: mockPut,
  remove: mockRemove,
}));

vi.mock("@/lib/services/factoryHolidayService", () => ({
  getHolidaysInRange: mockGetHolidaysInRange,
}));

import { saveSalarySheetOverride } from "./salarySheetOverrideService";

describe("saveSalarySheetOverride", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockRemove.mockReset();
    mockGetAll.mockReset();
    mockGetHolidaysInRange.mockReset();
    mockGetHolidaysInRange.mockResolvedValue([]);
  });

  it("clamps present days to Mon–Sat workdays in the period", async () => {
    await saveSalarySheetOverride({
      employeeId: "e1",
      year: 2026,
      month: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
      notes: "note",
      overrides: { presentDays: 20 },
    });
    expect(mockPut).toHaveBeenCalledTimes(1);
    const saved = mockPut.mock.calls[0][1] as {
      overrides: { presentDays: number };
    };
    expect(saved.overrides.presentDays).toBe(12);
  });

  it("clamps earned Sunday pay and Sunday bonus to period rules", async () => {
    await saveSalarySheetOverride({
      employeeId: "e1",
      year: 2026,
      month: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
      notes: "note",
      overrides: {
        earnedSundayPayDays: 9,
        sundayPresentBonusDays: 9,
      },
    });
    const saved = mockPut.mock.calls[0][1] as {
      overrides: {
        earnedSundayPayDays: number;
        sundayPresentBonusDays: number;
      };
    };
    expect(saved.overrides.earnedSundayPayDays).toBe(2);
    expect(saved.overrides.sundayPresentBonusDays).toBe(3);
  });

  it("treats factory holidays as non-workdays for present cap", async () => {
    mockGetHolidaysInRange.mockResolvedValue([
      { id: "h1", date: "2026-03-02" },
      { id: "h2", date: "2026-03-03" },
    ]);
    await saveSalarySheetOverride({
      employeeId: "e1",
      year: 2026,
      month: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
      notes: "note",
      overrides: { presentDays: 20 },
    });
    const saved = mockPut.mock.calls[0][1] as {
      overrides: { presentDays: number };
    };
    expect(saved.overrides.presentDays).toBe(10);
  });
});
