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
} from "./date";

describe("getMonthRange", () => {
  it("returns first and last ISO day for April", () => {
    expect(getMonthRange(2026, 3)).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    });
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
