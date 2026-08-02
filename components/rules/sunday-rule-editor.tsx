"use client";

/**
 * Plain-language editor for a {@link SundayRule}.
 *
 * The owner needs real flexibility; the owner also cannot read a formula. So
 * the data model underneath is fully general and this editor deliberately is
 * not: it offers two shapes (a table of "reach N days, get X days" rows, or one
 * repeating "every N days, get X" line), spells the limits out as fields rather
 * than hiding them in code, and — the part that actually teaches — shows a live
 * worked example computed from the rule being typed. A preview that says
 * "someone present 14 days earns 2 extra days' pay" is worth more to this
 * audience than any amount of help text, and it is the only honest way to show
 * that a limit is holding the number down.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { readNumericInput } from "@/lib/utils/numericInput";
import {
  countablePresentDaysInMonth,
  cycleCollapsedToWholeMonth,
  evaluateSundayRuleForCycle,
  evaluateSundayRuleForMonth,
  getCycleBlocksForRule,
  longestCountableWindowDays,
  matchSundayRulePreset,
  normalizeSundayRule,
  SUNDAY_RULE_PRESETS,
  LEGACY_CYCLE_DAYS,
  LEGACY_EARNED_DAY_PAY_DAYS,
  LEGACY_MAX_PER_CYCLE,
  LEGACY_MAX_PER_MONTH,
  LEGACY_SUNDAY_WORKED_PAY_DAYS,
  MAX_CYCLE_DAYS,
  MAX_PAY_DAY_VALUE,
  MAX_TYPED_CYCLE_DAYS,
  type SundayRule,
  type SundayRulePresetId,
} from "@/lib/utils/sundayRule";
import { DEFAULT_APP_SETTINGS } from "@/lib/services/appSettingsService";
import {
  AlertTriangle,
  Check,
  Infinity as InfinityIcon,
  Pencil,
  ListOrdered,
  Plus,
  Layers,
  Repeat,
  Ruler,
  Star,
  Sun,
  Undo2,
  Trash2,
  X,
} from "lucide-react";

import type { MessageKey } from "@/lib/i18n/messages";

type Translate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

const FIELD = "min-h-[44px] w-24";
const ROW = "flex flex-wrap items-end gap-3";

function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

const PREMIUM_DEFAULT_DAYS = DEFAULT_APP_SETTINGS.defaultSundayPremiumRequiredDays;
const PREMIUM_DEFAULT_TIMES = DEFAULT_APP_SETTINGS.defaultSundayPremiumMultiplier;

/**
 * The preview rows: every present-day count from 0 to the longest stretch, with
 * runs that pay the same amount collapsed into one line. Short enough to read
 * at a glance and complete enough that nothing is hidden.
 */
export function buildSundayRulePreview(
  rule: SundayRule,
  windowDays: number = rule.cycleDays,
): { from: number; to: number; earned: number; uncapped: number }[] {
  const max = Math.max(1, Math.min(windowDays, 31));
  const rows: { from: number; to: number; earned: number; uncapped: number }[] = [];
  for (let days = 0; days <= max; days += 1) {
    const { earned, uncapped } = evaluateSundayRuleForCycle(rule, days);
    const last = rows[rows.length - 1];
    if (last && last.earned === earned && last.uncapped === uncapped) {
      last.to = days;
      continue;
    }
    rows.push({ from: days, to: days, earned, uncapped });
  }
  return rows;
}

