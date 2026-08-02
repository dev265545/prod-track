"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Dependency-free, theme-aware inline SVG/CSS chart primitives for the
 * inventory analytics dashboard. Palette: category colors are reused from
 * CATEGORY_THEME (identity); GREEN/AMBER/RED are reserved for stock health
 * status only; the movement trend uses a neutral + single accent pair.
 */

/* ---------------------------------------------------------------------- */
/* Donut: stock health (OK / LOW / OUT)                                   */
/* ---------------------------------------------------------------------- */

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  colorClassName: string; // stroke-* tailwind class
}

export function HealthDonut({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: number | string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const size = 160;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const frac = total > 0 ? seg.value / total : 0;
    const len = frac * circumference;
    const gap = total > 0 && frac > 0 ? 2 : 0; // 2px surface gap between segments
    const dasharray = `${Math.max(len - gap, 0)} ${circumference - Math.max(len - gap, 0)}`;
    const dashoffset = -offset;
    offset += len;
    return { ...seg, dasharray, dashoffset, frac };
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${centerLabel}: ${centerValue}`}
        className="shrink-0 -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        {arcs.map((a) =>
          a.value > 0 ? (
            <circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
              strokeLinecap="butt"
              className={cn("transition-[stroke-dasharray] duration-700 ease-out", a.colorClassName)}
            />
          ) : null,
        )}
      </svg>
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-baseline gap-2 sm:hidden">
          <span className="text-2xl font-extrabold tabular-nums">{centerValue}</span>
          <span className="text-xs text-muted-foreground">{centerLabel}</span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-4 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span
                  className={cn("size-2.5 shrink-0 rounded-full", s.colorClassName.replace("stroke-", "bg-"))}
                  aria-hidden
                />
                {s.label}
              </span>
              <span className="font-semibold tabular-nums">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Horizontal bar chart: stock by category                                */
/* ---------------------------------------------------------------------- */

export interface HBarDatum {
  key: string;
  label: string;
  value: number;
  colorClassName: string; // bg-* tailwind class
}

export function HorizontalBarChart({ data }: { data: HBarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="flex flex-col gap-3">
      {data.map((d, i) => (
        <li key={d.key} className="flex items-center gap-3">
          <span className="w-20 shrink-0 truncate text-sm text-muted-foreground sm:w-24">
            {d.label}
          </span>
          <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted/50">
            <div
              className={cn("h-full rounded-md transition-[width] duration-700 ease-out", d.colorClassName)}
              style={{
                width: `${(d.value / max) * 100}%`,
                animationDelay: `${i * 40}ms`,
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
            {d.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------- */
/* Grouped bar chart: inward vs outward over time, with hover tooltip     */
/* ---------------------------------------------------------------------- */

export interface TrendPoint {
  date: string; // ISO yyyy-mm-dd
  dayLabel: string; // short label e.g. "Jul 12"
  inward: number;
  outward: number;
}

export function MovementTrendChart({
  points,
  inwardLabel,
  outwardLabel,
}: {
  points: TrendPoint[];
  inwardLabel: string;
  outwardLabel: string;
}) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => Math.max(p.inward, p.outward)));
  const width = Math.max(320, points.length * 28);
  const height = 160;
  const padBottom = 22;
  const plotH = height - padBottom;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[var(--chart-2)]" aria-hidden />
          {inwardLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/50" aria-hidden />
          {outwardLabel}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="min-w-full"
          role="img"
          aria-label={`${inwardLabel} vs ${outwardLabel} trend`}
        >
          <defs>
            <linearGradient id={`${gradId}-in`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          {/* baseline */}
          <line
            x1={0}
            y1={plotH}
            x2={width}
            y2={plotH}
            className="stroke-border"
            strokeWidth={1}
          />
          {points.map((p, i) => {
            const slot = width / points.length;
            const barW = Math.min(9, slot * 0.32);
            const cx = slot * i + slot / 2;
            const inH = (p.inward / max) * (plotH - 8);
            const outH = (p.outward / max) * (plotH - 8);
            const isHover = hover === i;
            return (
              <g
                key={p.date}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                tabIndex={0}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
                className="cursor-pointer outline-none"
              >
                <rect x={cx - barW - 1} y={plotH - inH} width={barW} height={inH} rx={2}
                  fill={`url(#${gradId}-in)`}
                  opacity={isHover ? 1 : 0.9}
                />
                <rect x={cx + 1} y={plotH - outH} width={barW} height={outH} rx={2}
                  className="fill-muted-foreground/50"
                  opacity={isHover ? 1 : 0.85}
                />
                {isHover && (
                  <rect x={cx - slot / 2} y={0} width={slot} height={plotH}
                    className="fill-foreground/5" />
                )}
                {(i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 6) === 0) && (
                  <text
                    x={cx}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px]"
                  >
                    {p.dayLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {hover !== null && points[hover] && (
        <div className="flex w-fit items-center gap-3 rounded-lg border border-border bg-popover px-3 py-1.5 text-xs shadow-sm">
          <span className="font-semibold">{points[hover].dayLabel}</span>
          <span className="text-[var(--chart-2)]">
            {inwardLabel}: <span className="font-semibold tabular-nums">{points[hover].inward}</span>
          </span>
          <span className="text-muted-foreground">
            {outwardLabel}: <span className="font-semibold tabular-nums">{points[hover].outward}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Deficit / progress bar used in the low-stock leaderboard                */
/* ---------------------------------------------------------------------- */

export function StockDeficitBar({
  current,
  threshold,
}: {
  current: number;
  threshold: number;
}) {
  const pct = threshold > 0 ? Math.max(0, Math.min(1, current / threshold)) : current > 0 ? 1 : 0;
  const tone = current <= 0 ? "bg-destructive" : "bg-warning";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-muted sm:w-28">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", tone)}
          style={{ width: `${Math.max(pct * 100, current > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {current}/{threshold}
      </span>
    </div>
  );
}
