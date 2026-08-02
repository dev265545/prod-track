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

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { readNumericInput } from "@/lib/utils/numericInput";
import {
  evaluateSundayRuleForCycle,
  normalizeSundayRule,
  type SundayRule,
} from "@/lib/utils/sundayRule";
import {
  AlertTriangle,
  Infinity as InfinityIcon,
  ListOrdered,
  Plus,
  Repeat,
  Ruler,
  Star,
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

/**
 * The preview rows: every present-day count from 0 to the cycle length, with
 * runs that pay the same amount collapsed into one line. Short enough to read
 * at a glance and complete enough that nothing is hidden.
 */
export function buildSundayRulePreview(
  rule: SundayRule,
): { from: number; to: number; earned: number; uncapped: number }[] {
  const max = Math.max(1, Math.min(rule.cycleDays, 31));
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
}: {
  value: SundayRule;
  onChange: (next: SundayRule) => void;
  t: Translate;
}) {
  const rule = value;
  const preview = useMemo(() => buildSundayRulePreview(rule), [rule]);
  const cappedRow = preview.find((row) => row.uncapped > row.earned);
  // The best-paying row is the one worth reading aloud as the worked example.
  const example = preview.reduce(
    (best, row) => (row.earned > best.earned ? row : best),
    preview[0],
  );

  const patch = (next: Partial<SundayRule>) =>
    onChange(normalizeSundayRule({ ...rule, ...next }));

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
        <Label>{t("ruleTypeLabel")}</Label>
        <div className="flex flex-wrap gap-3">
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
      </div>

      {rule.kind === "table" ? (
        <div className="flex flex-col gap-3">
          {rule.brackets.length === 0 ? (
            <p className="text-base text-muted-foreground">{t("ruleTableEmpty")}</p>
          ) : (
            rule.brackets.map((bracket, index) => (
              <div key={index} className={ROW}>
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
              max={31}
              className={FIELD}
              value={String(rule.cycleDays)}
              onChange={(e) =>
                patch({ cycleDays: readNumericInput(e.target.value, 15, { min: 1, max: 31 }) })
              }
            />
          </div>
          <CapField
            id="ruleMaxPerCycle"
            label={t("ruleMaxPerCycle")}
            value={rule.maxPerCycle}
            fallback={2}
            onChange={(next) => patch({ maxPerCycle: next })}
            t={t}
          />
          <CapField
            id="ruleMaxPerMonth"
            label={t("ruleMaxPerMonth")}
            value={rule.maxPerMonth}
            fallback={4}
            onChange={(next) => patch({ maxPerMonth: next })}
            t={t}
          />
        </div>
        <p className="text-base leading-relaxed text-muted-foreground">
          {t("ruleCycleExplain", { n: num(rule.cycleDays) })}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Star className="size-5 shrink-0" aria-hidden />
          {t("rulePremiumTitle")}
        </p>
        {rule.sundayPremium === null ? (
          <>
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("rulePremiumHint")}
            </p>
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] px-5 py-3 text-base"
                onClick={() =>
                  patch({ sundayPremium: { requiredPresentDays: 26, multiplier: 1.2 } })
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
                  max={31}
                  className={FIELD}
                  value={String(rule.sundayPremium.requiredPresentDays)}
                  onChange={(e) =>
                    patch({
                      sundayPremium: {
                        requiredPresentDays: readNumericInput(e.target.value, 26, {
                          min: 0,
                          max: 31,
                        }),
                        multiplier: rule.sundayPremium?.multiplier ?? 1.2,
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
                  max={10}
                  decimal
                  className={FIELD}
                  value={String(rule.sundayPremium.multiplier)}
                  onChange={(e) =>
                    patch({
                      sundayPremium: {
                        requiredPresentDays:
                          rule.sundayPremium?.requiredPresentDays ?? 26,
                        multiplier: readNumericInput(e.target.value, 1.2, {
                          min: 0,
                          max: 10,
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
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("rulePremiumPrecedence")}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-3 p-4">
        <p className="text-base font-semibold text-foreground">
          {t("rulePreviewTitle")}
        </p>
        <p className="text-base leading-relaxed text-foreground">
          {example && example.earned > 0
            ? t("rulePreviewSentence", {
                days: num(example.from),
                earned: num(example.earned),
              })
            : t("rulePreviewNothing")}
        </p>
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
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[18rem] border-collapse text-base">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t("rulePreviewColDays")}</th>
                <th className="py-2 font-medium">{t("rulePreviewColEarned")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.from} className="border-t border-border">
                  <td className="py-2 pr-4 tabular-nums text-foreground">
                    {row.from === row.to
                      ? num(row.from)
                      : `${num(row.from)}–${num(row.to)}`}
                  </td>
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

/** A limit field with an explicit "no limit" state, because `null` must be reachable. */
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
            {t("ruleNoLimit")}
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
  }

  parts.push(t("ruleSummaryCycle", { n: num(rule.cycleDays) }));
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
