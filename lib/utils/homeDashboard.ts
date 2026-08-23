/**
 * ProdTrack Lite — data shaping for the home dashboard.
 *
 * Everything here is pure: the dashboard components render what these
 * functions return and hold no derivation logic of their own, so the
 * interesting cases (no data at all, one day of data, a gap in the middle,
 * a run of genuine zeroes) are testable without a React harness.
 *
 * The audience is an operator who reads numbers, not charts, so each shape
 * carries the *sentence* alongside the series: `direction` and `latestTotal`
 * exist so the trend card can say "more than yesterday" without the caller
 * re-deriving it, and `hasData` distinguishes "a new factory has written
 * nothing yet" from "we genuinely made zero" — those must not look alike.
 */

import { stockStatus, type StockStatus } from "@/components/inventory/shared";
import { getDatesInRange, toISODate } from "@/lib/utils/date";

/* ---------------------------------------------------------------------- */
/* The window the dashboard reads                                         */
/* ---------------------------------------------------------------------- */

export interface HomeTrendWindow {
  /** ISO yyyy-mm-dd, inclusive — hand straight to `getProductionsInRange`. */
  from: string;
  to: string;
  /** Every date from `from` through `to`, which drives the chart's spacing. */
  dates: string[];
}

/**
 * The last `days` calendar days ending on (and including) `endDate`.
 *
 * The window is computed once and shared by the query and the chart so the two
 * cannot disagree: fetching a range and then plotting a differently-derived
 * list of dates is how a day silently falls off the end of a line. Midday is
 * used for the arithmetic (as `getDatesInRange` does) so a DST shift cannot
 * push a date onto its neighbour.
 */
export function buildTrendWindow(endDate: string, days: number): HomeTrendWindow {
  const span = Math.max(1, Math.floor(days));
  const start = new Date(endDate + "T12:00:00");
  start.setDate(start.getDate() - (span - 1));
  const from = toISODate(start);
  return { from, to: endDate, dates: getDatesInRange(from, endDate) };
}

/* ---------------------------------------------------------------------- */
/* Production trend                                                       */
/* ---------------------------------------------------------------------- */

/** A stored production row, narrowed to the fields the trend reads. */
export interface HomeProductionRecord {
  date?: unknown;
  quantity?: unknown;
  shift?: unknown;
}

export interface HomeTrendPoint {
  /** ISO yyyy-mm-dd. */
  date: string;
  total: number;
  day: number;
  night: number;
}

export type HomeTrendDirection = "up" | "down" | "same";

export interface HomeProductionTrend {
  /** One point per requested date, in the order given — gaps included as 0. */
  points: HomeTrendPoint[];
  /** Sum across the whole window. */
  total: number;
  /** Largest single-day total; 0 when nothing was made. */
  max: number;
  /** The last day in the window. */
  latestTotal: number;
  /** The day before the last; 0 for a one-day window. */
  priorTotal: number;
  /** `latestTotal` against `priorTotal` — the sentence the card leads with. */
  direction: HomeTrendDirection;
  /**
   * True when at least one production row landed in the window. A window of
   * genuine zeroes is `hasData: false` only if nothing was written at all,
   * so an empty state never masquerades as "we made nothing".
   */
  hasData: boolean;
  /** Index of the best day, or -1 when nothing was made. */
  bestIndex: number;
}

function toFiniteNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Bucket production rows into one point per date in `dates`.
 *
 * `dates` drives the shape, not the data: a date nobody worked still gets a
 * zero point so the line keeps its true spacing, and a row outside the window
 * (or with no date) is dropped rather than folded into an edge bucket.
 */
export function buildProductionTrend(
  productions: HomeProductionRecord[],
  dates: string[],
): HomeProductionTrend {
  const byDate = new Map<string, HomeTrendPoint>();
  for (const date of dates) {
    byDate.set(date, { date, total: 0, day: 0, night: 0 });
  }

  let rowsInWindow = 0;
  for (const row of productions) {
    const date = typeof row.date === "string" ? row.date : null;
    if (!date) continue;
    const point = byDate.get(date);
    if (!point) continue;
    rowsInWindow += 1;
    const qty = toFiniteNumber(row.quantity);
    point.total += qty;
    if (row.shift === "night") point.night += qty;
    else point.day += qty;
  }

  const points = dates.map((d) => byDate.get(d) as HomeTrendPoint);

  let total = 0;
  let max = 0;
  let bestIndex = -1;
  points.forEach((p, i) => {
    total += p.total;
    if (p.total > max) {
      max = p.total;
      bestIndex = i;
    }
  });

  const latestTotal = points.length > 0 ? points[points.length - 1].total : 0;
  const priorTotal = points.length > 1 ? points[points.length - 2].total : 0;
  const direction: HomeTrendDirection =
    latestTotal > priorTotal ? "up" : latestTotal < priorTotal ? "down" : "same";

  return {
    points,
    total,
    max,
    latestTotal,
    priorTotal,
    direction,
    hasData: rowsInWindow > 0,
    bestIndex,
  };
}

/* ---------------------------------------------------------------------- */
/* Stock health                                                           */
/* ---------------------------------------------------------------------- */

/** A stock level row, narrowed to what the health count reads. */
export interface HomeStockRecord {
  currentStock: number;
  lowStockThreshold: number;
}

