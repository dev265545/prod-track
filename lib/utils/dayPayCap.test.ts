import { describe, expect, it } from "vitest";
import {
  computeAttendanceStatsForRange,
  computeDayPayFraction,
  computeDayPayFractionDetailed,
  reportDayPayCapForRange,
  type AttendanceRecord,
} from "./attendanceStats";
import {
  clampPayrollDriverFieldsToPeriod,
  DEFAULT_MAX_DAY_PAY_FRACTION,
  dayPayCapValue,
  getMaxPresentDaysInRange,
  normalizeDayPayCap,
  reportPayrollDriverClamp,
  countSundaysInRange,
  getMaxEarnedSundayPayDaysInRange,
  getDatesInRange,
  isSunday,
} from "./date";

/* ------------------------------------------------------------------ *
 * The algorithm exactly as it stood while the per-day limit was the
 * hardcoded constant `MAX_DAY_PAY_FRACTION = 2`. Kept verbatim so the
 * parity sweep below compares against real shipped behaviour rather
 * than against a restatement of the new code.
 * ------------------------------------------------------------------ */

const LEGACY_MAX_DAY_PAY_FRACTION = 2;

function legacyComputeDayPayFraction(
  att: { hoursWorked?: number; hoursReduced?: number; hoursExtra?: number },
  fullDayHours: number,
): number {
  if (fullDayHours <= 0) return 1;
  if (att.hoursWorked != null && att.hoursWorked >= 0) {
    return Math.min(
      Math.max(att.hoursWorked / fullDayHours, 0),
      LEGACY_MAX_DAY_PAY_FRACTION,
    );
  }
  const reduced = att.hoursReduced ?? 0;
  const extra = att.hoursExtra ?? 0;
  const adj = (extra - reduced) / fullDayHours;
  return Math.min(Math.max(1 + adj, 0), LEGACY_MAX_DAY_PAY_FRACTION);
}

function legacyGetMaxPresentDaysInRange(
  fromDate: string,
  toDate: string,
): number {
  const nonSundayDates = getDatesInRange(fromDate, toDate).filter(
    (d) => !isSunday(d),
  );
  return nonSundayDates.length * LEGACY_MAX_DAY_PAY_FRACTION;
}

function legacyClampPayrollDriverFieldsToPeriod(
  fromDate: string,
  toDate: string,
  d: {
    presentDays: number;
    earnedSundayPayDays: number;
    sundayPresentBonusDays: number;
  },
) {
  const maxPresent = legacyGetMaxPresentDaysInRange(fromDate, toDate);
  const maxEarned = getMaxEarnedSundayPayDaysInRange(fromDate, toDate);
  const maxSundayBonus = countSundaysInRange(fromDate, toDate);
  return {
    presentDays: Math.min(Math.max(0, d.presentDays), Math.max(0, maxPresent)),
    earnedSundayPayDays: Math.min(
      Math.max(0, d.earnedSundayPayDays),
      maxEarned,
    ),
    sundayPresentBonusDays: Math.min(
      Math.max(0, d.sundayPresentBonusDays),
      maxSundayBonus,
    ),
  };
}

/* ------------------------------------------------------------------ *
 * Sweep inputs
 * ------------------------------------------------------------------ */

const HOURS_PER_DAY = [0, -4, 1, 4, 8, 8.5, 12, 24];
const HOUR_VALUES = [
  undefined,
  0,
  0.5,
  1,
  3,
  4,
  8,
  10,
  16,
  24,
  -1,
  -8,
  Number.NaN,
];

function* attendanceShapes(): Generator<{
  hoursWorked?: number;
  hoursReduced?: number;
  hoursExtra?: number;
}> {
  for (const hoursWorked of HOUR_VALUES) {
    yield { hoursWorked };
  }
  for (const hoursExtra of HOUR_VALUES) {
    for (const hoursReduced of HOUR_VALUES) {
      yield { hoursExtra, hoursReduced };
      yield { hoursWorked: undefined, hoursExtra, hoursReduced };
    }
  }
}

