import { describe, expect, it } from "vitest";
import {
  buildAttendanceSalarySummaryForRange,
  buildMonthSalaryBreakdown,
  computeAttendanceStats,
  computeAttendanceStatsForRange,
  computeDayPayFraction,
  computeEarnedExtraPayDaysForCalendarScope,
  computeHoursInRange,
  MAX_EXTRA_PAY_DAYS_PER_MONTH,
  MAX_EXTRA_PAY_DAYS_PER_CYCLE,
  type SundayCategoryRule,
  sumHoursAdjustmentsInRange,
} from "./attendanceStats";
import { getSundayDatesInMonth } from "./date";

describe("computeEarnedExtraPayDaysForCalendarScope", () => {
  it("grants 2 per qualifying 15-day block (≥12 working presents), max 4 per month", () => {
    const nonSunDates: string[] = [];
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(2026, 2, d);
      if (dt.getDay() === 0) continue;
      nonSunDates.push(`2026-03-${String(d).padStart(2, "0")}`);
    }
    const att = new Map(
      nonSunDates.map((date) => [
        date,
        { status: "present" as const },
      ]),
    );
    const earned = computeEarnedExtraPayDaysForCalendarScope(
      "2026-03-01",
      "2026-03-31",
      [],
      att,
      8,
    );
    expect(earned).toBe(MAX_EXTRA_PAY_DAYS_PER_MONTH);
  });

  it("June 2026 full working attendance: two qualifying half-months → 4 earned", () => {
    const nonSunDates: string[] = [];
    for (let d = 1; d <= 30; d++) {
      const dt = new Date(2026, 5, d);
      if (dt.getDay() === 0) continue;
      nonSunDates.push(`2026-06-${String(d).padStart(2, "0")}`);
    }
    const att = new Map(
      nonSunDates.map((date) => [
        date,
        { status: "present" as const },
      ]),
    );
    expect(
      computeEarnedExtraPayDaysForCalendarScope(
        "2026-06-01",
        "2026-06-30",
        [],
        att,
        8,
      ),
    ).toBe(4);
  });

  it("returns 0 when no 15-day block reaches present threshold", () => {
    const earned = computeEarnedExtraPayDaysForCalendarScope(
      "2026-04-01",
      "2026-04-30",
      [],
      new Map([["2026-04-01", { status: "present" as const }]]),
      8,
    );
    expect(earned).toBe(0);
  });

  it("respects factory holidays in the 15-day window count", () => {
    // March 1–15 2026: if we treat one key working day as holiday, sum of presents drops
    const nonSunDates: string[] = [];
    for (let d = 1; d <= 15; d++) {
      const dt = new Date(2026, 2, d);
      if (dt.getDay() === 0) continue;
      nonSunDates.push(`2026-03-${String(d).padStart(2, "0")}`);
    }
    const att = new Map(
      nonSunDates.map((date) => [
        date,
        { status: "present" as const },
      ]),
    );
    const withHoliday = computeEarnedExtraPayDaysForCalendarScope(
      "2026-03-01",
      "2026-03-15",
      ["2026-03-02"],
      att,
      8,
    );
    expect(withHoliday).toBe(0);
  });

  it("supports threshold categories per 15-day cycle", () => {
    const nonSunDates: string[] = [];
    for (let d = 1; d <= 15; d++) {
      const dt = new Date(2026, 2, d);
      if (dt.getDay() === 0) continue;
      nonSunDates.push(`2026-03-${String(d).padStart(2, "0")}`);
    }
    const att = new Map(
      nonSunDates.map((date) => [date, { status: "present" as const }]),
    );
    const rule: SundayCategoryRule = {
      mode: "threshold",
      requiredPresent: 12,
      earnedSundays: 2,
    };
    expect(
      computeEarnedExtraPayDaysForCalendarScope(
        "2026-03-01",
        "2026-03-15",
        [],
        att,
        8,
        rule,
      ),
    ).toBe(2);
  });

  it("supports step categories and applies max 2 per 15-day cycle cap", () => {
    const nonSunDates: string[] = [];
    for (let d = 1; d <= 15; d++) {
      const dt = new Date(2026, 2, d);
      if (dt.getDay() === 0) continue;
      nonSunDates.push(`2026-03-${String(d).padStart(2, "0")}`);
    }
    const att = new Map(
      nonSunDates.map((date) => [date, { status: "present" as const }]),
    );
    const rule: SundayCategoryRule = {
      mode: "step",
      everyPresentDays: 6,
      earnedPerStep: 1,
    };
    expect(
      computeEarnedExtraPayDaysForCalendarScope(
        "2026-03-01",
        "2026-03-15",
        [],
        att,
        8,
        rule,
      ),
    ).toBe(MAX_EXTRA_PAY_DAYS_PER_CYCLE);
  });
});

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
  it("counts present and absent; no cycle bonus without a qualifying 15-day block", () => {
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
    expect(stats.earnedSundayPayDays).toBe(0);
    expect(stats.sundayPresentBonusDays).toBe(0);
    expect(stats.totalPaidDays).toBeCloseTo(1, 5);
    expect(stats.totalHoursWorked).toBe(8);
  });

  it("26 working presents in March: 4 cycle-based extra days, 30 paid without Sunday marks", () => {
    const nonSunDates: string[] = [];
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(2026, 2, d);
      if (dt.getDay() === 0) continue;
      nonSunDates.push(`2026-03-${String(d).padStart(2, "0")}`);
    }
    const stats = computeAttendanceStats({
      year: 2026,
      month: 2,
      holidayDates: [],
      attendance: nonSunDates.map((date) => ({
        date,
        status: "present" as const,
      })),
      hoursPerDay: 8,
    });
    expect(stats.presentDays).toBe(26);
    expect(stats.earnedSundayPayDays).toBe(4);
    expect(stats.sundayPresentBonusDays).toBe(0);
    expect(stats.totalPaidDays).toBe(30);
  });

  it("26 working presents in June: 4 cycle-based extra days, 30 paid without Sunday marks", () => {
    const nonSunDates: string[] = [];
    for (let d = 1; d <= 30; d++) {
      const dt = new Date(2026, 5, d);
      if (dt.getDay() === 0) continue;
      nonSunDates.push(`2026-06-${String(d).padStart(2, "0")}`);
    }
    const stats = computeAttendanceStats({
      year: 2026,
      month: 5,
      holidayDates: [],
      attendance: nonSunDates.map((date) => ({
        date,
        status: "present" as const,
      })),
      hoursPerDay: 8,
    });
    expect(stats.presentDays).toBe(26);
    expect(stats.earnedSundayPayDays).toBe(4);
    expect(stats.sundayPresentBonusDays).toBe(0);
    expect(stats.totalPaidDays).toBe(30);
  });

  it("26 working + 5 Sunday marks: 4 earned + 5 bonus = 35 paid days", () => {
    const nonSunDates: string[] = [];
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(2026, 2, d);
      if (dt.getDay() === 0) continue;
      nonSunDates.push(`2026-03-${String(d).padStart(2, "0")}`);
    }
    const sunDates = getSundayDatesInMonth(2026, 2);
    const stats = computeAttendanceStats({
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
    expect(stats.earnedSundayPayDays).toBe(4);
    expect(stats.sundayPresentBonusDays).toBe(5);
    expect(stats.totalPaidDays).toBe(35);
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
    expect(range.earnedSundayPayDays).toBe(month.earnedSundayPayDays);
    expect(range.sundayPresentBonusDays).toBe(month.sundayPresentBonusDays);
    expect(range.totalPaidDays).toBe(month.totalPaidDays);
    expect(range.totalHoursWorked).toBe(month.totalHoursWorked);
  });
});

