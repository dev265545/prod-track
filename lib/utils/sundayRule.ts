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

export interface SundayRule {
  kind: "table" | "repeat";
  /** Used when `kind === "table"`. Sorted ascending by threshold. */
  brackets: SundayRuleBracket[];
  /** Used when `kind === "repeat"`. Zero means the repeat earns nothing. */
  repeatEveryPresentDays: number;
  repeatGive: number;
  /** Cap per cycle, or `null` for no cap. */
  maxPerCycle: number | null;
  /** Cap per calendar month, or `null` for no cap. */
  maxPerMonth: number | null;
  /** Length of one earning window in calendar days. */
  cycleDays: number;
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
  repeatEveryPresentDays: 0,
  repeatGive: 0,
  maxPerCycle: LEGACY_MAX_PER_CYCLE,
  maxPerMonth: LEGACY_MAX_PER_MONTH,
  cycleDays: LEGACY_CYCLE_DAYS,
  sundayPremium: null,
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
  return { requiredPresentDays, multiplier };
}

const NEW_RULE_FIELDS = [
  "kind",
  "brackets",
  "repeatEveryPresentDays",
  "repeatGive",
  "maxPerCycle",
  "maxPerMonth",
  "cycleDays",
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
  const cycleDays = cycleDaysRaw >= 1 ? cycleDaysRaw : LEGACY_CYCLE_DAYS;

  return {
    kind,
    brackets,
    repeatEveryPresentDays,
    repeatGive,
    maxPerCycle: normalizeCap(row.maxPerCycle, LEGACY_MAX_PER_CYCLE),
    maxPerMonth: normalizeCap(row.maxPerMonth, LEGACY_MAX_PER_MONTH),
    cycleDays,
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
 * Split a calendar month into its earning windows.
 *
 * Windows run from day 1 in `cycleDays`-long steps, and the final window
 * absorbs whatever is left of the month — a month never ends in a stub window
 * that can only earn a fraction of what its siblings earn. Concretely, a short
 * tail (less than half a cycle) is merged into the window before it, which is
 * what `Math.round` expresses here.
 *
 * At the legacy `cycleDays = 15` this yields exactly `1–15` and `16–end` for
 * every month length from 28 to 31, matching the previous hardcoded split, and
 * lining the windows up with the first-half / second-half correction periods
 * the salary sheet already uses.
 */
export function getSundayRuleCycleBlocks(
  year: number,
  monthIndex: number,
  cycleDays: number = LEGACY_CYCLE_DAYS,
): { start: number; end: number }[] {
  const lastDay = getCalendarDaysInMonth(year, monthIndex);
  const len =
    Number.isFinite(cycleDays) && cycleDays >= 1 ? Math.floor(cycleDays) : LEGACY_CYCLE_DAYS;
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
