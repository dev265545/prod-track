import { getEmployees } from "./employeeService";
import { getAttendanceInRange } from "./attendanceService";
import { getHolidaysInRange } from "./factoryHolidayService";
import {
  getWorkingDaysInMonth,
  getRatePerDay,
} from "@/lib/utils/salaryRates";
import { getMonthRange } from "@/lib/utils/date";

export interface SalarySheetRow {
  id: string;
  name: string;
  presentDays: number;
  absentDays: number;
  earnedSundays: number;
  totalPaidDays: number;
  monthlySalary: number;
  ratePerDay: number;
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
  const [employees, attendance, holidays] = await Promise.all([
    getEmployees(true),
    getAttendanceInRange(from, to),
    getHolidaysInRange(from, to),
  ]);

  const holidayDates = holidays.map((h) => h.date as string);
  const workingDays = getWorkingDaysInMonth(year, month, holidayDates);

  const attendanceByEmployee = new Map<
    string,
    { present: number; absent: number }
  >();
  attendance.forEach((a) => {
    const empId = a.employeeId as string;
    if (!attendanceByEmployee.has(empId)) {
      attendanceByEmployee.set(empId, { present: 0, absent: 0 });
    }
    const acc = attendanceByEmployee.get(empId)!;
    if (a.status === "present") acc.present++;
    else if (a.status === "absent") acc.absent++;
  });

  const rows: SalarySheetRow[] = employees.map((emp) => {
    const empId = emp.id as string;
    const monthlySalary = (emp.monthlySalary as number) ?? 0;
    const ratePerDay = getRatePerDay(monthlySalary, workingDays);

    const { present, absent } = attendanceByEmployee.get(empId) ?? {
      present: 0,
      absent: 0,
    };
    const earnedSundays = Math.floor(present / 6);
    const totalPaidDays = present + earnedSundays;
    const calculatedSalary = totalPaidDays * ratePerDay;

    return {
      id: empId,
      name: (emp.name as string) || "Unknown",
      presentDays: present,
      absentDays: absent,
      earnedSundays,
      totalPaidDays,
      monthlySalary,
      ratePerDay,
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
