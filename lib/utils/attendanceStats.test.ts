import { describe, expect, it } from "vitest";
import {
  buildMonthSalaryBreakdown,
  computeAttendanceStats,
  computeAttendanceStatsForRange,
  computeDayPayFraction,
  computeHoursInRange,
  sumHoursAdjustmentsInRange,
} from "./attendanceStats";
import { getSundayDatesInMonth } from "./date";

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
  it("counts present and absent only — production does not infer attendance", () => {
    const stats = computeAttendanceStats({
      year: 2026,
      month: 3,
      holidayDates: [],
      attendance: [
        { date: "2026-04-01", status: "present" },
        { date: "2026-04-02", status: "absent" },
      ],
      hoursPerDay: 8,
    });
    expect(stats.presentDays).toBeCloseTo(1, 5);
    expect(stats.absentDays).toBe(25);
    expect(stats.restSundaysInMonth).toBe(4);
    expect(stats.sundayPresentBonusDays).toBe(0);
    expect(stats.totalPaidDays).toBeCloseTo(5, 5);
    expect(stats.totalHoursWorked).toBe(8);
  });

  it("full working month present yields full calendar paid days plus Sunday bonus when marked", () => {
    // March 2026: 31 days, 5 Sundays
    const nonSunDates: string[] = [];
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(2026, 2, d);
      if (dt.getDay() === 0) continue;
      nonSunDates.push(
        `2026-03-${String(d).padStart(2, "0")}`,
      );
    }
    const statsNoSunMark = computeAttendanceStats({
      year: 2026,
      month: 2,
      holidayDates: [],
      attendance: nonSunDates.map((date) => ({
        date,
        status: "present" as const,
      })),
      hoursPerDay: 8,
    });
    expect(statsNoSunMark.presentDays).toBe(26);
    expect(statsNoSunMark.restSundaysInMonth).toBe(5);
    expect(statsNoSunMark.sundayPresentBonusDays).toBe(0);
    expect(statsNoSunMark.totalPaidDays).toBe(31);

    const sunDates = getSundayDatesInMonth(2026, 2);
    const statsAllSun = computeAttendanceStats({
      year: 2026,
      month: 2,
      holidayDates: [],
      attendance: [
        ...nonSunDates.map((date) => ({
          date,
          status: "present" as const,
        })),
        ...sunDates.map((date) => ({ date, status: "present" as const })),
      ],
      hoursPerDay: 8,
    });
    expect(statsAllSun.sundayPresentBonusDays).toBe(5);
    expect(statsAllSun.totalPaidDays).toBe(36);
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
    });
    const range = computeAttendanceStatsForRange({
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      holidayDates: [],
      attendance: [{ date: "2026-04-01", status: "present" }],
    });
    expect(range.presentDays).toBe(month.presentDays);
    expect(range.absentDays).toBe(month.absentDays);
    expect(range.restSundaysInMonth).toBe(month.restSundaysInMonth);
    expect(range.sundayPresentBonusDays).toBe(month.sundayPresentBonusDays);
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
  it("totals attendance pay including paid Sundays and respects includeProductionPay", () => {
    const ratePerDay = 1000;
    const withProd = buildMonthSalaryBreakdown({
      year: 2026,
      month: 3,
      holidayDates: [],
      attendance: [{ date: "2026-04-01", status: "present" }],
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
      productionPayByDate: new Map([["2026-04-01", 50]]),
      hoursPerDay: 8,
      ratePerDay,
      includeProductionPay: false,
    });
    const row1b = noProd.days.find((d) => d.date === "2026-04-01");
    expect(row1b?.productionPay).toBe(0);
    // April 2026: one working present + four paid rest Sundays
    expect(noProd.restSundaysInMonth).toBe(4);
    expect(noProd.totalBaseSalary).toBe(5000);
  });
});
