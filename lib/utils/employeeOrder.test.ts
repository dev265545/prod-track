import { describe, expect, it } from "vitest";
import {
  getNextEmployeeSortOrder,
  moveInVisibleOrder,
  sortEmployeesByCustomOrder,
} from "./employeeOrder";

describe("sortEmployeesByCustomOrder", () => {
  it("keeps explicit sortOrder ahead of fallback records", () => {
    const employees = [
      { id: "b", name: "B", sortOrder: 1, createdAt: "2026-04-02" },
      { id: "c", name: "C", createdAt: "2026-04-03" },
      { id: "a", name: "A", sortOrder: 0, createdAt: "2026-04-01" },
    ];

    expect(sortEmployeesByCustomOrder(employees).map((employee) => employee.id))
      .toEqual(["a", "b", "c"]);
  });

  it("falls back to createdAt then id when sortOrder is missing", () => {
    const employees = [
      { id: "b", createdAt: "2026-04-02" },
      { id: "a", createdAt: "2026-04-02" },
      { id: "c", createdAt: "2026-04-01" },
    ];

    expect(sortEmployeesByCustomOrder(employees).map((employee) => employee.id))
      .toEqual(["c", "a", "b"]);
  });
});

describe("getNextEmployeeSortOrder", () => {
  it("appends new employees after the highest persisted order", () => {
    expect(
      getNextEmployeeSortOrder([
        { id: "a", sortOrder: 0 },
        { id: "b", sortOrder: 2 },
        { id: "c" },
      ]),
    ).toBe(3);
  });
});

describe("moveInVisibleOrder", () => {
  const all = ["a", "b", "c", "d"];

  it("moving the first visible person up does nothing", () => {
    expect(
      moveInVisibleOrder({
        orderedIds: all,
        visibleIds: all,
        id: "a",
        direction: -1,
      }),
    ).toBeNull();
  });

  it("moving the last visible person down does nothing", () => {
    expect(
      moveInVisibleOrder({
        orderedIds: all,
        visibleIds: all,
        id: "d",
        direction: 1,
      }),
    ).toBeNull();
  });

  it("swaps with the neighbour in an unfiltered list", () => {
    expect(
      moveInVisibleOrder({
        orderedIds: all,
        visibleIds: all,
        id: "c",
        direction: -1,
      }),
    ).toEqual(["a", "c", "b", "d"]);
  });

  it("under a filter, swaps the visible neighbour and not a hidden one", () => {
    // The production roster hides "b" and "d" (they are not production
    // workers). Moving "c" up must trade places with "a" — the person above it
    // on screen — not with the hidden "b" sitting between them.
    const result = moveInVisibleOrder({
      orderedIds: all,
      visibleIds: ["a", "c"],
      id: "c",
      direction: -1,
    });

    expect(result).toEqual(["c", "b", "a", "d"]);
    // What the user sees really did change.
    expect(result?.filter((id) => id === "a" || id === "c")).toEqual(["c", "a"]);
  });

  it("is a no-op at the edge of the visible list even when hidden rows follow", () => {
    expect(
      moveInVisibleOrder({
        orderedIds: all,
        visibleIds: ["a", "c"],
        id: "c",
        direction: 1,
      }),
    ).toBeNull();
  });

  it("ignores a person who is not on screen", () => {
    expect(
      moveInVisibleOrder({
        orderedIds: all,
        visibleIds: ["a", "c"],
        id: "b",
        direction: -1,
      }),
    ).toBeNull();
  });

  it("round-trips: the saved order sorts back to what the screen showed", () => {
    const employees = all.map((id, index) => ({ id, sortOrder: index }));
    const next = moveInVisibleOrder({
      orderedIds: all,
      visibleIds: ["a", "c"],
      id: "c",
      direction: -1,
    });

    // Persisting is "index in the new array becomes sortOrder".
    const saved = employees.map((employee) => ({
      ...employee,
      sortOrder: next!.indexOf(employee.id),
    }));

    expect(sortEmployeesByCustomOrder(saved).map((e) => e.id)).toEqual(next);
  });

  it("a move and its reverse return the original order", () => {
    const forward = moveInVisibleOrder({
      orderedIds: all,
      visibleIds: ["a", "c"],
      id: "c",
      direction: -1,
    })!;
    const back = moveInVisibleOrder({
      orderedIds: forward,
      visibleIds: ["c", "a"],
      id: "c",
      direction: 1,
    });

    expect(back).toEqual(all);
  });
});
