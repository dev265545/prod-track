/**
 * Donut-segment geometry, pulled out of the chart component.
 *
 * It lived there as a `.map()` that reassigned a running `offset` declared
 * outside the callback — a render-time mutation the React compiler rightly
 * refuses, because a re-render that starts mid-map would read a half-advanced
 * cursor. Written as a fold it is both legal and testable, and the component
 * keeps no state at all.
 */

export interface DonutArcInput {
  key: string;
  value: number;
}

export interface DonutArc {
  key: string;
  /** SVG `stroke-dasharray`: the drawn run, then the gap to the end. */
  dasharray: string;
  /** SVG `stroke-dashoffset`; negative, so segment N starts where N-1 ended. */
  dashoffset: number;
  /** This segment's share of the whole, 0..1. `0` when nothing has a value. */
  frac: number;
}

/**
 * @param segments values in drawing order; zero and negative values take no arc.
 * @param circumference the full circle length in user units.
 * @param gap blank space left after each drawn arc, so two touching segments
 *   read as two. Never allowed to make a run negative.
 */
export function buildDonutArcs(
  segments: readonly DonutArcInput[],
  circumference: number,
  gap = 2,
): DonutArc[] {
  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);

  return segments.reduce<{ arcs: DonutArc[]; offset: number }>(
    (acc, seg) => {
      const frac = total > 0 ? Math.max(seg.value, 0) / total : 0;
      const len = frac * circumference;
      const drawn = Math.max(len - (frac > 0 ? gap : 0), 0);
      acc.arcs.push({
        key: seg.key,
        dasharray: `${drawn} ${circumference - drawn}`,
        dashoffset: -acc.offset,
        frac,
      });
      return { arcs: acc.arcs, offset: acc.offset + len };
    },
    { arcs: [], offset: 0 },
  ).arcs;
}
