import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUNDAY_RULE,
  evaluateSundayRuleForCycle,
  getSundayRuleCycleBlocks,
  normalizeSundayRule,
  type SundayRule,
} from "./sundayRule";
import { computeEarnedExtraPayDaysForCalendarScope } from "./attendanceStats";
import { getCalendarDaysInMonth, isSunday } from "./date";

/* ------------------------------------------------------------------ *
 * The algorithm exactly as it stood before the rule became configurable.
 * Kept verbatim so the parity sweep below is a comparison against real
 * shipped behaviour rather than against a restatement of the new code.
 * ------------------------------------------------------------------ */

type LegacyRule =
  | { mode: "threshold"; requiredPresent: number; earnedSundays: number }
  | { mode: "step"; everyPresentDays: number; earnedPerStep: number };

const LEGACY_CYCLE = 15;
const LEGACY_PER_CYCLE = 2;
const LEGACY_PER_MONTH = 4;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function legacyBlocks(year: number, monthIndex: number) {
  const lastDay = getCalendarDaysInMonth(year, monthIndex);
  const blockCount = Math.max(1, Math.floor(LEGACY_PER_MONTH / LEGACY_PER_CYCLE));
  const blocks: { start: number; end: number }[] = [];
  for (let i = 0; i < blockCount; i += 1) {
    const start = 1 + i * LEGACY_CYCLE;
    if (start > lastDay) break;
    const isLast = i === blockCount - 1;
    blocks.push({
      start,
      end: isLast ? lastDay : Math.min(start + LEGACY_CYCLE - 1, lastDay),
    });
  }
  return blocks;
}

