import { getAll, put, remove, STORES } from "@/lib/db/adapter";
import { getHolidaysInRange } from "@/lib/services/factoryHolidayService";
import { getAdvancesByEmployee } from "@/lib/services/advanceService";
import { getAppSettings } from "@/lib/services/appSettingsService";
import {
  normalizeDayPayCap,
  reportPayrollDriverClamp,
  getMonthRange,
  getMonthRangePresets,
  getYearMonthFromIsoDate,
  type PayrollDriverClampReport,
} from "@/lib/utils/date";
import { AUDIT_ACTIONS, diffEntity, record as auditRecord } from "@/lib/services/auditService";
import { employeeName } from "@/lib/services/auditNames";

const STORE = STORES.SALARY_SHEET_OVERRIDES;

/**
 * The driver values a human can type over the computed payroll numbers. This
 * is the highest-value diff in the app: it is the only place where somebody
 * replaces what the app worked out with what they say it should be, so every
 * field a person can move is listed, and nothing else is.
 */
const OVERRIDE_AUDIT_FIELDS = [
  "presentDays",
  "absentDays",
  "holidayPresentDays",
  "earnedSundayPayDays",
  "sundayPresentBonusDays",
  "totalPaidDays",
  "hoursExtraTotal",
  "hoursReducedTotal",
  "calculatedSalary",
  "advanceDeduction",
  "netCalculatedSalary",
  "notes",
] as const;

/** Flatten a record so the override values sit next to `notes` for diffing. */
function overrideDiffShape(
  row: Pick<SalarySheetOverrideRecord, "overrides" | "notes"> | null,
): Record<string, unknown> | null {
  if (!row) return null;
  // An empty note is "no note", not a change from nothing to nothing —
  // otherwise every first save reports a `notes` change nobody made.
  return { ...row.overrides, notes: row.notes || undefined };
}

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
  const [holidays, appSettings] = await Promise.all([
    getHolidaysInRange(anchored.fromDate, anchored.toDate),
    getAppSettings(),
  ]);
  const holidayDates = holidays.map((h) => h.date as string);
  // The present-days ceiling is the configured per-day pay limit times the
  // number of non-Sunday dates, not the constant 2 it used to be. A factory
  // that has turned the limit off has no ceiling here either — clamping a
  // correction to a number the owner has explicitly removed would be the same
  // silent trim this rework exists to end.
  const clampReport = reportPayrollDriverClamp(
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
    normalizeDayPayCap(appSettings.maxDayPayFraction),
  );
  const cappedDrivers = clampReport.values;
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
  const previous = await readPreviousOverride(anchored);

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
    // Saving an empty set of overrides is how the sheet cancels a correction.
    void logOverride(
      AUDIT_ACTIONS.salaryOverrideClear,
      id,
      anchored.employeeId,
      anchored.fromDate,
      anchored.toDate,
      previous,
      null,
      "hand-entered payroll corrections were removed, so the calculated figures apply again",
    );
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
  void logOverride(
    AUDIT_ACTIONS.salaryOverrideSet,
    id,
    record.employeeId,
    record.fromDate,
    record.toDate,
    previous,
    record,
    describeOverrideSave(clampReport),
  );
  return record;
}

/**
 * The audit sentence for a saved correction, naming any figure the period
 * ceilings trimmed.
 *
 * A correction is a deliberate statement, so quietly reducing one and logging
 * "figures were entered by hand" would describe something that did not happen.
 */
export function describeOverrideSave(report: PayrollDriverClampReport): string {
  const base =
    "payroll figures were entered by hand, replacing what the app calculated";
  const trimmed: string[] = [];
  if (report.trimmed.presentDays) {
    trimmed.push(`present days down to ${report.limits.presentDays}`);
  }
  if (report.trimmed.earnedSundayPayDays) {
    trimmed.push(`earned Sunday days down to ${report.limits.earnedSundayPayDays}`);
  }
  if (report.trimmed.sundayPresentBonusDays) {
    trimmed.push(`Sundays present down to ${report.limits.sundayPresentBonusDays}`);
  }
  return trimmed.length === 0
    ? base
    : `${base}; the period limits trimmed ${trimmed.join(", ")}`;
}

/**
 * The before-image for the audit diff. Swallows its own failures: reading the
 * old row is only ever for the log, and a save must not fail because the log
 * could not describe it.
 */
async function readPreviousOverride(
  anchored: SaveSalarySheetOverrideInput,
): Promise<SalarySheetOverrideRecord | null> {
  try {
    return await getSalarySheetOverride(
      anchored.employeeId,
      anchored.year,
      anchored.month,
      anchored.fromDate,
      anchored.toDate,
    );
  } catch {
    return null;
  }
}

async function logOverride(
  action:
    | typeof AUDIT_ACTIONS.salaryOverrideSet
    | typeof AUDIT_ACTIONS.salaryOverrideClear,
  id: string,
  employeeId: string,
  fromDate: string,
  toDate: string,
  before: Pick<SalarySheetOverrideRecord, "overrides" | "notes"> | null,
  after: Pick<SalarySheetOverrideRecord, "overrides" | "notes"> | null,
  what: string,
): Promise<void> {
  const who = await employeeName(employeeId);
  void auditRecord(
    action,
    "salary_sheet_overrides",
    id,
    `For ${who}, ${what} for ${fromDate} to ${toDate}`,
    diffEntity(
      overrideDiffShape(before),
      overrideDiffShape(after),
      OVERRIDE_AUDIT_FIELDS,
    ),
  );
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
  const cleared = (
    id: string,
    before: Pick<SalarySheetOverrideRecord, "overrides" | "notes"> | null,
  ) =>
    void logOverride(
      AUDIT_ACTIONS.salaryOverrideClear,
      id,
      anchored.employeeId,
      anchored.fromDate,
      anchored.toDate,
      before,
      null,
      "hand-entered payroll corrections were removed, so the calculated figures apply again",
    );

  if (exact) {
    await remove(STORE, exact.id);
    cleared(exact.id, exact);
    return;
  }
  const all = await getAll(STORE);
  for (const row of all) {
    if (
      (row.employeeId as string) === anchored.employeeId &&
      (row.fromDate as string) === anchored.fromDate &&
      (row.toDate as string) === anchored.toDate
    ) {
      const stale = mapOverrideRow(row);
      await remove(STORE, row.id as string);
      cleared(row.id as string, stale);
    }
  }
}
