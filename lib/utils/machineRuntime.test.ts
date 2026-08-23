import { describe, expect, it } from "vitest";
import {
  buildItemLookups,
  buildTargetPlan,
  formatRunDuration,
  resolveTopUpView,
  unusableMachinesInPlan,
} from "./machineRuntime";
import type { ItemCombo } from "@/lib/services/itemComboService";
import type { Machine } from "@/lib/services/machineService";

const machine = (
  id: string,
  cavities: number,
  cycleTimeSeconds: number,
): Machine => ({ id, name: id, cavities, cycleTimeSeconds });

describe("formatRunDuration", () => {
  it("shows nothing to run as 0s", () => {
    expect(formatRunDuration(0)).toBe("0s");
    expect(formatRunDuration(-5)).toBe("0s");
  });

  it("guards against NaN and Infinity rather than printing them", () => {
    expect(formatRunDuration(Number.NaN)).toBe("0s");
    expect(formatRunDuration(Number.POSITIVE_INFINITY)).toBe("0s");
  });

  it("keeps one decimal under a minute, because cycles are sub-second", () => {
    expect(formatRunDuration(4.5)).toBe("4.5s");
    expect(formatRunDuration(0.44)).toBe("0.4s");
    expect(formatRunDuration(59.94)).toBe("59.9s");
  });

  it("switches to minutes and whole seconds at 60s", () => {
    expect(formatRunDuration(60)).toBe("1m 0s");
    expect(formatRunDuration(90.4)).toBe("1m 30s");
    expect(formatRunDuration(3661)).toBe("61m 1s");
  });
});

describe("buildItemLookups", () => {
  it("indexes stock and name by id", () => {
    const { itemsById, itemNameById } = buildItemLookups([
      { id: "a", name: "Lid", stock: 12 },
      { id: "b", name: "Base", stock: 0 },
    ]);
    expect(itemsById.a.stock).toBe(12);
    expect(itemNameById.b).toBe("Base");
  });

  it("returns empty lookups for no items", () => {
    expect(buildItemLookups([])).toEqual({ itemsById: {}, itemNameById: {} });
  });
});

describe("resolveTopUpView", () => {
  const combo: ItemCombo = {
    id: "c1",
    name: "Container set",
    components: [
      { itemId: "lid", ratio: 1 },
      { itemId: "base", ratio: 1 },
    ],
  };

  it("returns null until both a set and a machine are picked", () => {
    expect(resolveTopUpView(null, machine("m", 1, 1), {})).toBeNull();
    expect(resolveTopUpView(combo, null, {})).toBeNull();
  });

  it("picks the scarcest item to make and tops it up to the other one", () => {
    const view = resolveTopUpView(combo, machine("m", 1, 1), {
      lid: { stock: 100 },
      base: { stock: 40 },
    });
    expect(view).not.toBeNull();
    expect(view!.producedItemId).toBe("base");
    expect(view!.shortestItemId).toBe("lid");
    expect(view!.shortestItemSets).toBe(100);
    expect(view!.producedItemSets).toBe(40);
    expect(view!.neededPieces).toBe(60);
    expect(view!.runtimeSeconds).toBe(60);
    expect(view!.setsAfterRun).toBe(100);
    expect(view!.alreadyEnough).toBe(false);
  });

  it("reports 'already enough' when stock is already level", () => {
    const view = resolveTopUpView(combo, machine("m", 4, 2), {
      lid: { stock: 50 },
      base: { stock: 50 },
    });
    expect(view!.neededPieces).toBe(0);
    expect(view!.runtimeSeconds).toBe(0);
    expect(view!.alreadyEnough).toBe(true);
  });

  it("charges whole cycles only — 61 pieces on a 4-cavity machine is 16 cycles", () => {
    const view = resolveTopUpView(combo, machine("m", 4, 2), {
      lid: { stock: 61 },
      base: { stock: 0 },
    });
    expect(view!.neededPieces).toBe(61);
    // ceil(61 / 4) = 16 cycles x 2s
    expect(view!.runtimeSeconds).toBe(32);
  });

  it("respects ratios when converting sets to pieces", () => {
    const ratioCombo: ItemCombo = {
      id: "c2",
      name: "Two lids per base",
      components: [
        { itemId: "lid", ratio: 2 },
        { itemId: "base", ratio: 1 },
      ],
    };
    // lid: 100/2 = 50 sets. base: 10/1 = 10 sets -> base is scarcest, make base.
    const view = resolveTopUpView(ratioCombo, machine("m", 1, 1), {
      lid: { stock: 100 },
      base: { stock: 10 },
    });
    expect(view!.producedItemId).toBe("base");
    expect(view!.neededPieces).toBe(40);
  });

  it("flags a one-item set as not usable rather than throwing", () => {
    const lone: ItemCombo = {
      id: "c3",
      name: "Lone",
      components: [{ itemId: "lid", ratio: 1 }],
    };
    const view = resolveTopUpView(lone, machine("m", 1, 1), {
      lid: { stock: 5 },
    });
    expect(view!.inCombo).toBe(false);
  });

  it("returns null for an empty set (no item to make)", () => {
    const empty: ItemCombo = { id: "c4", name: "Empty", components: [] };
    expect(resolveTopUpView(empty, machine("m", 1, 1), {})).toBeNull();
  });
});

