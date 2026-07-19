import { getAll, put, remove, STORES } from "@/lib/db/adapter";
import { getHolidaysInRange } from "@/lib/services/factoryHolidayService";
import { getAdvancesByEmployee } from "@/lib/services/advanceService";
import {
  clampPayrollDriverFieldsToPeriod,
  getMonthRange,
  getMonthRangePresets,
  getYearMonthFromIsoDate,
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
  advanceDeduction?: number;
  netCalculatedSalary?: number;
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

function mapOverrideRow(
  row: Record<string, unknown>,
): SalarySheetOverrideRecord {
  const fromDate = String(row.fromDate ?? "");
  const anchor = getYearMonthFromIsoDate(fromDate);
  return {
    id: row.id as string,
    employeeId: row.employeeId as string,
    year: Number.isFinite(Number(row.year))
      ? Number(row.year)
      : (anchor?.year ?? 0),
    month: Number.isFinite(Number(row.month))
      ? Number(row.month)
      : (anchor?.month ?? 0),
    fromDate,
    toDate: String(row.toDate ?? ""),
    notes: (row.notes as string | undefined) ?? "",
    updatedAt: (row.updatedAt as string) ?? "",
    overrides: sanitizeSalarySheetOverrideValues(
      (row.overrides as SalarySheetOverrideValues | undefined) ?? {},
    ),
  };
}

/** Overrides whose date range overlaps a calendar month (robust to string year/month in DB). */
export function getSalarySheetOverridesTouchingMonth(
  year: number,
  month: number,
): Promise<SalarySheetOverrideRecord[]> {
  const { from: monthFrom, to: monthTo } = getMonthRange(year, month);
  return getAll(STORE).then((all) =>
    all
      .filter((row) => {
        const fromDate = String(row.fromDate ?? "");
        const toDate = String(row.toDate ?? "");
        if (!fromDate || !toDate) return false;
        return toDate >= monthFrom && fromDate <= monthTo;
      })
      .map(mapOverrideRow),
  );
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
      Number(row.year) === year &&
      Number(row.month) === month &&
      (row.fromDate as string) === fromDate &&
      (row.toDate as string) === toDate,
  );
  if (!match) return null;
  return mapOverrideRow(match);
}

export async function getSalarySheetOverridesForMonth(
  year: number,
  month: number,
): Promise<SalarySheetOverrideRecord[]> {
  return getSalarySheetOverridesTouchingMonth(year, month);
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
  const monthOverrides = await getSalarySheetOverridesTouchingMonth(year, month);
  return monthOverrides
    .filter(
      (row) =>
        row.employeeId === employeeId &&
        periodKeys.has(`${row.fromDate}:${row.toDate}`),
    )
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
}

function anchorOverrideMonthFromDates(
  input: SaveSalarySheetOverrideInput,
): SaveSalarySheetOverrideInput {
  const anchor = getYearMonthFromIsoDate(input.fromDate);
  if (!anchor) return input;
  return {
    ...input,
    year: anchor.year,
    month: anchor.month,
  };
}

export async function saveSalarySheetOverride(
  input: SaveSalarySheetOverrideInput,
): Promise<SalarySheetOverrideRecord> {
  const anchored = anchorOverrideMonthFromDates(input);
  const sanitized = sanitizeSalarySheetOverrideValues(anchored.overrides);
  const holidays = await getHolidaysInRange(anchored.fromDate, anchored.toDate);
  const holidayDates = holidays.map((h) => h.date as string);
  const cappedDrivers = clampPayrollDriverFieldsToPeriod(
    anchored.fromDate,
    anchored.toDate,
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
  // advanceDeduction: clamp to >= 0. An upper bound of "total advances given in
  // this period" would need `getAdvancesByEmployee`, which we fetch below —
  // but only when an advanceDeduction override is actually present, to avoid
  // an extra DB round trip on every save.
  if (typeof sanitized.advanceDeduction === "number") {
    const lowerClamped = Math.max(0, sanitized.advanceDeduction);
    const advances = await getAdvancesByEmployee(
      anchored.employeeId,
      anchored.fromDate,
      anchored.toDate,
    );
    const totalAdvancesInPeriod = advances.reduce(
      (sum, a) => sum + ((a.amount as number) || 0),
      0,
    );
    sanitized.advanceDeduction = Math.min(lowerClamped, totalAdvancesInPeriod);
  }
  const notes = anchored.notes?.trim() ?? "";
  const id = buildSalarySheetOverrideId(anchored);

  if (Object.keys(sanitized).length === 0 && !notes) {
    await remove(STORE, id);
    const stale = await getSalarySheetOverride(
      anchored.employeeId,
      anchored.year,
      anchored.month,
      anchored.fromDate,
      anchored.toDate,
    );
    if (stale && stale.id !== id) {
      await remove(STORE, stale.id);
    }
    return {
      id,
      employeeId: anchored.employeeId,
      year: anchored.year,
      month: anchored.month,
      fromDate: anchored.fromDate,
      toDate: anchored.toDate,
      notes: "",
      updatedAt: "",
      overrides: {},
    };
  }

  const record: SalarySheetOverrideRecord = {
    id,
    employeeId: anchored.employeeId,
    year: anchored.year,
    month: anchored.month,
    fromDate: anchored.fromDate,
    toDate: anchored.toDate,
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
  const anchored = anchorOverrideMonthFromDates({
    employeeId,
    year,
    month,
    fromDate,
    toDate,
    overrides: {},
  });
  const exact = await getSalarySheetOverride(
    anchored.employeeId,
    anchored.year,
    anchored.month,
    anchored.fromDate,
    anchored.toDate,
  );
  if (exact) {
    await remove(STORE, exact.id);
    return;
  }
  const all = await getAll(STORE);
  for (const row of all) {
    if (
      (row.employeeId as string) === anchored.employeeId &&
      (row.fromDate as string) === anchored.fromDate &&
      (row.toDate as string) === anchored.toDate
    ) {
      await remove(STORE, row.id as string);
    }
  }
}