function legacyEarned(
  fromDate: string,
  toDate: string,
  attByDate: Map<string, { status: string }>,
  rule: LegacyRule,
): number {
  let total = 0;
  let y = +fromDate.slice(0, 4);
  let m = +fromDate.slice(5, 7) - 1;
  const endY = +toDate.slice(0, 4);
  const endM = +toDate.slice(5, 7) - 1;
  while (y < endY || (y === endY && m <= endM)) {
    let monthRaw = 0;
    for (const { start, end } of legacyBlocks(y, m)) {
      const windowStart = `${y}-${pad2(m + 1)}-${pad2(start)}`;
      const windowEnd = `${y}-${pad2(m + 1)}-${pad2(end)}`;
      if (windowStart < fromDate || windowEnd > toDate) continue;
      let presentCount = 0;
      for (let d = start; d <= end; d++) {
        const dateStr = `${y}-${pad2(m + 1)}-${pad2(d)}`;
        if (isSunday(dateStr)) continue;
        if (attByDate.get(dateStr)?.status === "present") presentCount += 1;
      }
      let earnedForCycle = 0;
      if (rule.mode === "threshold") {
        if (presentCount >= rule.requiredPresent) earnedForCycle = rule.earnedSundays;
      } else if (rule.everyPresentDays > 0) {
        earnedForCycle =
          Math.floor(presentCount / rule.everyPresentDays) * rule.earnedPerStep;
      }
      monthRaw += Math.min(LEGACY_PER_CYCLE, earnedForCycle);
    }
    total += Math.min(LEGACY_PER_MONTH, monthRaw);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return total;
}

/** Attendance where the employee is present on the first `n` non-Sundays. */
function attendanceFor(year: number, monthIndex: number, presentPerHalf: number) {
  const att = new Map<string, { status: string }>();
  for (const { start, end } of legacyBlocks(year, monthIndex)) {
    let marked = 0;
    for (let d = start; d <= end; d++) {
      const dateStr = `${year}-${pad2(monthIndex + 1)}-${pad2(d)}`;
      if (isSunday(dateStr)) continue;
      if (marked >= presentPerHalf) break;
      att.set(dateStr, { status: "present" });
      marked += 1;
    }
  }
  return att;
}

describe("legacy migration parity", () => {
  // Every legacy category shape an install can hold, against every month of
  // four years and every reachable present-day count. If any of these differed
  // by a hundredth of a day, somebody's wages would change on upgrade.
  const legacyRules: LegacyRule[] = [
    { mode: "threshold", requiredPresent: 12, earnedSundays: 2 },
    { mode: "threshold", requiredPresent: 10, earnedSundays: 1 },
    { mode: "threshold", requiredPresent: 13, earnedSundays: 4 },
    { mode: "threshold", requiredPresent: 0, earnedSundays: 2 },
    { mode: "threshold", requiredPresent: 12, earnedSundays: 0 },
    { mode: "threshold", requiredPresent: 12, earnedSundays: 0.5 },
    { mode: "step", everyPresentDays: 6, earnedPerStep: 1 },
    { mode: "step", everyPresentDays: 5, earnedPerStep: 1 },
    { mode: "step", everyPresentDays: 3, earnedPerStep: 1 },
    { mode: "step", everyPresentDays: 6, earnedPerStep: 0 },
    { mode: "step", everyPresentDays: 6, earnedPerStep: 0.5 },
    { mode: "step", everyPresentDays: 1, earnedPerStep: 2 },
  ];

  it("produces identical earned days for every legacy rule, month and attendance", () => {
    for (const legacy of legacyRules) {
      const migrated = normalizeSundayRule(legacy);
      for (let year = 2024; year <= 2027; year += 1) {
        for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
          const lastDay = getCalendarDaysInMonth(year, monthIndex);
          const from = `${year}-${pad2(monthIndex + 1)}-01`;
          const to = `${year}-${pad2(monthIndex + 1)}-${pad2(lastDay)}`;
          for (let presentPerHalf = 0; presentPerHalf <= 16; presentPerHalf += 1) {
            const att = attendanceFor(year, monthIndex, presentPerHalf);
            expect(
              computeEarnedExtraPayDaysForCalendarScope(from, to, [], att, 8, migrated),
            ).toBe(legacyEarned(from, to, att, legacy));
          }
        }
      }
    }
  });

  it("produces identical earned days for half-month ranges", () => {
    const legacy: LegacyRule = { mode: "threshold", requiredPresent: 12, earnedSundays: 2 };
    const migrated = normalizeSundayRule(legacy);
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const lastDay = getCalendarDaysInMonth(2026, monthIndex);
      const mm = pad2(monthIndex + 1);
      const halves: [string, string][] = [
        [`2026-${mm}-01`, `2026-${mm}-15`],
        [`2026-${mm}-16`, `2026-${mm}-${pad2(lastDay)}`],
      ];
      for (const [from, to] of halves) {
        for (let presentPerHalf = 0; presentPerHalf <= 14; presentPerHalf += 1) {
          const att = attendanceFor(2026, monthIndex, presentPerHalf);
          expect(
            computeEarnedExtraPayDaysForCalendarScope(from, to, [], att, 8, migrated),
          ).toBe(legacyEarned(from, to, att, legacy));
        }
      }
    }
  });

  it("splits every month the way the hardcoded 15-day rule did", () => {
    for (let year = 2024; year <= 2027; year += 1) {
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        expect(getSundayRuleCycleBlocks(year, monthIndex, 15)).toEqual(
          legacyBlocks(year, monthIndex),
        );
      }
    }
  });

  it("leaves the default rule identical to the old default", () => {
    expect(normalizeSundayRule(null)).toEqual(DEFAULT_SUNDAY_RULE);
    expect(normalizeSundayRule(undefined)).toEqual(DEFAULT_SUNDAY_RULE);
    expect(
      normalizeSundayRule({ mode: "threshold", requiredPresent: 12, earnedSundays: 2 }),
    ).toEqual(DEFAULT_SUNDAY_RULE);
  });
});

