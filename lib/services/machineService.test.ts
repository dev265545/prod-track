import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A machine whose pieces-per-shot or seconds-per-shot is zero cannot produce
 * anything. It used to be saveable, and the calculator then reported "0s" for
 * it — which an operator planning a shift reads as the *fastest* machine
 * available. These tests pin both halves of the fix: the record can no longer
 * be created, and a record that already exists is reported as broken rather
 * than as instant.
 */

const rows = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/db/adapter", () => ({
  STORES: { MACHINES: "machines" },
  getAll: vi.fn(async () => Array.from(rows.values())),
  get: vi.fn(async (_store: string, id: string) => rows.get(id) ?? null),
  put: vi.fn(async (_store: string, row: Record<string, unknown>) => {
    rows.set(row.id as string, row);
  }),
  remove: vi.fn(async (_store: string, id: string) => {
    rows.delete(id);
  }),
}));

vi.mock("./auditService", () => ({
  AUDIT_ACTIONS: {
    machineCreate: "machine.create",
    machineUpdate: "machine.update",
    machineDelete: "machine.delete",
  },
  diffEntity: () => ({}),
  record: vi.fn(async () => {}),
}));

import {
  findMachineProblems,
  getMachines,
  isMachineUsable,
  MachineValidationError,
  saveMachine,
} from "./machineService";
import { calculateMachineRuntimeSeconds } from "./itemComboService";

beforeEach(() => {
  rows.clear();
});

describe("findMachineProblems", () => {
  it("passes a machine whose two numbers are both real and positive", () => {
    expect(findMachineProblems({ cavities: 4, cycleTimeSeconds: 2.5 })).toEqual(
      [],
    );
    expect(isMachineUsable({ cavities: 1, cycleTimeSeconds: 0.1 })).toBe(true);
  });

  it("names zero, negative, NaN and missing pieces-per-shot", () => {
    for (const cavities of [0, -4, Number.NaN, undefined, null, "4"]) {
      expect(
        findMachineProblems({ cavities, cycleTimeSeconds: 1 }),
      ).toEqual(["cavities"]);
    }
  });

  it("names zero, negative, NaN and missing seconds-per-shot", () => {
    for (const cycleTimeSeconds of [0, -1, Number.NaN, undefined, null, "1"]) {
      expect(findMachineProblems({ cavities: 4, cycleTimeSeconds })).toEqual([
        "cycleTime",
      ]);
    }
  });

  it("names both when both are wrong", () => {
    expect(findMachineProblems({ cavities: 0, cycleTimeSeconds: 0 })).toEqual([
      "cavities",
      "cycleTime",
    ]);
  });

  it("rejects Infinity, which would make every plan meaningless", () => {
    expect(
      findMachineProblems({
        cavities: Number.POSITIVE_INFINITY,
        cycleTimeSeconds: 1,
      }),
    ).toEqual(["cavities"]);
  });

  it("treats a missing machine as having no problems to report", () => {
    expect(findMachineProblems(null)).toEqual([]);
    expect(findMachineProblems(undefined)).toEqual([]);
  });
});

describe("saveMachine", () => {
  it("saves a good machine and defaults seconds-per-shot to 1", async () => {
    const saved = await saveMachine({ name: "Press 1", cavities: 4 });
    expect(saved.cycleTimeSeconds).toBe(1.0);
    expect(await getMachines()).toHaveLength(1);
  });

  it("refuses a machine with zero pieces-per-shot, and stores nothing", async () => {
    await expect(
      saveMachine({ name: "Bad", cavities: 0, cycleTimeSeconds: 2 }),
    ).rejects.toBeInstanceOf(MachineValidationError);
    expect(await getMachines()).toEqual([]);
  });

  it("refuses zero seconds-per-shot", async () => {
    await expect(
      saveMachine({ name: "Bad", cavities: 4, cycleTimeSeconds: 0 }),
    ).rejects.toBeInstanceOf(MachineValidationError);
    expect(await getMachines()).toEqual([]);
  });

  it("carries the problems on the error so the screen can name them", async () => {
    await expect(
      saveMachine({ name: "Bad", cavities: -1, cycleTimeSeconds: Number.NaN }),
    ).rejects.toMatchObject({ problems: ["cavities", "cycleTime"] });
  });

  it("refuses an edit that would break an already-good machine", async () => {
    const saved = await saveMachine({
      name: "Press 1",
      cavities: 4,
      cycleTimeSeconds: 2,
    });
    await expect(
      saveMachine({ ...saved, cavities: 0 }),
    ).rejects.toBeInstanceOf(MachineValidationError);
    const [stillThere] = await getMachines();
    expect(stillThere.cavities).toBe(4);
  });
});

describe("a bad machine already in the store", () => {
  it("reads back as unusable and reports no run time, not 0s", async () => {
    // Written straight into the store, as an install from before the guard.
    rows.set("machine_legacy", {
      id: "machine_legacy",
      name: "Old Press",
      cavities: 0,
      cycleTimeSeconds: 3,
    });

    const [machine] = await getMachines();
    expect(isMachineUsable(machine)).toBe(false);
    expect(findMachineProblems(machine)).toEqual(["cavities"]);
    expect(
      calculateMachineRuntimeSeconds(
        500,
        machine.cavities,
        machine.cycleTimeSeconds,
      ),
    ).toBeNull();
  });
});

describe("calculateMachineRuntimeSeconds guards", () => {
  it("returns null — not 0 — for an unusable machine, however many pieces", () => {
    expect(calculateMachineRuntimeSeconds(100, 0, 1)).toBeNull();
    expect(calculateMachineRuntimeSeconds(100, -2, 1)).toBeNull();
    expect(calculateMachineRuntimeSeconds(100, Number.NaN, 1)).toBeNull();
    expect(calculateMachineRuntimeSeconds(100, 4, 0)).toBeNull();
    expect(calculateMachineRuntimeSeconds(100, 4, -1)).toBeNull();
    expect(calculateMachineRuntimeSeconds(100, 4, Number.NaN)).toBeNull();
  });

  it("still returns null when there is nothing to make — the machine is the problem", () => {
    expect(calculateMachineRuntimeSeconds(0, 0, 1)).toBeNull();
  });

  it("keeps 0 for 'nothing to make' on a machine that works", () => {
    expect(calculateMachineRuntimeSeconds(0, 4, 2)).toBe(0);
    expect(calculateMachineRuntimeSeconds(Number.NaN, 4, 2)).toBe(0);
  });
});