describe("computeDayPayFraction — parity with the hardcoded limit", () => {
  it("pays exactly what it always paid, at the default limit, for every shape", () => {
    let compared = 0;
    for (const hours of HOURS_PER_DAY) {
      for (const att of attendanceShapes()) {
        const before = legacyComputeDayPayFraction(att, hours);
        const after = computeDayPayFraction(att, hours);
        // Object.is so a NaN result has to stay a NaN result: the old code
        // produced one for NaN hours and quietly changing that to a number
        // would move pay.
        expect(
          Object.is(before, after),
          `hours=${hours} att=${JSON.stringify(att)} before=${before} after=${after}`,
        ).toBe(true);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(2000);
  });

  it("pays the same when the default is passed explicitly", () => {
    for (const hours of HOURS_PER_DAY) {
      for (const att of attendanceShapes()) {
        expect(
          Object.is(
            legacyComputeDayPayFraction(att, hours),
            computeDayPayFraction(att, hours, DEFAULT_MAX_DAY_PAY_FRACTION),
          ),
        ).toBe(true);
      }
    }
  });
});

describe("computeDayPayFractionDetailed — the limit is reportable", () => {
  it("returns what the day earned as well as what it pays", () => {
    // Eight hours extra on an eight-hour shift: the case from the report.
    const result = computeDayPayFractionDetailed({ hoursExtra: 10 }, 8);
    expect(result.uncapped).toBe(2.25);
    expect(result.paid).toBe(2);
    expect(result.capped).toBe(true);
  });

  it("reports nothing when the limit did not bite", () => {
    const result = computeDayPayFractionDetailed({ hoursExtra: 4 }, 8);
    expect(result).toEqual({ paid: 1.5, uncapped: 1.5, capped: false });
  });

  it("a limit of exactly 1 makes extra hours earn nothing, and says so", () => {
    const result = computeDayPayFractionDetailed({ hoursExtra: 8 }, 8, 1);
    expect(result.paid).toBe(1);
    expect(result.uncapped).toBe(2);
    expect(result.capped).toBe(true);
    // A short day is still short: the limit is a ceiling, never a floor.
    expect(computeDayPayFractionDetailed({ hoursReduced: 4 }, 8, 1).paid).toBe(
      0.5,
    );
  });

  it("no limit pays the whole of a very long day", () => {
    const result = computeDayPayFractionDetailed({ hoursExtra: 400 }, 8, null);
    expect(result.paid).toBe(51);
    expect(result.capped).toBe(false);
  });

  it("a shift with no hours is one full day, whatever the limit", () => {
    for (const cap of [null, 1, 2, 10]) {
      expect(computeDayPayFractionDetailed({ hoursExtra: 9 }, 0, cap)).toEqual({
        paid: 1,
        uncapped: 1,
        capped: false,
      });
      expect(computeDayPayFractionDetailed({ hoursWorked: 9 }, -3, cap).paid).toBe(
        1,
      );
    }
  });

  it("negative hours never pay less than nothing", () => {
    expect(computeDayPayFractionDetailed({ hoursReduced: 40 }, 8, null).paid).toBe(
      0,
    );
    expect(computeDayPayFractionDetailed({ hoursWorked: -5 }, 8).paid).toBe(1);
  });

  it("unreadable input stays unreadable rather than becoming a limit story", () => {
    const result = computeDayPayFractionDetailed({ hoursExtra: Number.NaN }, 8);
    expect(Number.isNaN(result.paid)).toBe(true);
    expect(result.capped).toBe(false);
  });
});

describe("normalizeDayPayCap", () => {
  it("keeps the old constant when nothing is configured", () => {
    expect(normalizeDayPayCap(undefined)).toBe(2);
    expect(normalizeDayPayCap("")).toBe(2);
    expect(normalizeDayPayCap("nonsense")).toBe(2);
    expect(normalizeDayPayCap(Number.NaN)).toBe(2);
  });

  it("keeps an explicit no-limit", () => {
    expect(normalizeDayPayCap(null)).toBeNull();
    expect(dayPayCapValue(null)).toBe(Number.POSITIVE_INFINITY);
  });

  it("refuses a limit below 1, which would cut an ordinary full day", () => {
    expect(normalizeDayPayCap(0)).toBe(1);
    expect(normalizeDayPayCap(0.5)).toBe(1);
    expect(normalizeDayPayCap(-3)).toBe(1);
  });

  it("keeps a real limit", () => {
    expect(normalizeDayPayCap(1)).toBe(1);
    expect(normalizeDayPayCap(2.5)).toBe(2.5);
    expect(normalizeDayPayCap("3")).toBe(3);
  });
});

describe("period driver clamp — parity and configurability", () => {
  const RANGES: [string, string][] = [
    ["2026-01-01", "2026-01-15"],
    ["2026-01-16", "2026-01-31"],
    ["2026-02-01", "2026-02-28"],
    ["2026-03-01", "2026-03-31"],
    ["2026-04-05", "2026-04-05"],
    ["2026-11-01", "2026-11-30"],
  ];
  const VALUES = [-5, 0, 1, 7, 12.5, 30, 62, 1000];

  it("clamps exactly as the hardcoded version did, at the default limit", () => {
    for (const [from, to] of RANGES) {
      for (const presentDays of VALUES) {
        for (const earnedSundayPayDays of VALUES) {
          for (const sundayPresentBonusDays of VALUES) {
            const input = {
              presentDays,
              earnedSundayPayDays,
              sundayPresentBonusDays,
            };
            expect(
              clampPayrollDriverFieldsToPeriod(from, to, [], input),
            ).toEqual(legacyClampPayrollDriverFieldsToPeriod(from, to, input));
          }
        }
      }
    }
  });

  it("uses the configured limit for the present-days ceiling", () => {
    // January 2026 has 27 non-Sunday dates.
    expect(getMaxPresentDaysInRange("2026-01-01", "2026-01-31", 2)).toBe(54);
    expect(getMaxPresentDaysInRange("2026-01-01", "2026-01-31", 1)).toBe(27);
    expect(getMaxPresentDaysInRange("2026-01-01", "2026-01-31", 3)).toBe(81);
    expect(getMaxPresentDaysInRange("2026-01-01", "2026-01-31", null)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("an empty range has no room at all, even with no limit", () => {
    expect(getMaxPresentDaysInRange("2026-01-04", "2026-01-04", null)).toBe(0);
  });

  it("leaves a manual present-days correction alone when there is no limit", () => {
    const report = reportPayrollDriverClamp(
      "2026-01-01",
      "2026-01-31",
      [],
      {
        presentDays: 400,
        earnedSundayPayDays: 0,
        sundayPresentBonusDays: 0,
      },
      null,
    );
    expect(report.values.presentDays).toBe(400);
    expect(report.trimmed.presentDays).toBe(false);
  });

  it("names the correction it trimmed instead of trimming it silently", () => {
    const report = reportPayrollDriverClamp(
      "2026-01-01",
      "2026-01-31",
      [],
      {
        presentDays: 400,
        earnedSundayPayDays: 99,
        sundayPresentBonusDays: 99,
      },
      2,
    );
    expect(report.trimmed).toEqual({
      presentDays: true,
      earnedSundayPayDays: true,
      sundayPresentBonusDays: true,
    });
    expect(report.limits.presentDays).toBe(54);
    expect(report.values.presentDays).toBe(54);
  });

  it("does not call raising a negative to zero a trim", () => {
    const report = reportPayrollDriverClamp("2026-01-01", "2026-01-31", [], {
      presentDays: -5,
      earnedSundayPayDays: -5,
      sundayPresentBonusDays: -5,
    });
    expect(report.trimmed).toEqual({
      presentDays: false,
      earnedSundayPayDays: false,
      sundayPresentBonusDays: false,
    });
  });
});

describe("range totals — the limit does not move pay at its default", () => {
  const attendance: AttendanceRecord[] = [
    { date: "2026-01-01", status: "present", hoursExtra: 10 },
    { date: "2026-01-02", status: "present", hoursExtra: 4 },
    { date: "2026-01-03", status: "present", hoursWorked: 20 },
    { date: "2026-01-05", status: "present" },
    { date: "2026-01-06", status: "absent" },
    { date: "2026-01-07", status: "present", hoursReduced: 4 },
    // A present Sunday pays a flat bonus day and is never capped.
    { date: "2026-01-04", status: "present", hoursExtra: 12 },
  ];

  it("computeAttendanceStatsForRange is unchanged, and reports the clipping", () => {
    const stats = computeAttendanceStatsForRange({
      fromDate: "2026-01-01",
      toDate: "2026-01-07",
      holidayDates: [],
      attendance,
      hoursPerDay: 8,
    });
    // 2 + 1.5 + 2 + 1 + 0.5 = 7 present days, the same total the hardcoded
    // version produced.
    expect(stats.presentDays).toBe(7);
    expect(stats.dayPayCap).toEqual({
      limit: 2,
      // 2.25 - 2 on the 1st, 2.5 - 2 on the 3rd.
      clippedDays: 0.75,
      clippedDates: 2,
    });
  });

  it("raising the limit pays the clipped days, and says nothing was clipped", () => {
    const stats = computeAttendanceStatsForRange({
      fromDate: "2026-01-01",
      toDate: "2026-01-07",
      holidayDates: [],
      attendance,
      hoursPerDay: 8,
      maxDayPayFraction: null,
    });
    expect(stats.presentDays).toBe(7.75);
    expect(stats.dayPayCap).toEqual({
      limit: null,
      clippedDays: 0,
      clippedDates: 0,
    });
  });

  it("reportDayPayCapForRange agrees with the totals it explains", () => {
    expect(
      reportDayPayCapForRange(attendance, "2026-01-01", "2026-01-07", 8, 2),
    ).toEqual({ limit: 2, clippedDays: 0.75, clippedDates: 2 });
    expect(
      reportDayPayCapForRange(attendance, "2026-01-01", "2026-01-07", 8, null),
    ).toEqual({ limit: null, clippedDays: 0, clippedDates: 0 });
  });
});
