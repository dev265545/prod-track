import { describe, expect, it } from "vitest";
import {
  buildMonthSalaryBreakdown,
  computeAttendanceStats,
  computeAttendanceStatsForRange,
  computeDayPayFraction,
  computeHoursInRange,
  sumHoursAdjustmentsInRange,
} from "./attendanceStats";
import { getWorkingDayDates } from "./date";
import { getEarnedSundays } from "./salaryRates";

describe("computeDayPayFraction", () => {
  it("uses hoursWorked / fullDay when set", () => {
    expect(computeDayPayFraction({ hoursWorked: 4 }, 8)).toBe(0.5);
    expect(computeDayPayFraction({ hoursWorked: 16 }, 8)).toBe(2);
  });

  it("treats negative hoursWorked as unset and uses adjustment branch", () => {
    expect(computeDayPayFraction({ hoursWorked: -1 }, 8)).toBe(1);
  });

  it("clamps positive hoursWorked fraction to [0, 2]", () => {
    expect(computeDayPayFraction({ hoursWorked: 0 }, 8)).toBe(0);
  });

  it("uses extra / reduced vs full day when hoursWorked absent", () => {
    expect(computeDayPayFraction({ hoursExtra: 2 }, 8)).toBe(1.25);
    expect(computeDayPayFraction({ hoursReduced: 4 }, 8)).toBe(0.5);
  });

  it("returns 1 when fullDayHours <= 0", () => {
    expect(computeDayPayFraction({ hoursWorked: 4 }, 0)).toBe(1);
  });
});

describe("computeAttendanceStats", () => {
  it("counts present, absent, and production-inferred present", () => {
    const stats = computeAttendanceStats({
      year: 2026,
      month: 3,
      holidayDates: [],
      attendance: [
        { date: "2026-04-01", status: "present" },
        { date: "2026-04-02", status: "absent" },
      ],
      productionDates: new Set(["2026-04-03"]),
      hoursPerDay: 8,
    });
    expect(stats.presentDays).toBeCloseTo(2, 5);
    // All other month working days have no attendance and no production → absent
    expect(stats.absentDays).toBe(24);
    expect(stats.totalHoursWorked).toBe(8 + 8);
  });

  it("adds holiday present to earned-Sunday counter only", () => {
    const working = getWorkingDayDates(2026, 3, ["2026-04-07"]);
    const stats = computeAttendanceStats({
      year: 2026,
      month: 3,
      holidayDates: ["2026-04-07"],
      attendance: [
        { date: "2026-04-07", status: "present" },
        ...working.map((date) => ({ date, status: "present" as const })),
      ],
      productionDates: new Set<string>(),
      hoursPerDay: 8,
    });
    expect(stats.earnedSundays).toBe(getEarnedSundays(working.length + 1));
  });
});

describe("computeHoursInRange", () => {
  it("sums present hours within bounds", () => {
    const h = computeHoursInRange(
      [
        { date: "2026-04-01", status: "present", hoursWorked: 6 },
        { date: "2026-04-02", status: "present" },
        { date: "2026-03-30", status: "present", hoursWorked: 10 },
      ],
      "2026-04-01",
      "2026-04-02",
      8,
    );
    expect(h).toBe(6 + 8);
  });
});

describe("computeAttendanceStatsForRange", () => {
  it("matches month stats for a full April window", () => {
    const month = computeAttendanceStats({
      year: 2026,
      month: 3,
      holidayDates: [],
      attendance: [{ date: "2026-04-01", status: "present" }],
      productionDates: new Set<string>(),
    });
    const range = computeAttendanceStatsForRange({
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      holidayDates: [],
      attendance: [{ date: "2026-04-01", status: "present" }],
      productionDates: new Set<string>(),
    });
    expect(range.presentDays).toBe(month.presentDays);
    expect(range.absentDays).toBe(month.absentDays);
    expect(range.earnedSundays).toBe(month.earnedSundays);
    expect(range.totalPaidDays).toBe(month.totalPaidDays);
    expect(range.totalHoursWorked).toBe(month.totalHoursWorked);
  });
});

describe("sumHoursAdjustmentsInRange", () => {
  it("sums extra and reduced on present rows only", () => {
    expect(
      sumHoursAdjustmentsInRange(
        [
          { date: "2026-04-01", status: "present", hoursExtra: 1.5 },
          { date: "2026-04-02", status: "present", hoursReduced: 2 },
          { date: "2026-04-03", status: "absent", hoursExtra: 9 },
        ],
        "2026-04-01",
        "2026-04-30",
      ),
    ).toEqual({ hoursExtraSum: 1.5, hoursReducedSum: 2 });
  });
});

describe("buildMonthSalaryBreakdown", () => {
  it("totals base + Sunday bonus and respects includeProductionPay", () => {
    const ratePerDay = 1000;
    const withProd = buildMonthSalaryBreakdown({
      year: 2026,
      month: 3,
      holidayDates: [],
      attendance: [{ date: "2026-04-01", status: "present" }],
      productionDates: new Set<string>(),
      productionPayByDate: new Map([["2026-04-01", 50]]),
      hoursPerDay: 8,
      ratePerDay,
      includeProductionPay: true,
    });
    const row1 = withProd.days.find((d) => d.date === "2026-04-01");
    expect(row1?.basePay).toBe(1000);
    expect(row1?.productionPay).toBe(50);

    const noProd = buildMonthSalaryBreakdown({
      year: 2026,
      month: 3,
      holidayDates: [],
      attendance: [{ date: "2026-04-01", status: "present" }],
      productionDates: new Set<string>(),
      productionPayByDate: new Map([["2026-04-01", 50]]),
      hoursPerDay: 8,
      ratePerDay,
      includeProductionPay: false,
    });
    const row1b = noProd.days.find((d) => d.date === "2026-04-01");
    expect(row1b?.productionPay).toBe(0);
  });
});
