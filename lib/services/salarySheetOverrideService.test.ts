import { describe, expect, it, vi, beforeEach } from "vitest";
import { STORES } from "@/lib/db/schema";

const {
  mockPut,
  mockRemove,
  mockGetAll,
  mockGetHolidaysInRange,
  mockGetAdvancesByEmployee,
} = vi.hoisted(() => ({
  mockPut: vi.fn(),
  mockRemove: vi.fn(),
  mockGetAll: vi.fn(),
  mockGetHolidaysInRange: vi.fn(),
  mockGetAdvancesByEmployee: vi.fn(),
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

vi.mock("@/lib/services/advanceService", () => ({
  getAdvancesByEmployee: mockGetAdvancesByEmployee,
}));

import {
  describeOverrideSave,
  getSalarySheetOverridesForMonth,
  getSalarySheetOverridesTouchingMonth,
  saveSalarySheetOverride,
} from "./salarySheetOverrideService";

/**
 * Writes that landed in the override store.
 *
 * Saving an override also appends an audit entry, which is a `put` into a
 * different store — and one that is deliberately not awaited. Filtering by
 * store keeps these assertions about the override itself, and keeps them from
 * depending on whether the log write happened to finish first.
 */
function overridePuts(): unknown[][] {
  return mockPut.mock.calls.filter(
    (call) => call[0] === STORES.SALARY_SHEET_OVERRIDES,
  );
}

describe("saveSalarySheetOverride", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockRemove.mockReset();
    mockGetAll.mockReset();
    mockGetHolidaysInRange.mockReset();
    mockGetHolidaysInRange.mockResolvedValue([]);
    mockGetAdvancesByEmployee.mockReset();
    mockGetAdvancesByEmployee.mockResolvedValue([]);
  });

  // NOTE: this test used to assert a cap of 12 (= Mon–Sat workdays). That
  // encoded a bug: computed `presentDays` is a sum of *paid day fractions*,
  // each of which can reach 2.0 for a long day (see computeDayPayFraction),
  // so a legitimate computed figure of e.g. 20 was being silently clamped
  // down to 12 the moment anything else on the row was corrected.
  it("does not clamp a present-days figure that overtime can legitimately reach", async () => {
    await saveSalarySheetOverride({
      employeeId: "e1",
      year: 2026,
      month: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
      notes: "note",
      overrides: { presentDays: 20 },
    });
    expect(overridePuts()).toHaveLength(1);
    const saved = overridePuts()[0][1] as {
      overrides: { presentDays: number };
    };
    expect(saved.overrides.presentDays).toBe(20);
  });

  it("clamps present days to the real ceiling of 2 paid days per non-Sunday date", async () => {
    // Mar 1–15 2026 has 12 non-Sunday dates → at most 24 paid days.
    await saveSalarySheetOverride({
      employeeId: "e1",
      year: 2026,
      month: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
      notes: "note",
      overrides: { presentDays: 40 },
    });
    const saved = overridePuts()[0][1] as {
      overrides: { presentDays: number };
    };
    expect(saved.overrides.presentDays).toBe(24);
  });

  // A correction of zero is a statement — "this person was here on no days" —
  // and it has to survive every stage that could mistake it for "nothing was
  // entered": the sanitiser, the "is this record empty?" test, and the write.
  it("saves a correction of zero instead of treating it as nothing entered", async () => {
    mockGetAll.mockResolvedValue([]);
    await saveSalarySheetOverride({
      employeeId: "e1",
      year: 2026,
      month: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
      overrides: { presentDays: 0 },
    });

    expect(mockRemove).not.toHaveBeenCalled();
    expect(overridePuts()).toHaveLength(1);
    const saved = overridePuts()[0][1] as {
      overrides: Record<string, number>;
    };
    expect(saved.overrides).toEqual({ presentDays: 0 });
    expect(Object.prototype.hasOwnProperty.call(saved.overrides, "presentDays")).toBe(
      true,
    );
  });

  it("removes the record when every correction is taken back off", async () => {
    mockGetAll.mockResolvedValue([]);
    await saveSalarySheetOverride({
      employeeId: "e1",
      year: 2026,
      month: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
      notes: "",
      overrides: {},
    });

    expect(overridePuts()).toHaveLength(0);
    expect(mockRemove).toHaveBeenCalledWith(
      STORES.SALARY_SHEET_OVERRIDES,
      "salary_sheet_override:e1:2026:2:2026-03-01:2026-03-15",
    );
  });

  it("keeps a correction of zero saved even with no note", async () => {
    mockGetAll.mockResolvedValue([]);
    await saveSalarySheetOverride({
      employeeId: "e1",
      year: 2026,
      month: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
      notes: "   ",
      overrides: { earnedSundayPayDays: 0, sundayPresentBonusDays: 0 },
    });

    expect(mockRemove).not.toHaveBeenCalled();
    const saved = overridePuts()[0][1] as {
      overrides: Record<string, number>;
    };
    expect(saved.overrides).toEqual({
      earnedSundayPayDays: 0,
      sundayPresentBonusDays: 0,
    });
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
    const saved = overridePuts()[0][1] as {
      overrides: {
        earnedSundayPayDays: number;
        sundayPresentBonusDays: number;
      };
    };
    expect(saved.overrides.earnedSundayPayDays).toBe(2);
    expect(saved.overrides.sundayPresentBonusDays).toBe(3);
  });

  // NOTE: this test used to assert that factory holidays lower the present-days
  // cap (20 → 10). That also encoded the bug: an employee who works on a factory
  // holiday IS paid for it, and `computeAttendanceStats` adds those days into
  // `presentDays`. Holidays therefore do not reduce the achievable maximum.
  it("does not lower the present-days cap for factory holidays (holiday work is paid)", async () => {
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
    const saved = overridePuts()[0][1] as {
      overrides: { presentDays: number };
    };
    expect(saved.overrides.presentDays).toBe(20);
  });

  it("clamps a negative advanceDeduction override to zero", async () => {
    mockGetAdvancesByEmployee.mockResolvedValue([
      { amount: 500, date: "2026-03-05" },
    ]);
    await saveSalarySheetOverride({
      employeeId: "e1",
      year: 2026,
      month: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
      notes: "note",
      overrides: { advanceDeduction: -200 },
    });
    const saved = overridePuts()[0][1] as {
      overrides: { advanceDeduction: number };
    };
    expect(saved.overrides.advanceDeduction).toBe(0);
  });

  it("clamps an advanceDeduction override to the total advances given in the period", async () => {
    mockGetAdvancesByEmployee.mockResolvedValue([
      { amount: 200, date: "2026-03-02" },
      { amount: 100, date: "2026-03-10" },
    ]);
    await saveSalarySheetOverride({
      employeeId: "e1",
      year: 2026,
      month: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-15",
      notes: "note",
      overrides: { advanceDeduction: 900 },
    });
    const saved = overridePuts()[0][1] as {
      overrides: { advanceDeduction: number };
    };
    expect(saved.overrides.advanceDeduction).toBe(300);
  });
});

