import { describe, expect, it } from "vitest";
import { buildPrintableAttendanceSalaryRangeHtml } from "./salaryService";
import type { MonthSalaryDayRow } from "@/lib/utils/attendanceStats";

/**
 * The printed attendance sheet used to work out what Sundays had paid by
 * multiplying "Sundays worked" by one day's pay. That is right only while every
 * Sunday pays the same, so the moment extra Sunday pay applied the paper
 * disagreed with the payroll table — and the paper is what the worker is handed.
 */
function sundayRow(date: string, basePay: number): MonthSalaryDayRow {
  return {
    date,
    weekdayShort: "Sun",
    rowKind: "sunday",
    statusLabel: "Sunday (marked present — bonus day)",
    hoursWorked: null,
    hoursExtra: null,
    hoursReduced: null,
    effectiveHours: 8,
    paidFraction: 1,
    basePay,
    productionPay: 0,
  };
}

function baseInput(overrides: Partial<Parameters<typeof buildPrintableAttendanceSalaryRangeHtml>[0]> = {}) {
  return {
    employeeName: "Asha",
    monthLabel: "April 2026",
    rangeLabel: "1 Apr 2026 – 30 Apr 2026",
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    monthlySalary: 30000,
    ratePerDay: 1000,
    ratePerHour: 125,
    summary: {
      presentDays: 26,
      absentDays: 0,
      holidayPresentDays: 0,
      earnedSundayPayDays: 0,
      sundayPresentBonusDays: 2,
      totalPaidDays: 28,
      totalHoursWorked: 208,
      hoursExtraTotal: 0,
      hoursReducedTotal: 0,
      sundayPremiumExtraPay: 0,
      calculatedSalary: 28000,
    },
    dayRows: [sundayRow("2026-04-05", 1000), sundayRow("2026-04-12", 1000)],
    ...overrides,
  };
}

describe("buildPrintableAttendanceSalaryRangeHtml", () => {
  it("prints Sundays worked at the flat daily rate when nothing pays extra", () => {
    const html = buildPrintableAttendanceSalaryRangeHtml(baseInput());
    expect(html).toContain("<strong>Sun. +:</strong> 2 (₹2,000)");
  });

  it("prints what the Sundays actually paid when extra Sunday pay applies", () => {
    const html = buildPrintableAttendanceSalaryRangeHtml(
      baseInput({
        dayRows: [sundayRow("2026-04-05", 1000), sundayRow("2026-04-12", 1500)],
        sundayMarkBonusPay: 2500,
      }),
    );

    // Still two Sundays, but ₹2,500 rather than the ₹2,000 the old formula
    // would have printed under a total that already included the extra.
    expect(html).toContain("<strong>Sun. +:</strong> 2 (₹2,500)");
    expect(html).not.toContain("<strong>Sun. +:</strong> 2 (₹2,000)");
  });
});
