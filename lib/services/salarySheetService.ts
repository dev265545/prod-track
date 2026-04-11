import { getEmployees } from "./employeeService";
import { getAttendanceInRange } from "./attendanceService";
import { getHolidaysInRange } from "./factoryHolidayService";
import { getShifts } from "./shiftService";
import {
  getCalendarDaysInMonth,
  getRatePerDay,
  getRatePerHour,
} from "@/lib/utils/salaryRates";
import {
  getMonthRange,
  getWorkingDayDates,
  getDatesInRange,
  getSundayDatesInMonth,
} from "@/lib/utils/date";
import {
  computeDayPayFraction,
  getEarnedSundayPayUnits,
} from "@/lib/utils/attendanceStats";

export interface SalarySheetRow {
  id: string;
  name: string;
  presentDays: number;
  absentDays: number;
  /** Earned Sunday pay units (10/15/25/30-day step table on working presents) */
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
  const [employees, attendance, holidays, shifts] = await Promise.all([
    getEmployees(true),
    getAttendanceInRange(from, to),
    getHolidaysInRange(from, to),
    getShifts(),
  ]);

  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, (s.hoursPerDay as number) ?? 8])
  );

  const holidayDates = holidays.map((h) => h.date as string);
  const calendarDaysInMonth = getCalendarDaysInMonth(year, month);
  const workingDayDates = getWorkingDayDates(year, month, holidayDates);
  const monthDateList = getDatesInRange(from, to);
  const holidayDatesInMonth = monthDateList.filter((d) =>
    holidayDates.includes(d)
  );

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
    const ratePerHour = getRatePerHour(
      monthlySalary,
      calendarDaysInMonth,
      hoursPerDay
    );
    const empAtt = attByEmpDate.get(empId) ?? new Map();

    let paidWorkingDays = 0;
    let absentCount = 0;
    let hoursExtraTotal = 0;
    let hoursReducedTotal = 0;

    const bumpHours = (att: {
      hoursExtra?: number;
      hoursReduced?: number;
    }) => {
      const ex = att.hoursExtra ?? 0;
      const red = att.hoursReduced ?? 0;
      if (ex > 0) hoursExtraTotal += ex;
      if (red > 0) hoursReducedTotal += red;
    };

    for (const dateStr of workingDayDates) {
      const att = empAtt.get(dateStr);
      if (att?.status === "present") {
        paidWorkingDays += computeDayPayFraction(att, hoursPerDay);
        bumpHours(att);
      } else if (att?.status === "absent") {
        absentCount += 1;
      } else {
        absentCount += 1;
      }
    }

    for (const dateStr of holidayDatesInMonth) {
      const att = empAtt.get(dateStr);
      if (att?.status === "present") {
        bumpHours(att);
      }
    }

    let sundayPresentBonusDays = 0;
    for (const dateStr of getSundayDatesInMonth(year, month)) {
      const att = empAtt.get(dateStr);
      if (att?.status === "present") {
        sundayPresentBonusDays += 1;
        bumpHours(att);
      }
    }

    const paidRounded = Math.round(paidWorkingDays * 100) / 100;
    const earnedSundayPayDays = getEarnedSundayPayUnits(paidWorkingDays);
    const totalPaidDays =
      paidRounded + earnedSundayPayDays + sundayPresentBonusDays;
    const calculatedSalary =
      Math.round(totalPaidDays * ratePerDay * 100) / 100;

    return {
      id: empId,
      name: (emp.name as string) || "Unknown",
      presentDays: paidRounded,
      absentDays: absentCount,
      earnedSundayPayDays,
      sundayPresentBonusDays,
      totalPaidDays,
      monthlySalary,
      ratePerDay,
      ratePerHour,
      hoursExtraTotal: Math.round(hoursExtraTotal * 100) / 100,
      hoursReducedTotal: Math.round(hoursReducedTotal * 100) / 100,
      calculatedSalary,
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