export function SundayRuleEditor({
  value,
  onChange,
  t,
  startExpanded = false,
}: {
  value: SundayRule;
  onChange: (next: SundayRule) => void;
  t: Translate;
  /**
   * Skip the preset chooser and open the full editor straight away.
   *
   * True when the owner is editing a rule that already exists: they came to
   * change one number, and bouncing them through a list of named starting
   * points would ask them to re-decide something they decided months ago.
   */
  startExpanded?: boolean;
}) {
  const rule = value;
  // The month on screen is the month the owner is standing in: the windows and
  // the monthly total are only truthful for a concrete month length.
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const blocks = useMemo(
    () => getCycleBlocksForRule(rule, year, monthIndex),
    [rule, year, monthIndex],
  );
  // Sundays are not counted towards any of this, so the longest stretch holds
  // fewer present days than it holds calendar days. Everything the editor
  // measures a rule against — the preview axis, the "can never be reached"
  // warning — is this number, the one the pay engine will actually see.
  const windowDays = useMemo(
    () => longestCountableWindowDays(rule, year, monthIndex),
    [rule, year, monthIndex],
  );
  const monthDays = useMemo(
    () => countablePresentDaysInMonth(year, monthIndex),
    [year, monthIndex],
  );
  const cycleCollapsed = useMemo(
    () => cycleCollapsedToWholeMonth(rule, year, monthIndex),
    [rule, year, monthIndex],
  );
  const month = useMemo(
    () => evaluateSundayRuleForMonth(rule, year, monthIndex),
    [rule, year, monthIndex],
  );
  const preview = useMemo(
    () => buildSundayRulePreview(rule, windowDays),
    [rule, windowDays],
  );
  const cappedRow = preview.find((row) => row.uncapped > row.earned);
  // The best-paying row is the one worth reading aloud as the worked example.
  const example = preview.reduce(
    (best, row) => (row.earned > best.earned ? row : best),
    preview[0],
  );

  // What a day is worth is a knob almost nobody turns, so it stays folded away
  // unless this rule already uses it. Four numbers on screen for every owner
  // would cost more comprehension than the two gaps it closes are worth.
  const worthIsDefault =
    rule.sundayWorkedPayDays === LEGACY_SUNDAY_WORKED_PAY_DAYS &&
    rule.earnedDayPayDays === LEGACY_EARNED_DAY_PAY_DAYS;
  const [worthOpen, setWorthOpen] = useState(!worthIsDefault);
  // Mounted fresh per category (the form passes a `key`), so this initial read
  // is taken against the rule actually being edited. It used to survive from
  // one category to the next, which could show this panel folded away while it
  // asserted a worth the category on screen did not have.
  const [full, setFull] = useState(startExpanded);
  const preset = matchSundayRulePreset(rule);

  const patch = (next: Partial<SundayRule>) =>
    onChange(normalizeSundayRule({ ...rule, ...next }));

  if (!full) {
    return (
      <SundayRulePresetChooser
        selected={preset}
        onPick={(next) => onChange(normalizeSundayRule(next))}
        onCustomise={() => setFull(true)}
        t={t}
      />
    );
  }

  const setBracket = (index: number, field: "whenPresentDaysAtLeast" | "give", raw: string) => {
    // Kept unsorted here: re-sorting mid-keystroke would move the row the owner
    // is typing in. normalizeSundayRule sorts on save.
    const brackets = rule.brackets.map((row, i) =>
      i === index ? { ...row, [field]: readNumericInput(raw, 0, { min: 0 }) } : row,
    );
    onChange({ ...rule, brackets });
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-2">
        {/* Was a bare `<Label>` with no `htmlFor` — a label pointing at
            nothing, which named neither button. It names the group instead. */}
        <p id="ruleTypeLabel" className="text-sm font-medium text-foreground">
          {t("ruleTypeLabel")}
        </p>
        <div
          role="group"
          aria-labelledby="ruleTypeLabel"
          className="flex flex-wrap gap-3"
        >
          <Button
            type="button"
            variant={rule.kind === "table" ? "default" : "outline"}
            className="min-h-[44px] px-5 py-3 text-base"
            aria-pressed={rule.kind === "table"}
            onClick={() => patch({ kind: "table" })}
          >
            <ListOrdered data-icon="inline-start" aria-hidden />
            {t("ruleTypeTable")}
          </Button>
          <Button
            type="button"
            variant={rule.kind === "repeat" ? "default" : "outline"}
            className="min-h-[44px] px-5 py-3 text-base"
            aria-pressed={rule.kind === "repeat"}
            onClick={() => patch({ kind: "repeat" })}
          >
            <Repeat data-icon="inline-start" aria-hidden />
            {t("ruleTypeRepeat")}
          </Button>
        </div>
        <p className="text-base leading-relaxed text-muted-foreground">
          {rule.kind === "table" ? t("ruleTypeTableHint") : t("ruleTypeRepeatHint")}
        </p>
        {/* Switching shape hides the other shape's numbers but never deletes
            them. Without this line the owner sees their typed lines vanish. */}
        {(rule.kind === "repeat" && rule.brackets.length > 0) ||
        (rule.kind === "table" && rule.repeatEveryPresentDays > 0) ? (
          <p className="text-base leading-relaxed text-muted-foreground">
            {t("ruleKeepsLines")}
          </p>
        ) : null}
      </div>

      {rule.kind === "table" ? (
        <div className="flex flex-col gap-3">
          {rule.brackets.length === 0 ? (
            <p className="text-base text-muted-foreground">{t("ruleTableEmpty")}</p>
          ) : (
            rule.brackets.map((bracket, index) => (
              <div key={index} className="flex flex-col gap-2">
              <div className={ROW}>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`ruleWhen${index}`}>{t("ruleTableWhen")}</Label>
                  <NumberInput
                    id={`ruleWhen${index}`}
                    min={0}
                    className={FIELD}
                    value={String(bracket.whenPresentDaysAtLeast)}
                    onChange={(e) =>
                      setBracket(index, "whenPresentDaysAtLeast", e.target.value)
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`ruleGive${index}`}>{t("ruleTableGive")}</Label>
                  <NumberInput
                    id={`ruleGive${index}`}
                    min={0}
                    decimal
                    className={FIELD}
                    value={String(bracket.give)}
                    onChange={(e) => setBracket(index, "give", e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-[44px] px-4 py-3 text-base"
                  onClick={() =>
                    onChange({
                      ...rule,
                      brackets: rule.brackets.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 data-icon="inline-start" aria-hidden />
                  {t("ruleTableRemoveRow")}
                </Button>
              </div>
              {/* A line asking for more present days than the longest stretch
                  contains can never pay, and used to be shown as if it worked. */}
              {bracket.whenPresentDaysAtLeast > windowDays ? (
                <p className="flex items-start gap-2 rounded-lg border border-warning bg-surface-4 p-3 text-base leading-relaxed text-foreground">
                  <AlertTriangle
                    className="mt-0.5 size-5 shrink-0 text-warning"
                    aria-hidden
                  />
                  <span>{t("ruleBracketUnreachable", { n: num(windowDays) })}</span>
                </p>
              ) : null}
              </div>
            ))
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] px-5 py-3 text-base"
              onClick={() =>
                onChange({
                  ...rule,
                  brackets: [
                    ...rule.brackets,
                    { whenPresentDaysAtLeast: 12, give: 2 },
                  ],
                })
              }
            >
              <Plus data-icon="inline-start" aria-hidden />
              {t("ruleTableAddRow")}
            </Button>
          </div>
          {/* The question only exists once there are two lines to pass. With
              one line both answers pay the same, so asking it would be noise. */}
          {rule.brackets.length > 1 ? (
            <div className="flex flex-col gap-2">
              <p
                id="ruleBracketModeLabel"
                className="text-sm font-medium text-foreground"
              >
                {t("ruleBracketModeLabel")}
              </p>
              <div
                role="group"
                aria-labelledby="ruleBracketModeLabel"
                className="flex flex-wrap gap-3"
              >
                <Button
                  type="button"
                  variant={rule.bracketMode === "highest" ? "default" : "outline"}
                  className="min-h-[44px] px-5 py-3 text-base"
                  aria-pressed={rule.bracketMode === "highest"}
                  onClick={() => patch({ bracketMode: "highest" })}
                >
                  <ListOrdered data-icon="inline-start" aria-hidden />
                  {t("ruleBracketModeHighest")}
                </Button>
                <Button
                  type="button"
                  variant={rule.bracketMode === "each" ? "default" : "outline"}
                  className="min-h-[44px] px-5 py-3 text-base"
                  aria-pressed={rule.bracketMode === "each"}
                  onClick={() => patch({ bracketMode: "each" })}
                >
                  <Layers data-icon="inline-start" aria-hidden />
                  {t("ruleBracketModeEach")}
                </Button>
              </div>
              <p className="text-base leading-relaxed text-muted-foreground">
                {rule.bracketMode === "each"
                  ? t("ruleBracketModeEachHint")
                  : t("ruleBracketModeHighestHint")}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={ROW}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ruleRepeatEvery">{t("ruleRepeatEvery")}</Label>
            <NumberInput
              id="ruleRepeatEvery"
              min={0}
              className={FIELD}
              value={String(rule.repeatEveryPresentDays)}
              onChange={(e) =>
                patch({
                  repeatEveryPresentDays: readNumericInput(e.target.value, 0, {
                    min: 0,
                  }),
                })
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ruleRepeatGive">{t("ruleRepeatGive")}</Label>
            <NumberInput
              id="ruleRepeatGive"
              min={0}
              decimal
              className={FIELD}
              value={String(rule.repeatGive)}
              onChange={(e) =>
                patch({ repeatGive: readNumericInput(e.target.value, 0, { min: 0 }) })
              }
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Ruler className="size-5 shrink-0" aria-hidden />
          {t("ruleLimitsTitle")}
        </p>
        <div className={ROW}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ruleCycleDays">{t("ruleCycleDays")}</Label>
            <NumberInput
              id="ruleCycleDays"
              min={1}
              // A stretch never crosses a month boundary — the pay engine walks
              // one calendar month at a time — so a number past the longest
              // month cannot mean what it says.
              max={MAX_TYPED_CYCLE_DAYS}
              className={FIELD}
              value={String(rule.cycleDays)}
              onChange={(e) =>
                patch({
                  cycleDays: readNumericInput(e.target.value, LEGACY_CYCLE_DAYS, {
                    min: 1,
                    max: MAX_TYPED_CYCLE_DAYS,
                  }),
                })
              }
            />
          </div>
          <CapField
            id="ruleMaxPerCycle"
            label={t("ruleMaxPerCycle")}
            value={rule.maxPerCycle}
            fallback={LEGACY_MAX_PER_CYCLE}
            onChange={(next) => patch({ maxPerCycle: next })}
            t={t}
          />
          <CapField
            id="ruleMaxPerMonth"
            label={t("ruleMaxPerMonth")}
            value={rule.maxPerMonth}
            fallback={LEGACY_MAX_PER_MONTH}
            onChange={(next) => patch({ maxPerMonth: next })}
            t={t}
          />
        </div>
        <p className="text-base leading-relaxed text-muted-foreground">
          {t("ruleCycleExplain")}
        </p>
        {/* The month is not cut into equal stretches of `cycleDays` — the
            splitter rounds. Show the windows this month will really have,
            read from the same function the pay engine uses. */}
        <p className="text-base leading-relaxed text-foreground">
          {t("ruleCycleActual", {
            windows: blocks
              .map((block) =>
                t("ruleCycleWindow", {
                  start: num(block.start),
                  end: num(block.end),
                }),
              )
              .join(t("ruleCycleWindowJoin")),
          })}
        </p>
        {/* "The days left at the end of the month" used to be a question here.
            It is a calendar artefact no owner has a policy about, and one of
            its two answers cut a dead one-day stretch off every 31-day month —
            which is seven months a year, on the default stretch length nobody
            changed. The field stays on the rule at its "merge" default, so no
            stored rule moved; only the question is gone. */}
        {/* The splitter rounds, so past roughly two thirds of a month every
            stretch length means the same single window. Say so, rather than let
            the owner believe the number they typed did something. */}
        {cycleCollapsed ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning bg-surface-4 p-3 text-base leading-relaxed text-foreground">
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-warning"
              aria-hidden
            />
            <span>{t("ruleCycleCollapsed", { n: num(rule.cycleDays) })}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Star className="size-5 shrink-0" aria-hidden />
          {t("rulePremiumTitle")}
        </p>
        {rule.sundayPremium === null ? (
          <>
            {/* This sentence asserts a Sunday pays one day's pay, which stops
                being true the moment the owner changes what a Sunday is worth.
                Say it only while it is true; the worth block below always says
                the real figure. */}
            {rule.sundayWorkedPayDays === LEGACY_SUNDAY_WORKED_PAY_DAYS ? (
              <p className="text-base leading-relaxed text-muted-foreground">
                {t("rulePremiumHint")}
              </p>
            ) : (
              <p className="text-base leading-relaxed text-muted-foreground">
                {t("ruleWorthSummary", {
                  sunday: num(rule.sundayWorkedPayDays),
                  earned: num(rule.earnedDayPayDays),
                })}
              </p>
            )}
            {/* "Off" is not the whole truth. `resolveSundayPremiumForEmployee`
                falls through to the factory defaults for anyone paid by output,
                so those workers get extra Sunday pay from Settings whatever this
                rule says — and the sentence explaining that used to be rendered
                only in the ON state, hidden in exactly the state that needs it. */}
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("rulePremiumOffOperators")}
            </p>
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] px-5 py-3 text-base"
                onClick={() =>
                  patch({
                    sundayPremium: {
                      requiredPresentDays: PREMIUM_DEFAULT_DAYS,
                      multiplier: PREMIUM_DEFAULT_TIMES,
                    },
                  })
                }
              >
                <Plus data-icon="inline-start" aria-hidden />
                {t("rulePremiumOn")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={ROW}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="rulePremiumAfter">{t("rulePremiumAfter")}</Label>
                <NumberInput
                  id="rulePremiumAfter"
                  min={0}
                  max={MAX_CYCLE_DAYS}
                  className={FIELD}
                  value={String(rule.sundayPremium.requiredPresentDays)}
                  onChange={(e) =>
                    patch({
                      sundayPremium: {
                        requiredPresentDays: readNumericInput(e.target.value, PREMIUM_DEFAULT_DAYS, {
                          min: 0,
                          max: MAX_CYCLE_DAYS,
                        }),
                        multiplier: rule.sundayPremium?.multiplier ?? PREMIUM_DEFAULT_TIMES,
                      },
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="rulePremiumTimes">{t("rulePremiumTimes")}</Label>
                <NumberInput
                  id="rulePremiumTimes"
                  min={0}
                  max={MAX_PAY_DAY_VALUE}
                  decimal
                  className={FIELD}
                  value={String(rule.sundayPremium.multiplier)}
                  onChange={(e) =>
                    patch({
                      sundayPremium: {
                        requiredPresentDays:
                          rule.sundayPremium?.requiredPresentDays ??
                          PREMIUM_DEFAULT_DAYS,
                        multiplier: readNumericInput(e.target.value, PREMIUM_DEFAULT_TIMES, {
                          min: 0,
                          max: MAX_PAY_DAY_VALUE,
                        }),
                      },
                    })
                  }
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] px-4 py-3 text-base"
                onClick={() => patch({ sundayPremium: null })}
              >
                <X data-icon="inline-start" aria-hidden />
                {t("rulePremiumOff")}
              </Button>
            </div>
            {/* The counter runs over one calendar month and Sundays never add
                to it, so anything past the month's countable days can never
                fire. A bracket one panel away gets this warning; a premium that
                can never pay was printed in the category list without one. */}
            {rule.sundayPremium.requiredPresentDays > monthDays ? (
              <p className="flex items-start gap-2 rounded-lg border border-warning bg-surface-4 p-3 text-base leading-relaxed text-foreground">
                <AlertTriangle
                  className="mt-0.5 size-5 shrink-0 text-warning"
                  aria-hidden
                />
                <span>{t("rulePremiumUnreachable", { n: num(monthDays) })}</span>
              </p>
            ) : null}
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("rulePremiumPrecedence")}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Sun className="size-5 shrink-0" aria-hidden />
          {t("ruleWorthTitle")}
        </p>
        {!worthOpen ? (
          <>
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("ruleWorthHint")}
            </p>
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] px-5 py-3 text-base"
                onClick={() => setWorthOpen(true)}
              >
                <Sun data-icon="inline-start" aria-hidden />
                {t("ruleWorthOpen")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={ROW}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ruleWorthSunday">{t("ruleWorthSunday")}</Label>
                <NumberInput
                  id="ruleWorthSunday"
                  min={0}
                  max={MAX_PAY_DAY_VALUE}
                  decimal
                  className={FIELD}
                  value={String(rule.sundayWorkedPayDays)}
                  onChange={(e) =>
                    patch({
                      sundayWorkedPayDays: readNumericInput(
                        e.target.value,
                        LEGACY_SUNDAY_WORKED_PAY_DAYS,
                        { min: 0, max: MAX_PAY_DAY_VALUE },
                      ),
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ruleWorthEarned">{t("ruleWorthEarned")}</Label>
                <NumberInput
                  id="ruleWorthEarned"
                  min={0}
                  max={MAX_PAY_DAY_VALUE}
                  decimal
                  className={FIELD}
                  value={String(rule.earnedDayPayDays)}
                  onChange={(e) =>
                    patch({
                      earnedDayPayDays: readNumericInput(
                        e.target.value,
                        LEGACY_EARNED_DAY_PAY_DAYS,
                        { min: 0, max: MAX_PAY_DAY_VALUE },
                      ),
                    })
                  }
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] px-4 py-3 text-base"
                onClick={() => {
                  patch({
                    sundayWorkedPayDays: LEGACY_SUNDAY_WORKED_PAY_DAYS,
                    earnedDayPayDays: LEGACY_EARNED_DAY_PAY_DAYS,
                  });
                  setWorthOpen(false);
                }}
              >
                <Undo2 data-icon="inline-start" aria-hidden />
                {t("ruleWorthReset")}
              </Button>
            </div>
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("ruleWorthSundayHint")}
            </p>
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("ruleWorthEarnedHint")}
            </p>
            <p className="text-base leading-relaxed text-foreground">
              {t("ruleWorthSummary", {
                sunday: num(rule.sundayWorkedPayDays),
                earned: num(rule.earnedDayPayDays),
              })}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-3 p-4">
        <p className="text-base font-semibold text-foreground">
          {t("rulePreviewTitle")}
        </p>
        {/* The counts below stop short of the stretch's calendar length because
            the pay engine never counts a Sunday towards them. Saying so is the
            difference between a table the owner can trust and one that pays
            fewer days than it shows. */}
        <p className="text-base leading-relaxed text-muted-foreground">
          {t("rulePreviewSundaysNotCounted", { n: num(windowDays) })}
        </p>
        <p className="text-base leading-relaxed text-foreground">
          {example && example.earned > 0
            ? t("rulePreviewSentence", {
                days: num(example.from),
                earned: num(example.earned),
              })
            : t("rulePreviewNothing")}
        </p>
        {/* The per-stretch table knows nothing about the monthly limit, which
            is applied a long way away in the pay engine. Say the real monthly
            outcome here, or the table promises money nobody will be paid. */}
        <p className="text-base leading-relaxed text-foreground">
          {t("ruleMonthMost", { earned: num(month.earned) })}
        </p>
        {/* The table above counts earned days as the owner typed them. Once an
            earned day is worth something other than one day's pay, the rupees
            differ from that number, so say the pay figure out loud rather than
            let the table imply it. */}
        {rule.earnedDayPayDays !== LEGACY_EARNED_DAY_PAY_DAYS ? (
          <p className="text-base leading-relaxed text-foreground">
            {t("ruleMonthMostMoney", {
              pay: num(month.earned * rule.earnedDayPayDays),
              earned: num(rule.earnedDayPayDays),
            })}
          </p>
        ) : null}
        {/* Surface token rather than a tinted warning background: an alpha
            modifier compiles to color-mix(), which Chrome 109 cannot read. */}
        {cappedRow ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning bg-surface-4 p-3 text-base leading-relaxed text-foreground">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <span>
              {t("ruleCapWarning", {
                days: num(cappedRow.from),
                uncapped: num(cappedRow.uncapped),
                earned: num(cappedRow.earned),
              })}
            </span>
          </p>
        ) : null}
        {month.cappedByMonth ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning bg-surface-4 p-3 text-base leading-relaxed text-foreground">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <span>
              {t("ruleMonthCapWarning", {
                uncapped: num(month.uncapped),
                earned: num(month.earned),
              })}
            </span>
          </p>
        ) : null}
        <div className="w-full overflow-x-auto">
          <table
            className="w-full min-w-[18rem] border-collapse text-base"
            aria-label={t("a11ySundayPreviewLabel")}
          >
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t("rulePreviewColDaysCountable")}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t("rulePreviewColEarned")}
                </th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.from} className="border-t border-border">
                  {/* The day count identifies the row. */}
                  <th
                    scope="row"
                    className="py-2 pr-4 text-left font-normal tabular-nums text-foreground"
                  >
                    {row.from === row.to
                      ? num(row.from)
                      : `${num(row.from)}–${num(row.to)}`}
                  </th>
                  <td className="py-2 tabular-nums text-foreground">
                    {num(row.earned)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** The three named starting points, plus the door to the full editor. */
const PRESET_TEXT: Record<
  SundayRulePresetId,
  { title: MessageKey; body: MessageKey }
> = {
  common: { title: "rulePresetCommon", body: "rulePresetCommonBody" },
  asYouGo: { title: "rulePresetAsYouGo", body: "rulePresetAsYouGoBody" },
  none: { title: "rulePresetNone", body: "rulePresetNoneBody" },
};

/**
 * The first thing an owner writing a new rule sees.
 *
 * Not a simpler rule model — the same {@link SundayRule} comes out of every
 * button here, and "Set it up myself" opens the full editor with nothing taken
 * away. It exists because the full editor asks eleven questions at once, and an
 * owner who cannot answer eleven questions does not answer one: they leave the
 * pre-filled numbers alone and never come back. Three outcomes stated in money
 * and days is a choice this audience can actually make.
 */
function SundayRulePresetChooser({
  selected,
  onPick,
  onCustomise,
  t,
}: {
  selected: SundayRulePresetId | null;
  onPick: (rule: SundayRule) => void;
  onCustomise: () => void;
  t: Translate;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <p id="rulePresetLabel" className="text-sm font-medium text-foreground">
        {t("rulePresetLabel")}
      </p>
      <div
        role="group"
        aria-labelledby="rulePresetLabel"
        className="flex w-full min-w-0 flex-col gap-3"
      >
        {SUNDAY_RULE_PRESETS.map((preset) => {
          const text = PRESET_TEXT[preset.id];
          const isSelected = selected === preset.id;
          return (
            <Button
              key={preset.id}
              type="button"
              variant={isSelected ? "default" : "outline"}
              aria-pressed={isSelected}
              // `h-auto` because the default button height would clip the
              // second line, and the second line is the whole point: the
              // outcome in days and money, not just a name.
              className="h-auto min-h-[44px] w-full min-w-0 flex-col items-start justify-start gap-1 whitespace-normal px-4 py-3 text-left text-base"
              onClick={() => onPick(preset.rule)}
            >
              <span className="flex items-center gap-2 font-semibold">
                {isSelected ? (
                  <Check className="size-5 shrink-0" aria-hidden />
                ) : (
                  <Sun className="size-5 shrink-0" aria-hidden />
                )}
                {t(text.title)}
              </span>
              <span className="w-full min-w-0 text-base font-normal leading-relaxed">
                {t(text.body)}
              </span>
            </Button>
          );
        })}
      </div>
      {/* Nothing is hidden behind this — every number the editor ever offered is
          still here, one press away. */}
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] px-5 py-3 text-base"
          onClick={onCustomise}
        >
          <Pencil data-icon="inline-start" aria-hidden />
          {t("rulePresetCustom")}
        </Button>
      </div>
      <p className="text-base leading-relaxed text-muted-foreground">
        {t("rulePresetCustomHint")}
      </p>
    </div>
  );
}

/**
 * A limit field with an explicit "no limit" state, because `null` must be
 * reachable.
 *
 * The chip states what the limit *is* ("No limit set"); the button always
 * states what pressing it *does* ("Set a limit" / "Remove the limit"). They
 * used to both read "No limit", so the pair said the same words twice and
 * neither read as an action.
 */
function CapField({
  id,
  label,
  value,
  fallback,
  onChange,
  t,
}: {
  id: string;
  label: string;
  value: number | null;
  fallback: number;
  onChange: (next: number | null) => void;
  t: Translate;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        {value === null ? (
          <span className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-3 text-base text-muted-foreground">
            <InfinityIcon className="size-5 shrink-0" aria-hidden />
            {t("ruleNoLimitState")}
          </span>
        ) : (
          <NumberInput
            id={id}
            min={0}
            decimal
            className={FIELD}
            value={String(value)}
            onChange={(e) =>
              onChange(readNumericInput(e.target.value, fallback, { min: 0 }))
            }
          />
        )}
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] px-4 py-3 text-base"
          onClick={() => onChange(value === null ? fallback : null)}
        >
          {value === null ? (
            <Ruler data-icon="inline-start" aria-hidden />
          ) : (
            <InfinityIcon data-icon="inline-start" aria-hidden />
          )}
          {value === null ? t("ruleSetLimit") : t("ruleNoLimitSet")}
        </Button>
      </div>
    </div>
  );
}

/**
 * One line of plain language describing a rule, for the category list.
 *
 * Says the limits out loud as part of the sentence. The old list showed only
 * "12 present days → 2 Sundays" while the engine quietly enforced a cap the
 * owner had never seen; a rule's description now includes everything that can
 * change what it pays.
 */
export function describeSundayRule(rule: SundayRule, t: Translate): string {
  const parts: string[] = [];

  if (rule.kind === "repeat") {
    parts.push(
      rule.repeatEveryPresentDays > 0 && rule.repeatGive > 0
        ? t("ruleSummaryRepeat", {
            every: num(rule.repeatEveryPresentDays),
            give: num(rule.repeatGive),
          })
        : t("ruleSummaryNothing"),
    );
  } else if (rule.brackets.length === 0) {
    parts.push(t("ruleSummaryNothing"));
  } else {
    parts.push(
      rule.brackets
        .map((b) =>
          t("ruleSummaryBracket", {
            days: num(b.whenPresentDaysAtLeast),
            give: num(b.give),
          }),
        )
        .join("; "),
    );
    if (rule.bracketMode === "each" && rule.brackets.length > 1) {
      parts.push(t("ruleSummaryBracketEach"));
    }
  }

  parts.push(t("ruleSummaryCycle", { n: num(rule.cycleDays) }));
  // Only the non-default answer earns a clause; saying "the last stretch is
  // longer" on every rule would bury the lines that matter.
  if (rule.cycleRemainder === "separate") {
    parts.push(t("ruleSummaryLeftoverSeparate"));
  }
  // Only when it is not the ordinary one-day-per-day, so the common rule's
  // one-liner does not grow a clause that says nothing.
  if (
    rule.sundayWorkedPayDays !== LEGACY_SUNDAY_WORKED_PAY_DAYS ||
    rule.earnedDayPayDays !== LEGACY_EARNED_DAY_PAY_DAYS
  ) {
    parts.push(
      t("ruleSummaryWorth", {
        sunday: num(rule.sundayWorkedPayDays),
        earned: num(rule.earnedDayPayDays),
      }),
    );
  }
  parts.push(
    rule.maxPerCycle === null && rule.maxPerMonth === null
      ? t("ruleSummaryNoLimits")
      : t("ruleSummaryLimits", {
          cycle: rule.maxPerCycle === null ? t("ruleNoLimit") : num(rule.maxPerCycle),
          month: rule.maxPerMonth === null ? t("ruleNoLimit") : num(rule.maxPerMonth),
        }),
  );
  if (rule.sundayPremium) {
    parts.push(
      t("ruleSummaryPremium", {
        days: num(rule.sundayPremium.requiredPresentDays),
        times: num(rule.sundayPremium.multiplier),
      }),
    );
  }
  return parts.join(" · ");
}
