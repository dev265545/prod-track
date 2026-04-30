import { describe, expect, it } from "vitest";
import {
  getNextEmployeeSortOrder,
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
