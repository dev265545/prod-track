import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUNDAY_RULE,
  evaluateSundayRuleForCycle,
  evaluateSundayRuleForMonth,
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

  it("reports the monthly ceiling, including the cap the cycle evaluator cannot see", () => {
    const rule = normalizeSundayRule({
      kind: "table",
      brackets: [{ whenPresentDaysAtLeast: 10, give: 3 }],
      maxPerCycle: null,
      maxPerMonth: 4,
      cycleDays: 15,
    } satisfies Partial<SundayRule>);
    // Two windows of 3 each is 6; the monthly cap pays 4 — the number the
    // per-stretch preview alone would never have shown.
    expect(evaluateSundayRuleForMonth(rule, 2026, 2)).toEqual({
      uncapped: 6,
      earned: 4,
      cappedByMonth: true,
    });
    expect(
      evaluateSundayRuleForMonth({ ...rule, maxPerMonth: null }, 2026, 2),
    ).toEqual({ uncapped: 6, earned: 6, cappedByMonth: false });
  });

  it("counts a month's real windows, not cycleDays-sized ones", () => {
    const rule = normalizeSundayRule({
      kind: "table",
      brackets: [{ whenPresentDaysAtLeast: 25, give: 1 }],
      maxPerCycle: null,
      maxPerMonth: null,
      cycleDays: 20,
    } satisfies Partial<SundayRule>);
    // cycleDays 20 splits March into 1–20 and 21–31; neither window is long
    // enough to reach 25 present days, so the rule can never pay.
    expect(evaluateSundayRuleForMonth(rule, 2026, 2).earned).toBe(0);
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

/* ------------------------------------------------------------------ *
 * The rule engine exactly as it stood before "what is a day worth",
 * "add up every line" and the relaxed guards were added. Kept verbatim
 * so the sweep below compares against real shipped behaviour rather
 * than a restatement of the new code.
 * ------------------------------------------------------------------ */

function priorEvaluateForCycle(
  rule: SundayRule,
  presentDays: number,
): { earned: number; uncapped: number; cappedByCycle: boolean } {
  let uncapped = 0;

  if (rule.kind === "repeat") {
    if (rule.repeatEveryPresentDays > 0) {
      uncapped =
        Math.floor(presentDays / rule.repeatEveryPresentDays) * rule.repeatGive;
    }
  } else {
    for (const bracket of rule.brackets) {
      if (presentDays >= bracket.whenPresentDaysAtLeast) uncapped = bracket.give;
    }
  }

  if (!Number.isFinite(uncapped) || uncapped < 0) uncapped = 0;
  const earned =
    rule.maxPerCycle === null ? uncapped : Math.min(rule.maxPerCycle, uncapped);
  return { earned, uncapped, cappedByCycle: earned < uncapped };
}

/** The month splitter exactly as it stood before the leftover was a choice. */
function priorCycleBlocks(
  year: number,
  monthIndex: number,
  cycleDays: number,
): { start: number; end: number }[] {
  const lastDay = getCalendarDaysInMonth(year, monthIndex);
  const len = Number.isFinite(cycleDays) && cycleDays >= 1 ? Math.floor(cycleDays) : 15;
  const blockCount = Math.max(1, Math.round(lastDay / len));
  const blocks: { start: number; end: number }[] = [];
  for (let i = 0; i < blockCount; i += 1) {
    const start = 1 + i * len;
    if (start > lastDay) break;
    const isLast = i === blockCount - 1;
    blocks.push({
      start,
      end: isLast ? lastDay : Math.min(start + len - 1, lastDay),
    });
  }
  return blocks;
}

function priorEarnedForCalendarScope(
  fromDate: string,
  toDate: string,
  attByDate: Map<string, { status: string }>,
  rule: SundayRule,
): number {
  let total = 0;
  let y = +fromDate.slice(0, 4);
  let m = +fromDate.slice(5, 7) - 1;
  const endY = +toDate.slice(0, 4);
  const endM = +toDate.slice(5, 7) - 1;
  while (y < endY || (y === endY && m <= endM)) {
    let monthRaw = 0;
    for (const { start, end } of getSundayRuleCycleBlocks(y, m, rule.cycleDays)) {
      const windowStart = `${y}-${pad2(m + 1)}-${pad2(start)}`;
      const windowEnd = `${y}-${pad2(m + 1)}-${pad2(end)}`;
      if (windowStart < fromDate || windowEnd > toDate) continue;
      let presentCount = 0;
      for (let d = start; d <= end; d++) {
        const dateStr = `${y}-${pad2(m + 1)}-${pad2(d)}`;
        if (isSunday(dateStr)) continue;
        if (attByDate.get(dateStr)?.status === "present") presentCount += 1;
      }
      monthRaw += priorEvaluateForCycle(rule, presentCount).earned;
    }
    total +=
      rule.maxPerMonth === null ? monthRaw : Math.min(rule.maxPerMonth, monthRaw);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return total;
}

describe("new knobs at their defaults change nothing", () => {
  // A spread of rule shapes an install can plausibly hold, none of which
  // mentions the new fields — exactly what every stored rule looks like today.
  const storedRules: unknown[] = [
    { kind: "table", brackets: [{ whenPresentDaysAtLeast: 12, give: 2 }] },
    {
      kind: "table",
      brackets: [
        { whenPresentDaysAtLeast: 8, give: 1 },
        { whenPresentDaysAtLeast: 12, give: 2 },
        { whenPresentDaysAtLeast: 20, give: 4 },
      ],
      maxPerCycle: null,
      maxPerMonth: null,
    },
    {
      kind: "table",
      brackets: [
        { whenPresentDaysAtLeast: 5, give: 0.5 },
        { whenPresentDaysAtLeast: 10, give: 1.5 },
      ],
      cycleDays: 10,
      maxPerCycle: 1,
      maxPerMonth: 3,
    },
    { kind: "repeat", repeatEveryPresentDays: 5, repeatGive: 1 },
    {
      kind: "repeat",
      repeatEveryPresentDays: 4,
      repeatGive: 1,
      maxPerCycle: null,
      maxPerMonth: null,
      cycleDays: 20,
    },
    { mode: "threshold", requiredPresent: 12, earnedSundays: 2 },
    { mode: "step", everyPresentDays: 6, earnedPerStep: 1 },
    null,
    {},
  ];

  it("every stored rule normalizes to the compatible defaults", () => {
    for (const stored of storedRules) {
      const rule = normalizeSundayRule(stored);
      expect(rule.bracketMode).toBe("highest");
      expect(rule.sundayWorkedPayDays).toBe(1);
      expect(rule.earnedDayPayDays).toBe(1);
      expect(rule.cycleRemainder).toBe("merge");
    }
  });

  it("splits every month exactly as the previous splitter did", () => {
    // The splitter grew a second answer for the month's leftover days. Sweep
    // the old one against the new one at its default across every stretch
    // length and four years of months: one differing window would move wages.
    for (let len = 1; len <= 40; len += 1) {
      for (let year = 2024; year <= 2027; year += 1) {
        for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
          expect(getSundayRuleCycleBlocks(year, monthIndex, len)).toEqual(
            priorCycleBlocks(year, monthIndex, len),
          );
          expect(
            getSundayRuleCycleBlocks(year, monthIndex, len, "merge"),
          ).toEqual(priorCycleBlocks(year, monthIndex, len));
        }
      }
    }
  });

  it("pays the identical number of days as the previous engine", () => {
    for (const stored of storedRules) {
      const rule = normalizeSundayRule(stored);
      for (let days = 0; days <= 40; days += 1) {
        expect(evaluateSundayRuleForCycle(rule, days)).toEqual(
          priorEvaluateForCycle(rule, days),
        );
      }
      // Four years of months, at every reachable attendance level, through the
      // function payroll actually calls.
      for (let year = 2024; year <= 2027; year += 1) {
        for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
          const from = `${year}-${pad2(monthIndex + 1)}-01`;
          const to = `${year}-${pad2(monthIndex + 1)}-${pad2(
            getCalendarDaysInMonth(year, monthIndex),
          )}`;
          for (const presentPerHalf of [0, 3, 8, 11, 12, 13, 20, 31]) {
            const att = attendanceFor(year, monthIndex, presentPerHalf);
            expect(
              computeEarnedExtraPayDaysForCalendarScope(from, to, [], att, 8, rule),
            ).toBe(priorEarnedForCalendarScope(from, to, att, rule));
          }
        }
      }
    }
  });
});

describe("adding up every line reached", () => {
  const brackets = [
    { whenPresentDaysAtLeast: 6, give: 1 },
    { whenPresentDaysAtLeast: 12, give: 1 },
    { whenPresentDaysAtLeast: 20, give: 1 },
  ];

  it("pays only the top line by default", () => {
    const rule = normalizeSundayRule({ kind: "table", brackets, maxPerCycle: null });
    expect(evaluateSundayRuleForCycle(rule, 5).earned).toBe(0);
    expect(evaluateSundayRuleForCycle(rule, 12).earned).toBe(1);
    expect(evaluateSundayRuleForCycle(rule, 25).earned).toBe(1);
  });

  it("adds every line reached when asked to", () => {
    const rule = normalizeSundayRule({
      kind: "table",
      brackets,
      bracketMode: "each",
      maxPerCycle: null,
    });
    expect(evaluateSundayRuleForCycle(rule, 5).earned).toBe(0);
    expect(evaluateSundayRuleForCycle(rule, 6).earned).toBe(1);
    expect(evaluateSundayRuleForCycle(rule, 12).earned).toBe(2);
    expect(evaluateSundayRuleForCycle(rule, 25).earned).toBe(3);
  });

  it("still reports the per-stretch limit clipping the sum", () => {
    const rule = normalizeSundayRule({
      kind: "table",
      brackets,
      bracketMode: "each",
      maxPerCycle: 2,
    });
    expect(evaluateSundayRuleForCycle(rule, 25)).toEqual({
      earned: 2,
      uncapped: 3,
      cappedByCycle: true,
    });
  });

  it("means nothing for a repeating rule, and is not lost by switching", () => {
    const rule = normalizeSundayRule({
      kind: "repeat",
      bracketMode: "each",
      brackets,
      repeatEveryPresentDays: 5,
      repeatGive: 1,
      maxPerCycle: null,
    });
    expect(rule.bracketMode).toBe("each");
    expect(evaluateSundayRuleForCycle(rule, 20).earned).toBe(4);
  });
});

describe("what one earned day is worth", () => {
  const stored = {
    kind: "table",
    brackets: [{ whenPresentDaysAtLeast: 12, give: 2 }],
    maxPerCycle: 2,
    maxPerMonth: 4,
    cycleDays: 15,
  };

  it("scales the pay days after both caps, not the caps themselves", () => {
    const plain = normalizeSundayRule(stored);
    const rich = normalizeSundayRule({ ...stored, earnedDayPayDays: 1.5 });
    const att = attendanceFor(2026, 2, 31);
    const base = computeEarnedExtraPayDaysForCalendarScope(
      "2026-03-01",
      "2026-03-31",
      [],
      att,
      8,
      plain,
    );
    expect(base).toBe(4); // the monthly cap, in the units the owner typed
    expect(
      computeEarnedExtraPayDaysForCalendarScope(
        "2026-03-01",
        "2026-03-31",
        [],
        att,
        8,
        rich,
      ),
    ).toBe(6);
    // The per-stretch view keeps speaking in the owner's own units.
    expect(evaluateSundayRuleForCycle(rich, 12).earned).toBe(2);
  });

  it("can pay nothing without falling back to a default", () => {
    const rule = normalizeSundayRule({ ...stored, earnedDayPayDays: 0 });
    expect(rule.earnedDayPayDays).toBe(0);
    expect(
      computeEarnedExtraPayDaysForCalendarScope(
        "2026-03-01",
        "2026-03-31",
        [],
        attendanceFor(2026, 2, 31),
        8,
        rule,
      ),
    ).toBe(0);
  });
});

describe("the days left at the end of the month", () => {
  it("merges the leftover into the last stretch unless told otherwise", () => {
    // 25-day stretches in March: merged, the 6-day tail disappears into one
    // 31-day window; split, it stands on its own.
    expect(getSundayRuleCycleBlocks(2026, 2, 25, "merge")).toEqual([
      { start: 1, end: 31 },
    ]);
    expect(getSundayRuleCycleBlocks(2026, 2, 25, "separate")).toEqual([
      { start: 1, end: 25 },
      { start: 26, end: 31 },
    ]);
    // Even the ordinary 15 leaves one day over in a 31-day month.
    expect(getSundayRuleCycleBlocks(2026, 2, 15, "merge")).toEqual([
      { start: 1, end: 15 },
      { start: 16, end: 31 },
    ]);
    expect(getSundayRuleCycleBlocks(2026, 2, 15, "separate")).toEqual([
      { start: 1, end: 15 },
      { start: 16, end: 30 },
      { start: 31, end: 31 },
    ]);
  });

  it("agrees with the old split whenever nothing is left over", () => {
    // February at 14 days divides exactly, so there is no leftover to decide
    // about and both answers must be the same windows.
    expect(getSundayRuleCycleBlocks(2026, 1, 14, "separate")).toEqual(
      getSundayRuleCycleBlocks(2026, 1, 14, "merge"),
    );
    expect(getSundayRuleCycleBlocks(2026, 1, 14, "separate")).toEqual([
      { start: 1, end: 14 },
      { start: 15, end: 28 },
    ]);
  });

  it("never loses or repeats a day of the month", () => {
    for (const remainder of ["merge", "separate"] as const) {
      for (let len = 1; len <= 40; len += 1) {
        for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
          const lastDay = getCalendarDaysInMonth(2026, monthIndex);
          const blocks = getSundayRuleCycleBlocks(2026, monthIndex, len, remainder);
          expect(blocks[0].start).toBe(1);
          expect(blocks[blocks.length - 1].end).toBe(lastDay);
          for (let i = 1; i < blocks.length; i += 1) {
            expect(blocks[i].start).toBe(blocks[i - 1].end + 1);
          }
        }
      }
    }
  });

  it("carries the choice through the whole-month evaluator", () => {
    const stored = {
      kind: "table",
      brackets: [{ whenPresentDaysAtLeast: 20, give: 1 }],
      maxPerCycle: null,
      maxPerMonth: null,
      cycleDays: 25,
    };
    // Merged, March is one 31-day window that reaches 20 once. Split, the
    // 6-day tail is its own window and can never reach 20, so the month still
    // earns 1 — from the first window alone.
    expect(evaluateSundayRuleForMonth(normalizeSundayRule(stored), 2026, 2)).toEqual({
      uncapped: 1,
      earned: 1,
      cappedByMonth: false,
    });
    expect(
      evaluateSundayRuleForMonth(
        normalizeSundayRule({ ...stored, cycleRemainder: "separate" }),
        2026,
        2,
      ),
    ).toEqual({ uncapped: 1, earned: 1, cappedByMonth: false });
    // Where it really bites: a rule reachable in a short window pays twice
    // when the tail stands on its own and once when it is absorbed.
    const easy = { ...stored, brackets: [{ whenPresentDaysAtLeast: 5, give: 1 }] };
    expect(evaluateSundayRuleForMonth(normalizeSundayRule(easy), 2026, 2).earned).toBe(1);
    expect(
      evaluateSundayRuleForMonth(
        normalizeSundayRule({ ...easy, cycleRemainder: "separate" }),
        2026,
        2,
      ).earned,
    ).toBe(2);
  });

  it("keeps an unreadable value on the split every install already has", () => {
    expect(normalizeSundayRule({ kind: "table", cycleRemainder: "sideways" }).cycleRemainder).toBe("merge");
    expect(normalizeSundayRule({ kind: "table" }).cycleRemainder).toBe("merge");
    expect(
      normalizeSundayRule({ kind: "table", cycleRemainder: "separate" }).cycleRemainder,
    ).toBe("separate");
  });
});

