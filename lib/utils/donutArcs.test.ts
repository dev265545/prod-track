import { describe, expect, it } from "vitest";
import { buildDonutArcs } from "./donutArcs";

const C = 100;

describe("buildDonutArcs", () => {
  it("gives every segment its share of the circle", () => {
    const arcs = buildDonutArcs(
      [
        { key: "a", value: 1 },
        { key: "b", value: 3 },
      ],
      C,
      0,
    );
    expect(arcs.map((a) => a.frac)).toEqual([0.25, 0.75]);
    expect(arcs[0].dasharray).toBe("25 75");
    expect(arcs[1].dasharray).toBe("75 25");
  });

  it("starts each segment where the previous one ended", () => {
    const arcs = buildDonutArcs(
      [
        { key: "a", value: 1 },
        { key: "b", value: 1 },
        { key: "c", value: 2 },
      ],
      C,
      0,
    );
    expect(arcs.map((a) => a.dashoffset)).toEqual([-0, -25, -50]);
  });

  it("leaves a gap after a drawn arc but never a negative run", () => {
    const [big, sliver] = buildDonutArcs(
      [
        { key: "big", value: 99 },
        { key: "sliver", value: 1 },
      ],
      C,
      2,
    );
    expect(big.dasharray).toBe("97 3");
    // The sliver is 1 unit long and the gap is 2 — it must clamp, not go
    // negative and paint backwards around the ring.
    expect(sliver.dasharray).toBe("0 100");
  });

  it("draws nothing when every value is zero", () => {
    const arcs = buildDonutArcs(
      [
        { key: "a", value: 0 },
        { key: "b", value: 0 },
      ],
      C,
    );
    expect(arcs.every((a) => a.frac === 0)).toBe(true);
    expect(arcs.every((a) => a.dasharray === `0 ${C}`)).toBe(true);
  });

  it("ignores a negative value rather than eating the ring", () => {
    const arcs = buildDonutArcs(
      [
        { key: "bad", value: -5 },
        { key: "good", value: 5 },
      ],
      C,
      0,
    );
    expect(arcs[0].frac).toBe(0);
    expect(arcs[1].frac).toBe(1);
    expect(arcs[1].dashoffset).toBe(-0);
  });

  it("returns nothing for no segments", () => {
    expect(buildDonutArcs([], C)).toEqual([]);
  });
});
