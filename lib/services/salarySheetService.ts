import { getEmployee, getEmployees } from "./employeeService";
import { getAttendanceInRange } from "./attendanceService";
import { getHolidaysInRange } from "./factoryHolidayService";
import { getShifts } from "./shiftService";
import {
  getSundayCategories,
  resolveSundayCategoryRule,
} from "./sundayCategoryService";
import {
  getSalarySheetOverridesForMonth,
  type SalarySheetOverrideRecord,
  type SalarySheetOverrideValues,
} from "./salarySheetOverrideService";
import { resolveEffectiveSalarySheetRow } from "./salarySheetComposite";
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

const PAYROLL_NUMERIC_FIELDS = [
  "presentDays",
  "absentDays",
  "holidayPresentDays",
  "earnedSundayPayDays",
  "sundayPresentBonusDays",
  "totalPaidDays",
  "hoursExtraTotal",
  "hoursReducedTotal",
  "calculatedSalary",
] as const;

/** True when payroll adjustment should drive UI/print instead of raw attendance. */
export function salarySheetRowHasAdjustment(
  row: SalarySheetRow | null | undefined,
): row is SalarySheetRow {
  if (!row) return false;
  if (row.hasOverrides) return true;
  const cv = row.calculatedValues;
  return PAYROLL_NUMERIC_FIELDS.some(
    (key) => Math.abs(row[key] - cv[key]) > 0.001,
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
  const [employees, attendance, holidays, shifts, sundayCategories, monthOverrides] =
    await Promise.all([
      getEmployees(true),
      getAttendanceInRange(from, to),
      getHolidaysInRange(from, to),
      getShifts(),
      getSundayCategories(),
      getSalarySheetOverridesForMonth(year, month),
    ]);

  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, (s.hoursPerDay as number) ?? 8])
  );
  const sundayCategoryMap = Object.fromEntries(
    sundayCategories.map((c) => [c.id, c]),
  );

  const holidayDates = holidays.map((h) => h.date as string);
  const calendarDaysInMonth = getCalendarDaysInMonth(year, month);
  const overridesByEmployeeId = new Map<string, SalarySheetOverrideRecord[]>();
  monthOverrides.forEach((record) => {
    const list = overridesByEmployeeId.get(record.employeeId) ?? [];
    list.push(record);
    overridesByEmployeeId.set(record.employeeId, list);
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

  const buildBaseRowForEmployee = (
    emp: Record<string, unknown>,
    rangeFrom: string,
    rangeTo: string,
  ): SalarySheetRow => {
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
      hoursPerDay,
    );
    const empAtt = attByEmpDate.get(empId) ?? new Map();
    const attendanceForRange = Array.from(empAtt.entries())
      .filter(([date]) => date >= rangeFrom && date <= rangeTo)
      .map(([date, att]) => ({
        date,
        status: att.status,
        hoursWorked: att.hoursWorked,
        hoursReduced: att.hoursReduced,
        hoursExtra: att.hoursExtra,
      }));
    const summary = buildAttendanceSalarySummaryForRange({
      fromDate: rangeFrom,
      toDate: rangeTo,
      holidayDates,
      attendance: attendanceForRange,
      hoursPerDay,
      ratePerDay,
      sundayCategoryRule,
    });

    return {
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
  };

  const rows: SalarySheetRow[] = employees.map((emp) => {
    const empId = emp.id as string;
    const baseRow = buildBaseRowForEmployee(emp, from, to);
    return resolveEffectiveSalarySheetRow(
      baseRow,
      overridesByEmployeeId.get(empId) ?? [],
      year,
      month,
      from,
      to,
      (rangeFrom, rangeTo) => buildBaseRowForEmployee(emp, rangeFrom, rangeTo),
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
  const fromRoster = result.rows.find((r) => r.id === employeeId);
  if (fromRoster) return fromRoster;

  const employee = await getEmployee(employeeId);
  if (!employee) return null;

  const [attendance, holidays, shifts, sundayCategories, monthOverrides] =
    await Promise.all([
      getAttendanceInRange(from, to).then((rows) =>
        rows.filter((a) => (a.employeeId as string) === employeeId),
      ),
      getHolidaysInRange(from, to),
      getShifts(),
      getSundayCategories(),
      getSalarySheetOverridesForMonth(year, month),
    ]);

  const holidayDates = holidays.map((h) => h.date as string);
  const calendarDaysInMonth = getCalendarDaysInMonth(year, month);
  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, (s.hoursPerDay as number) ?? 8]),
  );
  const sundayCategoryMap = Object.fromEntries(
    sundayCategories.map((c) => [c.id, c]),
  );
  const employeeOverrides = monthOverrides.filter(
    (record) => record.employeeId === employeeId,
  );

  const shiftId = employee.shiftId as string | undefined;
  const hoursPerDay = shiftId ? (shiftMap[shiftId] ?? 8) : 8;
  const sundayCategoryId = employee.sundayCategoryId as string | undefined;
  const sundayCategory = sundayCategoryId
    ? sundayCategoryMap[sundayCategoryId]
    : undefined;
  const sundayCategoryRule = resolveSundayCategoryRule(sundayCategory);
  const monthlySalary = (employee.monthlySalary as number) ?? 0;
  const ratePerDay = getRatePerDay(monthlySalary, calendarDaysInMonth);
  const ratePerHour = getRatePerHour(
    monthlySalary,
    calendarDaysInMonth,
    hoursPerDay,
  );
  const summary = buildAttendanceSalarySummaryForRange({
    fromDate: from,
    toDate: to,
    holidayDates,
    attendance: attendance.map((a) => ({
      date: a.date as string,
      status: a.status as string,
      hoursWorked: a.hoursWorked as number | undefined,
      hoursReduced: a.hoursReduced as number | undefined,
      hoursExtra: a.hoursExtra as number | undefined,
    })),
    hoursPerDay,
    ratePerDay,
    sundayCategoryRule,
  });

  const baseRow: SalarySheetRow = {
    id: employeeId,
    name: (employee.name as string) || "Unknown",
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

  const buildBaseForRange = (rangeFrom: string, rangeTo: string): SalarySheetRow => {
    const rangeSummary = buildAttendanceSalarySummaryForRange({
      fromDate: rangeFrom,
      toDate: rangeTo,
      holidayDates,
      attendance: attendance
        .map((a) => ({
          date: a.date as string,
          status: a.status as string,
          hoursWorked: a.hoursWorked as number | undefined,
          hoursReduced: a.hoursReduced as number | undefined,
          hoursExtra: a.hoursExtra as number | undefined,
        }))
        .filter((a) => a.date >= rangeFrom && a.date <= rangeTo),
      hoursPerDay,
      ratePerDay,
      sundayCategoryRule,
    });
    return {
      ...baseRow,
      presentDays: rangeSummary.presentDays,
      absentDays: rangeSummary.absentDays,
      holidayPresentDays: rangeSummary.holidayPresentDays,
      earnedSundayPayDays: rangeSummary.earnedSundayPayDays,
      sundayPresentBonusDays: rangeSummary.sundayPresentBonusDays,
      totalPaidDays: rangeSummary.totalPaidDays,
      hoursExtraTotal: rangeSummary.hoursExtraTotal,
      hoursReducedTotal: rangeSummary.hoursReducedTotal,
      baseCalculatedSalary: rangeSummary.calculatedSalary,
      calculatedSalary: rangeSummary.calculatedSalary,
      calculatedValues: {
        presentDays: rangeSummary.presentDays,
        absentDays: rangeSummary.absentDays,
        holidayPresentDays: rangeSummary.holidayPresentDays,
        earnedSundayPayDays: rangeSummary.earnedSundayPayDays,
        sundayPresentBonusDays: rangeSummary.sundayPresentBonusDays,
        totalPaidDays: rangeSummary.totalPaidDays,
        hoursExtraTotal: rangeSummary.hoursExtraTotal,
        hoursReducedTotal: rangeSummary.hoursReducedTotal,
        calculatedSalary: rangeSummary.calculatedSalary,
      },
    };
  };

  return resolveEffectiveSalarySheetRow(
    baseRow,
    employeeOverrides,
    year,
    month,
    from,
    to,
    buildBaseForRange,
  );
}
