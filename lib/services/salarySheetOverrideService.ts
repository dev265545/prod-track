import { getAll, put, remove, STORES } from "@/lib/db/adapter";
import { getHolidaysInRange } from "@/lib/services/factoryHolidayService";
import {
  clampPayrollDriverFieldsToPeriod,
  getMonthRangePresets,
} from "@/lib/utils/date";

const STORE = STORES.SALARY_SHEET_OVERRIDES;

export interface SalarySheetOverrideValues {
  presentDays?: number;
  absentDays?: number;
  holidayPresentDays?: number;
  earnedSundayPayDays?: number;
  sundayPresentBonusDays?: number;
  totalPaidDays?: number;
  hoursExtraTotal?: number;
  hoursReducedTotal?: number;
  calculatedSalary?: number;
}

export interface SalarySheetOverrideRecord {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  fromDate: string;
  toDate: string;
  notes?: string;
  updatedAt: string;
  overrides: SalarySheetOverrideValues;
}

export interface SaveSalarySheetOverrideInput {
  employeeId: string;
  year: number;
  month: number;
  fromDate: string;
  toDate: string;
  notes?: string;
  overrides: SalarySheetOverrideValues;
}

export interface SalarySheetCorrectionPeriod {
  key: "first-half" | "second-half";
  fromDate: string;
  toDate: string;
  label: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildSalarySheetOverrideId(input: {
  employeeId: string;
  year: number;
  month: number;
  fromDate: string;
  toDate: string;
}): string {
  const { employeeId, year, month, fromDate, toDate } = input;
  return `salary_sheet_override:${employeeId}:${year}:${month}:${fromDate}:${toDate}`;
}

export function getSalarySheetCorrectionPeriods(
  year: number,
  month: number,
): SalarySheetCorrectionPeriod[] {
  const presets = getMonthRangePresets(year, month);
  return presets
    .filter(
      (preset): preset is (typeof presets)[number] & {
        mode: "first-half" | "second-half";
      } => preset.mode === "first-half" || preset.mode === "second-half",
    )
    .map((preset) => ({
      key: preset.mode,
      fromDate: preset.from,
      toDate: preset.to,
      label: preset.label,
    }));
}

export function getSalarySheetCorrectionPeriodForRange(
  year: number,
  month: number,
  fromDate: string,
  toDate: string,
): SalarySheetCorrectionPeriod | null {
  return (
    getSalarySheetCorrectionPeriods(year, month).find(
      (period) => period.fromDate === fromDate && period.toDate === toDate,
    ) ?? null
  );
}

export function sanitizeSalarySheetOverrideValues(
  values: SalarySheetOverrideValues,
): SalarySheetOverrideValues {
  const sanitized: SalarySheetOverrideValues = {};
  for (const [key, rawValue] of Object.entries(values)) {
    if (!isFiniteNumber(rawValue)) continue;
    sanitized[key as keyof SalarySheetOverrideValues] = round2(rawValue);
  }
  return sanitized;
}

export async function getSalarySheetOverride(
  employeeId: string,
  year: number,
  month: number,
  fromDate: string,
  toDate: string,
): Promise<SalarySheetOverrideRecord | null> {
  const all = await getAll(STORE);
  const match = all.find(
    (row) =>
      (row.employeeId as string) === employeeId &&
      (row.year as number) === year &&
      (row.month as number) === month &&
      (row.fromDate as string) === fromDate &&
      (row.toDate as string) === toDate,
  );
  if (!match) return null;
  return {
    id: match.id as string,
    employeeId: match.employeeId as string,
    year: match.year as number,
    month: match.month as number,
    fromDate: match.fromDate as string,
    toDate: match.toDate as string,
    notes: (match.notes as string | undefined) ?? "",
    updatedAt: (match.updatedAt as string) ?? "",
    overrides: sanitizeSalarySheetOverrideValues(
      (match.overrides as SalarySheetOverrideValues | undefined) ?? {},
    ),
  };
}

export async function getSalarySheetOverridesForMonth(
  year: number,
  month: number,
): Promise<SalarySheetOverrideRecord[]> {
  const all = await getAll(STORE);
  return all
    .filter(
      (row) =>
        (row.year as number) === year && (row.month as number) === month,
    )
    .map((row) => ({
      id: row.id as string,
      employeeId: row.employeeId as string,
      year: row.year as number,
      month: row.month as number,
      fromDate: row.fromDate as string,
      toDate: row.toDate as string,
      notes: (row.notes as string | undefined) ?? "",
      updatedAt: (row.updatedAt as string) ?? "",
      overrides: sanitizeSalarySheetOverrideValues(
        (row.overrides as SalarySheetOverrideValues | undefined) ?? {},
      ),
    }));
}

export async function getSalarySheetOverridesForRange(
  year: number,
  month: number,
  fromDate: string,
  toDate: string,
): Promise<SalarySheetOverrideRecord[]> {
  const monthOverrides = await getSalarySheetOverridesForMonth(year, month);
  return monthOverrides.filter(
    (row) => row.fromDate === fromDate && row.toDate === toDate,
  );
}

export async function getSalarySheetOverridesByEmployeeMonth(
  employeeId: string,
  year: number,
  month: number,
): Promise<SalarySheetOverrideRecord[]> {
  const periods = getSalarySheetCorrectionPeriods(year, month);
  const periodKeys = new Set(
    periods.map((period) => `${period.fromDate}:${period.toDate}`),
  );
  const all = await getAll(STORE);
  return all
    .filter(
      (row) =>
        (row.employeeId as string) === employeeId &&
        (row.year as number) === year &&
        (row.month as number) === month &&
        periodKeys.has(`${row.fromDate as string}:${row.toDate as string}`),
    )
    .map((row) => ({
      id: row.id as string,
      employeeId: row.employeeId as string,
      year: row.year as number,
      month: row.month as number,
      fromDate: row.fromDate as string,
      toDate: row.toDate as string,
      notes: (row.notes as string | undefined) ?? "",
      updatedAt: (row.updatedAt as string) ?? "",
      overrides: sanitizeSalarySheetOverrideValues(
        (row.overrides as SalarySheetOverrideValues | undefined) ?? {},
      ),
    }))
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
}

export async function saveSalarySheetOverride(
  input: SaveSalarySheetOverrideInput,
): Promise<SalarySheetOverrideRecord> {
  const sanitized = sanitizeSalarySheetOverrideValues(input.overrides);
  const holidays = await getHolidaysInRange(input.fromDate, input.toDate);
  const holidayDates = holidays.map((h) => h.date as string);
  const cappedDrivers = clampPayrollDriverFieldsToPeriod(
    input.fromDate,
    input.toDate,
    holidayDates,
    {
      presentDays:
        typeof sanitized.presentDays === "number" &&
        Number.isFinite(sanitized.presentDays)
          ? sanitized.presentDays
          : 0,
      earnedSundayPayDays:
        typeof sanitized.earnedSundayPayDays === "number" &&
        Number.isFinite(sanitized.earnedSundayPayDays)
          ? sanitized.earnedSundayPayDays
          : 0,
      sundayPresentBonusDays:
        typeof sanitized.sundayPresentBonusDays === "number" &&
        Number.isFinite(sanitized.sundayPresentBonusDays)
          ? sanitized.sundayPresentBonusDays
          : 0,
    },
  );
  if (typeof sanitized.presentDays === "number") {
    sanitized.presentDays = cappedDrivers.presentDays;
  }
  if (typeof sanitized.earnedSundayPayDays === "number") {
    sanitized.earnedSundayPayDays = cappedDrivers.earnedSundayPayDays;
  }
  if (typeof sanitized.sundayPresentBonusDays === "number") {
    sanitized.sundayPresentBonusDays = cappedDrivers.sundayPresentBonusDays;
  }
  const notes = input.notes?.trim() ?? "";
  const id = buildSalarySheetOverrideId(input);

  if (Object.keys(sanitized).length === 0 && !notes) {
    await remove(STORE, id);
    return {
      id,
      employeeId: input.employeeId,
      year: input.year,
      month: input.month,
      fromDate: input.fromDate,
      toDate: input.toDate,
      notes: "",
      updatedAt: "",
      overrides: {},
    };
  }

  const record: SalarySheetOverrideRecord = {
    id,
    employeeId: input.employeeId,
    year: input.year,
    month: input.month,
    fromDate: input.fromDate,
    toDate: input.toDate,
    notes,
    updatedAt: new Date().toISOString(),
    overrides: sanitized,
  };
  await put(STORE, record as unknown as Record<string, unknown>);
  return record;
}

export async function clearSalarySheetOverride(
  employeeId: string,
  year: number,
  month: number,
  fromDate: string,
  toDate: string,
): Promise<void> {
  await remove(
    STORE,
    buildSalarySheetOverrideId({ employeeId, year, month, fromDate, toDate }),
  );
}
