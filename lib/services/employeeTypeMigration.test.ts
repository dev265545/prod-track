import { describe, expect, it, vi, beforeEach } from "vitest";
import { inferEmployeeType, backfillEmployeeTypes } from "./employeeTypeMigration";

vi.mock("./employeeService", () => ({
  getEmployees: vi.fn(),
  saveEmployee: vi.fn(),
}));

vi.mock("./productionService", () => ({
  getProductionsByEmployee: vi.fn(),
}));

import { getEmployees, saveEmployee } from "./employeeService";
import { getProductionsByEmployee } from "./productionService";

describe("inferEmployeeType", () => {
  it("monthlySalary only -> salaried", () => {
    expect(
      inferEmployeeType({ hasMonthlySalary: true, hasProductionRecords: false })
    ).toBe("salaried");
  });

  it("production only -> production", () => {
    expect(
      inferEmployeeType({ hasMonthlySalary: false, hasProductionRecords: true })
    ).toBe("production");
  });

  it("both present -> salaried (monthly salary wins, ambiguous default)", () => {
    expect(
      inferEmployeeType({ hasMonthlySalary: true, hasProductionRecords: true })
    ).toBe("salaried");
  });

  it("neither present -> salaried (ambiguous default)", () => {
    expect(
      inferEmployeeType({ hasMonthlySalary: false, hasProductionRecords: false })
    ).toBe("salaried");
  });
});

describe("backfillEmployeeTypes", () => {
  beforeEach(() => {
    vi.mocked(getEmployees).mockReset();
    vi.mocked(saveEmployee).mockReset();
    vi.mocked(getProductionsByEmployee).mockReset();
    vi.mocked(saveEmployee).mockImplementation(async (e) => e);
  });

  it("infers salaried for employee with monthlySalary", async () => {
    vi.mocked(getEmployees).mockResolvedValue([
      { id: "emp_1", monthlySalary: 9000 },
    ]);
    vi.mocked(getProductionsByEmployee).mockResolvedValue([]);

    const result = await backfillEmployeeTypes();

    expect(result.updated).toEqual(["emp_1"]);
    expect(saveEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "emp_1",
        employeeType: "salaried",
        employeeTypeConfirmed: false,
      })
    );
  });

  it("infers production for employee with only production records", async () => {
    vi.mocked(getEmployees).mockResolvedValue([{ id: "emp_2" }]);
    vi.mocked(getProductionsByEmployee).mockResolvedValue([
      { id: "prod_1", employeeId: "emp_2", date: "2026-01-01" },
    ]);

    const result = await backfillEmployeeTypes();

    expect(result.updated).toEqual(["emp_2"]);
    expect(saveEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "emp_2",
        employeeType: "production",
        employeeTypeConfirmed: false,
      })
    );
  });

  it("infers salaried (default) for employee with neither signal", async () => {
    vi.mocked(getEmployees).mockResolvedValue([{ id: "emp_3" }]);
    vi.mocked(getProductionsByEmployee).mockResolvedValue([]);

    const result = await backfillEmployeeTypes();

    expect(result.updated).toEqual(["emp_3"]);
    expect(saveEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "emp_3",
        employeeType: "salaried",
        employeeTypeConfirmed: false,
      })
    );
  });

  it("does not touch employees that already have employeeType set", async () => {
    vi.mocked(getEmployees).mockResolvedValue([
      { id: "emp_4", employeeType: "operator", employeeTypeConfirmed: true },
    ]);
    vi.mocked(getProductionsByEmployee).mockResolvedValue([]);

    const result = await backfillEmployeeTypes();

    expect(result.updated).toEqual([]);
    expect(saveEmployee).not.toHaveBeenCalled();
  });
});
