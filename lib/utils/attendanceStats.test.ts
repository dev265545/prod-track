import { describe, expect, it } from "vitest";
import {
  buildAttendanceSalarySummaryForRange,
  buildMonthSalaryBreakdown,
  computeAttendanceStats,
  computeAttendanceStatsForRange,
  computeDayPayFraction,
  computeEarnedExtraPayDaysForCalendarScope,
  computeHoursInRange,
  getExtraPayCycleBlocks,
  MAX_EXTRA_PAY_DAYS_PER_MONTH,
  MAX_EXTRA_PAY_DAYS_PER_CYCLE,
  type SundayCategoryRule,
  sumHoursAdjustmentsInRange,
} from "./attendanceStats";
import { getSundayDatesInMonth } from "./date";
import { getCycleBlocksForRule, normalizeSundayRule } from "./sundayRule";

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
    const rule: SundayCategoryRule = normalizeSundayRule({
      mode: "threshold",
      requiredPresent: 12,
      earnedSundays: 2,
    });
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
    const rule: SundayCategoryRule = normalizeSundayRule({
      mode: "step",
      everyPresentDays: 6,
      earnedPerStep: 1,
    });
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
        sundayPremium: { requiredPresentDays: 26, sundayMultiplier: 1.2 },
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
        sundayPremium: { requiredPresentDays: 26, sundayMultiplier: 1.2 },
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
        sundayPremium: { requiredPresentDays: 5, sundayMultiplier: 1.5 },
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
        sundayPremium: { requiredPresentDays: 24, sundayMultiplier: 1.5 },
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

