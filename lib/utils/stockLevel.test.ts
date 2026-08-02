import { describe, it, expect } from "vitest";
import { stockMeter } from "@/lib/utils/stockLevel";

describe("stockMeter", () => {
  it("puts the low line at the middle of the track", () => {
    expect(stockMeter(100, 100)).toEqual({ percent: 50, lowMarkPercent: 50 });
  });

  it("fills a quarter when stock is half the low line", () => {
    expect(stockMeter(50, 100).percent).toBe(25);
  });

  it("fills the whole track at twice the low line", () => {
    expect(stockMeter(200, 100).percent).toBe(100);
  });

  it("clamps well-stocked items instead of overflowing the track", () => {
    expect(stockMeter(5000, 100).percent).toBe(100);
  });

  it("empties the track for zero and negative stock", () => {
    expect(stockMeter(0, 100).percent).toBe(0);
    expect(stockMeter(-40, 100).percent).toBe(0);
  });

  it("drops the mark and shows a full bar when no low line is set", () => {
    expect(stockMeter(80, 0)).toEqual({ percent: 100, lowMarkPercent: null });
    expect(stockMeter(80, -5)).toEqual({ percent: 100, lowMarkPercent: null });
    expect(stockMeter(80, Number.NaN)).toEqual({
      percent: 100,
      lowMarkPercent: null,
    });
  });

  it("shows an empty bar when there is no stock and no low line", () => {
    expect(stockMeter(0, 0)).toEqual({ percent: 0, lowMarkPercent: null });
  });

  it("treats a broken stock number as empty rather than drawing nothing", () => {
    expect(stockMeter(Number.NaN, 100).percent).toBe(0);
    expect(stockMeter(Number.POSITIVE_INFINITY, 100).percent).toBe(0);
  });

  it("keeps fractional stock on the bar", () => {
    expect(stockMeter(12.5, 50).percent).toBeCloseTo(12.5, 5);
  });
});
