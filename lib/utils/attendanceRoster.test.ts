import { describe, it, expect, vi } from "vitest";
import {
  buildAttendancePayload,
  buildRoster,
  deriveMark,
  getDayKind,
  rowsToFillPresent,
  runWithConcurrency,
  summarizeRoster,
  type RosterRow,
} from "./attendanceRoster";
import { computeDayPayFraction } from "./attendanceStats";

const shifts = {
  day: { name: "Day", hoursPerDay: 8 },
  long: { name: "Long", hoursPerDay: 12 },
};

function row(over: Partial<RosterRow>): RosterRow {
  return {
    employeeId: "e1",
    name: "A",
    shiftName: null,
    hoursPerDay: 8,
    mark: null,
    hoursExtra: 0,
    hoursReduced: 0,
    ...over,
  };
}

describe("deriveMark", () => {
  it("treats a missing record as not-yet-marked, not as absent", () => {
    expect(deriveMark(undefined)).toBeNull();
  });

  it("reads the two stored statuses", () => {
    expect(deriveMark({ employeeId: "e1", date: "d", status: "present" })).toBe(
      "present",
    );
    expect(deriveMark({ employeeId: "e1", date: "d", status: "absent" })).toBe(
      "absent",
    );
  });

  it("still reads an old half-day row as an ordinary present day", () => {
    expect(
      deriveMark({
        employeeId: "e1",
        date: "d",
        status: "present",
        hoursReduced: 4,
      }),
    ).toBe("present");
  });

  it("ignores an unknown status rather than guessing", () => {
    expect(deriveMark({ employeeId: "e1", date: "d", status: "leave" })).toBeNull();
  });
});

describe("buildAttendancePayload", () => {
  it("still pays a hand-entered half shift as exactly half a day", () => {
    const payload = buildAttendancePayload({
      employeeId: "e1",
      date: "2026-08-02",
      mark: "present",
      hoursReduced: 4,
    });
    expect(payload).toEqual({
      employeeId: "e1",
      date: "2026-08-02",
      status: "present",
      hoursReduced: 4,
    });
    expect(
      computeDayPayFraction({ hoursReduced: payload.hoursReduced as number }, 8),
    ).toBe(0.5);
  });

  it("round-trips every mark back through deriveMark", () => {
    for (const mark of ["present", "absent"] as const) {
      const payload = buildAttendancePayload({
        employeeId: "e1",
        date: "2026-08-02",
        mark,
      });
      expect(
        deriveMark(payload as unknown as Parameters<typeof deriveMark>[0]),
      ).toBe(mark);
    }
  });

  it("drops hours from an absent day so they cannot reach payroll", () => {
    expect(
      buildAttendancePayload({
        employeeId: "e1",
        date: "2026-08-02",
        mark: "absent",
        hoursExtra: 3,
        hoursReduced: 2,
        recordId: "att_1",
      }),
    ).toEqual({
      id: "att_1",
      employeeId: "e1",
      date: "2026-08-02",
      status: "absent",
    });
  });

  it("keeps hour adjustments on a present day and omits empty ones", () => {
    expect(
      buildAttendancePayload({
        employeeId: "e1",
        date: "2026-08-02",
        mark: "present",
        hoursExtra: 2,
      }),
    ).toEqual({
      employeeId: "e1",
      date: "2026-08-02",
      status: "present",
      hoursExtra: 2,
    });
  });

  it("clamps negative hand-typed hours to zero", () => {
    expect(
      buildAttendancePayload({
        employeeId: "e1",
        date: "2026-08-02",
        mark: "present",
        hoursExtra: -5,
        hoursReduced: -1,
      }),
    ).toEqual({ employeeId: "e1", date: "2026-08-02", status: "present" });
  });
});

