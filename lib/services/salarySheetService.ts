import { getEmployees } from "./employeeService";
import { getAttendanceInRange } from "./attendanceService";
import { getProductionsInRange } from "./productionService";
import { getHolidaysInRange } from "./factoryHolidayService";
import { getShifts } from "./shiftService";
import {
  getWorkingDaysInMonth,
  getRatePerDay,
  getRatePerHour,
  getEarnedSundays,
} from "@/lib/utils/salaryRates";
import { getMonthRange, getWorkingDayDates, getDatesInRange } from "@/lib/utils/date";
import { computeDayPayFraction } from "@/lib/utils/attendanceStats";

export interface SalarySheetRow {
  id: string;
  name: string;
  presentDays: number;
  absentDays: number;
  earnedSundays: number;
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
}> {
  const { from, to } = getMonthRange(year, month);
  const [employees, attendance, holidays, productions, shifts] = await Promise.all([
    getEmployees(true),
    getAttendanceInRange(from, to),
    getHolidaysInRange(from, to),
    getProductionsInRange(from, to),
    getShifts(),
  ]);

  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, (s.hoursPerDay as number) ?? 8])
  );

  const holidayDates = holidays.map((h) => h.date as string);
  const workingDays = getWorkingDaysInMonth(year, month, holidayDates);
  const workingDayDates = getWorkingDayDates(year, month, holidayDates);
  const monthDateList = getDatesInRange(from, to);
  const holidayDatesInMonth = monthDateList.filter((d) =>
    holidayDates.includes(d)
  );

  // Productions by employee+date
  const prodByEmpDate = new Map<string, Set<string>>();
  productions.forEach((p) => {
    const empId = p.employeeId as string;
    const date = p.date as string;
    if (!prodByEmpDate.has(empId)) prodByEmpDate.set(empId, new Set());
    prodByEmpDate.get(empId)!.add(date);
  });

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
    const ratePerDay = getRatePerDay(monthlySalary, workingDays);
    const shiftId = emp.shiftId as string | undefined;
    const hoursPerDay = shiftId ? (shiftMap[shiftId] ?? 8) : 8;
    const ratePerHour = getRatePerHour(monthlySalary, workingDays, hoursPerDay);
    const empProdDates = prodByEmpDate.get(empId) ?? new Set<string>();
    const empAtt = attByEmpDate.get(empId) ?? new Map();

    let paidWorkingDays = 0;
    let daysCountForSunday = 0;
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

    // Working days: present (explicit or inferred from production), absent (explicit or no entry)
    for (const dateStr of workingDayDates) {
      const att = empAtt.get(dateStr);
      const hasProd = empProdDates.has(dateStr);
      if (att?.status === "present") {
        paidWorkingDays += computeDayPayFraction(att, hoursPerDay);
        daysCountForSunday += 1;
        bumpHours(att);
      } else if (att?.status === "absent") {
        absentCount += 1;
      } else if (hasProd) {
        paidWorkingDays += 1;
        daysCountForSunday += 1;
      } else {
        absentCount += 1;
      }
    }

    // Holidays: present = count for Sunday only, no salary; absent/no entry = don't count
    for (const dateStr of holidayDatesInMonth) {
      const att = empAtt.get(dateStr);
      if (att?.status === "present") {
        daysCountForSunday += 1;
        bumpHours(att);
      }
    }

    const earnedSundays = getEarnedSundays(daysCountForSunday);
    const paidRounded = Math.round(paidWorkingDays * 100) / 100;
    const totalPaidDays = paidRounded + earnedSundays;
    const calculatedSalary =
      Math.round((paidWorkingDays + earnedSundays) * ratePerDay * 100) / 100;

    return {
      id: empId,
      name: (emp.name as string) || "Unknown",
      presentDays: paidRounded,
      absentDays: absentCount,
      earnedSundays,
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
  };
}

