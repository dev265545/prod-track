import { describe, expect, it } from "vitest";
import {
  getEarnedSundays,
  getRatePerDay,
  getRatePerHour,
  getWorkingDaysInMonth,
} from "./salaryRates";

describe("getWorkingDaysInMonth", () => {
  it("counts Mon–Sat excluding Sundays", () => {
    // April 2026: 30 days, 4 Sundays → 26 working days
    expect(getWorkingDaysInMonth(2026, 3, [])).toBe(26);
  });

  it("excludes factory holidays that fall on weekdays", () => {
    // Remove 2026-04-01 (Wed) and 2026-04-02 (Thu)
    expect(getWorkingDaysInMonth(2026, 3, ["2026-04-01", "2026-04-02"])).toBe(
      24,
    );
  });
});

describe("getRatePerDay", () => {
  it("divides monthly salary by working days", () => {
    expect(getRatePerDay(26000, 26)).toBe(1000);
  });

  it("returns 0 when no working days", () => {
    expect(getRatePerDay(1000, 0)).toBe(0);
    expect(getRatePerDay(1000, -1)).toBe(0);
  });
});

describe("getRatePerHour", () => {
  it("divides by working days × hours per day", () => {
    expect(getRatePerHour(24000, 24, 8)).toBe(125);
  });

  it("returns 0 when hours per day is 0", () => {
    expect(getRatePerHour(1000, 10, 0)).toBe(0);
  });
});

describe("getEarnedSundays", () => {
  it("uses threshold ladder 10,12,18,…", () => {
    expect(getEarnedSundays(9)).toBe(0);
    expect(getEarnedSundays(10)).toBe(1);
    expect(getEarnedSundays(11)).toBe(1);
    expect(getEarnedSundays(12)).toBe(2);
    expect(getEarnedSundays(17)).toBe(2);
    expect(getEarnedSundays(18)).toBe(3);
    expect(getEarnedSundays(48)).toBe(8);
    expect(getEarnedSundays(49)).toBe(8);
  });
});
