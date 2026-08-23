/**
 * ProdTrack Lite — date-first attendance roster.
 *
 * The roster screen asks a different question than the employee page does:
 * *"for this one date, where does every active person stand?"* — so the shape
 * it needs is one row per employee, not one row per date.
 *
 * Payroll understands exactly two attendance statuses: `"present"` and
 * `"absent"` (see `attendanceStats.computeDayPayFraction` and
 * `salarySheetService`), and the roster now offers exactly those two marks —
 * nothing is encoded on top of them. A short day is still recorded, but through
 * the hours a present row already carries: `computeDayPayFraction` pays
 * `1 + (hoursExtra - hoursReduced) / hoursPerDay`, so four hours off an eight
 * hour shift is a 0.5 paid day. Days written by the older "half day" button are
 * exactly that shape, so they keep loading, keep showing their reduced hours,
 * and keep paying the same — they simply read as a present day with hours off.
 */

import { isRestrictedForEntry, isSunday } from "./date";
import { isProductionEmployee } from "./productionRoster";

/** What the operator taps. These are the stored statuses, one for one. */
export type RosterMark = "present" | "absent";

/** Shift length assumed when an employee has no shift, matching `salaryService`. */
export const DEFAULT_HOURS_PER_DAY = 8;

/** Stored attendance row, narrowed to the fields the roster reads. */
export interface RosterAttendanceRecord {
  id?: string;
  employeeId: string;
  date: string;
  status: string;
  hoursReduced?: number;
  hoursExtra?: number;
}

export interface RosterEmployee {
  id: string;
  name: string;
  shiftId?: string;
  isActive?: boolean;
  employeeType?: string;
}

export interface RosterRow {
  employeeId: string;
  name: string;
  /** Shift name for the row's subtitle, when the employee has one. */
  shiftName: string | null;
  hoursPerDay: number;
  /** `null` means "not written down yet" — distinct from an explicit absence. */
  mark: RosterMark | null;
  /** Only meaningful on a present row. */
  hoursExtra: number;
  hoursReduced: number;
  /** Id of the stored row, so an edit updates rather than inserts. */
  recordId?: string;
}

/**
 * Which of the two buttons should read as pressed for a stored row.
 *
 * A present row is a present row whatever its hours say: a reduction is an
 * adjustment shown next to the mark, never a different mark.
 */
export function deriveMark(
  record: RosterAttendanceRecord | undefined,
): RosterMark | null {
  if (!record) return null;
  if (record.status === "absent") return "absent";
  if (record.status === "present") return "present";
  return null;
}

/**
 * The record to hand `saveAttendance` for a tapped mark.
 *
 * `saveAttendance` upserts on `(employeeId, date)`, so omitting `recordId` is
 * safe — but passing it when known saves the lookup and keeps the row's identity
 * stable. Hours only ride along on present rows: an absent day has no hours, and
 * leaving stale adjustments on it would feed `hoursExtraTotal` in the sheet.
 */
export function buildAttendancePayload(input: {
  employeeId: string;
  date: string;
  mark: RosterMark;
  hoursExtra?: number;
  hoursReduced?: number;
  recordId?: string;
}): Record<string, unknown> {
  const { employeeId, date, mark, recordId } = input;
  const base: Record<string, unknown> = {
    ...(recordId ? { id: recordId } : {}),
    employeeId,
    date,
  };

  if (mark === "absent") {
    return { ...base, status: "absent" };
  }

  const hoursReduced = Math.max(0, input.hoursReduced ?? 0);
  const hoursExtra = Math.max(0, input.hoursExtra ?? 0);

  return {
    ...base,
    status: "present",
    ...(hoursReduced > 0 ? { hoursReduced } : {}),
    ...(hoursExtra > 0 ? { hoursExtra } : {}),
  };
}

/**
 * One row per *active* employee, in the order `getEmployees` already sorted
 * them, joined to whatever was written for `date`.
 *
 * Duplicate attendance rows can exist in databases written before
 * `saveAttendance` became an upsert. The **last** one wins here, matching
 * `getAttendanceByEmployeeAndDate` and `salarySheetService` — all three readers
 * have to agree or a corrected day would display one way and be paid another.
 */
