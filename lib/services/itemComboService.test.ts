import { describe, expect, it } from "vitest";
import {
  calculateComponentNeedsForTarget,
  calculateMachineRuntimeSeconds,
  calculateTopUpPlan,
  type ItemCombo,
} from "./itemComboService";

describe("calculateMachineRuntimeSeconds", () => {
  it("rounds up to whole cycles — a machine can't run a fraction of one", () => {
    // 3 pieces needed, 8-cavity machine, 1s cycle -> still needs 1 full cycle (1s), not 0.375s.
    expect(calculateMachineRuntimeSeconds(3, 8, 1)).toBe(1);
  });

  it("returns an exact whole-cycle count when pieces divide evenly", () => {
    expect(calculateMachineRuntimeSeconds(16, 8, 1)).toBe(2);
  });

  it("returns 0 for zero or negative pieces", () => {
    expect(calculateMachineRuntimeSeconds(0, 8, 1)).toBe(0);
    expect(calculateMachineRuntimeSeconds(-5, 8, 1)).toBe(0);
  });
});

describe("calculateTopUpPlan", () => {
  it("(a) equal-ratio combo: tops up the scarcer item to match the other", () => {
    const combo: ItemCombo = {
      id: "combo_1",
      name: "Combo A",
      components: [
        { itemId: "x", ratio: 1 },
        { itemId: "y", ratio: 1 },
      ],
    };
    // x = 100, y = 50 -> y is the bottleneck; producing y should aim for 100.
    const itemsById = { x: { stock: 100 }, y: { stock: 50 } };
    const result = calculateTopUpPlan(combo, itemsById, "y", {
      cavities: 1,
      cycleTimeSeconds: 1,
    });

    expect(result.inCombo).toBe(true);
    expect(result.bottleneckItemId).toBe("x");
    expect(result.bottleneckUnits).toBe(100);
    expect(result.neededPieces).toBe(50);
    expect(result.runtimeSeconds).toBe(50);
    expect(result.resultingComboUnits).toBe(100);
  });

  it("(b) non-1 ratios: needed pieces account for the produced item's ratio", () => {
    const combo: ItemCombo = {
      id: "combo_2",
      name: "Combo B",
      components: [
        { itemId: "x", ratio: 2 },
        { itemId: "y", ratio: 1 },
      ],
    };
    // x = 50 -> unitsPossible 25 (bottleneck since y is being produced)
    // y = 40 -> unitsPossible 40; need to bring y's units up to 25 -> already above, so 0 needed
    const itemsById = { x: { stock: 50 }, y: { stock: 40 } };
    const result = calculateTopUpPlan(combo, itemsById, "y", {
      cavities: 1,
      cycleTimeSeconds: 1,
    });

    expect(result.bottleneckItemId).toBe("x");
    expect(result.bottleneckUnits).toBe(25);
    expect(result.neededPieces).toBe(0);
    expect(result.runtimeSeconds).toBe(0);
    expect(result.resultingComboUnits).toBe(25);
  });

  it("(c) producing the scarce non-1-ratio item computes needed pieces via its own ratio", () => {
    const combo: ItemCombo = {
      id: "combo_3",
      name: "Combo C",
      components: [
        { itemId: "x", ratio: 1 },
        { itemId: "y", ratio: 3 },
      ],
    };
    // x = 30 -> bottleneck units = 30 (only other component)
    // y = 60, ratio 3 -> unitsPossible 20; need 10 more units * ratio 3 = 30 pieces
    const itemsById = { x: { stock: 30 }, y: { stock: 60 } };
    const result = calculateTopUpPlan(combo, itemsById, "y", {
      cavities: 2,
      cycleTimeSeconds: 1,
    });

    expect(result.bottleneckItemId).toBe("x");
    expect(result.bottleneckUnits).toBe(30);
    expect(result.producedUnitsPossible).toBe(20);
    expect(result.neededPieces).toBe(30);
    // 30 pieces / 2 cavities = exactly 15 whole cycles -> 15s
    expect(result.runtimeSeconds).toBe(15);
    expect(result.resultingComboUnits).toBe(30);
  });

  it("(d) rounds runtime up to a whole number of machine cycles", () => {
    const combo: ItemCombo = {
      id: "combo_4",
      name: "Combo D",
      components: [
        { itemId: "x", ratio: 1 },
        { itemId: "y", ratio: 1 },
      ],
    };
    // needed pieces = 100; 6-cavity machine -> ceil(100/6) = 17 cycles * 1.2s = 20.4s
    const itemsById = { x: { stock: 200 }, y: { stock: 100 } };
    const result = calculateTopUpPlan(combo, itemsById, "y", {
      cavities: 6,
      cycleTimeSeconds: 1.2,
    });

    expect(result.neededPieces).toBe(100);
    expect(result.runtimeSeconds).toBeCloseTo(20.4, 5);
  });

  it("(e) with 3+ components, bottleneck is the minimum of the OTHER components (not max)", () => {
    const combo: ItemCombo = {
      id: "combo_5",
      name: "Combo E",
      components: [
        { itemId: "x", ratio: 1 },
        { itemId: "y", ratio: 1 },
        { itemId: "z", ratio: 1 },
      ],
    };
    // Producing y (currently 10). Others: x=100, z=30 -> true bottleneck is z=30, not x=100.
    const itemsById = { x: { stock: 100 }, y: { stock: 10 }, z: { stock: 30 } };
    const result = calculateTopUpPlan(combo, itemsById, "y", {
      cavities: 1,
      cycleTimeSeconds: 1,
    });

    expect(result.bottleneckItemId).toBe("z");
    expect(result.bottleneckUnits).toBe(30);
    expect(result.neededPieces).toBe(20);
    expect(result.resultingComboUnits).toBe(30);
  });

  it("(f) returns inCombo: false when the produced item isn't part of the combo", () => {
    const combo: ItemCombo = {
      id: "combo_6",
      name: "Combo F",
      components: [
        { itemId: "x", ratio: 1 },
        { itemId: "y", ratio: 1 },
      ],
    };
    const result = calculateTopUpPlan(
      combo,
      { x: { stock: 10 }, y: { stock: 10 } },
      "z",
      { cavities: 1, cycleTimeSeconds: 1 },
    );
    expect(result.inCombo).toBe(false);
    expect(result.neededPieces).toBe(0);
  });
});

describe("calculateComponentNeedsForTarget", () => {
  it("computes needed total and additional pieces per component for a target quantity", () => {
    const combo: ItemCombo = {
      id: "combo_7",
      name: "Combo G",
      components: [
        { itemId: "x", ratio: 1 },
        { itemId: "y", ratio: 2 },
      ],
    };
    const itemsById = { x: { stock: 4000 }, y: { stock: 1000 } };
    const result = calculateComponentNeedsForTarget(combo, itemsById, 10000);

    const x = result.find((r) => r.itemId === "x")!;
    const y = result.find((r) => r.itemId === "y")!;

    expect(x.neededTotalPieces).toBe(10000);
    expect(x.neededAdditionalPieces).toBe(6000);
    expect(y.neededTotalPieces).toBe(20000);
    expect(y.neededAdditionalPieces).toBe(19000);
  });

  it("clamps needed additional pieces to 0 when current stock already covers the target", () => {
    const combo: ItemCombo = {
      id: "combo_8",
      name: "Combo H",
      components: [{ itemId: "x", ratio: 1 }],
    };
    const itemsById = { x: { stock: 50000 } };
    const result = calculateComponentNeedsForTarget(combo, itemsById, 10000);

    expect(result[0].neededAdditionalPieces).toBe(0);
  });
});