describe("normalizeSundayRule", () => {
  it("falls back to the default for a row with nothing usable in it", () => {
    expect(normalizeSundayRule({})).toEqual(DEFAULT_SUNDAY_RULE);
    expect(normalizeSundayRule("nonsense")).toEqual(DEFAULT_SUNDAY_RULE);
    expect(normalizeSundayRule(42)).toEqual(DEFAULT_SUNDAY_RULE);
    expect(normalizeSundayRule({ mode: "unknown" })).toEqual(DEFAULT_SUNDAY_RULE);
  });

  it("falls back when a legacy field is genuinely unset, but honours an explicit 0", () => {
    expect(normalizeSundayRule({ mode: "threshold", requiredPresent: 12 })).toEqual(
      DEFAULT_SUNDAY_RULE,
    );
    expect(normalizeSundayRule({ mode: "step", earnedPerStep: 1 })).toEqual(
      DEFAULT_SUNDAY_RULE,
    );
    // Zero days earned is a configuration ("this group earns nothing"), not an
    // absence, and must not be replaced by the default.
    expect(
      normalizeSundayRule({ mode: "threshold", requiredPresent: 12, earnedSundays: 0 })
        .brackets,
    ).toEqual([{ whenPresentDaysAtLeast: 12, give: 0 }]);
    // `everyPresentDays: 0` is a division by zero, not a rule.
    expect(
      normalizeSundayRule({ mode: "step", everyPresentDays: 0, earnedPerStep: 1 }),
    ).toEqual(DEFAULT_SUNDAY_RULE);
  });

  it("clamps negatives and rejects NaN rather than letting them reach payroll", () => {
    expect(
      normalizeSundayRule({ mode: "threshold", requiredPresent: -5, earnedSundays: -3 })
        .brackets,
    ).toEqual([{ whenPresentDaysAtLeast: 0, give: 0 }]);
    expect(
      normalizeSundayRule({ mode: "threshold", requiredPresent: NaN, earnedSundays: 2 }),
    ).toEqual(DEFAULT_SUNDAY_RULE);
    const rule = normalizeSundayRule({
      kind: "repeat",
      repeatEveryPresentDays: "abc",
      repeatGive: -4,
      cycleDays: 0,
    });
    expect(rule.repeatEveryPresentDays).toBe(0);
    expect(rule.repeatGive).toBe(0);
    expect(rule.cycleDays).toBe(15);
  });

  it("keeps an explicit null cap as 'no cap' and sorts bracket rows", () => {
    const rule = normalizeSundayRule({
      kind: "table",
      brackets: [
        { whenPresentDaysAtLeast: 20, give: 4 },
        { whenPresentDaysAtLeast: 12, give: 2 },
      ],
      maxPerCycle: null,
      maxPerMonth: null,
    });
    expect(rule.maxPerCycle).toBeNull();
    expect(rule.maxPerMonth).toBeNull();
    expect(rule.brackets).toEqual([
      { whenPresentDaysAtLeast: 12, give: 2 },
      { whenPresentDaysAtLeast: 20, give: 4 },
    ]);
  });

  it("drops half-written bracket rows instead of inventing numbers", () => {
    const rule = normalizeSundayRule({
      kind: "table",
      brackets: [
        { whenPresentDaysAtLeast: 12 },
        { give: 2 },
        null,
        "x",
        { whenPresentDaysAtLeast: 14, give: 3 },
      ],
    });
    expect(rule.brackets).toEqual([{ whenPresentDaysAtLeast: 14, give: 3 }]);
  });

  it("reads a premium only when both of its numbers are present", () => {
    expect(
      normalizeSundayRule({ kind: "table", sundayPremium: { requiredPresentDays: 26 } })
        .sundayPremium,
    ).toBeNull();
    expect(
      normalizeSundayRule({
        kind: "table",
        sundayPremium: { requiredPresentDays: 26, multiplier: 1.5 },
      }).sundayPremium,
    ).toEqual({ requiredPresentDays: 26, multiplier: 1.5 });
  });
});