describe("guards on absurd input", () => {
  it("allows a stretch far longer than a month but not longer than a year", () => {
    expect(normalizeSundayRule({ kind: "table", cycleDays: 90 }).cycleDays).toBe(90);
    expect(normalizeSundayRule({ kind: "table", cycleDays: 5000 }).cycleDays).toBe(366);
    // Zero is still not a stretch; it falls back rather than dividing a month
    // into nothing.
    expect(normalizeSundayRule({ kind: "table", cycleDays: 0 }).cycleDays).toBe(15);
  });

  it("clamps a slipped digit in any 'what is this worth' number", () => {
    const rule = normalizeSundayRule({
      kind: "table",
      sundayWorkedPayDays: 9999,
      earnedDayPayDays: 9999,
      sundayPremium: { requiredPresentDays: 9999, multiplier: 9999 },
    });
    expect(rule.sundayWorkedPayDays).toBe(100);
    expect(rule.earnedDayPayDays).toBe(100);
    expect(rule.sundayPremium).toEqual({
      requiredPresentDays: 366,
      multiplier: 100,
    });
  });

  it("keeps a negative or unreadable worth off the payroll", () => {
    const rule = normalizeSundayRule({
      kind: "table",
      sundayWorkedPayDays: -3,
      earnedDayPayDays: "abc",
    });
    expect(rule.sundayWorkedPayDays).toBe(0);
    expect(rule.earnedDayPayDays).toBe(1);
  });
});