describe("buildTargetPlan", () => {
  const combo: ItemCombo = {
    id: "c1",
    name: "Container set",
    components: [
      { itemId: "lid", ratio: 1 },
      { itemId: "base", ratio: 2 },
    ],
  };
  const itemsById = { lid: { stock: 10 }, base: { stock: 0 } };
  const machines = [machine("m1", 1, 1), machine("m2", 2, 3)];

  it("is empty with no set selected", () => {
    expect(buildTargetPlan(null, itemsById, machines, 100, {})).toEqual({
      rows: [],
      totalSeconds: 0,
      hasAssignments: false,
      missingAssignment: false,
    });
  });

  it("subtracts stock and multiplies by the ratio", () => {
    const plan = buildTargetPlan(combo, itemsById, machines, 100, {});
    expect(plan.rows.map((r) => r.neededPieces)).toEqual([90, 200]);
    expect(plan.rows[1].ratio).toBe(2);
    expect(plan.rows[0].currentStock).toBe(10);
  });

  it("leaves runtime unknown and flags the gap when a needy row has no machine", () => {
    const plan = buildTargetPlan(combo, itemsById, machines, 100, {
      lid: "m1",
    });
    expect(plan.rows[0].runtimeSeconds).toBe(90);
    expect(plan.rows[1].runtimeSeconds).toBeNull();
    expect(plan.missingAssignment).toBe(true);
    expect(plan.hasAssignments).toBe(true);
  });

  it("does not flag a missing machine on a row that needs nothing", () => {
    const stocked = { lid: { stock: 1000 }, base: { stock: 1000 } };
    const plan = buildTargetPlan(combo, stocked, machines, 100, {});
    expect(plan.rows.every((r) => r.neededPieces === 0)).toBe(true);
    expect(plan.missingAssignment).toBe(false);
    expect(plan.hasAssignments).toBe(false);
    expect(plan.totalSeconds).toBe(0);
  });

  it("takes the busiest machine, because different machines run at once", () => {
    // lid -> m1: 90 pieces, 1 cavity, 1s = 90s
    // base -> m2: 200 pieces, 2 cavities, 3s = 100 cycles x 3s = 300s
    const plan = buildTargetPlan(combo, itemsById, machines, 100, {
      lid: "m1",
      base: "m2",
    });
    expect(plan.totalSeconds).toBe(300);
    expect(plan.missingAssignment).toBe(false);
  });

  it("adds up when one machine is picked for two rows", () => {
    // both on m1 (1 cavity, 1s): 90s + 200s, run one after the other.
    const plan = buildTargetPlan(combo, itemsById, machines, 100, {
      lid: "m1",
      base: "m1",
    });
    expect(plan.totalSeconds).toBe(290);
  });

  it("ignores a machine id that no longer exists", () => {
    const plan = buildTargetPlan(combo, itemsById, machines, 100, {
      lid: "deleted",
    });
    expect(plan.rows[0].runtimeSeconds).toBeNull();
    expect(plan.hasAssignments).toBe(false);
    expect(plan.missingAssignment).toBe(true);
  });

  it("treats a zero or negative target as nothing to make", () => {
    expect(
      buildTargetPlan(combo, itemsById, machines, 0, { lid: "m1" }).rows[0]
        .neededPieces,
    ).toBe(0);
    expect(
      buildTargetPlan(combo, itemsById, machines, -50, { lid: "m1" }).rows[1]
        .neededPieces,
    ).toBe(0);
  });

  it("rounds a fractional piece requirement up to a whole piece", () => {
    const halfCombo: ItemCombo = {
      id: "c5",
      name: "Half",
      components: [{ itemId: "lid", ratio: 0.5 }],
    };
    // 5 sets x 0.5 = 2.5 pieces, stock 0 -> 3 pieces, 3 cycles on a 1-cavity machine
    const plan = buildTargetPlan(
      halfCombo,
      { lid: { stock: 0 } },
      machines,
      5,
      { lid: "m1" },
    );
    expect(plan.rows[0].neededPieces).toBe(3);
    expect(plan.totalSeconds).toBe(3);
  });
});

/**
 * A machine saved with 0 pieces-per-shot (or 0 seconds-per-shot) can never
 * make anything. The maths used to report it as 0 seconds, which on a panel
 * that ranks machines by run time makes the broken one look like the fastest.
 * Nothing below may report a duration for such a machine.
 */
