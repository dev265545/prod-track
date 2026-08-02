import { describe, expect, it } from "vitest";
import {
  adjustCustomRange,
  computeDayHours,
  computeSettlement,
  findAttendanceForDate,
  getEmployeeSections,
  getMonthIsoBounds,
  hoursInputsChanged,
  hoursInputsForDate,
  indexById,
  monthPickerOptions,
  parseHoursInput,
  parseMonthPickerValue,
  pickInitialPeriod,
  resolveEmployeeType,
  resolveHoursInputs,
  resolveSalaryRange,
  salarySheetRequestKey,
  sumAdvances,
  sumProductionValue,
  sumQuantity,
} from "./employeeDetail";

describe("resolveEmployeeType", () => {
  it("keeps the known types", () => {
    expect(resolveEmployeeType("production")).toBe("production");
    expect(resolveEmployeeType("operator")).toBe("operator");
    expect(resolveEmployeeType("salaried")).toBe("salaried");
  });

  it("falls back to salaried for missing or unknown values", () => {
    expect(resolveEmployeeType(undefined)).toBe("salaried");
    expect(resolveEmployeeType("")).toBe("salaried");
    expect(resolveEmployeeType("contractor")).toBe("salaried");
  });
});

describe("getEmployeeSections", () => {
  const opts = { isAdmin: true, hasStoredSalaryRecords: true };

  it("shows pay settings and attendance salary for salaried staff", () => {
    const s = getEmployeeSections("salaried", opts);
    expect(s.paySettings).toBe(true);
    expect(s.attendanceSalary).toBe(true);
    expect(s.operatorSettings).toBe(false);
    expect(s.productionLog).toBe(false);
    expect(s.hideRates).toBe(false);
  });

  it("swaps the salaried sections for the production ones", () => {
    const s = getEmployeeSections("production", opts);
    expect(s.paySettings).toBe(false);
    expect(s.attendanceSalary).toBe(false);
    expect(s.productionAdvances).toBe(true);
    expect(s.productionLog).toBe(true);
  });

  it("gives operators the operator settings, admin only", () => {
    expect(getEmployeeSections("operator", opts).operatorSettings).toBe(true);
    expect(
      getEmployeeSections("operator", { ...opts, isAdmin: false })
        .operatorSettings,
    ).toBe(false);
  });

  it("hides money from non-admins viewing an operator only", () => {
    expect(
      getEmployeeSections("operator", { ...opts, isAdmin: false }).hideRates,
    ).toBe(true);
    expect(
      getEmployeeSections("salaried", { ...opts, isAdmin: false }).hideRates,
    ).toBe(false);
    expect(getEmployeeSections("operator", opts).hideRates).toBe(false);
  });

  it("hides stored salary records unless admin and non-empty", () => {
    expect(getEmployeeSections("salaried", opts).storedSalaryRecords).toBe(true);
    expect(
      getEmployeeSections("salaried", { ...opts, hasStoredSalaryRecords: false })
        .storedSalaryRecords,
    ).toBe(false);
    expect(
      getEmployeeSections("salaried", { ...opts, isAdmin: false })
        .storedSalaryRecords,
    ).toBe(false);
  });
});

describe("getMonthIsoBounds", () => {
  it("pads single-digit months and uses the real last day", () => {
    expect(getMonthIsoBounds(2026, 1)).toEqual({
      monthStart: "2026-02-01",
      monthEnd: "2026-02-28",
    });
    expect(getMonthIsoBounds(2024, 1).monthEnd).toBe("2024-02-29");
    expect(getMonthIsoBounds(2026, 11)).toEqual({
      monthStart: "2026-12-01",
      monthEnd: "2026-12-31",
    });
  });
});

describe("monthPickerOptions", () => {
  it("counts backwards from the given month", () => {
    const opts = monthPickerOptions(3, "en", new Date(2026, 0, 15));
    expect(opts.map((o) => o.value)).toEqual(["2026-0", "2025-11", "2025-10"]);
  });

  it("round-trips through parseMonthPickerValue", () => {
    const [first] = monthPickerOptions(1, "en", new Date(2026, 6, 2));
    expect(parseMonthPickerValue(first.value)).toEqual({ year: 2026, month: 6 });
  });

  it("rejects junk picker values", () => {
    expect(parseMonthPickerValue("nonsense")).toBeNull();
  });
});