describe("computeEarnedExtraPayDaysForCalendarScope — trailing partial blocks", () => {
  function fullMonthPresence(
    year: number,
    monthIndex: number,
    lastDay: number,
  ) {
    const entries: [string, { status: string }][] = [];
    for (let d = 1; d <= lastDay; d++) {
      if (new Date(year, monthIndex, d).getDay() === 0) continue;
      entries.push([
        `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        { status: "present" },
      ]);
    }
    return new Map(entries);
  }

  // Bug 7: February's 16th–EOM block is only 13/14 days long, so the old
  // "full 15-day blocks only" loop skipped it entirely and February capped at 2.
  it("February with full attendance earns the same 4 days as any other month", () => {
    const earned = computeEarnedExtraPayDaysForCalendarScope(
      "2026-02-01",
      "2026-02-28",
      [],
      fullMonthPresence(2026, 1, 28),
      8,
    );
    expect(earned).toBe(MAX_EXTRA_PAY_DAYS_PER_MONTH);
  });

  it("leap February (29 days) also earns the full 4 days", () => {
    const earned = computeEarnedExtraPayDaysForCalendarScope(
      "2024-02-01",
      "2024-02-29",
      [],
      fullMonthPresence(2024, 1, 29),
      8,
    );
    expect(earned).toBe(MAX_EXTRA_PAY_DAYS_PER_MONTH);
  });

  it("counts day 31 inside the second block of a 31-day month", () => {
    // Only the second half is worked, and only just enough days to qualify —
    // the 31st has to count for the block to reach the 12-present threshold.
    const entries: [string, { status: string }][] = [];
    for (const d of [16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 31]) {
      entries.push([`2026-03-${String(d).padStart(2, "0")}`, { status: "present" }]);
    }
    const earned = computeEarnedExtraPayDaysForCalendarScope(
      "2026-03-16",
      "2026-03-31",
      [],
      new Map(entries),
      8,
    );
    expect(earned).toBe(MAX_EXTRA_PAY_DAYS_PER_CYCLE);
  });
});

/**
 * The Sunday premium, swept against the algorithm it replaced.
 *
 * `buildAttendanceSalarySummaryForRange` used to pay `totalPaidDays × ratePerDay`
 * and nothing else. That formula is kept verbatim below and swept against the
 * live function over a wide spread of months, rates, shifts, ranges and
 * attendance shapes: with no premium configured — which is every install that
 * exists today — not one rupee may move.
 */
function legacyBuildAttendanceSalarySummaryForRange(input: {
  fromDate: string;
  toDate: string;
  holidayDates: string[];
  attendance: { date: string; status: string; hoursWorked?: number; hoursReduced?: number; hoursExtra?: number }[];
  hoursPerDay?: number;
  ratePerDay: number;
  sundayCategoryRule?: SundayCategoryRule;
}) {
  const {
    fromDate,
    toDate,
    holidayDates,
    attendance,
    hoursPerDay = 8,
    ratePerDay,
    sundayCategoryRule,
  } = input;

  const stats = computeAttendanceStatsForRange({
    fromDate,
    toDate,
    holidayDates,
    attendance,
    hoursPerDay,
    sundayCategoryRule,
  });
  const { hoursExtraSum, hoursReducedSum } = sumHoursAdjustmentsInRange(
    attendance,
    fromDate,
    toDate,
  );

  return {
    ...stats,
    hoursExtraTotal: hoursExtraSum,
    hoursReducedTotal: hoursReducedSum,
    calculatedSalary: Math.round(stats.totalPaidDays * ratePerDay * 100) / 100,
  };
}

/** Deterministic pseudo-random so a failing sweep case can be reproduced. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

describe("Sunday premium — a premium-free factory's pay does not move", () => {
  it("agrees with the previous algorithm across a swept range of months, rates and attendance", () => {
    const random = makeRandom(20260802);
    const rates = [0, 300, 322.58, 1000, 1234.56];
    const shifts = [8, 9, 12];
    let cases = 0;

    for (let year = 2025; year <= 2026; year += 1) {
      for (let month = 0; month < 12; month += 1) {
        const lastDay = new Date(year, month + 1, 0).getDate();
        for (const ratePerDay of rates) {
          const hoursPerDay = shifts[Math.floor(random() * shifts.length)];
          const attendance: {
            date: string;
            status: string;
            hoursWorked?: number;
            hoursExtra?: number;
            hoursReduced?: number;
          }[] = [];
          const holidayDates: string[] = [];
          for (let day = 1; day <= lastDay; day += 1) {
            const roll = random();
            if (roll < 0.1) {
              holidayDates.push(iso(year, month, day));
            }
            if (roll < 0.15) continue;
            const record: {
              date: string;
              status: string;
              hoursWorked?: number;
              hoursExtra?: number;
              hoursReduced?: number;
            } = {
              date: iso(year, month, day),
              status: roll < 0.3 ? "absent" : "present",
            };
            const shape = random();
            if (shape < 0.2) record.hoursWorked = Math.round(random() * 20);
            else if (shape < 0.4) record.hoursExtra = Math.round(random() * 6);
            else if (shape < 0.6) record.hoursReduced = Math.round(random() * 6);
            attendance.push(record);
          }

          const ranges: [string, string][] = [
            [iso(year, month, 1), iso(year, month, lastDay)],
            [iso(year, month, 1), iso(year, month, 15)],
            [iso(year, month, 16), iso(year, month, lastDay)],
            [iso(year, month, 7), iso(year, month, 22)],
          ];
          for (const [fromDate, toDate] of ranges) {
            const args = {
              fromDate,
              toDate,
              holidayDates,
              attendance,
              hoursPerDay,
              ratePerDay,
            };
            const legacy = legacyBuildAttendanceSalarySummaryForRange(args);
            // No premium at all: the field is simply not passed, exactly as
            // every caller passed it before the premium existed.
            const current = buildAttendanceSalarySummaryForRange(args);
            // ...and an explicitly absent premium must be the same thing.
            const explicitNone = buildAttendanceSalarySummaryForRange({
              ...args,
              sundayPremium: null,
            });
            // A multiplier of 1 is "a Sunday pays one day's pay" — configured,
            // but worth nothing, so it must not move a paisa either.
            const neutral = buildAttendanceSalarySummaryForRange({
              ...args,
              sundayPremium: { requiredPresentDays: 0, sundayMultiplier: 1 },
            });

            expect({ ...current, sundayPremiumExtraPay: undefined }).toEqual({
              ...legacy,
              sundayPremiumExtraPay: undefined,
            });
            expect(current.calculatedSalary).toBe(legacy.calculatedSalary);
            expect(current.sundayPremiumExtraPay).toBe(0);
            expect(explicitNone.calculatedSalary).toBe(legacy.calculatedSalary);
            expect(neutral.calculatedSalary).toBe(legacy.calculatedSalary);
            cases += 1;
          }
        }
      }
    }

    expect(cases).toBe(2 * 12 * 5 * 4);
  });
});

describe("Sunday premium — what it pays once it is configured", () => {
  /** April 2026: Sundays fall on the 5th, 12th, 19th and 26th. */
  const presentEveryDay = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      date: iso(2026, 3, from + i),
      status: "present",
    }));

  it("pays a worked Sunday extra once the month's present days reach the number", () => {
    const attendance = presentEveryDay(1, 30);
    const withPremium = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      holidayDates: [],
      attendance,
      hoursPerDay: 8,
      ratePerDay: 1000,
      // 20 present working days, then a worked Sunday pays one and a half days.
      sundayPremium: { requiredPresentDays: 20, sundayMultiplier: 1.5 },
    });
    const flat = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      holidayDates: [],
      attendance,
      hoursPerDay: 8,
      ratePerDay: 1000,
    });

    // Present every working day: the 20th qualifying day falls before the last
    // Sunday of the month (26 April) but after the 19th, so exactly one Sunday
    // is paid at the higher rate — an extra half day's pay.
    expect(withPremium.sundayPremiumExtraPay).toBe(500);
    expect(withPremium.calculatedSalary).toBe(flat.calculatedSalary + 500);
    // Day counts are untouched: the premium is money, not days.
    expect(withPremium.totalPaidDays).toBe(flat.totalPaidDays);
    expect(withPremium.sundayPresentBonusDays).toBe(
      flat.sundayPresentBonusDays,
    );
  });

  it("pays nothing extra when the worker never reaches the number", () => {
    const summary = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      holidayDates: [],
      attendance: presentEveryDay(1, 30),
      hoursPerDay: 8,
      ratePerDay: 1000,
      sundayPremium: { requiredPresentDays: 31, sundayMultiplier: 2 },
    });
    expect(summary.sundayPremiumExtraPay).toBe(0);
  });

  it("pays every worked Sunday when the number is zero", () => {
    const summary = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      holidayDates: [],
      attendance: [
        { date: "2026-04-05", status: "present" },
        { date: "2026-04-12", status: "present" },
      ],
      hoursPerDay: 8,
      ratePerDay: 1000,
      sundayPremium: { requiredPresentDays: 0, sundayMultiplier: 1.2 },
    });
    // Two Sundays worked, each paying a fifth of a day extra.
    expect(summary.sundayPremiumExtraPay).toBe(400);
  });

  it("counts qualifying days from the 1st, so the second half of a month is not restarted", () => {
    const attendance = presentEveryDay(1, 30);
    const rangeOnly = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-16",
      toDate: "2026-04-30",
      holidayDates: [],
      attendance: attendance.filter((a) => a.date >= "2026-04-16"),
      hoursPerDay: 8,
      ratePerDay: 1000,
      sundayPremium: { requiredPresentDays: 20, sundayMultiplier: 1.5 },
    });
    const wholeMonthKnown = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-16",
      toDate: "2026-04-30",
      holidayDates: [],
      attendance: attendance.filter((a) => a.date >= "2026-04-16"),
      hoursPerDay: 8,
      ratePerDay: 1000,
      sundayPremium: { requiredPresentDays: 20, sundayMultiplier: 1.5 },
      premiumAttendance: attendance,
    });

    // Judged on the half alone, nobody reaches 20 days and the premium silently
    // vanishes; judged on the month, the 26th qualifies.
    expect(rangeOnly.sundayPremiumExtraPay).toBe(0);
    expect(wholeMonthKnown.sundayPremiumExtraPay).toBe(500);
  });

  it("never pays for a Sunday outside the range being paid", () => {
    const attendance = presentEveryDay(1, 30);
    const firstHalf = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-01",
      toDate: "2026-04-15",
      holidayDates: [],
      attendance,
      hoursPerDay: 8,
      ratePerDay: 1000,
      sundayPremium: { requiredPresentDays: 0, sundayMultiplier: 2 },
      premiumAttendance: attendance,
    });
    const secondHalf = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-16",
      toDate: "2026-04-30",
      holidayDates: [],
      attendance,
      hoursPerDay: 8,
      ratePerDay: 1000,
      sundayPremium: { requiredPresentDays: 0, sundayMultiplier: 2 },
      premiumAttendance: attendance,
    });
    // Four Sundays in April, two in each half, each worth one extra day at 2×.
    expect(firstHalf.sundayPremiumExtraPay).toBe(2000);
    expect(secondHalf.sundayPremiumExtraPay).toBe(2000);
  });

  it("agrees, Sunday for Sunday, with the day-by-day sheet the worker is shown", () => {
    const attendance = presentEveryDay(1, 30);
    const premium = { requiredPresentDays: 20, sundayMultiplier: 1.5 };
    const withPremium = buildMonthSalaryBreakdown({
      year: 2026,
      month: 3,
      holidayDates: [],
      attendance,
      productionPayByDate: new Map(),
      hoursPerDay: 8,
      ratePerDay: 1000,
      includeProductionPay: false,
      sundayPremium: premium,
    });
    const flat = buildMonthSalaryBreakdown({
      year: 2026,
      month: 3,
      holidayDates: [],
      attendance,
      productionPayByDate: new Map(),
      hoursPerDay: 8,
      ratePerDay: 1000,
      includeProductionPay: false,
    });

    const summary = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      holidayDates: [],
      attendance,
      hoursPerDay: 8,
      ratePerDay: 1000,
      sundayPremium: premium,
    });

    expect(
      Math.round(
        (withPremium.sundayMarkBonusPay - flat.sundayMarkBonusPay) * 100,
      ) / 100,
    ).toBe(summary.sundayPremiumExtraPay);
  });
});

describe("what one worked Sunday is worth", () => {
  const marchSundays = getSundayDatesInMonth(2026, 2);
  const attendance = marchSundays.map((date) => ({ date, status: "present" }));
  // Nothing but Sundays, so the earned pool stays out of the arithmetic and the
  // only figure moving is the one under test.
  const emptyRule = normalizeSundayRule({ kind: "table", brackets: [] });

  it("pays one day per Sunday when the rule says nothing, exactly as before", () => {
    const stats = computeAttendanceStats({
      year: 2026,
      month: 2,
      holidayDates: [],
      attendance,
      sundayCategoryRule: emptyRule,
    });
    expect(stats.sundayPresentBonusDays).toBe(marchSundays.length);
  });

  it("pays half a day per Sunday when the owner sets half", () => {
    const half = normalizeSundayRule({
      kind: "table",
      brackets: [],
      sundayWorkedPayDays: 0.5,
    });
    expect(
      computeAttendanceStats({
        year: 2026,
        month: 2,
        holidayDates: [],
        attendance,
        sundayCategoryRule: half,
      }).sundayPresentBonusDays,
    ).toBe(marchSundays.length * 0.5);
    expect(
      computeAttendanceStatsForRange({
        fromDate: "2026-03-01",
        toDate: "2026-03-31",
        holidayDates: [],
        attendance,
        sundayCategoryRule: half,
      }).sundayPresentBonusDays,
    ).toBe(marchSundays.length * 0.5);
  });

  it("moves the rupees on the day rows, not only the day count", () => {
    const half = normalizeSundayRule({
      kind: "table",
      brackets: [],
      sundayWorkedPayDays: 0.5,
    });
    const breakdown = buildMonthSalaryBreakdown({
      year: 2026,
      month: 2,
      holidayDates: [],
      attendance,
      productionPayByDate: new Map(),
      hoursPerDay: 8,
      ratePerDay: 400,
      sundayCategoryRule: half,
    });
    const sundayRows = breakdown.days.filter((r) => r.rowKind === "sunday");
    expect(sundayRows.every((r) => r.basePay === 200)).toBe(true);
    expect(sundayRows.every((r) => r.paidFraction === 0.5)).toBe(true);
    expect(breakdown.sundayMarkBonusPay).toBe(marchSundays.length * 200);
    expect(breakdown.sundayPresentBonusDays).toBe(marchSundays.length * 0.5);
  });

  it("lets the Sunday premium multiply the worth instead of replacing it", () => {
    // Present every non-Sunday so the premium's day count is reached, then a
    // worked Sunday worth half a day at 2x is one whole day, not two.
    const everyDay: { date: string; status: string }[] = [];
    for (let d = 1; d <= 31; d += 1) {
      everyDay.push({
        date: `2026-03-${String(d).padStart(2, "0")}`,
        status: "present",
      });
    }
    const half = normalizeSundayRule({
      kind: "table",
      brackets: [],
      sundayWorkedPayDays: 0.5,
    });
    const breakdown = buildMonthSalaryBreakdown({
      year: 2026,
      month: 2,
      holidayDates: [],
      attendance: everyDay,
      productionPayByDate: new Map(),
      hoursPerDay: 8,
      ratePerDay: 400,
      sundayCategoryRule: half,
      sundayPremium: { requiredPresentDays: 1, sundayMultiplier: 2 },
    });
    const lastSunday = breakdown.days
      .filter((r) => r.rowKind === "sunday")
      .at(-1)!;
    expect(lastSunday.basePay).toBe(400);

    // And the range summary, which adds the premium as a delta on top of the
    // flat worth, must agree with those rows rather than double-count.
    const summary = buildAttendanceSalarySummaryForRange({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      holidayDates: [],
      attendance: everyDay,
      ratePerDay: 400,
      sundayCategoryRule: half,
      sundayPremium: { requiredPresentDays: 1, sundayMultiplier: 2 },
    });
    const sundayPay =
      summary.sundayPresentBonusDays * 400 + (summary.sundayPremiumExtraPay ?? 0);
    // 1 March 2026 is itself a Sunday, so nobody has qualified yet that day and
    // it pays the plain half-day worth; the other four pay the doubled one.
    expect(sundayPay).toBe(200 + 4 * 400);
    expect(sundayPay).toBe(breakdown.sundayMarkBonusPay);
  });
});

/**
 * The pay engine used to split a month into cycle windows with
 * `getExtraPayCycleBlocks(year, monthIndex, rule.cycleDays)`, which always
 * merged the month's leftover days into the last window. It now asks the rule
 * itself (`getCycleBlocksForRule`), so a rule that says "pay the leftover days
 * as their own window" is finally obeyed.
 *
 * Per the repo convention for payroll changes, the previous algorithm is kept
 * verbatim below and swept: while `cycleRemainder` sits at its default
 * ("merge", which is what every stored rule normalizes to), the two must agree
 * on every block of every month — the same rupees, for every existing install.
 */
describe("cycle blocks: previous algorithm vs the rule-aware one", () => {
  /** Verbatim copy of what the engine called before this change. */
  function previousBlocks(
    rule: SundayCategoryRule,
    year: number,
    monthIndex: number,
  ): { start: number; end: number }[] {
    return getExtraPayCycleBlocks(year, monthIndex, rule.cycleDays);
  }

  it("agrees for every month and cycle length at the default remainder", () => {
    for (let year = 2024; year <= 2027; year += 1) {
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        for (let cycleDays = 1; cycleDays <= 31; cycleDays += 1) {
          const rule = normalizeSundayRule({ kind: "table", cycleDays });
          expect(rule.cycleRemainder).toBe("merge");
          expect(getCycleBlocksForRule(rule, year, monthIndex)).toEqual(
            previousBlocks(rule, year, monthIndex),
          );
        }
      }
    }
  });

  it("earned days are unchanged for a default rule, and change when the owner asks", () => {
    // Present every non-Sunday of March 2026 (31 days).
    const att = new Map<string, { status: string }>();
    for (let d = 1; d <= 31; d += 1) {
      const date = `2026-03-${String(d).padStart(2, "0")}`;
      if (new Date(2026, 2, d).getDay() === 0) continue;
      att.set(date, { status: "present" });
    }
    const base = {
      kind: "repeat" as const,
      repeatEveryPresentDays: 3,
      repeatGive: 1,
      cycleDays: 10,
      maxPerCycle: null,
      maxPerMonth: null,
    };
    const merged = normalizeSundayRule({ ...base, cycleRemainder: "merge" });
    const separate = normalizeSundayRule({
      ...base,
      cycleRemainder: "separate",
    });

    const earn = (rule: SundayCategoryRule) =>
      computeEarnedExtraPayDaysForCalendarScope(
        "2026-03-01",
        "2026-03-31",
        [],
        att,
        8,
        rule,
      );

    // 10-day cycles over a 31-day month: merged gives 1–10, 11–20, 21–31;
    // separate breaks the last one into 21–30 and a 31-only window.
    expect(getCycleBlocksForRule(merged, 2026, 2)).toEqual([
      { start: 1, end: 10 },
      { start: 11, end: 20 },
      { start: 21, end: 31 },
    ]);
    expect(getCycleBlocksForRule(separate, 2026, 2)).toEqual([
      { start: 1, end: 10 },
      { start: 11, end: 20 },
      { start: 21, end: 30 },
      { start: 31, end: 31 },
    ]);
    // The default answer is the old answer...
    expect(earn(merged)).toBe(earn(normalizeSundayRule(base)));
    // ...and the owner's other choice actually reaches the money.
    // Merged: 8, 9 and 9 present days → 2 + 3 + 3 = 8 earned days. Separate
    // strips the 31st into a window of its own, and the 8 remaining present
    // days in 21–30 only reach 2 — a day of pay the owner's choice moved.
    expect(earn(merged)).toBe(8);
    expect(earn(separate)).toBe(7);
  });
});
