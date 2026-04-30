import { getEmployees } from "./employeeService";
import { getAttendanceInRange } from "./attendanceService";
import { getHolidaysInRange } from "./factoryHolidayService";
import { getShifts } from "./shiftService";
import {
  getSundayCategories,
  resolveSundayCategoryRule,
} from "./sundayCategoryService";
import {
  getCalendarDaysInMonth,
  getRatePerDay,
  getRatePerHour,
} from "@/lib/utils/salaryRates";
import {
  getMonthRange,
} from "@/lib/utils/date";
import {
  buildAttendanceSalarySummaryForRange,
} from "@/lib/utils/attendanceStats";

export interface SalarySheetRow {
  id: string;
  name: string;
  presentDays: number;
  absentDays: number;
  /** Extra pay days from 15-day in-month cycles (max 4 / month) */
  earnedSundayPayDays: number;
  /** Sundays marked present — one extra daily rate each */
  sundayPresentBonusDays: number;
  totalPaidDays: number;
  monthlySalary: number;
  ratePerDay: number;
  ratePerHour: number;
  hoursExtraTotal: number;
  hoursReducedTotal: number;
  calculatedSalary: number;
}

export async function getSalarySheetForMonth(
  year: number,
  month: number
): Promise<{
  rows: SalarySheetRow[];
  from: string;
  to: string;
  holidayDates: string[];
  calendarDaysInMonth: number;
}> {
  const { from, to } = getMonthRange(year, month);
  return getSalarySheetForRange(year, month, from, to);
}

export async function getSalarySheetForRange(
  year: number,
  month: number,
  from: string,
  to: string,
): Promise<{
  rows: SalarySheetRow[];
  from: string;
  to: string;
  holidayDates: string[];
  calendarDaysInMonth: number;
}> {
  const [employees, attendance, holidays, shifts, sundayCategories] = await Promise.all([
    getEmployees(true),
    getAttendanceInRange(from, to),
    getHolidaysInRange(from, to),
    getShifts(),
    getSundayCategories(),
  ]);

  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, (s.hoursPerDay as number) ?? 8])
  );
  const sundayCategoryMap = Object.fromEntries(
    sundayCategories.map((c) => [c.id, c]),
  );

  const holidayDates = holidays.map((h) => h.date as string);
  const calendarDaysInMonth = getCalendarDaysInMonth(year, month);

  // Attendance by employee+date
  const attByEmpDate = new Map<
    string,
    Map<string, { status: string; hoursWorked?: number; hoursReduced?: number; hoursExtra?: number }>
  >();
  attendance.forEach((a) => {
    const empId = a.employeeId as string;
    const date = a.date as string;
    if (!attByEmpDate.has(empId)) attByEmpDate.set(empId, new Map());
    attByEmpDate.get(empId)!.set(date, {
      status: a.status as string,
      hoursWorked: a.hoursWorked as number | undefined,
      hoursReduced: a.hoursReduced as number | undefined,
      hoursExtra: a.hoursExtra as number | undefined,
    });
  });

  const rows: SalarySheetRow[] = employees.map((emp) => {
    const empId = emp.id as string;
    const monthlySalary = (emp.monthlySalary as number) ?? 0;
    const ratePerDay = getRatePerDay(monthlySalary, calendarDaysInMonth);
    const shiftId = emp.shiftId as string | undefined;
    const hoursPerDay = shiftId ? (shiftMap[shiftId] ?? 8) : 8;
    const sundayCategoryId = emp.sundayCategoryId as string | undefined;
    const sundayCategory = sundayCategoryId
      ? sundayCategoryMap[sundayCategoryId]
      : undefined;
    const sundayCategoryRule = resolveSundayCategoryRule(sundayCategory);
    const ratePerHour = getRatePerHour(
      monthlySalary,
      calendarDaysInMonth,
      hoursPerDay
    );
    const empAtt = attByEmpDate.get(empId) ?? new Map();
    const attendance = Array.from(empAtt.entries()).map(([date, att]) => ({
      date,
      status: att.status,
      hoursWorked: att.hoursWorked,
      hoursReduced: att.hoursReduced,
      hoursExtra: att.hoursExtra,
    }));
    const summary = buildAttendanceSalarySummaryForRange({
      fromDate: from,
      toDate: to,
      holidayDates,
      attendance,
      hoursPerDay,
      ratePerDay,
      sundayCategoryRule,
    });

    return {
      id: empId,
      name: (emp.name as string) || "Unknown",
      presentDays: summary.presentDays,
      absentDays: summary.absentDays,
      earnedSundayPayDays: summary.earnedSundayPayDays,
      sundayPresentBonusDays: summary.sundayPresentBonusDays,
      totalPaidDays: summary.totalPaidDays,
      monthlySalary,
      ratePerDay,
      ratePerHour,
      hoursExtraTotal: summary.hoursExtraTotal,
      hoursReducedTotal: summary.hoursReducedTotal,
      calculatedSalary: summary.calculatedSalary,
    };
  });

  return {
    rows,
    from,
    to,
    holidayDates,
    calendarDaysInMonth,
  };
}
