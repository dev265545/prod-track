import { describe, expect, it } from "vitest";
import type { InventoryMovement } from "@/lib/services/inventoryService";
import {
  groupInventoryMovementsByDate,
  movementsForDate,
} from "@/lib/utils/inventoryCalendar";

const movement = (
  overrides: Partial<InventoryMovement>,
): InventoryMovement => ({
  id: "movement",
  itemId: "item",
  date: "2026-07-29",
  type: "inward",
  qty: 10,
  createdAt: 1,
  ...overrides,
});

describe("inventory calendar helpers", () => {
  it("groups movement counts and quantities by date", () => {
    const result = groupInventoryMovementsByDate([
      movement({ date: "2026-07-29", type: "inward", qty: 10 }),
      movement({ date: "2026-07-29", type: "outward", qty: 3 }),
      movement({ date: "2026-07-30", type: "inward", qty: 7 }),
    ]);

    expect(result.get("2026-07-29")).toEqual({
      count: 2,
      inward: 10,
      outward: 3,
    });
    expect(result.get("2026-07-30")).toEqual({
      count: 1,
      inward: 7,
      outward: 0,
    });
  });

  it("returns selected-date movements newest first", () => {
    const result = movementsForDate(
      [
        movement({ id: "old", createdAt: 10 }),
        movement({ id: "new", createdAt: 20 }),
        movement({ id: "other-date", date: "2026-07-30", createdAt: 30 }),
      ],
      "2026-07-29",
    );

    expect(result.map((item) => item.id)).toEqual(["new", "old"]);
  });
});