export function buildRoster(input: {
  employees: RosterEmployee[];
  attendance: RosterAttendanceRecord[];
  shiftsById: Record<string, { name?: string; hoursPerDay?: number }>;
}): RosterRow[] {
  const { employees, attendance, shiftsById } = input;

  const byEmployee = new Map<string, RosterAttendanceRecord>();
  for (const record of attendance) {
    byEmployee.set(record.employeeId, record);
  }

  return employees
    // Production people are paid for what they make, not for days attended —
    // their day is recorded on /production instead (see lib/utils/productionRoster.ts).
    // Listing them here left them permanently "still to write", and the
    // "everyone is here" button wrote present rows that pay them nothing,
    // because their day-rate comes from monthlySalary, which is 0.
    .filter((e) => e.isActive !== false && !isProductionEmployee(e))
    .map((e) => {
      const shift = e.shiftId ? shiftsById[e.shiftId] : undefined;
      const hoursPerDay = shift?.hoursPerDay ?? DEFAULT_HOURS_PER_DAY;
      const record = byEmployee.get(e.id);
      const mark = deriveMark(record);
      return {
        employeeId: e.id,
        name: e.name,
        shiftName: shift?.name ?? null,
        hoursPerDay,
        mark,
        // Hours belong to a present day only; an absence has none.
        hoursExtra: mark === "present" ? (record?.hoursExtra ?? 0) : 0,
        hoursReduced: mark === "present" ? (record?.hoursReduced ?? 0) : 0,
        recordId: record?.id,
      };
    });
}

export interface RosterSummary {
  total: number;
  /** Rows with any explicit mark — the "28" in "28 of 30 written down". */
  marked: number;
  present: number;
  absent: number;
  /** Rows still needing a decision. The operator's remaining work. */
  unmarked: number;
  /** 0–100, for the progress rule. 100 when there is nobody to mark. */
  percent: number;
}

export function summarizeRoster(rows: RosterRow[]): RosterSummary {
  let present = 0;
  let absent = 0;
  for (const row of rows) {
    if (row.mark === "present") present += 1;
    else if (row.mark === "absent") absent += 1;
  }
  const total = rows.length;
  const marked = present + absent;
  return {
    total,
    marked,
    present,
    absent,
    unmarked: total - marked,
    percent: total === 0 ? 100 : Math.round((marked / total) * 100),
  };
}

/**
 * How the day itself should be treated.
 *
 * `holiday` mirrors `isRestrictedForEntry`, which the dashboard already uses to
 * refuse entries on factory holidays. Sundays are *not* restricted — a present
 * Sunday is a paid bonus day — so they only get a note, never a block.
 */
export type DayKind = "holiday" | "sunday" | "working";

export function getDayKind(date: string, holidayDates: string[]): DayKind {
  if (isRestrictedForEntry(date, holidayDates)) return "holiday";
  if (isSunday(date)) return "sunday";
  return "working";
}

/**
 * Rows the "everyone is here" action should fill.
 *
 * Only ever the unmarked ones. Overwriting a mark the operator already made
 * would quietly undo a correction — the exact failure this screen exists to
 * prevent — so the bulk action can add work but never destroy it.
 */
export function rowsToFillPresent(rows: RosterRow[]): RosterRow[] {
  return rows.filter((row) => row.mark === null);
}

/**
 * How many of the bulk fill's writes may be in flight at once.
 *
 * One at a time meant thirty sequential round trips with the operator watching
 * the spinner. All at once is worse: a hundred and fifty concurrent
 * transactions on a low-end Windows 7 machine is a write storm that starves the
 * read the same page is doing and can time the whole batch out. A small pool
 * keeps the disk busy without flooding it.
 */
export const BULK_FILL_CONCURRENCY = 4;

/**
 * Run `work` over `items` with at most `limit` in flight, and count how many
 * did not succeed.
 *
 * Every item is attempted even if earlier ones fail — a bulk fill that stopped
 * at the first bad write would leave the roster half-written with no way to
 * tell where it stopped. `work` returning `false` **or** throwing both count as
 * a failure, so a caller's own bug cannot be mistaken for a clean run.
 */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<boolean>,
): Promise<{ failed: number }> {
  let cursor = 0;
  let failed = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const at = cursor;
      cursor += 1;
      if (at >= items.length) return;
      try {
        if (!(await work(items[at]))) failed += 1;
      } catch {
        failed += 1;
      }
    }
  }

  const workers: Promise<void>[] = [];
  const width = Math.max(1, Math.min(limit, items.length));
  for (let i = 0; i < width; i += 1) workers.push(worker());
  await Promise.all(workers);

  return { failed };
}
