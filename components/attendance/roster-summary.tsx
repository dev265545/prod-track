"use client";

import { Check, CircleDashed, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { RosterSummary } from "@/lib/utils/attendanceRoster";

/**
 * The one line that answers "am I finished?".
 *
 * "Still to write" is given the same weight as the two answers, because an
 * unmarked person is not a neutral state — it is remaining work, and on payday
 * it silently reads as an absence.
 */

const TILES: {
  key: keyof RosterSummary;
  labelKey: MessageKey;
  icon: typeof Check;
  valueClass: string;
}[] = [
  {
    key: "present",
    labelKey: "rostCountHere",
    icon: Check,
    valueClass: "text-success",
  },
  {
    key: "absent",
    labelKey: "rostCountAway",
    icon: X,
    valueClass: "text-destructive",
  },
  {
    key: "unmarked",
    labelKey: "rostCountLeft",
    icon: CircleDashed,
    valueClass: "text-foreground",
  },
];

export function RosterSummaryBar({ summary }: { summary: RosterSummary }) {
  const { t } = useLanguage();
  const done = summary.unmarked === 0 && summary.total > 0;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p
          className="font-heading text-lg font-semibold text-foreground"
          aria-live="polite"
        >
          {done
            ? t("rostProgressDone", { total: summary.total })
            : t("rostProgress", {
                done: summary.marked,
                total: summary.total,
              })}
        </p>
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {summary.percent}%
        </p>
      </div>

      {/* Plain two-element bar: no gradients, no color-mix — Chrome 109 safe. */}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label={t("a11yProgressLabel")}
        aria-valuenow={summary.marked}
        aria-valuemin={0}
        aria-valuemax={summary.total}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            done ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${summary.percent}%` }}
        />
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.key}
              className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-surface-2 px-3 py-2"
            >
              <dt className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{t(tile.labelKey)}</span>
              </dt>
              <dd
                className={cn(
                  "font-heading text-2xl font-bold tabular-nums leading-none",
                  tile.valueClass,
                )}
              >
                {summary[tile.key]}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
