import { describe, expect, it } from "vitest";
import {
  clampDateToMonth,
  getDatesInRange,
  getMonthRangeLabel,
  getMonthRange,
  getMonthRangePresets,
  getWorkingDaysInRange,
  getWorkingDayDates,
  isSunday,
  isRestrictedForEntry,
  getCalendarDaysInMonth,
  getSundayDatesInMonth,
  countSundaysInRange,
  getYearMonthFromIsoDate,
  countCalendarDaysInclusive,
  getMaxEarnedSundayPayDaysInRange,
  clampPayrollDriverFieldsToPeriod,
} from "./date";

describe("getMonthRange", () => {
  it("returns first and last ISO day for April", () => {
    expect(getMonthRange(2026, 3)).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    });
  });
});

describe("getYearMonthFromIsoDate", () => {
  it("returns JS month index and year", () => {
    expect(getYearMonthFromIsoDate("2026-03-15")).toEqual({
      year: 2026,
      month: 2,
    });
  });

  it("returns null for invalid strings", () => {
    expect(getYearMonthFromIsoDate("")).toBeNull();
    expect(getYearMonthFromIsoDate("bad")).toBeNull();
  });
});

describe("countCalendarDaysInclusive", () => {
  it("counts first-half 15-day ranges", () => {
    expect(countCalendarDaysInclusive("2026-03-01", "2026-03-15")).toBe(15);
  });

  it("returns 0 when range is invalid", () => {
    expect(countCalendarDaysInclusive("", "2026-03-15")).toBe(0);
    expect(countCalendarDaysInclusive("2026-03-16", "2026-03-01")).toBe(0);
  });
});

describe("getMaxEarnedSundayPayDaysInRange", () => {
  it("returns 2 for half-month length", () => {
    expect(getMaxEarnedSundayPayDaysInRange("2026-03-01", "2026-03-15")).toBe(2);
  });

  it("returns 4 for full-month length", () => {
    expect(getMaxEarnedSundayPayDaysInRange("2026-03-01", "2026-03-31")).toBe(4);
  });
});

describe("clampPayrollDriverFieldsToPeriod", () => {
  // NOTE: previously asserted presentDays capped to 12 (Mon–Sat day count).
  // That encoded a bug — presentDays is a sum of paid-day fractions of up to 2
  // per date, so 20 is legitimately achievable in Mar 1–15 and must survive.
  it("caps present to 2 paid days per non-Sunday date and Sunday bonus to Sundays in range", () => {
    const out = clampPayrollDriverFieldsToPeriod(
      "2026-03-01",
      "2026-03-15",
      [],
      { presentDays: 20, earnedSundayPayDays: 5, sundayPresentBonusDays: 10 },
    );
    expect(out.presentDays).toBe(20);
    expect(out.earnedSundayPayDays).toBe(2);
    expect(out.sundayPresentBonusDays).toBe(3);
  });

  it("caps present days at twice the non-Sunday date count", () => {
    const out = clampPayrollDriverFieldsToPeriod(
      "2026-03-01",
      "2026-03-15",
      [],
      { presentDays: 99, earnedSundayPayDays: 0, sundayPresentBonusDays: 0 },
    );
    expect(out.presentDays).toBe(24); // 12 non-Sunday dates * 2
  });

  it("caps present days to 0 when the range has no Mon–Sat workdays", () => {
    // 2026-03-01 is a Sunday — single-day range has zero workdays
    const out = clampPayrollDriverFieldsToPeriod(
      "2026-03-01",
      "2026-03-01",
      [],
      { presentDays: 5, earnedSundayPayDays: 1, sundayPresentBonusDays: 1 },
    );
    expect(out.presentDays).toBe(0);
    expect(out.earnedSundayPayDays).toBe(1);
    expect(out.sundayPresentBonusDays).toBe(1);
  });
});

describe("month range helpers", () => {
  it("builds full/first/second-half presets for 31-day months", () => {
    expect(getMonthRangePresets(2026, 2)).toEqual([
      {
        mode: "full-month",
        from: "2026-03-01",
        to: "2026-03-31",
        label: "1-31 Mar 2026",
      },
      {
        mode: "first-half",
        from: "2026-03-01",
        to: "2026-03-15",
        label: "1-15 Mar 2026",
      },
      {
        mode: "second-half",
        from: "2026-03-16",
        to: "2026-03-31",
        label: "16-31 Mar 2026",
      },
    ]);
  });

  it("builds second-half presets correctly for leap-year February", () => {
    const secondHalf = getMonthRangePresets(2028, 1).find(
      (preset) => preset.mode === "second-half",
    );
    expect(secondHalf).toEqual({
      mode: "second-half",
      from: "2028-02-16",
      to: "2028-02-29",
      label: "16-29 Feb 2028",
    });
  });

  it("clamps custom dates into the selected month", () => {
    expect(clampDateToMonth("2026-03-29", 2026, 3)).toBe("2026-04-01");
    expect(clampDateToMonth("2026-05-02", 2026, 3)).toBe("2026-04-30");
    expect(clampDateToMonth("2026-04-12", 2026, 3)).toBe("2026-04-12");
  });

  it("formats range labels for a single day and a span", () => {
    expect(getMonthRangeLabel("2026-04-10", "2026-04-10")).toBe(
      "10 Apr 2026",
    );
    expect(getMonthRangeLabel("2026-04-10", "2026-04-19")).toBe(
      "10-19 Apr 2026",
    );
  });
});

describe("getDatesInRange", () => {
  it("includes both endpoints", () => {
    expect(getDatesInRange("2026-04-01", "2026-04-03")).toEqual([
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
    ]);
  });

  it("handles single-day range", () => {
    expect(getDatesInRange("2026-04-15", "2026-04-15")).toEqual([
      "2026-04-15",
    ]);
  });
});

describe("getWorkingDaysInRange", () => {
  it("excludes Sundays and holidays", () => {
    // Mon 2026-04-06 through Sun 2026-04-12: Mon–Sat count as working (6), Sunday skipped
    expect(getWorkingDaysInRange("2026-04-06", "2026-04-12", [])).toBe(6);
  });

  it("subtracts a weekday holiday", () => {
    expect(
      getWorkingDaysInRange("2026-04-06", "2026-04-10", ["2026-04-08"]),
    ).toBe(4);
  });
});

describe("getWorkingDayDates", () => {
  it("lists only Mon–Sat dates in month", () => {
    const days = getWorkingDayDates(2026, 3, []);
    expect(days).toHaveLength(26);
    expect(days.every((d) => !isSunday(d))).toBe(true);
  });
});

describe("isRestrictedForEntry", () => {
  it("blocks factory holidays only, not Sundays", () => {
    expect(isSunday("2026-04-05")).toBe(true);
    expect(isRestrictedForEntry("2026-04-05", [])).toBe(false);
    expect(isRestrictedForEntry("2026-04-06", [])).toBe(false);
    expect(isRestrictedForEntry("2026-04-08", ["2026-04-08"])).toBe(true);
  });
});

describe("Sunday helpers", () => {
  it("counts calendar days and lists Sunday ISO dates", () => {
    expect(getCalendarDaysInMonth(2026, 3)).toBe(30);
    const sun = getSundayDatesInMonth(2026, 3);
    expect(sun).toHaveLength(4);
    expect(sun.every((d) => isSunday(d))).toBe(true);
  });

  it("countSundaysInRange matches list", () => {
    expect(countSundaysInRange("2026-04-01", "2026-04-30")).toBe(4);
  });
});