describe("getSalarySheetOverridesTouchingMonth", () => {
  beforeEach(() => {
    mockGetAll.mockReset();
  });

  it("loads overrides that overlap the calendar month even when year/month are strings", async () => {
    mockGetAll.mockResolvedValue([
      {
        id: "o1",
        employeeId: "e1",
        year: "2026",
        month: "3",
        fromDate: "2026-04-01",
        toDate: "2026-04-15",
        overrides: { presentDays: 10 },
      },
      {
        id: "o2",
        employeeId: "e2",
        fromDate: "2026-05-01",
        toDate: "2026-05-15",
        overrides: { presentDays: 8 },
      },
    ]);

    const april = await getSalarySheetOverridesTouchingMonth(2026, 3);
    expect(april).toHaveLength(1);
    expect(april[0].employeeId).toBe("e1");
    expect(april[0].year).toBe(2026);
    expect(april[0].month).toBe(3);
    expect(april[0].overrides.presentDays).toBe(10);
  });

  it("getSalarySheetOverridesForMonth delegates to overlap lookup", async () => {
    mockGetAll.mockResolvedValue([
      {
        id: "o1",
        employeeId: "e1",
        year: 2026,
        month: 3,
        fromDate: "2026-04-16",
        toDate: "2026-04-30",
        overrides: { presentDays: 9 },
      },
    ]);
    const rows = await getSalarySheetOverridesForMonth(2026, 3);
    expect(rows).toHaveLength(1);
    expect(rows[0].fromDate).toBe("2026-04-16");
  });
});

describe("describeOverrideSave", () => {
  const noTrim = {
    values: { presentDays: 0, earnedSundayPayDays: 0, sundayPresentBonusDays: 0 },
    trimmed: {
      presentDays: false,
      earnedSundayPayDays: false,
      sundayPresentBonusDays: false,
    },
    limits: { presentDays: 54, earnedSundayPayDays: 4, sundayPresentBonusDays: 4 },
  };

  it("says only what happened when nothing was trimmed", () => {
    expect(describeOverrideSave(noTrim)).toBe(
      "payroll figures were entered by hand, replacing what the app calculated",
    );
  });

  it("names every figure the period limits pulled down", () => {
    const trimmed = {
      ...noTrim,
      trimmed: {
        presentDays: true,
        earnedSundayPayDays: false,
        sundayPresentBonusDays: true,
      },
    };
    // A correction reduced without a word is the defect this work exists to
    // end, so the audit line has to carry it.
    expect(describeOverrideSave(trimmed)).toBe(
      "payroll figures were entered by hand, replacing what the app calculated; " +
        "the period limits trimmed present days down to 54, Sundays present down to 4",
    );
  });
});
