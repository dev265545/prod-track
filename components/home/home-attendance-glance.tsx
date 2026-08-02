"use client";

import { CalendarCheck } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { HomeCard } from "@/components/home/home-card";
import {
  buildAttendanceSplit,
  type HomeAttendanceKey,
  type HomeRosterSummary,
} from "@/lib/utils/homeDashboard";
import { number } from "@/lib/utils/formatter";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * The question: **did anyone not get marked today?**
 *
 * A part-to-whole bar rather than a donut: three groups, and the one that
 * matters ("not written yet") is a remainder, which a bar shows as the piece
 * still to be filled. Present is `success` and unwritten is `warning` because
 * both are genuine states here — unwritten attendance is work outstanding,
 * not decoration. "Did not come" wears neutral ink: an absence is a fact, not
 * a fault, and colouring it red would read as an accusation.
 *
 * Segments are separated by a 2px gap in the card colour, never by a stroke.
 */

const SEGMENT_META: Record<
  HomeAttendanceKey,
  { labelKey: MessageKey; fill: string }
> = {
  present: { labelKey: "homeAttPresent", fill: "bg-success" },
  absent: { labelKey: "homeAttAbsent", fill: "bg-muted-foreground" },
  unmarked: { labelKey: "homeAttUnmarked", fill: "bg-warning" },
};

export interface HomeAttendanceGlanceProps {
  /** Exactly what `summarizeRoster` returns. `null` while loading. */
  summary: HomeRosterSummary | null;
  className?: string;
}

export function HomeAttendanceGlance({
  summary,
  className,
}: HomeAttendanceGlanceProps) {
  const { t } = useLanguage();

  const shell = {
    title: t("homeAttTitle"),
    icon: CalendarCheck,
    href: "/attendance",
    linkLabel: t("homeAttGo"),
    className,
  };

  if (!summary) return <HomeCard {...shell} loading />;

  const split = buildAttendanceSplit(summary);

  if (split.status === "empty") {
    return (
      <HomeCard
        {...shell}
        empty={{ title: t("homeAttEmpty"), hint: t("homeAttEmptyHint") }}
      />
    );
  }

  const headline = t("homeAttWritten", {
    marked: number(split.marked),
    total: number(split.total),
  });
  const sentence =
    split.unmarked > 0
      ? t("homeAttRemaining", { count: number(split.unmarked) })
      : t("homeAttAllDone");

  const visible = split.segments.filter((s) => s.percent > 0);

  return (
    <HomeCard {...shell}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-heading text-4xl font-bold leading-none tracking-tight text-foreground sm:text-5xl">
          {number(split.marked)}
          <span className="text-2xl font-semibold text-muted-foreground sm:text-3xl">
            {" / "}
            {number(split.total)}
          </span>
        </span>
        <span className="text-base text-muted-foreground">{headline}</span>
      </div>

      {/* The bar. Identity is never colour alone — the list below repeats every
          group as a word and a number. */}
      <div
        className="flex h-4 w-full min-w-0 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${headline}. ${sentence}`}
      >
        {visible.map((seg, i) => (
          <span
            key={seg.key}
            className={SEGMENT_META[seg.key].fill}
            style={{
              width: `${seg.percent}%`,
              marginLeft: i === 0 ? undefined : "2px",
            }}
          />
        ))}
      </div>

      <ul className="flex min-w-0 flex-col gap-1.5">
        {split.segments.map((seg) => (
          <li
            key={seg.key}
            className="flex min-w-0 items-center justify-between gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span
                className={`size-2.5 shrink-0 rounded-full ${SEGMENT_META[seg.key].fill}`}
                aria-hidden
              />
              <span className="min-w-0 truncate">
                {t(SEGMENT_META[seg.key].labelKey)}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {number(seg.value)}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">{sentence}</p>
    </HomeCard>
  );
}
