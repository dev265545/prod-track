import { describe, expect, it } from "vitest";
import { applySalaryTargetsToDayRows } from "./salarySheetDayDisplay";
import type { MonthSalaryDayRow } from "./attendanceStats";
import { messages } from "@/lib/i18n/messages";
import { translatorFor } from "@/lib/i18n/translate";

function workingDay(date: string): MonthSalaryDayRow {
  return {
    date,
    weekdayShort: "Mon",
    rowKind: "working",
    statusLabel: "Absent",
    hoursWorked: null,
    hoursExtra: null,
    hoursReduced: null,
    effectiveHours: null,
    paidFraction: 0,
    basePay: 0,
    productionPay: 0,
  };
}

function sundayDay(date: string): MonthSalaryDayRow {
  return {
    date,
    weekdayShort: "Sun",
    rowKind: "sunday",
    statusLabel: "Sunday",
    hoursWorked: null,
    hoursExtra: null,
    hoursReduced: null,
    effectiveHours: null,
    paidFraction: 0,
    basePay: 0,
    productionPay: 0,
  };
}

describe("applySalaryTargetsToDayRows", () => {
  it("marks a stable set of working and Sunday rows as paid", () => {
    const rows = [
      workingDay("2026-04-06"),
      workingDay("2026-04-07"),
      workingDay("2026-04-08"),
      workingDay("2026-04-09"),
      sundayDay("2026-04-05"),
      sundayDay("2026-04-12"),
    ];

    const adjusted = applySalaryTargetsToDayRows(
      rows,
      {
        presentDays: 2,
        holidayPresentDays: 0,
        sundayPresentBonusDays: 1,
      },
      300,
      8,
      "emp_1:2026-04-06:2026-04-12",
    );

    const paidWorking = adjusted.filter(
      (row) => row.rowKind === "working" && row.paidFraction > 0,
    );
    const paidSunday = adjusted.filter(
      (row) => row.rowKind === "sunday" && row.paidFraction > 0,
    );

    expect(paidWorking).toHaveLength(2);
    expect(paidSunday).toHaveLength(1);
    expect(paidWorking.every((row) => row.basePay === 300)).toBe(true);
    expect(paidSunday[0]?.basePay).toBe(300);
  });

  it("is stable for the same seed", () => {
    const rows = [
      workingDay("2026-04-01"),
      workingDay("2026-04-02"),
      workingDay("2026-04-03"),
    ];
    const targets = {
      presentDays: 2,
      holidayPresentDays: 0,
      sundayPresentBonusDays: 0,
    };
    const first = applySalaryTargetsToDayRows(
      rows,
      targets,
      300,
      8,
      "emp_1",
    );
    const second = applySalaryTargetsToDayRows(
      rows,
      targets,
      300,
      8,
      "emp_1",
    );
    expect(first.map((row) => row.date)).toEqual(second.map((row) => row.date));
  });

  it("writes every day-status word in the chosen language", () => {
    const rows = [
      workingDay("2026-04-06"),
      workingDay("2026-04-07"),
      sundayDay("2026-04-05"),
    ];

    const adjusted = applySalaryTargetsToDayRows(
      rows,
      {
        presentDays: 1,
        holidayPresentDays: 0,
        sundayPresentBonusDays: 1,
      },
      300,
      8,
      "emp_1",
      translatorFor("hi"),
    );

    // Nothing that lands on a printed sheet may be in English here.
    expect(adjusted.map((row) => row.statusLabel)).toEqual([
      messages.hi.calTitlePresent,
      messages.hi.calTitleAbsent,
      messages.hi.dayStatusSundayWorked,
    ]);
    for (const row of adjusted) {
      expect(row.statusLabel).not.toMatch(/[A-Za-z]/);
    }
  });

  it("falls back to English day-status words when no language is stored", () => {
    const adjusted = applySalaryTargetsToDayRows(
      [sundayDay("2026-04-05")],
      { presentDays: 0, holidayPresentDays: 0, sundayPresentBonusDays: 0 },
      300,
      8,
      "emp_1",
    );
    expect(adjusted[0]?.statusLabel).toBe(messages.en.dayStatusSunday);
  });
});
