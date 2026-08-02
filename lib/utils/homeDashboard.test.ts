import { describe, it, expect } from "vitest";
import {
  buildProductionTrend,
  buildTrendWindow,
  buildAttendanceSplit,
  buildTrendGeometry,
  summarizeStockHealth,
  type HomeRosterSummary,
} from "./homeDashboard";

const days = (...d: string[]) => d;

describe("buildProductionTrend", () => {
  it("returns an explicit empty shape for no dates and no rows", () => {
    const t = buildProductionTrend([], []);
    expect(t.points).toEqual([]);
    expect(t.total).toBe(0);
    expect(t.max).toBe(0);
    expect(t.hasData).toBe(false);
    expect(t.bestIndex).toBe(-1);
    expect(t.direction).toBe("same");
  });

  it("keeps a zero point for every date nobody worked", () => {
    const t = buildProductionTrend(
      [{ date: "2026-01-03", quantity: 40, shift: "day" }],
      days("2026-01-01", "2026-01-02", "2026-01-03"),
    );
    expect(t.points.map((p) => p.total)).toEqual([0, 0, 40]);
    expect(t.points.map((p) => p.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  it("splits day and night onto the same date bucket", () => {
    const t = buildProductionTrend(
      [
        { date: "2026-01-01", quantity: 10, shift: "day" },
        { date: "2026-01-01", quantity: 15, shift: "night" },
        { date: "2026-01-01", quantity: 5 },
      ],
      days("2026-01-01"),
    );
    expect(t.points[0]).toEqual({
      date: "2026-01-01",
      total: 30,
      day: 15,
      night: 15,
    });
  });

  it("handles a single day of data without inventing a direction", () => {
    const t = buildProductionTrend(
      [{ date: "2026-01-01", quantity: 12 }],
      days("2026-01-01"),
    );
    expect(t.latestTotal).toBe(12);
    expect(t.priorTotal).toBe(0);
    expect(t.direction).toBe("up");
    expect(t.bestIndex).toBe(0);
    expect(t.hasData).toBe(true);
  });

  it("reads the direction from the last two days", () => {
    const up = buildProductionTrend(
      [
        { date: "2026-01-01", quantity: 5 },
        { date: "2026-01-02", quantity: 9 },
      ],
      days("2026-01-01", "2026-01-02"),
    );
    expect(up.direction).toBe("up");

    const down = buildProductionTrend(
      [
        { date: "2026-01-01", quantity: 9 },
        { date: "2026-01-02", quantity: 5 },
      ],
      days("2026-01-01", "2026-01-02"),
    );
    expect(down.direction).toBe("down");

    const same = buildProductionTrend(
      [
        { date: "2026-01-01", quantity: 5 },
        { date: "2026-01-02", quantity: 5 },
      ],
      days("2026-01-01", "2026-01-02"),
    );
    expect(same.direction).toBe("same");
  });

  it("distinguishes 'nothing written' from 'wrote a zero'", () => {
    const untouched = buildProductionTrend([], days("2026-01-01", "2026-01-02"));
    expect(untouched.hasData).toBe(false);
    expect(untouched.max).toBe(0);
    expect(untouched.bestIndex).toBe(-1);

    const zeroes = buildProductionTrend(
      [
        { date: "2026-01-01", quantity: 0 },
        { date: "2026-01-02", quantity: 0 },
      ],
      days("2026-01-01", "2026-01-02"),
    );
    expect(zeroes.hasData).toBe(true);
    expect(zeroes.total).toBe(0);
    expect(zeroes.bestIndex).toBe(-1);
  });

  it("ignores rows outside the window and rows with no usable date", () => {
    const t = buildProductionTrend(
      [
        { date: "2025-12-31", quantity: 999 },
        { date: undefined, quantity: 999 },
        { quantity: 999 },
        { date: "2026-01-01", quantity: 7 },
      ],
      days("2026-01-01"),
    );
    expect(t.total).toBe(7);
    expect(t.hasData).toBe(true);
  });

  it("treats a non-numeric quantity as zero rather than NaN", () => {
    const t = buildProductionTrend(
      [
        { date: "2026-01-01", quantity: "abc" },
        { date: "2026-01-01", quantity: null },
        { date: "2026-01-01", quantity: "8" },
      ],
      days("2026-01-01"),
    );
    expect(t.total).toBe(8);
  });

  it("reports the best day", () => {
    const t = buildProductionTrend(
      [
        { date: "2026-01-01", quantity: 4 },
        { date: "2026-01-02", quantity: 40 },
        { date: "2026-01-03", quantity: 9 },
      ],
      days("2026-01-01", "2026-01-02", "2026-01-03"),
    );
    expect(t.bestIndex).toBe(1);
    expect(t.max).toBe(40);
    expect(t.total).toBe(53);
  });
});

describe("summarizeStockHealth", () => {
  it("returns a null worst state for an empty store", () => {
    expect(summarizeStockHealth([])).toEqual({
      total: 0,
      ok: 0,
      low: 0,
      out: 0,
      needsAttention: 0,
      worst: null,
    });
  });

  it("matches the inventory screens' thresholds exactly", () => {
    const h = summarizeStockHealth([
      { currentStock: 0, lowStockThreshold: 5 }, // out
      { currentStock: -3, lowStockThreshold: 5 }, // out (negative reads as out)
      { currentStock: 4, lowStockThreshold: 5 }, // low
      { currentStock: 5, lowStockThreshold: 5 }, // ok — at threshold is not low
      { currentStock: 50, lowStockThreshold: 5 }, // ok
    ]);
    expect(h).toEqual({
      total: 5,
      ok: 2,
      low: 1,
      out: 2,
      needsAttention: 3,
      worst: "out",
    });
  });

  it("reports low as the worst when nothing is finished", () => {
    expect(
      summarizeStockHealth([
        { currentStock: 1, lowStockThreshold: 5 },
        { currentStock: 9, lowStockThreshold: 5 },
      ]).worst,
    ).toBe("low");
  });

  it("reports ok when everything is healthy", () => {
    expect(
      summarizeStockHealth([{ currentStock: 9, lowStockThreshold: 5 }]).worst,
    ).toBe("ok");
  });
});

const roster = (p: Partial<HomeRosterSummary>): HomeRosterSummary => {
  const present = p.present ?? 0;
  const absent = p.absent ?? 0;
  const unmarked = p.unmarked ?? 0;
  const total = present + absent + unmarked;
  return {
    total,
    present,
    absent,
    unmarked,
    marked: present + absent,
    percent: total === 0 ? 100 : Math.round(((present + absent) / total) * 100),
  };
};

describe("buildAttendanceSplit", () => {
  it("reports an empty roster instead of a zero-width bar", () => {
    const s = buildAttendanceSplit(roster({}));
    expect(s.status).toBe("empty");
    expect(s.segments.every((seg) => seg.percent === 0)).toBe(true);
  });

  it("gives a single person the whole bar", () => {
    const s = buildAttendanceSplit(roster({ present: 1 }));
    expect(s.segments.find((x) => x.key === "present")?.percent).toBe(100);
    expect(s.status).toBe("done");
  });

  it("sums to exactly 100 when the shares do not divide evenly", () => {
    for (const counts of [
      { present: 1, absent: 1, unmarked: 1 },
      { present: 5, absent: 1, unmarked: 1 },
      { present: 2, absent: 3, unmarked: 2 },
      { present: 33, absent: 33, unmarked: 34 },
      { present: 7, absent: 0, unmarked: 6 },
    ]) {
      const s = buildAttendanceSplit(roster(counts));
      const sum = s.segments.reduce((a, b) => a + b.percent, 0);
      expect(sum, JSON.stringify(counts)).toBe(100);
    }
  });

  it("never lets a real group round away to nothing", () => {
    const s = buildAttendanceSplit(roster({ present: 299, unmarked: 1 }));
    const unmarked = s.segments.find((x) => x.key === "unmarked");
    expect(unmarked?.value).toBe(1);
    expect(unmarked?.percent).toBeGreaterThanOrEqual(1);
    expect(s.segments.reduce((a, b) => a + b.percent, 0)).toBe(100);
  });

  it("gives an absent group no width when nobody is absent", () => {
    const s = buildAttendanceSplit(roster({ present: 4, unmarked: 4 }));
    expect(s.segments.find((x) => x.key === "absent")?.percent).toBe(0);
  });

  it("is pending while anyone is still unwritten", () => {
    expect(buildAttendanceSplit(roster({ present: 9, unmarked: 1 })).status).toBe(
      "pending",
    );
    expect(buildAttendanceSplit(roster({ present: 9, absent: 1 })).status).toBe(
      "done",
    );
  });
});

describe("buildTrendGeometry", () => {
  it("returns nothing to draw for no points", () => {
    expect(buildTrendGeometry([], 100, 50, 0)).toEqual({
      line: "",
      area: "",
      coords: [],
    });
  });

  it("centres a single point instead of pinning it to the left edge", () => {
    const g = buildTrendGeometry([10], 100, 50, 10);
    expect(g.coords).toHaveLength(1);
    expect(g.coords[0].x).toBe(50);
  });

  it("draws an all-zero window flat on the baseline, not mid-height", () => {
    const g = buildTrendGeometry([0, 0, 0], 90, 50, 0);
    expect(g.coords.map((c) => c.y)).toEqual([50, 50, 50]);
    expect(g.coords.map((c) => c.x)).toEqual([0, 45, 90]);
  });

  it("puts the maximum at the top and a zero on the baseline", () => {
    const g = buildTrendGeometry([0, 10], 100, 50, 10);
    expect(g.coords[0].y).toBe(50);
    expect(g.coords[1].y).toBe(4);
  });

  it("closes the area path back down to the baseline", () => {
    const g = buildTrendGeometry([5, 10], 100, 50, 10);
    expect(g.line.startsWith("M0.00")).toBe(true);
    expect(g.area.endsWith("Z")).toBe(true);
    expect(g.area).toContain("L0.00 50");
  });
});

describe("buildTrendWindow", () => {
  it("ends on the given day and includes it", () => {
    const w = buildTrendWindow("2026-01-14", 14);
    expect(w.to).toBe("2026-01-14");
    expect(w.from).toBe("2026-01-01");
    expect(w.dates).toHaveLength(14);
    expect(w.dates[0]).toBe("2026-01-01");
    expect(w.dates[13]).toBe("2026-01-14");
  });

  it("collapses a one-day window to that single day", () => {
    const w = buildTrendWindow("2026-03-09", 1);
    expect(w).toEqual({
      from: "2026-03-09",
      to: "2026-03-09",
      dates: ["2026-03-09"],
    });
  });

  it("treats a zero or negative span as one day rather than inverting", () => {
    expect(buildTrendWindow("2026-03-09", 0).dates).toEqual(["2026-03-09"]);
    expect(buildTrendWindow("2026-03-09", -5).dates).toEqual(["2026-03-09"]);
  });

  it("walks back across a month and a leap-year boundary", () => {
    expect(buildTrendWindow("2026-03-02", 5).from).toBe("2026-02-26");
    expect(buildTrendWindow("2024-03-01", 3).dates).toEqual([
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
  });

  it("produces a window a trend can be built against with no gaps", () => {
    const w = buildTrendWindow("2026-01-05", 5);
    const trend = buildProductionTrend(
      [{ date: "2026-01-05", quantity: 12, shift: "day" }],
      w.dates,
    );
    expect(trend.points.map((p) => p.total)).toEqual([0, 0, 0, 0, 12]);
  });
});