describe("machines that cannot run", () => {
  const combo: ItemCombo = {
    id: "c1",
    name: "Container set",
    components: [
      { itemId: "lid", ratio: 1 },
      { itemId: "base", ratio: 2 },
    ],
  };
  const itemsById = { lid: { stock: 10 }, base: { stock: 0 } };

  const broken = (id: string, cavities: number, cycle: number) =>
    machine(id, cavities, cycle);

  describe("resolveTopUpView", () => {
    const twoItem: ItemCombo = {
      id: "c1",
      name: "Container set",
      components: [
        { itemId: "lid", ratio: 1 },
        { itemId: "base", ratio: 1 },
      ],
    };
    const stock = { lid: { stock: 100 }, base: { stock: 40 } };

    it("reports no run time and names zero pieces-per-shot", () => {
      const view = resolveTopUpView(twoItem, broken("m", 0, 1), stock);
      expect(view!.runtimeSeconds).toBeNull();
      expect(view!.machineProblems).toEqual(["cavities"]);
      expect(view!.neededPieces).toBe(60);
    });

    it("names zero seconds-per-shot", () => {
      const view = resolveTopUpView(twoItem, broken("m", 4, 0), stock);
      expect(view!.runtimeSeconds).toBeNull();
      expect(view!.machineProblems).toEqual(["cycleTime"]);
    });

    it("names both when both are wrong", () => {
      const view = resolveTopUpView(twoItem, broken("m", -1, Number.NaN), stock);
      expect(view!.runtimeSeconds).toBeNull();
      expect(view!.machineProblems).toEqual(["cavities", "cycleTime"]);
    });

    it("still reports no run time when stock is already level", () => {
      // 0s here would be indistinguishable from "nothing to do".
      const view = resolveTopUpView(twoItem, broken("m", 0, 1), {
        lid: { stock: 50 },
        base: { stock: 50 },
      });
      expect(view!.runtimeSeconds).toBeNull();
      expect(view!.machineProblems).toEqual(["cavities"]);
    });

    it("leaves a good machine's answer exactly as before", () => {
      const view = resolveTopUpView(twoItem, machine("m", 1, 1), stock);
      expect(view!.runtimeSeconds).toBe(60);
      expect(view!.machineProblems).toEqual([]);
    });
  });

  describe("buildTargetPlan", () => {
    const machines = [machine("good", 1, 1), broken("bad", 0, 1)];

    it("does not total a broken machine as zero, and never ranks it best", () => {
      // good: 90 pieces at 1/s = 90s. bad: 200 pieces, but it cannot run.
      const plan = buildTargetPlan(combo, itemsById, machines, 100, {
        lid: "good",
        base: "bad",
      });
      expect(plan.rows[0].runtimeSeconds).toBe(90);
      expect(plan.rows[1].runtimeSeconds).toBeNull();
      expect(plan.rows[1].machineProblems).toEqual(["cavities"]);
      // The busiest machine is the only one that can actually run.
      expect(plan.totalSeconds).toBe(90);
      // The total is understated, and the panel must say so.
      expect(plan.missingAssignment).toBe(true);
    });

    it("shows no total at all when every picked machine is broken", () => {
      const plan = buildTargetPlan(combo, itemsById, machines, 100, {
        lid: "bad",
        base: "bad",
      });
      expect(plan.hasAssignments).toBe(false);
      expect(plan.totalSeconds).toBe(0);
      expect(plan.missingAssignment).toBe(true);
      expect(plan.rows.every((r) => r.runtimeSeconds === null)).toBe(true);
    });

    it("keeps machineProblems empty when no machine is picked", () => {
      const plan = buildTargetPlan(combo, itemsById, machines, 100, {});
      expect(plan.rows.every((r) => r.machineProblems.length === 0)).toBe(true);
    });

    it("keeps machineProblems empty for a machine id that no longer exists", () => {
      const plan = buildTargetPlan(combo, itemsById, machines, 100, {
        lid: "deleted",
      });
      expect(plan.rows[0].machineProblems).toEqual([]);
      expect(plan.rows[0].runtimeSeconds).toBeNull();
    });

    it("flags a broken machine even on a row that needs no pieces", () => {
      const stocked = { lid: { stock: 1000 }, base: { stock: 1000 } };
      const plan = buildTargetPlan(combo, stocked, machines, 100, {
        lid: "bad",
      });
      expect(plan.rows[0].neededPieces).toBe(0);
      expect(plan.rows[0].runtimeSeconds).toBeNull();
      expect(plan.rows[0].machineProblems).toEqual(["cavities"]);
    });
  });

  describe("unusableMachinesInPlan", () => {
    const machines = [machine("good", 1, 1), broken("bad", 0, 1)];

    it("names the broken machine once, even when it is picked twice", () => {
      const plan = buildTargetPlan(combo, itemsById, machines, 100, {
        lid: "bad",
        base: "bad",
      });
      expect(unusableMachinesInPlan(plan, machines)).toEqual([
        { machineId: "bad", name: "bad", problems: ["cavities"] },
      ]);
    });

    it("is empty when every picked machine works", () => {
      const plan = buildTargetPlan(combo, itemsById, machines, 100, {
        lid: "good",
        base: "good",
      });
      expect(unusableMachinesInPlan(plan, machines)).toEqual([]);
    });
  });
});
