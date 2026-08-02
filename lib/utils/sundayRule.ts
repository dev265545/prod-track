/**
 * The configurable rule that turns "days present" into "extra pay days earned".
 *
 * ## Why this shape
 *
 * The old model had two hardcoded rule *types* (`threshold` and `step`) with
 * four optional fields between them, plus three hardcoded constants that
 * silently overrode whatever the owner had configured. A category saying
 * "every 5 present days earns 1 day" could never pay more than 2 per cycle,
 * and nothing in the UI said so.
 *
 * The replacement is one flat, fully-configurable record:
 *
 * - `kind: "table"` — an ordered list of brackets, "present at least N days →
 *   give X days". One bracket expresses the old `threshold` mode; several
 *   express schedules the old model could not represent at all
 *   (12 days → 2, 20 days → 4). The highest bracket the employee reaches wins.
 * - `kind: "repeat"` — "every N present days → give X", the old `step` mode.
 * - `maxPerCycle` / `maxPerMonth` — the caps, now *data* with an explicit
 *   `null` for "no cap", carried on the rule so the editor can show them next
 *   to the numbers they clamp.
 * - `cycleDays` — the half-month window length, previously the constant 15.
 * - `sundayPremium` — "once they reach N present days, pay a present Sunday at
 *   X times the daily rate". Folded in here so the Operator multiplier stops
 *   being a second, parallel mechanism for the same idea.
 *
 * ## Why "table" and "repeat" are alternatives, not layers
 *
 * A rule carrying both a table and a repeat needs a precedence the owner has to
 * hold in their head ("14 days: the table says 2, the repeat says 2, which?").
 * Both users are non-technical, so the model exposes one shape per rule and no
 * precedence at all. Nothing is lost: any schedule a table+repeat pair could
 * express can be written as a table, and every legacy category maps onto
 * exactly one of the two.
 *
 * ## Compatibility
 *
 * {@link normalizeSundayRule} accepts a new-style rule, a legacy
 * `{mode, requiredPresent, ...}` row, or garbage, and always returns a complete
 * valid rule. The legacy defaults (cycle 15 days, cap 2 per cycle, cap 4 per
 * month) are preserved exactly, so migrating an install changes no pay.
 */

import { getCalendarDaysInMonth } from "./date";

/** One row of a bracket table: reach `whenPresentDaysAtLeast`, earn `give`. */
export interface SundayRuleBracket {
  whenPresentDaysAtLeast: number;
  give: number;
}

export interface SundayRulePremium {
  /** Present working days needed in the month before the multiplier applies. */
  requiredPresentDays: number;
  /** Present Sundays past that point pay `ratePerDay * multiplier`. */
  multiplier: number;
}

/** How the days left over at the end of a month are treated. */
export type SundayRuleRemainder = "merge" | "separate";

export interface SundayRule {
  kind: "table" | "repeat";
  /** Used when `kind === "table"`. Sorted ascending by threshold. */
  brackets: SundayRuleBracket[];
  /**
   * How several reached table lines combine.
   *
   * - `"highest"` — only the best line the employee reached pays. This is what
   *   the engine has always done and is the default for every rule that does
   *   not say otherwise, so no existing install moves.
   * - `"each"` — every line reached pays, added together. An owner who means
   *   "one day for reaching 12, another for reaching 20" had to hand-compute
   *   cumulative totals into each row before this existed, and would get it
   *   wrong.
   *
   * Meaningless for `kind: "repeat"`, and carried anyway so switching shape
   * back does not lose the choice.
   */
  bracketMode: "highest" | "each";
  /**
   * What ONE Sunday actually worked is worth, in days' pay. Was hardcoded to 1
   * everywhere. `0.5` is a factory that pays helpers half a day for Sunday
   * work; `1` is exactly what every install did before this field existed.
   *
   * The Sunday premium multiplier, when it applies, multiplies *this*, so the
   * two knobs compose instead of fighting.
   */
  sundayWorkedPayDays: number;
  /**
   * What ONE extra day earned from the table/repeat is worth, in days' pay.
   *
   * Applied after both caps, so the caps stay stated in the same units the
   * owner types into the lines. `1` reproduces today's behaviour exactly, where
   * an earned day was always paid at the plain daily rate.
   */
  earnedDayPayDays: number;
  /** Used when `kind === "repeat"`. Zero means the repeat earns nothing. */
  repeatEveryPresentDays: number;
  repeatGive: number;
  /** Cap per cycle, or `null` for no cap. */
  maxPerCycle: number | null;
  /** Cap per calendar month, or `null` for no cap. */
  maxPerMonth: number | null;
  /** Length of one earning window in calendar days. */
  cycleDays: number;
  /**
   * What happens to the days left at the end of the month when `cycleDays` does
   * not divide it evenly.
   *
   * - `"merge"` — the leftover days join the window before them, so the last
   *   window is longer than the rest. This is what the splitter has always
   *   done and is the default for every rule that does not say otherwise, so
   *   no stored rule moves.
   * - `"separate"` — the leftover days are their own short window. It earns on
   *   the same rule as its siblings but has fewer days to do it in, which is
   *   what an owner who says "the month is exactly two tens and a bit" means.
   *
   * Kept on the rule rather than in settings because `cycleDays` is per rule:
   * the leftover only exists relative to a particular stretch length.
   */
  cycleRemainder: SundayRuleRemainder;
  /** Sunday rate premium, or `null` to leave present Sundays at the flat rate. */
  sundayPremium: SundayRulePremium | null;
}