describe("buildRoster", () => {
  const employees = [
    { id: "e1", name: "Asha", shiftId: "day" },
    { id: "e2", name: "Bimal", shiftId: "long" },
    { id: "e3", name: "Chand" },
    { id: "e4", name: "Left the job", isActive: false },
  ];

  it("leaves out production employees — they are paid for output, not days", () => {
    // Their day is recorded on /production. Listing them here left them stuck
    // as "still to write" forever, and "everyone is here" wrote present rows
    // that pay nothing, because their day-rate comes from a monthlySalary of 0.
    const rows = buildRoster({
      employees: [
        ...employees,
        { id: "e5", name: "Piece worker", employeeType: "production" },
      ],
      attendance: [],
      shiftsById: shifts,
    });
    expect(rows.map((r) => r.name)).not.toContain("Piece worker");
  });

  it("keeps only active employees, in the order given", () => {
    const rows = buildRoster({ employees, attendance: [], shiftsById: shifts });
    expect(rows.map((r) => r.name)).toEqual(["Asha", "Bimal", "Chand"]);
  });

  it("falls back to an 8h day when an employee has no shift", () => {
    const rows = buildRoster({ employees, attendance: [], shiftsById: shifts });
    expect(rows[1].hoursPerDay).toBe(12);
    expect(rows[2].hoursPerDay).toBe(8);
    expect(rows[2].shiftName).toBeNull();
  });

  it("leaves people with no record unmarked", () => {
    const rows = buildRoster({ employees, attendance: [], shiftsById: shifts });
    expect(rows.every((r) => r.mark === null)).toBe(true);
  });

  it("joins each employee to their own record", () => {
    const rows = buildRoster({
      employees,
      attendance: [
        { id: "a1", employeeId: "e1", date: "d", status: "present" },
        { id: "a2", employeeId: "e3", date: "d", status: "absent" },
      ],
      shiftsById: shifts,
    });
    expect(rows.map((r) => r.mark)).toEqual(["present", null, "absent"]);
    expect(rows[0].recordId).toBe("a1");
  });

  it("lets the last duplicate win, as the payroll readers do", () => {
    const rows = buildRoster({
      employees,
      attendance: [
        { id: "a1", employeeId: "e1", date: "d", status: "absent" },
        { id: "a2", employeeId: "e1", date: "d", status: "present" },
      ],
      shiftsById: shifts,
    });
    expect(rows[0].mark).toBe("present");
    expect(rows[0].recordId).toBe("a2");
  });

  it("surfaces hour adjustments on a present day and drops them on an absence", () => {
    const rows = buildRoster({
      employees,
      attendance: [
        { employeeId: "e1", date: "d", status: "present", hoursExtra: 2 },
        { employeeId: "e2", date: "d", status: "absent", hoursExtra: 3 },
      ],
      shiftsById: shifts,
    });
    expect(rows[0]).toMatchObject({ mark: "present", hoursExtra: 2 });
    expect(rows[1]).toMatchObject({ mark: "absent", hoursExtra: 0 });
  });

  /**
   * Rows written by the removed "Half day" button are present days carrying half
   * the shift as `hoursReduced`. Removing the button must not touch them: they
   * load as present, keep their reduction on screen, save back unchanged, and
   * still pay 0.5.
   */
  it("loads a legacy half-day row as a present day that keeps its reduced hours", () => {
    const rows = buildRoster({
      employees,
      attendance: [
        { id: "a1", employeeId: "e2", date: "d", status: "present", hoursReduced: 6 },
      ],
      shiftsById: shifts,
    });
    const legacy = rows[1];
    expect(legacy).toMatchObject({
      mark: "present",
      hoursReduced: 6,
      hoursPerDay: 12,
    });
    expect(computeDayPayFraction({ hoursReduced: legacy.hoursReduced }, 12)).toBe(
      0.5,
    );

    const payload = buildAttendancePayload({
      employeeId: legacy.employeeId,
      date: "d",
      mark: legacy.mark!,
      hoursExtra: legacy.hoursExtra,
      hoursReduced: legacy.hoursReduced,
      recordId: legacy.recordId,
    });
    expect(payload).toEqual({
      id: "a1",
      employeeId: "e2",
      date: "d",
      status: "present",
      hoursReduced: 6,
    });
  });
});

describe("summarizeRoster", () => {
  it("counts unmarked apart from absent", () => {
    const summary = summarizeRoster([
      row({ employeeId: "1", mark: "present" }),
      row({ employeeId: "2", mark: "present" }),
      row({ employeeId: "3", mark: "absent" }),
      row({ employeeId: "4", mark: "absent" }),
      row({ employeeId: "5", mark: null }),
    ]);
    expect(summary).toEqual({
      total: 5,
      marked: 4,
      present: 2,
      absent: 2,
      unmarked: 1,
      percent: 80,
    });
  });

  it("reports an empty roster as complete rather than dividing by zero", () => {
    expect(summarizeRoster([])).toMatchObject({ total: 0, percent: 100 });
  });
});

describe("getDayKind", () => {
  it("blocks a factory holiday", () => {
    expect(getDayKind("2026-08-15", ["2026-08-15"])).toBe("holiday");
  });

  it("marks a Sunday without blocking it", () => {
    expect(getDayKind("2026-08-02", [])).toBe("sunday");
  });

  it("treats an ordinary weekday as a working day", () => {
    expect(getDayKind("2026-08-03", ["2026-08-15"])).toBe("working");
  });

  it("lets a holiday win over a Sunday, since a holiday is the blocking one", () => {
    expect(getDayKind("2026-08-02", ["2026-08-02"])).toBe("holiday");
  });
});

describe("rowsToFillPresent", () => {
  it("only fills rows nobody has decided on yet", () => {
    const rows = [
      row({ employeeId: "1", mark: "absent" }),
      row({ employeeId: "2", mark: null }),
      row({ employeeId: "3", mark: "present" }),
      row({ employeeId: "4", mark: null }),
      row({ employeeId: "5", mark: "present" }),
    ];
    expect(rowsToFillPresent(rows).map((r) => r.employeeId)).toEqual(["2", "4"]);
  });
});

describe("runWithConcurrency", () => {
  /** Runs `work` over 1..n, recording how many were in flight at the peak. */
  async function measure(n: number, limit: number) {
    const items = Array.from({ length: n }, (_, i) => i);
    let inFlight = 0;
    let peak = 0;
    const order: number[] = [];
    const { failed } = await runWithConcurrency(items, limit, async (i) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      order.push(i);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return true;
    });
    return { peak, order, failed };
  }

  it("never exceeds the limit, and still visits everybody", async () => {
    const { peak, order, failed } = await measure(30, 4);
    expect(peak).toBeLessThanOrEqual(4);
    expect(failed).toBe(0);
    expect(order.slice().sort((a, b) => a - b)).toEqual(
      Array.from({ length: 30 }, (_, i) => i),
    );
  });

  it("does not spawn more workers than there are items", async () => {
    const { peak } = await measure(2, 8);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("keeps going after a failure and counts every one of them", async () => {
    const items = [1, 2, 3, 4, 5];
    const seen: number[] = [];
    const { failed } = await runWithConcurrency(items, 2, async (n) => {
      seen.push(n);
      if (n === 2) return false;
      if (n === 4) throw new Error("disk full");
      return true;
    });
    // A thrown write is a failure, not a crashed batch.
    expect(failed).toBe(2);
    expect(seen.slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("does nothing, successfully, when there is nothing to do", async () => {
    const work = vi.fn();
    const { failed } = await runWithConcurrency([], 4, work);
    expect(failed).toBe(0);
    expect(work).not.toHaveBeenCalled();
  });
});