describe("totals", () => {
  const productions = [
    { itemId: "a", quantity: 3 },
    { itemId: "b", quantity: 2 },
    { itemId: "a" },
  ];
  const rates: Record<string, number> = { a: 10, b: 25 };

  it("sums quantities, treating missing as zero", () => {
    expect(sumQuantity(productions)).toBe(5);
  });

  it("values production at the item rate", () => {
    expect(sumProductionValue(productions, (itemId) => rates[itemId] ?? 0)).toBe(
      80,
    );
  });

  it("values unknown items at zero rather than NaN", () => {
    expect(sumProductionValue([{ itemId: "zz", quantity: 4 }], () => 0)).toBe(0);
  });

  it("sums advances", () => {
    expect(sumAdvances([{ amount: 500 }, { amount: 250 }, {}])).toBe(750);
  });
});

describe("indexById", () => {
  it("keys rows by id", () => {
    expect(indexById([{ id: "x", name: "X" }])).toEqual({
      x: { id: "x", name: "X" },
    });
  });
});

describe("computeSettlement", () => {
  it("computes net and remaining advance", () => {
    expect(
      computeSettlement({ gross: 10000, totalAdvancePaid: 4000, advanceToCut: 1500 }),
    ).toEqual({ net: 8500, advanceLeft: 2500 });
  });

  it("never goes negative", () => {
    expect(
      computeSettlement({ gross: 1000, totalAdvancePaid: 500, advanceToCut: 4000 }),
    ).toEqual({ net: 0, advanceLeft: 0 });
  });
});

describe("computeDayHours", () => {
  it("is zero when the day is absent or unmarked", () => {
    expect(computeDayHours(undefined, 8)).toBe(0);
    expect(computeDayHours({ status: "absent" }, 8)).toBe(0);
  });

  it("prefers the recorded hours worked", () => {
    expect(computeDayHours({ status: "present", hoursWorked: 6 }, 8)).toBe(6);
  });

  it("falls back to shift hours plus the adjustment", () => {
    expect(
      computeDayHours({ status: "present", hoursExtra: 2, hoursReduced: 1 }, 8),
    ).toBe(9);
    expect(computeDayHours({ status: "present" }, 8)).toBe(8);
  });
});

describe("resolveSalaryRange", () => {
  const base = {
    year: 2026,
    month: 6,
    customFrom: "",
    customTo: "",
    locale: "en" as const,
  };

  it("resolves the full month", () => {
    const r = resolveSalaryRange({ ...base, mode: "full-month" });
    expect(r.from).toBe("2026-07-01");
    expect(r.to).toBe("2026-07-31");
  });

  it("resolves the halves", () => {
    expect(resolveSalaryRange({ ...base, mode: "first-half" }).to).toBe(
      "2026-07-15",
    );
    expect(resolveSalaryRange({ ...base, mode: "second-half" }).from).toBe(
      "2026-07-16",
    );
  });

  it("clamps a custom range into the month", () => {
    const r = resolveSalaryRange({
      ...base,
      mode: "custom",
      customFrom: "2026-06-02",
      customTo: "2026-09-20",
    });
    expect(r.from).toBe("2026-07-01");
    expect(r.to).toBe("2026-07-31");
  });

  it("swaps a reversed custom range instead of showing an empty period", () => {
    const r = resolveSalaryRange({
      ...base,
      mode: "custom",
      customFrom: "2026-07-20",
      customTo: "2026-07-05",
    });
    expect(r.from).toBe("2026-07-05");
    expect(r.to).toBe("2026-07-20");
  });

  it("defaults an empty custom range to the whole month", () => {
    const r = resolveSalaryRange({ ...base, mode: "custom" });
    expect(r.from).toBe("2026-07-01");
    expect(r.to).toBe("2026-07-31");
  });
});

describe("adjustCustomRange", () => {
  it("pushes the end forward when the start passes it", () => {
    expect(
      adjustCustomRange({
        edited: "from",
        value: "2026-07-20",
        currentFrom: "2026-07-01",
        currentTo: "2026-07-10",
        year: 2026,
        month: 6,
      }),
    ).toEqual({ from: "2026-07-20", to: "2026-07-20" });
  });

  it("pulls the start back when the end goes before it", () => {
    expect(
      adjustCustomRange({
        edited: "to",
        value: "2026-07-03",
        currentFrom: "2026-07-10",
        currentTo: "2026-07-20",
        year: 2026,
        month: 6,
      }),
    ).toEqual({ from: "2026-07-03", to: "2026-07-03" });
  });

  it("leaves a valid range alone", () => {
    expect(
      adjustCustomRange({
        edited: "from",
        value: "2026-07-05",
        currentFrom: "2026-07-01",
        currentTo: "2026-07-20",
        year: 2026,
        month: 6,
      }),
    ).toEqual({ from: "2026-07-05", to: "2026-07-20" });
  });
});