describe("buildAttendanceSalarySummaryForRange", () => {
  it("matches full-month salary totals when the selected range covers the month", () => {
    const summary = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      holidayDates: [],
      attendance: [{ date: "2026-04-01", status: "present" }],
      hoursPerDay: 8,
      ratePerDay: 1000,
    });
    expect(summary.presentDays).toBe(1);
    expect(summary.absentDays).toBe(25);
    expect(summary.totalPaidDays).toBe(1);
    expect(summary.hoursExtraTotal).toBe(0);
    expect(summary.hoursReducedTotal).toBe(0);
    expect(summary.calculatedSalary).toBe(1000);
  });

  it("calculates salary contribution and hour adjustments for a custom in-month range", () => {
    const summary = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-10",
      toDate: "2026-04-15",
      holidayDates: [],
      attendance: [
        { date: "2026-04-10", status: "present", hoursExtra: 2 },
        { date: "2026-04-11", status: "present", hoursReduced: 4 },
        { date: "2026-04-13", status: "absent" },
      ],
      hoursPerDay: 8,
      ratePerDay: 300,
    });
    expect(summary.presentDays).toBe(1.75);
    expect(summary.absentDays).toBe(3);
    expect(summary.earnedSundayPayDays).toBe(0);
    expect(summary.sundayPresentBonusDays).toBe(0);
    expect(summary.totalPaidDays).toBe(1.75);
    expect(summary.hoursExtraTotal).toBe(2);
    expect(summary.hoursReducedTotal).toBe(4);
    expect(summary.calculatedSalary).toBe(525);
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
  it("totals working pay, earned Sunday pool, Sunday mark bonus; respects includeProductionPay", () => {
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
    expect(noProd.earnedSundayPayDays).toBe(0);
    expect(noProd.earnedSundayPoolPay).toBe(0);
    expect(noProd.totalBaseSalary).toBe(1000);
  });
});
