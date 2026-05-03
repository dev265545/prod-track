import { getEmployees } from "./employeeService";
import { getAttendanceInRange } from "./attendanceService";
import { getHolidaysInRange } from "./factoryHolidayService";
import { getShifts } from "./shiftService";
import {
  getSundayCategories,
  resolveSundayCategoryRule,
} from "./sundayCategoryService";
import {
  getSalarySheetOverridesForRange,
  type SalarySheetOverrideRecord,
  type SalarySheetOverrideValues,
} from "./salarySheetOverrideService";
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
  holidayPresentDays: number;
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
  baseCalculatedSalary: number;
  calculatedSalary: number;
  hasOverrides: boolean;
  overrideNotes: string;
  overrideUpdatedAt: string;
  overrideValues: SalarySheetOverrideValues;
  calculatedValues: Required<SalarySheetOverrideValues>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasPersistedOverrides(record: SalarySheetOverrideRecord | null): boolean {
  if (!record) return false;
  return (
    Object.keys(record.overrides ?? {}).length > 0 ||
    (record.notes?.trim().length ?? 0) > 0
  );
}

export function applySalarySheetOverrides(
  baseRow: SalarySheetRow,
  overrideRecord: SalarySheetOverrideRecord | null,
): SalarySheetRow {
  const overrides = overrideRecord?.overrides ?? {};
  const presentDays = overrides.presentDays ?? baseRow.presentDays;
  const absentDays = overrides.absentDays ?? baseRow.absentDays;
  const holidayPresentDays =
    overrides.holidayPresentDays ?? baseRow.holidayPresentDays;
  const earnedSundayPayDays =
    overrides.earnedSundayPayDays ?? baseRow.earnedSundayPayDays;
  const sundayPresentBonusDays =
    overrides.sundayPresentBonusDays ?? baseRow.sundayPresentBonusDays;
  const hoursExtraTotal = overrides.hoursExtraTotal ?? baseRow.hoursExtraTotal;
  const hoursReducedTotal =
    overrides.hoursReducedTotal ?? baseRow.hoursReducedTotal;
  const totalPaidDays =
    overrides.totalPaidDays ??
    round2(presentDays + earnedSundayPayDays + sundayPresentBonusDays);
  const baseCalculatedSalary =
    baseRow.baseCalculatedSalary ?? baseRow.calculatedSalary;
  const calculatedSalary =
    overrides.calculatedSalary ?? round2(totalPaidDays * baseRow.ratePerDay);

  return {
    ...baseRow,
    presentDays,
    absentDays,
    holidayPresentDays,
    earnedSundayPayDays,
    sundayPresentBonusDays,
    totalPaidDays,
    hoursExtraTotal,
    hoursReducedTotal,
    baseCalculatedSalary,
    calculatedSalary,
    hasOverrides: hasPersistedOverrides(overrideRecord),
    overrideNotes: overrideRecord?.notes?.trim() ?? "",
    overrideUpdatedAt: overrideRecord?.updatedAt ?? "",
    overrideValues: { ...overrides },
    calculatedValues: baseRow.calculatedValues,
  };
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
  const [employees, attendance, holidays, shifts, sundayCategories, overrides] = await Promise.all([
    getEmployees(true),
    getAttendanceInRange(from, to),
    getHolidaysInRange(from, to),
    getShifts(),
    getSundayCategories(),
    getSalarySheetOverridesForRange(year, month, from, to),
  ]);

  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, (s.hoursPerDay as number) ?? 8])
  );
  const sundayCategoryMap = Object.fromEntries(
    sundayCategories.map((c) => [c.id, c]),
  );

  const holidayDates = holidays.map((h) => h.date as string);
  const calendarDaysInMonth = getCalendarDaysInMonth(year, month);
  const overrideByEmployeeId = new Map(
    overrides.map((record) => [record.employeeId, record]),
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

    const baseRow: SalarySheetRow = {
      id: empId,
      name: (emp.name as string) || "Unknown",
      presentDays: summary.presentDays,
      absentDays: summary.absentDays,
      holidayPresentDays: summary.holidayPresentDays,
      earnedSundayPayDays: summary.earnedSundayPayDays,
      sundayPresentBonusDays: summary.sundayPresentBonusDays,
      totalPaidDays: summary.totalPaidDays,
      monthlySalary,
      ratePerDay,
      ratePerHour,
      hoursExtraTotal: summary.hoursExtraTotal,
      hoursReducedTotal: summary.hoursReducedTotal,
      baseCalculatedSalary: summary.calculatedSalary,
      calculatedSalary: summary.calculatedSalary,
      hasOverrides: false,
      overrideNotes: "",
      overrideUpdatedAt: "",
      overrideValues: {},
      calculatedValues: {
        presentDays: summary.presentDays,
        absentDays: summary.absentDays,
        holidayPresentDays: summary.holidayPresentDays,
        earnedSundayPayDays: summary.earnedSundayPayDays,
        sundayPresentBonusDays: summary.sundayPresentBonusDays,
        totalPaidDays: summary.totalPaidDays,
        hoursExtraTotal: summary.hoursExtraTotal,
        hoursReducedTotal: summary.hoursReducedTotal,
        calculatedSalary: summary.calculatedSalary,
      },
    };
    return applySalarySheetOverrides(
      baseRow,
      overrideByEmployeeId.get(empId) ?? null,
    );
  });

  return {
    rows,
    from,
    to,
    holidayDates,
    calendarDaysInMonth,
  };
}

/** Single row for one employee (same rules as the salary sheet table). */
export async function getSalarySheetRowForEmployee(
  employeeId: string,
  year: number,
  month: number,
  from: string,
  to: string,
): Promise<SalarySheetRow | null> {
  const result = await getSalarySheetForRange(year, month, from, to);
  return result.rows.find((r) => r.id === employeeId) ?? null;
}