export interface HomeStockHealth {
  total: number;
  ok: number;
  low: number;
  out: number;
  /** low + out — the count the "go fix it" link is sized by. */
  needsAttention: number;
  /** The single worst state present, or `null` for an empty store. */
  worst: StockStatus | null;
}

/**
 * Count items by stock state, using the *same* `stockStatus` the inventory
 * screens use. Importing it rather than re-implementing the comparison is the
 * point: a threshold rule that drifts between two screens is a bug the
 * operator experiences as the app lying to them.
 */
export function summarizeStockHealth(
  levels: HomeStockRecord[],
): HomeStockHealth {
  let ok = 0;
  let low = 0;
  let out = 0;
  for (const level of levels) {
    const status = stockStatus(level.currentStock, level.lowStockThreshold);
    if (status === "out") out += 1;
    else if (status === "low") low += 1;
    else ok += 1;
  }
  return {
    total: levels.length,
    ok,
    low,
    out,
    needsAttention: low + out,
    worst: out > 0 ? "out" : low > 0 ? "low" : ok > 0 ? "ok" : null,
  };
}

/* ---------------------------------------------------------------------- */
/* Attendance split                                                       */
/* ---------------------------------------------------------------------- */

/** The shape `summarizeRoster` returns, which is what this consumes. */
export interface HomeRosterSummary {
  total: number;
  marked: number;
  present: number;
  absent: number;
  unmarked: number;
  percent: number;
}

export type HomeAttendanceKey = "present" | "absent" | "unmarked";

export interface HomeAttendanceSegment {
  key: HomeAttendanceKey;
  value: number;
  /** Whole percent of the bar. Non-zero values never round down to 0. */
  percent: number;
}

export interface HomeAttendanceSplit {
  segments: HomeAttendanceSegment[];
  total: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  /** `empty` = nobody to mark, `pending` = work left, `done` = all written. */
  status: "empty" | "pending" | "done";
}

/**
 * Turn a roster summary into bar segments whose percents sum to exactly 100.
 *
 * Rounding each share independently leaves a 1–2% seam at the end of the bar
 * that reads as a fourth, meaningless segment; the largest-remainder pass here
 * puts the leftover on the biggest share instead. A non-zero group is also
 * floored at 1%, because "one person still to write" disappearing from the bar
 * is precisely the case the bar exists to show.
 */
export function buildAttendanceSplit(
  summary: HomeRosterSummary,
): HomeAttendanceSplit {
  const raw: Array<{ key: HomeAttendanceKey; value: number }> = [
    { key: "present", value: summary.present },
    { key: "absent", value: summary.absent },
    { key: "unmarked", value: summary.unmarked },
  ];
  const total = summary.total;

  let segments: HomeAttendanceSegment[];
  if (total <= 0) {
    segments = raw.map((r) => ({ ...r, percent: 0 }));
  } else {
    const scaled = raw.map((r) => {
      const exact = (r.value / total) * 100;
      return { ...r, exact, percent: r.value > 0 ? Math.max(1, Math.floor(exact)) : 0 };
    });
    let used = scaled.reduce((s, r) => s + r.percent, 0);
    // Hand the rounding remainder to the largest share, one point at a time,
    // so the bar always ends flush at 100.
    while (used !== 100) {
      const step = used < 100 ? 1 : -1;
      const candidates = scaled.filter((r) =>
        step > 0 ? r.value > 0 : r.percent > 1,
      );
      if (candidates.length === 0) break;
      const target = candidates.reduce((a, b) => (a.exact >= b.exact ? a : b));
      target.percent += step;
      used += step;
    }
    segments = scaled.map(({ key, value, percent }) => ({ key, value, percent }));
  }

  return {
    segments,
    total,
    marked: summary.marked,
    unmarked: summary.unmarked,
    present: summary.present,
    absent: summary.absent,
    status: total <= 0 ? "empty" : summary.unmarked > 0 ? "pending" : "done",
  };
}

/* ---------------------------------------------------------------------- */
/* Sparkline geometry                                                     */
/* ---------------------------------------------------------------------- */

export interface HomeTrendGeometry {
  /** `M`/`L` path through every point. */
  line: string;
  /** The same path closed to the baseline, for the wash under the line. */
  area: string;
  /** One x/y per point, for markers and hit targets. */
  coords: Array<{ x: number; y: number }>;
}

/**
 * Map trend points onto a viewBox.
 *
 * An all-zero window is drawn flat on the baseline rather than mid-height:
 * a line floating in the middle of an empty chart reads as "average
 * production", which is the opposite of the truth. A single point gets
 * centred instead of pinned to x=0, where it would look clipped.
 */
export function buildTrendGeometry(
  values: number[],
  width: number,
  height: number,
  max: number,
): HomeTrendGeometry {
  if (values.length === 0) {
    return { line: "", area: "", coords: [] };
  }
  const top = 4;
  const usable = Math.max(1, height - top);
  const coords = values.map((v, i) => {
    const x =
      values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
    const y = max > 0 ? height - (v / max) * usable : height;
    return { x, y };
  });

  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(" ");
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area = `${line} L${last.x.toFixed(2)} ${height} L${first.x.toFixed(2)} ${height} Z`;

  return { line, area, coords };
}