/** Cycle window length before this rule was configurable. */
export const LEGACY_CYCLE_DAYS = 15;
/** Per-cycle cap before this rule was configurable. */
export const LEGACY_MAX_PER_CYCLE = 2;
/** Per-month cap before this rule was configurable. */
export const LEGACY_MAX_PER_MONTH = 4;
/** Present days a legacy default category required. */
export const LEGACY_REQUIRED_PRESENT = 12;
/** Days a legacy default category gave for reaching that. */
export const LEGACY_EARNED_SUNDAYS = 2;

/**
 * Longest stretch a rule may declare, in calendar days.
 *
 * The editor used to stop at 31 while the model accepted anything, so a
 * quarterly attendance bonus — a perfectly ordinary thing to want — could not
 * be typed even though the engine would have run it. A little over a year is
 * long enough for any stretch a factory means and short enough that a slipped
 * digit is still caught.
 */
export const MAX_CYCLE_DAYS = 366;

/**
 * Most days' pay any single "what is this worth" number may claim.
 *
 * Guards the multiplier and the two worth fields against a stray keypress
 * turning one Sunday into a year's wages. Nothing legitimate comes near it.
 */
export const MAX_PAY_DAY_VALUE = 100;

/** What one worked Sunday was worth before it was configurable. */
export const LEGACY_SUNDAY_WORKED_PAY_DAYS = 1;
/** What one earned extra day was worth before it was configurable. */
export const LEGACY_EARNED_DAY_PAY_DAYS = 1;
/** How the month's leftover days were treated before it was configurable. */
export const LEGACY_CYCLE_REMAINDER: SundayRuleRemainder = "merge";

/**
 * The rule applied to an employee with no Sunday category.
 *
 * Identical in effect to the old `DEFAULT_SUNDAY_CATEGORY_RULE`: present 12
 * working days in a half-month window and earn 2 extra pay days, at most 2 per
 * window and 4 per month.
 */
export const DEFAULT_SUNDAY_RULE: SundayRule = {
  kind: "table",
  brackets: [
    {
      whenPresentDaysAtLeast: LEGACY_REQUIRED_PRESENT,
      give: LEGACY_EARNED_SUNDAYS,
    },
  ],
  bracketMode: "highest",
  sundayWorkedPayDays: LEGACY_SUNDAY_WORKED_PAY_DAYS,
  earnedDayPayDays: LEGACY_EARNED_DAY_PAY_DAYS,
  repeatEveryPresentDays: 0,
  repeatGive: 0,
  maxPerCycle: LEGACY_MAX_PER_CYCLE,
  maxPerMonth: LEGACY_MAX_PER_MONTH,
  cycleDays: LEGACY_CYCLE_DAYS,
  cycleRemainder: LEGACY_CYCLE_REMAINDER,
  sundayPremium: null,
};

