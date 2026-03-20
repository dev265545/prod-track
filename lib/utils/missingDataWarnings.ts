/**
 * ProdTrack Lite - Missing data warnings
 * Identifies working days without production or attendance data.
 * Excludes: Sundays, factory holidays, days marked absent.
 * Respects employee start date (createdAt) - no warnings for days before start.
 */

import { isSunday, yesterday } from "./date";
import { getProductionsByEmployee } from "@/lib/services/productionService";
import { getAttendanceByEmployeeInRange } from "@/lib/services/attendanceService";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Inclusive calendar dates from `from` through `to` as YYYY-MM-DD strings. */
function listDatesInRange(from: string, to: string): string[] {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const fromDate = new Date(fy, fm - 1, fd);
  const toDate = new Date(ty, tm - 1, td);
  const cur = new Date(fromDate);
  const out: string[] = [];
  while (cur <= toDate) {
    const y = cur.getFullYear();
    const m = pad(cur.getMonth() + 1);
    const d = pad(cur.getDate());
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export interface MissingDay {
  date: string;
}

/**
 * Returns past dates within the given period that are working days but have
 * no production and no attendance (present/absent) recorded.
 * Only checks up to yesterday - today is not flagged (you see that warning tomorrow).
 * Excludes: Sundays, factory holidays, days marked absent.
 * Respects employee start date - no warnings for dates before employeeStartDate.
 */
export async function getMissingDataDays(
  employeeId: string,
  employeeStartDate: string,
  periodFrom: string,
  periodTo: string,
  factoryHolidays: string[]
): Promise<MissingDay[]> {
  const rangeEnd = periodTo < yesterday() ? periodTo : yesterday();
  const rangeStart = employeeStartDate > periodFrom ? employeeStartDate : periodFrom;
  if (rangeStart > rangeEnd) return [];

  const holidaySet = new Set(factoryHolidays);
  const [productions, attendance] = await Promise.all([
    getProductionsByEmployee(employeeId, periodFrom, periodTo),
    getAttendanceByEmployeeInRange(employeeId, periodFrom, periodTo),
  ]);

  const productionDates = new Set(productions.map((p) => p.date as string));
  const attendanceMap = new Map(
    attendance.map((a) => [a.date as string, a.status as string])
  );

  const missing: MissingDay[] = [];
  const dates = listDatesInRange(rangeStart, rangeEnd);
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (isSunday(date)) continue;
    if (holidaySet.has(date)) continue;
    if (attendanceMap.get(date) === "absent") continue;
    if (productionDates.has(date)) continue;
    if (attendanceMap.get(date) === "present") continue;
    missing.push({ date });
  }
  return missing;
}

/**
 * Get missing data days for all employees within the given period.
 * Uses createdAt for employee start; falls back to periodFrom for legacy employees.
 */
export async function getMissingDataForAllEmployees(
  employees: { id: string; createdAt?: string }[],
  periodFrom: string,
  periodTo: string,
  factoryHolidays: string[]
): Promise<Map<string, MissingDay[]>> {
  const results = new Map<string, MissingDay[]>();

  await Promise.all(
    employees.map(async (emp) => {
      const start = (emp.createdAt as string) || periodFrom;
      if (start > periodTo) {
        results.set(emp.id, []);
        return;
      }
      const missing = await getMissingDataDays(
        emp.id,
        start,
        periodFrom,
        periodTo,
        factoryHolidays
      );
      results.set(emp.id, missing);
    })
  );

  return results;
}