describe("evaluateSundayRuleForCycle", () => {
  const table = (
    brackets: { whenPresentDaysAtLeast: number; give: number }[],
    maxPerCycle: number | null = null,
  ): SundayRule =>
    normalizeSundayRule({ kind: "table", brackets, maxPerCycle, maxPerMonth: null });

  it("gives the highest bracket the employee actually reached", () => {
    const rule = table([
      { whenPresentDaysAtLeast: 12, give: 2 },
      { whenPresentDaysAtLeast: 20, give: 4 },
    ]);
    expect(evaluateSundayRuleForCycle(rule, 11).earned).toBe(0);
    expect(evaluateSundayRuleForCycle(rule, 12).earned).toBe(2);
    expect(evaluateSundayRuleForCycle(rule, 19).earned).toBe(2);
    expect(evaluateSundayRuleForCycle(rule, 20).earned).toBe(4);
    expect(evaluateSundayRuleForCycle(rule, 40).earned).toBe(4);
  });

  it("earns nothing from an empty table rather than throwing", () => {
    expect(evaluateSundayRuleForCycle(table([]), 30)).toEqual({
      earned: 0,
      uncapped: 0,
      cappedByCycle: false,
    });
  });

  it("earns nothing from a repeat of zero days rather than dividing by zero", () => {
    const rule = normalizeSundayRule({
      kind: "repeat",
      repeatEveryPresentDays: 0,
      repeatGive: 1,
      maxPerCycle: null,
    });
    const result = evaluateSundayRuleForCycle(rule, 30);
    expect(result.earned).toBe(0);
    expect(Number.isFinite(result.earned)).toBe(true);
  });

  it("reports when a cap holds the amount below what the rule says", () => {
    const rule = normalizeSundayRule({
      kind: "repeat",
      repeatEveryPresentDays: 5,
      repeatGive: 1,
      maxPerCycle: 2,
    });
    expect(evaluateSundayRuleForCycle(rule, 10)).toEqual({
      earned: 2,
      uncapped: 2,
      cappedByCycle: false,
    });
    // Three steps' worth earned, two paid — the editor uses `cappedByCycle` to
    // say so out loud instead of quietly paying the smaller number.
    expect(evaluateSundayRuleForCycle(rule, 15)).toEqual({
      earned: 2,
      uncapped: 3,
      cappedByCycle: true,
    });
  });

  it("pays the whole amount when the cap is removed", () => {
    const rule = normalizeSundayRule({
      kind: "repeat",
      repeatEveryPresentDays: 5,
      repeatGive: 1,
      maxPerCycle: null,
    });
    expect(evaluateSundayRuleForCycle(rule, 15).earned).toBe(3);
  });
});

describe("configurable cycles and caps end to end", () => {
  it("honours an uncapped repeating rule across a whole month", () => {
    // Every non-Sunday present in March 2026, every 4 present days earns 1, no caps.
    const rule = normalizeSundayRule({
      kind: "repeat",
      repeatEveryPresentDays: 4,
      repeatGive: 1,
      maxPerCycle: null,
      maxPerMonth: null,
    });
    const att = attendanceFor(2026, 2, 31);
    const earned = computeEarnedExtraPayDaysForCalendarScope(
      "2026-03-01",
      "2026-03-31",
      [],
      att,
      8,
      rule,
    );
    const firstHalf = Array.from({ length: 15 }, (_, i) => `2026-03-${pad2(i + 1)}`)
      .filter((d) => !isSunday(d)).length;
    const secondHalf = Array.from({ length: 16 }, (_, i) => `2026-03-${pad2(i + 16)}`)
      .filter((d) => !isSunday(d)).length;
    expect(earned).toBe(
      Math.floor(firstHalf / 4) + Math.floor(secondHalf / 4),
    );
    // The legacy cap would have held this at 4; nothing clamps it now.
    expect(earned).toBeGreaterThan(4);
  });

  it("splits the month by a configured cycle length", () => {
    expect(getSundayRuleCycleBlocks(2026, 2, 10)).toEqual([
      { start: 1, end: 10 },
      { start: 11, end: 20 },
      { start: 21, end: 31 },
    ]);
    expect(getSundayRuleCycleBlocks(2026, 2, 31)).toEqual([{ start: 1, end: 31 }]);
    // A stub tail is absorbed rather than left as a window that can never earn
    // what its siblings earn.
    expect(getSundayRuleCycleBlocks(2026, 1, 15)).toEqual([
      { start: 1, end: 15 },
      { start: 16, end: 28 },
    ]);
  });
});
