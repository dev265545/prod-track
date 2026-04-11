import { describe, expect, it } from "vitest";
import {
  getCalendarDaysInMonth,
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

describe("getCalendarDaysInMonth", () => {
  it("returns length of month", () => {
    expect(getCalendarDaysInMonth(2026, 3)).toBe(30);
    expect(getCalendarDaysInMonth(2026, 1)).toBe(28);
  });
});

describe("getRatePerDay", () => {
  it("divides monthly salary by calendar days in month", () => {
    expect(getRatePerDay(9000, 30)).toBe(300);
    expect(getRatePerDay(26000, 26)).toBe(1000);
  });

  it("returns 0 when no calendar days", () => {
    expect(getRatePerDay(1000, 0)).toBe(0);
    expect(getRatePerDay(1000, -1)).toBe(0);
  });
});

describe("getRatePerHour", () => {
  it("divides by calendar days × hours per day", () => {
    expect(getRatePerHour(24000, 30, 8)).toBe(100);
  });

  it("returns 0 when hours per day is 0", () => {
    expect(getRatePerHour(1000, 10, 0)).toBe(0);
  });
});
