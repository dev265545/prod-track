"use client";

/**
 * Plain-language editor for the per-day pay limit.
 *
 * The limit used to be the constant `MAX_DAY_PAY_FRACTION = 2` inside
 * `date.ts`. Somebody who did an eight-hour shift plus ten hours extra had
 * earned 2.25 days by the app's own arithmetic and was paid 2, and nothing
 * anywhere said a number had been reduced. This is the same treatment the
 * Sunday rule got: the limit becomes data with a reachable "no limit", and the
 * editor shows a worked example so the owner can see what the number they typed
 * actually does — including when it is holding a day's pay down.
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { readNumericInput } from "@/lib/utils/numericInput";
import {
  DEFAULT_MAX_DAY_PAY_FRACTION,
  MIN_DAY_PAY_CAP,
  dayPayCapValue,
  type DayPayCap,
} from "@/lib/utils/date";
import { AlertTriangle, Infinity as InfinityIcon, Ruler } from "lucide-react";

import type { MessageKey } from "@/lib/i18n/messages";

type Translate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

const FIELD = "min-h-[44px] w-28";

function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Hours of extra work worth showing. Spans a full second shift and beyond. */
const PREVIEW_EXTRA_HOURS = [0, 2, 4, 6, 8, 10, 12];

export interface DayPayCapPreviewRow {
  extraHours: number;
  /** Days the formula produces before the limit. */
  uncapped: number;
  /** Days actually paid. */
  paid: number;
  capped: boolean;
}

/**
 * What a shift of `hoursPerDay` earns for a range of extra hours, under `cap`.
 *
 * Mirrors `computeDayPayFraction` rather than calling it, on purpose: this is a
 * teaching table for a specific illustrative shift length, not a pay
 * calculation, and it must keep working if the engine ever grows an input this
 * preview has no value for.
 */
export function buildDayPayCapPreview(
  cap: DayPayCap,
  hoursPerDay: number,
): DayPayCapPreviewRow[] {
  const limit = dayPayCapValue(cap);
  const hours = hoursPerDay > 0 ? hoursPerDay : 8;
  return PREVIEW_EXTRA_HOURS.map((extraHours) => {
    const uncapped = 1 + extraHours / hours;
    const paid = Math.min(uncapped, limit);
    return { extraHours, uncapped, paid, capped: paid < uncapped };
  });
}

export function DayPayCapEditor({
  value,
  onChange,
  exampleHoursPerDay = 8,
  t,
}: {
  value: DayPayCap;
  onChange: (next: DayPayCap) => void;
  /** Shift length the worked example is written against. */
  exampleHoursPerDay?: number;
  t: Translate;
}) {
  const hours = exampleHoursPerDay > 0 ? exampleHoursPerDay : 8;
  const preview = useMemo(
    () => buildDayPayCapPreview(value, hours),
    [value, hours],
  );
  // A full extra shift is the example everybody recognises: work your day
  // twice over and see what it pays.
  const example =
    preview.find((row) => row.extraHours === hours) ??
    preview[preview.length - 1];
  const firstCapped = preview.find((row) => row.capped);

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Ruler className="size-5 shrink-0" aria-hidden />
          {t("capLimitTitle")}
        </p>
        <p className="text-base leading-relaxed text-muted-foreground">
          {t("capLimitHint")}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dayPayCapValue">{t("capLimitLabel")}</Label>
            {value === null ? (
              <span className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-3 text-base text-muted-foreground">
                <InfinityIcon className="size-5 shrink-0" aria-hidden />
                {t("capNoLimit")}
              </span>
            ) : (
              <NumberInput
                id="dayPayCapValue"
                min={MIN_DAY_PAY_CAP}
                max={24}
                decimal
                className={FIELD}
                value={String(value)}
                onChange={(e) =>
                  onChange(
                    readNumericInput(
                      e.target.value,
                      DEFAULT_MAX_DAY_PAY_FRACTION,
                      { min: MIN_DAY_PAY_CAP, max: 24 },
                    ),
                  )
                }
              />
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] px-5 py-3 text-base"
            onClick={() =>
              onChange(value === null ? DEFAULT_MAX_DAY_PAY_FRACTION : null)
            }
          >
            {value === null ? (
              <Ruler data-icon="inline-start" aria-hidden />
            ) : (
              <InfinityIcon data-icon="inline-start" aria-hidden />
            )}
            {value === null ? t("capSetLimit") : t("capNoLimitSet")}
          </Button>
        </div>
        {/* Why the box will not go below 1, said before it is tried rather
            than after. */}
        <p className="text-base leading-relaxed text-muted-foreground">
          {t("capMinimumExplain")}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-3 p-4">
        <p className="text-base font-semibold text-foreground">
          {t("capPreviewTitle")}
        </p>
        <p className="text-base leading-relaxed text-foreground">
          {t("capPreviewSentence", {
            extra: num(example.extraHours),
            hours: num(hours),
            days: num(example.paid),
          })}
        </p>
        {/* Surface token rather than a tinted warning background: an alpha
            modifier compiles to color-mix(), which Chrome 109 cannot read. */}
        {firstCapped ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning bg-surface-4 p-3 text-base leading-relaxed text-foreground">
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-warning"
              aria-hidden
            />
            <span>
              {t("capWarning", {
                extra: num(firstCapped.extraHours),
                hours: num(hours),
                uncapped: num(firstCapped.uncapped),
                paid: num(firstCapped.paid),
              })}
            </span>
          </p>
        ) : (
          <p className="text-base leading-relaxed text-muted-foreground">
            {t("capNoClipping")}
          </p>
        )}
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[18rem] border-collapse text-base">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t("capColExtra")}</th>
                <th className="py-2 font-medium">{t("capColPaid")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.extraHours} className="border-t border-border">
                  <td className="py-2 pr-4 tabular-nums text-foreground">
                    {num(row.extraHours)}
                  </td>
                  <td className="py-2 tabular-nums text-foreground">
                    {row.capped
                      ? t("capColPaidClipped", {
                          paid: num(row.paid),
                          uncapped: num(row.uncapped),
                        })
                      : num(row.paid)}
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

/** One line of plain language describing the limit, for a summary row. */
export function describeDayPayCap(cap: DayPayCap, t: Translate): string {
  return cap === null
    ? t("capSummaryNoLimit")
    : t("capSummaryLimit", { days: num(cap) });
}
