import { describe, expect, it } from "vitest";
import { buildPrintableAttendanceSalaryRangeHtml } from "./salaryService";

describe("buildPrintableAttendanceSalaryRangeHtml", () => {
  it("renders per-day attendance rows for the selected range", () => {
    const html = buildPrintableAttendanceSalaryRangeHtml({
      employeeName: "Asha",
      monthLabel: "April 2026",
      rangeLabel: "10-15 Apr 2026",
      fromDate: "2026-04-10",
      toDate: "2026-04-15",
      monthlySalary: 9000,
      ratePerDay: 300,
      ratePerHour: 38,
      summary: {
        presentDays: 1.75,
        absentDays: 3,
        earnedSundayPayDays: 0,
        sundayPresentBonusDays: 0,
        totalPaidDays: 1.75,
        totalHoursWorked: 14,
        hoursExtraTotal: 2,
        hoursReducedTotal: 4,
        calculatedSalary: 525,
      },
      dayRows: [
        {
          date: "2026-04-10",
          weekdayShort: "Fri",
          rowKind: "working",
          statusLabel: "Present",
          hoursWorked: null,
          hoursExtra: 2,
          hoursReduced: null,
          effectiveHours: 10,
          paidFraction: 1.25,
          basePay: 375,
          productionPay: 0,
        },
        {
          date: "2026-04-11",
          weekdayShort: "Sat",
          rowKind: "working",
          statusLabel: "Present",
          hoursWorked: null,
          hoursExtra: null,
          hoursReduced: 4,
          effectiveHours: 4,
          paidFraction: 0.5,
          basePay: 150,
          productionPay: 0,
        },
      ],
    });

    expect(html).toContain("Daily breakdown");
    expect(html).toContain("10 Apr 2026");
    expect(html).toContain("Present");
    expect(html).toContain("1.25");
    expect(html).toContain("₹375");
    expect(html).toContain("15 Apr 2026");
  });
});
