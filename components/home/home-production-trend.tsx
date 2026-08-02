"use client";

import { useId, useState } from "react";
import { Factory, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { HomeCard } from "@/components/home/home-card";
import { buildTrendGeometry, type HomeProductionTrend } from "@/lib/utils/homeDashboard";
import { formatDisplayDate } from "@/lib/utils/date";
import { number } from "@/lib/utils/formatter";

/**
 * The question: **is the work going up or down?**
 *
 * One series, so there is no legend to read — the title says what is plotted.
 * The shape is the point: an operator who cannot read a chart still gets the
 * whole answer from the hero number and the three sentences under it, which
 * are the chart's text equivalent and not a caption.
 *
 * No `<text>` lives inside the SVG: the plot is stretched with
 * `preserveAspectRatio="none"` so it stays fluid from 320px up, and stretched
 * glyphs are unreadable. Day captions are HTML underneath instead, and the
 * line keeps its 2px weight through `vector-effect="non-scaling-stroke"`.
 */

const VIEW_W = 320;
const VIEW_H = 96;
/** The plot stops just short of the right edge so the "today" rule is not
 *  half-clipped by the viewport boundary. */
const PLOT_W = VIEW_W - 3;

/** "14 Mar 2026" → "14 Mar" — the year is noise on a two-week window. */
function shortDay(iso: string, locale: "en" | "hi"): string {
  return formatDisplayDate(iso, locale).split(" ").slice(0, 2).join(" ");
}

export interface HomeProductionTrendCardProps {
  /** Built by `buildProductionTrend`. `null` while the data is still loading. */
  trend: HomeProductionTrend | null;
  className?: string;
}

export function HomeProductionTrendCard({
  trend,
  className,
}: HomeProductionTrendCardProps) {
  const { t, locale } = useLanguage();
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const days = trend?.points.length ?? 0;

  const shell = {
    title: t("homeTrendTitle"),
    subtitle: days > 0 ? t("homeTrendSubtitle", { days: number(days) }) : undefined,
    icon: Factory,
    href: "/production",
    linkLabel: t("homeTrendGo"),
    className,
  };

  if (!trend) {
    return <HomeCard {...shell} loading />;
  }

  if (!trend.hasData) {
    return (
      <HomeCard
        {...shell}
        empty={{ title: t("homeTrendEmpty"), hint: t("homeTrendEmptyHint") }}
      />
    );
  }

  const values = trend.points.map((p) => p.total);
  const geo = buildTrendGeometry(values, PLOT_W, VIEW_H, trend.max);
  const last = geo.coords[geo.coords.length - 1];

  const DirectionIcon =
    trend.direction === "up"
      ? TrendingUp
      : trend.direction === "down"
        ? TrendingDown
        : Minus;
  const directionText =
    trend.direction === "up"
      ? t("homeTrendUp", { count: number(trend.priorTotal) })
      : trend.direction === "down"
        ? t("homeTrendDown", { count: number(trend.priorTotal) })
        : t("homeTrendSame");

  const totalText = t("homeTrendTotal", {
    count: number(trend.total),
    days: number(days),
  });
  const bestText =
    trend.bestIndex >= 0
      ? t("homeTrendBest", {
          date: shortDay(trend.points[trend.bestIndex].date, locale),
          count: number(trend.max),
        })
      : null;

  const headline = t("homeTrendLatest", { count: number(trend.latestTotal) });
  const hovered = hover !== null ? trend.points[hover] : null;

  return (
    <HomeCard {...shell}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-heading text-4xl font-bold leading-none tracking-tight text-foreground sm:text-5xl">
          {number(trend.latestTotal)}
        </span>
        <span className="flex items-center gap-2 text-base text-muted-foreground">
          <DirectionIcon className="size-5 shrink-0" aria-hidden />
          <span className="min-w-0">{directionText}</span>
        </span>
      </div>

      <div className="min-w-0">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="block h-24 w-full"
          role="img"
          aria-label={`${headline}. ${directionText} ${totalText}`}
        >
          <defs>
            <linearGradient id={`${gradId}-wash`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <line
            x1="0"
            y1={VIEW_H}
            x2={VIEW_W}
            y2={VIEW_H}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          <path d={geo.area} fill={`url(#${gradId}-wash)`} />
          <path
            d={geo.line}
            fill="none"
            stroke="var(--chart-2)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Hit targets: one full-height band per day, so a fingertip lands
              on the day rather than having to find the line itself. */}
          {geo.coords.map((_c, i) => {
            const bandW = VIEW_W / Math.max(1, geo.coords.length);
            return (
              <rect
                key={trend.points[i].date}
                x={bandW * i}
                y={0}
                width={bandW}
                height={VIEW_H}
                fill={hover === i ? "var(--muted)" : "transparent"}
                fillOpacity={hover === i ? 0.7 : 0}
                tabIndex={0}
                role="button"
                aria-label={`${shortDay(trend.points[i].date, locale)}: ${number(values[i])}`}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
              />
            );
          })}

          {/* "Today" marker. A circle is impossible here — the plot is
              stretched horizontally to fill the card, which would squash a
              round dot into an oval; a vertical rule keeps its 2px weight
              through `vector-effect` and distorts not at all. */}
          {last ? (
            <line
              x1={last.x}
              y1={last.y}
              x2={last.x}
              y2={VIEW_H}
              stroke="var(--chart-2)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>

        <div className="mt-1 flex min-w-0 items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {shortDay(trend.points[0].date, locale)}
          </span>
          <span className="min-w-0 truncate">
            {shortDay(trend.points[trend.points.length - 1].date, locale)}
          </span>
        </div>
      </div>

      {hovered ? (
        <p className="text-sm font-medium tabular-nums text-foreground" aria-live="polite">
          {shortDay(hovered.date, locale)} — {number(hovered.total)}
        </p>
      ) : null}

      {/* Text equivalent: everything the line says, in words. */}
      <div className="flex min-w-0 flex-col gap-0.5 text-sm text-muted-foreground">
        <p>{totalText}</p>
        {bestText ? <p>{bestText}</p> : null}
      </div>
    </HomeCard>
  );
}
