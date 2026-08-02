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

  it("does not overwrite an explicit type even when the guess would differ", async () => {
    // Explicitly "salaried" but has production records: the guess is irrelevant.
    vi.mocked(getEmployees).mockResolvedValue([
      { id: "emp_5", employeeType: "salaried", employeeTypeConfirmed: false },
    ]);
    vi.mocked(getProductionsByEmployee).mockResolvedValue([
      { id: "prod_9", employeeId: "emp_5", date: "2026-01-01" },
    ]);

    const result = await backfillEmployeeTypes();

    expect(result.updated).toEqual([]);
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  it("leaves a human-confirmed employee alone even without a type", async () => {
    vi.mocked(getEmployees).mockResolvedValue([
      { id: "emp_6", employeeTypeConfirmed: true },
    ]);
    vi.mocked(getProductionsByEmployee).mockResolvedValue([]);

    const result = await backfillEmployeeTypes();

    expect(result.updated).toEqual([]);
    expect(saveEmployee).not.toHaveBeenCalled();
  });

  it("never marks a guess as confirmed", async () => {
    vi.mocked(getEmployees).mockResolvedValue([
      { id: "emp_7", monthlySalary: 12000 },
      { id: "emp_8" },
    ]);
    vi.mocked(getProductionsByEmployee).mockResolvedValue([
      { id: "prod_2", employeeId: "emp_8", date: "2026-01-01" },
    ]);

    await backfillEmployeeTypes();

    expect(saveEmployee).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(saveEmployee).mock.calls) {
      expect(call[0].employeeTypeConfirmed).toBe(false);
      expect(call[0].employeeTypeConfirmed).not.toBe(true);
    }
  });

  it("is idempotent: a second run writes nothing", async () => {
    const stored: Record<string, unknown>[] = [{ id: "emp_9" }];
    vi.mocked(getEmployees).mockImplementation(async () => stored);
    vi.mocked(getProductionsByEmployee).mockResolvedValue([]);
    vi.mocked(saveEmployee).mockImplementation(async (e) => {
      const idx = stored.findIndex((s) => s.id === e.id);
      if (idx >= 0) stored[idx] = { ...stored[idx], ...e };
      return e;
    });

    const first = await backfillEmployeeTypes();
    expect(first.updated).toEqual(["emp_9"]);
    expect(saveEmployee).toHaveBeenCalledTimes(1);

    const second = await backfillEmployeeTypes();
    expect(second.updated).toEqual([]);
    expect(saveEmployee).toHaveBeenCalledTimes(1);
    expect(stored[0]).toMatchObject({
      employeeType: "salaried",
      employeeTypeConfirmed: false,
    });
  });
});