describe("hours inputs", () => {
  const dayA = { date: "2026-07-01", status: "present", hoursExtra: 2 };
  const dayB = { date: "2026-07-02", status: "present" };
  const attendance = [dayA, dayB];

  it("reads the stored hours for a present day", () => {
    expect(hoursInputsForDate(dayA)).toEqual({ reduced: "", extra: "2" });
  });

  it("is blank for an absent or missing day", () => {
    expect(hoursInputsForDate({ status: "absent", hoursExtra: 3 })).toEqual({
      reduced: "",
      extra: "",
    });
    expect(hoursInputsForDate(undefined)).toEqual({ reduced: "", extra: "" });
  });

  it("keeps a draft that belongs to the selected day", () => {
    const draft = { date: "2026-07-01", reduced: "1", extra: "4" };
    expect(resolveHoursInputs(draft, "2026-07-01", dayA)).toEqual({
      reduced: "1",
      extra: "4",
    });
  });

  it("does NOT carry a draft typed on day A over to day B", () => {
    const draft = { date: "2026-07-01", reduced: "1", extra: "4" };
    expect(
      resolveHoursInputs(
        draft,
        "2026-07-02",
        findAttendanceForDate(attendance, "2026-07-02"),
      ),
    ).toEqual({ reduced: "", extra: "" });
  });

  it("parses only non-negative numbers", () => {
    expect(parseHoursInput("")).toBeUndefined();
    expect(parseHoursInput("abc")).toBeUndefined();
    expect(parseHoursInput("-2")).toBeUndefined();
    expect(parseHoursInput("0")).toBe(0);
    expect(parseHoursInput("1.5")).toBe(1.5);
  });

  it("detects a change against the stored values", () => {
    expect(hoursInputsChanged(dayA, "", "2")).toBe(false);
    expect(hoursInputsChanged(dayA, "", "3")).toBe(true);
    expect(hoursInputsChanged(dayB, "1", "")).toBe(true);
    expect(hoursInputsChanged(undefined, "", "")).toBe(false);
  });
});

describe("findAttendanceForDate", () => {
  const rows = [{ date: "2026-07-01" }, { date: "2026-07-02" }];

  it("finds the row for a date", () => {
    expect(findAttendanceForDate(rows, "2026-07-02")).toEqual({
      date: "2026-07-02",
    });
  });

  it("returns nothing when no day is selected", () => {
    expect(findAttendanceForDate(rows, null)).toBeUndefined();
  });
});

describe("pickInitialPeriod", () => {
  const current = { from: "2026-07-01", to: "2026-07-15", label: "Jul 1-15" };

  it("uses today's period when it has data", () => {
    const withData = [
      { from: "2026-06-01", to: "2026-06-15", label: "Jun 1-15" },
      current,
    ];
    expect(pickInitialPeriod(withData, current)).toEqual({
      periods: withData,
      from: "2026-07-01",
      to: "2026-07-15",
    });
  });

  it("falls back to the latest period with data", () => {
    const withData = [
      { from: "2026-05-01", to: "2026-05-15", label: "May 1-15" },
      { from: "2026-06-01", to: "2026-06-15", label: "Jun 1-15" },
    ];
    expect(pickInitialPeriod(withData, current)).toMatchObject({
      from: "2026-06-01",
      to: "2026-06-15",
    });
  });

  it("uses the current period when nothing has data", () => {
    expect(pickInitialPeriod([], current)).toEqual({
      periods: [current],
      from: "2026-07-01",
      to: "2026-07-15",
    });
  });
});

describe("salarySheetRequestKey", () => {
  it("matches for identical ranges so the page can fetch once", () => {
    expect(salarySheetRequestKey("e1", "2026-07-01", "2026-07-31")).toBe(
      salarySheetRequestKey("e1", "2026-07-01", "2026-07-31"),
    );
    expect(salarySheetRequestKey("e1", "2026-07-01", "2026-07-31")).not.toBe(
      salarySheetRequestKey("e1", "2026-07-01", "2026-07-15"),
    );
  });
});
