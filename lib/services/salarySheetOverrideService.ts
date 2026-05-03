import { getAll, put, remove, STORES } from "@/lib/db/adapter";

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

export async function getSalarySheetOverridesForRange(
  year: number,
  month: number,
  fromDate: string,
  toDate: string,
): Promise<SalarySheetOverrideRecord[]> {
  const all = await getAll(STORE);
  return all
    .filter(
      (row) =>
        (row.year as number) === year &&
        (row.month as number) === month &&
        (row.fromDate as string) === fromDate &&
        (row.toDate as string) === toDate,
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

export async function saveSalarySheetOverride(
  input: SaveSalarySheetOverrideInput,
): Promise<SalarySheetOverrideRecord> {
  const sanitized = sanitizeSalarySheetOverrideValues(input.overrides);
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