/**
 * A rule that earns no extra pay days at all.
 *
 * A table with no lines can never match, so nothing is earned and neither cap
 * ever bites. Everything else stays at the ordinary values: a Sunday actually
 * worked is still paid one day's pay, because "earns no extra days" is a
 * statement about the earning schedule, not a reason to stop paying for work
 * that was done.
 *
 * This is what an owner picks when a worker with no Sunday rule of their own
 * should accrue nothing — see `resolveUnassignedSundayRule`.
 */
export const EARNS_NO_EXTRA_DAYS_RULE: SundayRule = {
  ...DEFAULT_SUNDAY_RULE,
  brackets: [],
  repeatEveryPresentDays: 0,
  repeatGive: 0,
};

/**
 * A finite number >= 0, or `null` when the value is genuinely unset.
 *
 * An explicit `0` is a *configuration* ("earn nothing"), not an absence, and
 * must stay distinguishable from unset — a category that pays no extra days is
 * a real thing an owner can mean, and silently substituting a default there
 * pays people money the owner did not agree to.
 */
export function configuredNonNegative(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

/** A finite number >= 0, else the fallback. NaN and negatives never survive. */
function nonNegativeOr(value: unknown, fallback: number): number {
  const n = configuredNonNegative(value);
  return n === null ? fallback : n;
}

/** A cap: a finite number >= 0, or `null` meaning "no cap". */
function normalizeCap(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function normalizeBrackets(value: unknown): SundayRuleBracket[] {
  if (!Array.isArray(value)) return [];
  const rows: SundayRuleBracket[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const at = configuredNonNegative(row.whenPresentDaysAtLeast);
    const give = configuredNonNegative(row.give);
    // A bracket with no threshold or no amount is not a half-configured rule
    // we can guess at — it is a row the owner never finished. Drop it rather
    // than invent a number that moves wages.
    if (at === null || give === null) continue;
    rows.push({ whenPresentDaysAtLeast: at, give });
  }
  return rows.sort(
    (a, b) => a.whenPresentDaysAtLeast - b.whenPresentDaysAtLeast,
  );
}

function normalizePremium(value: unknown): SundayRulePremium | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const requiredPresentDays = configuredNonNegative(row.requiredPresentDays);
  const multiplier = configuredNonNegative(row.multiplier);
  if (requiredPresentDays === null || multiplier === null) return null;
  return {
    requiredPresentDays: Math.min(MAX_CYCLE_DAYS, requiredPresentDays),
    multiplier: Math.min(MAX_PAY_DAY_VALUE, multiplier),
  };
}

/** A worth in days' pay: non-negative, finite, and not absurd. */
function normalizePayDayValue(value: unknown, fallback: number): number {
  return Math.min(MAX_PAY_DAY_VALUE, nonNegativeOr(value, fallback));
}

const NEW_RULE_FIELDS = [
  "kind",
  "brackets",
  "bracketMode",
  "sundayWorkedPayDays",
  "earnedDayPayDays",
  "repeatEveryPresentDays",
  "repeatGive",
  "maxPerCycle",
  "maxPerMonth",
  "cycleDays",
  "cycleRemainder",
  "sundayPremium",
] as const;

/** True when `raw` carries any field only the current rule shape has. */
function isNewShape(row: Record<string, unknown>): boolean {
  return NEW_RULE_FIELDS.some((key) => row[key] !== undefined);
}

/**
 * Translate a legacy category into the equivalent general rule.
 *
 * `threshold` becomes a one-row table and `step` becomes a repeat; both keep
 * the legacy cycle length and caps, so the engine produces the same number it
 * produced before. A legacy row whose fields are unset falls back to the
 * default rule, exactly as the old resolver did — except that an explicit `0`
 * is honoured, which is the behaviour a recent fix established and this must
 * not regress.
 */
function fromLegacy(row: Record<string, unknown>): SundayRule {
  if (row.mode === "threshold") {
    const requiredPresent = configuredNonNegative(row.requiredPresent);
    const earnedSundays = configuredNonNegative(row.earnedSundays);
    if (requiredPresent === null || earnedSundays === null) {
      return DEFAULT_SUNDAY_RULE;
    }
    return {
      ...DEFAULT_SUNDAY_RULE,
      kind: "table",
      brackets: [
        { whenPresentDaysAtLeast: requiredPresent, give: earnedSundays },
      ],
    };
  }

  const everyPresentDays = configuredNonNegative(row.everyPresentDays);
  const earnedPerStep = configuredNonNegative(row.earnedPerStep);
  // `everyPresentDays: 0` is not a rule, it is a division by zero, so unlike
  // the "earn nothing" amounts it still falls back to the default.
  if (!everyPresentDays || earnedPerStep === null) return DEFAULT_SUNDAY_RULE;
  return {
    ...DEFAULT_SUNDAY_RULE,
    kind: "repeat",
    brackets: [],
    repeatEveryPresentDays: everyPresentDays,
    repeatGive: earnedPerStep,
  };
}

/**
 * Turn anything at all — a new rule, a legacy category row, `null`, nonsense —
 * into a complete valid {@link SundayRule}.
 *
 * Every field is validated independently so a row half-written by an older
 * build still yields a usable rule instead of throwing on the first bad field.
 */
export function normalizeSundayRule(raw: unknown): SundayRule {
  if (!raw || typeof raw !== "object") return DEFAULT_SUNDAY_RULE;
  const row = raw as Record<string, unknown>;
  // A row with none of the current fields is either a legacy category or
  // something we cannot read at all; in both cases guessing a table out of thin
  // air would silently pay nothing, so fall back to the documented default.
  if (!isNewShape(row)) {
    return row.mode === "threshold" || row.mode === "step"
      ? fromLegacy(row)
      : DEFAULT_SUNDAY_RULE;
  }

  const kind = row.kind === "repeat" ? "repeat" : "table";
  const brackets = normalizeBrackets(row.brackets);
  const repeatEveryPresentDays = nonNegativeOr(row.repeatEveryPresentDays, 0);
  const repeatGive = nonNegativeOr(row.repeatGive, 0);
  // A cycle of zero days would divide the month into nothing. Fall back rather
  // than produce a rule that can never pay.
  const cycleDaysRaw = Math.floor(nonNegativeOr(row.cycleDays, LEGACY_CYCLE_DAYS));
  const cycleDays =
    cycleDaysRaw >= 1 ? Math.min(MAX_CYCLE_DAYS, cycleDaysRaw) : LEGACY_CYCLE_DAYS;

  return {
    kind,
    brackets,
    // Anything that is not the explicit opt-in stays on the behaviour every
    // install already has, so an absent field can never move a wage.
    bracketMode: row.bracketMode === "each" ? "each" : "highest",
    sundayWorkedPayDays: normalizePayDayValue(
      row.sundayWorkedPayDays,
      LEGACY_SUNDAY_WORKED_PAY_DAYS,
    ),
    earnedDayPayDays: normalizePayDayValue(
      row.earnedDayPayDays,
      LEGACY_EARNED_DAY_PAY_DAYS,
    ),
    repeatEveryPresentDays,
    repeatGive,
    maxPerCycle: normalizeCap(row.maxPerCycle, LEGACY_MAX_PER_CYCLE),
    maxPerMonth: normalizeCap(row.maxPerMonth, LEGACY_MAX_PER_MONTH),
    cycleDays,
    // As with `bracketMode`: anything that is not the explicit opt-in stays on
    // the split every install already has.
    cycleRemainder: row.cycleRemainder === "separate" ? "separate" : "merge",
    sundayPremium: normalizePremium(row.sundayPremium),
  };
}

/**
 * Extra pay days earned in one cycle, before the per-month cap.
 *
 * Returns the *uncapped* amount alongside the capped one so the editor can tell
 * the owner "your rule gives 4 here, but the cap holds it at 2" instead of
 * silently paying 2 — the whole defect this rework exists to fix.
 */
export function evaluateSundayRuleForCycle(
  rule: SundayRule,
  presentDays: number,
): { earned: number; uncapped: number; cappedByCycle: boolean } {
  let uncapped = 0;

  if (rule.kind === "repeat") {
    if (rule.repeatEveryPresentDays > 0) {
      uncapped =
        Math.floor(presentDays / rule.repeatEveryPresentDays) * rule.repeatGive;
    }
  } else if (rule.bracketMode === "each") {
    // Every line reached pays, added together.
    for (const bracket of rule.brackets) {
      if (presentDays >= bracket.whenPresentDaysAtLeast) uncapped += bracket.give;
    }
  } else {
    // Highest bracket the employee actually reached wins. Brackets are sorted
    // ascending by normalizeSundayRule, so the last match is the best one.
    for (const bracket of rule.brackets) {
      if (presentDays >= bracket.whenPresentDaysAtLeast) uncapped = bracket.give;
    }
  }

  if (!Number.isFinite(uncapped) || uncapped < 0) uncapped = 0;
  const earned =
    rule.maxPerCycle === null ? uncapped : Math.min(rule.maxPerCycle, uncapped);
  return { earned, uncapped, cappedByCycle: earned < uncapped };
}

/**
 * The most a rule can pay across one whole calendar month.
 *
 * The per-cycle evaluator knows nothing about `maxPerMonth` — that cap is
 * applied a long way away, in `computeEarnedExtraPayDaysForCalendarScope`. So
 * an editor that previews only cycles cannot tell the owner that their monthly
 * limit will clip the number it just showed them. This walks the same windows
 * the pay engine walks, assumes a perfect attendance record in each, and
 * returns the capped and uncapped monthly totals so the difference can be said
 * out loud.
 */
export function evaluateSundayRuleForMonth(
  rule: SundayRule,
  year: number,
  monthIndex: number,
): { earned: number; uncapped: number; cappedByMonth: boolean } {
  let uncapped = 0;
  for (const block of getCycleBlocksForRule(rule, year, monthIndex)) {
    uncapped += evaluateSundayRuleForCycle(rule, block.end - block.start + 1).earned;
  }
  const earned =
    rule.maxPerMonth === null ? uncapped : Math.min(rule.maxPerMonth, uncapped);
  return { earned, uncapped, cappedByMonth: earned < uncapped };
}

/**
 * Split a calendar month into its earning windows.
 *
 * Windows always run from day 1 in `cycleDays`-long steps. What differs is the
 * tail, and that is now the owner's choice:
 *
 * - `"merge"` (the default, and what every install has always done) — the final
 *   window absorbs whatever is left of the month, so a month never ends in a
 *   stub window that can only earn a fraction of what its siblings earn. A
 *   short tail is merged into the window before it, which is what `Math.round`
 *   expresses here.
 * - `"separate"` — the tail stands on its own as a shorter window.
 *
 * At the legacy `cycleDays = 15` **both** answers yield exactly `1–15` and
 * `16–end` for every month length from 28 to 31, matching the previous
 * hardcoded split and the first-half / second-half correction periods the
 * salary sheet already uses. The two only diverge once the owner has changed
 * the stretch length.
 */
export function getSundayRuleCycleBlocks(
  year: number,
  monthIndex: number,
  cycleDays: number = LEGACY_CYCLE_DAYS,
  remainder: SundayRuleRemainder = LEGACY_CYCLE_REMAINDER,
): { start: number; end: number }[] {
  const lastDay = getCalendarDaysInMonth(year, monthIndex);
  const len =
    Number.isFinite(cycleDays) && cycleDays >= 1 ? Math.floor(cycleDays) : LEGACY_CYCLE_DAYS;
  const blockCount =
    remainder === "separate"
      ? Math.max(1, Math.ceil(lastDay / len))
      : Math.max(1, Math.round(lastDay / len));
  const blocks: { start: number; end: number }[] = [];
  for (let i = 0; i < blockCount; i += 1) {
    const start = 1 + i * len;
    if (start > lastDay) break;
    // Only the merging split stretches its last window to the end of the month.
    const absorbsTail = remainder === "merge" && i === blockCount - 1;
    blocks.push({
      start,
      end: absorbsTail ? lastDay : Math.min(start + len - 1, lastDay),
    });
  }
  return blocks;
}

/**
 * The windows a *rule* produces in a month.
 *
 * The one call every reader of a rule should make: it is the only place that
 * knows a rule carries both a stretch length and a leftover choice, so the
 * screen and the pay engine cannot drift apart by one of them forgetting.
 */
export function getCycleBlocksForRule(
  rule: SundayRule,
  year: number,
  monthIndex: number,
): { start: number; end: number }[] {
  return getSundayRuleCycleBlocks(year, monthIndex, rule.cycleDays, rule.cycleRemainder);
}
