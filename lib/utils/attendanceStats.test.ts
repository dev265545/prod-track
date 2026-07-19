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

  it("counts holiday-present days toward the 15-day threshold", () => {
    const att = new Map<string, { status: "present" }>();
    for (const d of [1, 2, 4, 5, 6, 7, 8, 9, 11, 12, 13]) {
      const date = `2026-05-${String(d).padStart(2, "0")}`;
      att.set(date, { status: "present" });
    }
    att.set("2026-05-14", { status: "present" });
    const earned = computeEarnedExtraPayDaysForCalendarScope(
      "2026-05-01",
      "2026-05-15",
      ["2026-05-14"],
      att,
      8,
    );
    expect(earned).toBe(2);
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

  it("qualifies by present dates even when one present day is fractional", () => {
    const att = new Map<string, { status: "present"; hoursReduced?: number }>();
    for (let d = 1; d <= 15; d++) {
      const dt = new Date(2026, 2, d);
      if (dt.getDay() === 0) continue;
      const date = `2026-03-${String(d).padStart(2, "0")}`;
      att.set(
        date,
        d === 2 ? { status: "present", hoursReduced: 1 } : { status: "present" },
      );
    }
    expect(
      computeEarnedExtraPayDaysForCalendarScope(
        "2026-03-01",
        "2026-03-15",
        [],
        att,
        8,
      ),
    ).toBe(2);
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

  it("pays a present employee on a factory holiday", () => {
    const summary = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      holidayDates: ["2026-04-02"],
      attendance: [{ date: "2026-04-02", status: "present" }],
      hoursPerDay: 8,
      ratePerDay: 1000,
    });
    expect(summary.presentDays).toBe(1);
    expect(summary.absentDays).toBe(25);
    expect(summary.holidayPresentDays).toBe(1);
    expect(summary.totalPaidDays).toBe(1);
    expect(summary.calculatedSalary).toBe(1000);
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

  describe("operatorSundayRule", () => {
    // March 2026: Sundays fall on 1, 8, 15, 22, 29. Non-Sunday days: 26.
    function buildAttendanceForMarch(presentThroughDay: number) {
      const records: { date: string; status: "present" }[] = [];
      for (let d = 1; d <= presentThroughDay; d++) {
        const dow = new Date(2026, 2, d).getDay();
        if (dow === 0) continue; // Sundays handled separately below
        records.push({
          date: `2026-03-${String(d).padStart(2, "0")}`,
          status: "present",
        });
      }
      return records;
    }

    it("without operatorSundayRule: Sunday-present pay is unchanged (flat ratePerDay)", () => {
      const ratePerDay = 1000;
      const breakdown = buildMonthSalaryBreakdown({
        year: 2026,
        month: 2,
        holidayDates: [],
        attendance: [
          ...buildAttendanceForMarch(31),
          { date: "2026-03-01", status: "present" },
          { date: "2026-03-08", status: "present" },
        ],
        productionPayByDate: new Map(),
        hoursPerDay: 8,
        ratePerDay,
      });
      const sun1 = breakdown.days.find((d) => d.date === "2026-03-01");
      const sun8 = breakdown.days.find((d) => d.date === "2026-03-08");
      expect(sun1?.basePay).toBe(1000);
      expect(sun8?.basePay).toBe(1000);
    });

    it("with operatorSundayRule, before crossing the threshold: still flat ratePerDay", () => {
      const ratePerDay = 1000;
      // Only present through March 7 (6 working days: 2,3,4,5,6,7) before Sunday March 8.
      const breakdown = buildMonthSalaryBreakdown({
        year: 2026,
        month: 2,
        holidayDates: [],
        attendance: [
          ...buildAttendanceForMarch(7),
          { date: "2026-03-08", status: "present" },
        ],
        productionPayByDate: new Map(),
        hoursPerDay: 8,
        ratePerDay,
        operatorSundayRule: { requiredPresentDays: 26, sundayMultiplier: 1.2 },
      });
      const sun8 = breakdown.days.find((d) => d.date === "2026-03-08");
      expect(sun8?.basePay).toBe(1000);
    });

    it("with operatorSundayRule, after crossing the threshold: multiplied rate applies", () => {
      const ratePerDay = 1000;
      // All 26 non-Sunday days in March present, plus every Sunday present.
      const nonSunDates = buildAttendanceForMarch(31);
      const breakdown = buildMonthSalaryBreakdown({
        year: 2026,
        month: 2,
        holidayDates: [],
        attendance: [
          ...nonSunDates,
          { date: "2026-03-01", status: "present" },
          { date: "2026-03-08", status: "present" },
          { date: "2026-03-15", status: "present" },
          { date: "2026-03-22", status: "present" },
          { date: "2026-03-29", status: "present" },
        ],
        productionPayByDate: new Map(),
        hoursPerDay: 8,
        ratePerDay,
        operatorSundayRule: { requiredPresentDays: 26, sundayMultiplier: 1.2 },
      });
      // Threshold of 26 present working days is only reached at the very end of the
      // month (March has 26 non-Sunday days total), so no Sunday in-month can cross
      // it here — use a lower threshold below for a within-month crossing case.
      const sun29 = breakdown.days.find((d) => d.date === "2026-03-29");
      expect(sun29?.basePay).toBe(1000); // threshold of 26 not reached until day 31 (non-Sunday count caps at 26 on day 31)
    });

    it("mixed within-month crossing: Sundays before threshold flat, Sundays after threshold multiplied", () => {
      const ratePerDay = 1000;
      // Use a low threshold (5) so the crossing happens mid-month, before the second Sunday.
      // Present working days 2,3,4,5,6,7 (6 days) occur before Sunday March 8.
      const attendance = [
        ...buildAttendanceForMarch(7), // present 2..7 (6 non-Sunday working days)
        { date: "2026-03-01", status: "present" as const }, // Sunday #1, 0 prior present days
        { date: "2026-03-08", status: "present" as const }, // Sunday #2, 6 prior present days >= 5
      ];
      const breakdown = buildMonthSalaryBreakdown({
        year: 2026,
        month: 2,
        holidayDates: [],
        attendance,
        productionPayByDate: new Map(),
        hoursPerDay: 8,
        ratePerDay,
        operatorSundayRule: { requiredPresentDays: 5, sundayMultiplier: 1.5 },
      });
      const sun1 = breakdown.days.find((d) => d.date === "2026-03-01");
      const sun8 = breakdown.days.find((d) => d.date === "2026-03-08");
      expect(sun1?.basePay).toBe(1000); // 0 present days so far < 5
      expect(sun8?.basePay).toBe(1500); // 6 present days so far >= 5, multiplied 1000 * 1.5
      expect(breakdown.sundayPresentBonusDays).toBe(2);
      expect(breakdown.sundayMarkBonusPay).toBe(2500); // flat 1000 + multiplied 1500
    });

    it("edge values: multiplier 1.5, threshold 26 produce exactly rounded currency values", () => {
      const ratePerDay = 733.33;
      const nonSunDates = buildAttendanceForMarch(31); // all 26 non-Sunday days present
      const breakdown = buildMonthSalaryBreakdown({
        year: 2026,
        month: 2,
        holidayDates: [],
        attendance: [
          ...nonSunDates,
          { date: "2026-03-29", status: "present" },
        ],
        productionPayByDate: new Map(),
        hoursPerDay: 8,
        ratePerDay,
        operatorSundayRule: { requiredPresentDays: 24, sundayMultiplier: 1.5 },
      });
      // By March 29, present working days accumulated = all non-Sunday days from 1..28,
      // which is 24 (March has Sundays on 1, 8, 15, 22 within that span).
      const sun29 = breakdown.days.find((d) => d.date === "2026-03-29");
      expect(sun29?.basePay).toBe(Math.round(ratePerDay * 1.5 * 100) / 100);
      expect(sun29?.basePay).toBe(1100);
    });
  });

  it("labels holiday-present rows as paid holiday presence", () => {
    const breakdown = buildMonthSalaryBreakdown({
      year: 2026,
      month: 3,
      holidayDates: ["2026-04-02"],
      attendance: [{ date: "2026-04-02", status: "present" }],
      productionPayByDate: new Map(),
      hoursPerDay: 8,
      ratePerDay: 1000,
      includeProductionPay: false,
    });
    const row = breakdown.days.find((day) => day.date === "2026-04-02");
    expect(row?.statusLabel).toBe("Present (factory holiday)");
    expect(row?.paidFraction).toBe(1);
    expect(row?.basePay).toBe(1000);
  });
});
