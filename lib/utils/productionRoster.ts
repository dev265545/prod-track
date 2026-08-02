/**
 * ProdTrack Lite — date-first production roster.
 *
 * A production-type employee has no attendance to mark. What they made *is* the
 * record of their working day: `salaryService.calculateSalary` pays them
 * quantity x item rate and never reads an attendance row, and
 * `app/employee/EmployeePageClient.tsx` hides the shift, calendar and monthly
 * attendance print for them for the same reason.
 *
 * So the question the production screen has to answer is the same shape as the
 * attendance roster's — *"for this one date, where does every person stand?"* —
 * only the answer is "did anything get written down for them" rather than
 * "were they here". This module is that join, kept pure so it can be tested
 * without a database.
 *
 * Deliberately **not** here: any writing of attendance rows for these people.
 * See {@link isProductionEmployee}.
 */

/** Employee fields the roster reads. */
export interface ProductionRosterEmployee {
  id: string;
  name: string;
  employeeType?: string;
  isActive?: boolean;
}

/** Stored production row, narrowed to the fields the roster reads. */
export interface ProductionRosterRecord {
  id?: string;
  employeeId: string;
  itemId: string;
  date: string;
  quantity: number;
  shift?: string;
}

export interface ProductionRosterRow {
  employeeId: string;
  name: string;
  /** How many separate lines were written for this person on this date. */
  lines: number;
  /** Everything they made that date, across items and both shifts. */
  totalQty: number;
  dayQty: number;
  nightQty: number;
  /** Item ids they produced, in the order first seen — for a compact subtitle. */
  itemIds: string[];
  /** `false` means "nothing written down yet" — the operator's remaining work. */
  recorded: boolean;
}

/**
 * Whether this person is paid for what they made rather than for being here.
 *
 * The only place the app decides this. Attendance rows are never written for
 * these people: on the salary sheet their day rate comes from `monthlySalary`,
 * which is zero for them, so an attendance row would add nothing to their pay
 * while making the attendance screen claim a day was "marked" that nobody is
 * paid for.
 */
export function isProductionEmployee(employee: {
  employeeType?: string;
}): boolean {
  return employee.employeeType === "production";
}

/**
 * One row per *active production* employee, in the order `getEmployees` already
 * sorted them, joined to everything written for `date`.
 *
 * Records for other dates are ignored rather than trusted, so a caller that
 * over-fetches (a whole month, say) still gets one day's answer.
 */
export function buildProductionRoster(input: {
  employees: ProductionRosterEmployee[];
  productions: ProductionRosterRecord[];
  date: string;
}): ProductionRosterRow[] {
  const { employees, productions, date } = input;

  const byEmployee = new Map<string, ProductionRosterRecord[]>();
  for (const record of productions) {
    if (record.date !== date) continue;
    const list = byEmployee.get(record.employeeId);
    if (list) list.push(record);
    else byEmployee.set(record.employeeId, [record]);
  }

  return employees
    .filter((e) => e.isActive !== false && isProductionEmployee(e))
    .map((e) => {
      const records = byEmployee.get(e.id) ?? [];
      let totalQty = 0;
      let dayQty = 0;
      let nightQty = 0;
      const itemIds: string[] = [];
      for (const record of records) {
        const qty = Number(record.quantity) || 0;
        totalQty += qty;
        if (record.shift === "night") nightQty += qty;
        else dayQty += qty;
        if (record.itemId && !itemIds.includes(record.itemId)) {
          itemIds.push(record.itemId);
        }
      }
      return {
        employeeId: e.id,
        name: e.name,
        lines: records.length,
        totalQty,
        dayQty,
        nightQty,
        itemIds,
        // A line for zero pieces is still somebody having looked at this person,
        // so "recorded" counts lines, not quantity.
        recorded: records.length > 0,
      };
    });
}

export interface ProductionRosterSummary {
  total: number;
  /** People with at least one line — the "8" in "8 of 10 written down". */
  recorded: number;
  /** People with nothing written down. The operator's remaining work. */
  pending: number;
  /** Everything made that day by these people. */
  totalQty: number;
  /** 0–100, for the progress rule. 100 when there is nobody to record. */
  percent: number;
}

export function summarizeProductionRoster(
  rows: ProductionRosterRow[],
): ProductionRosterSummary {
  let recorded = 0;
  let totalQty = 0;
  for (const row of rows) {
    if (row.recorded) recorded += 1;
    totalQty += row.totalQty;
  }
  const total = rows.length;
  return {
    total,
    recorded,
    pending: total - recorded,
    totalQty,
    percent: total === 0 ? 100 : Math.round((recorded / total) * 100),
  };
}

/**
 * Who the "still to write" list should name, in roster order.
 *
 * Kept separate from the summary so the screen can both count them and list
 * them without deciding twice what "pending" means.
 */
export function pendingProductionRows(
  rows: ProductionRosterRow[],
): ProductionRosterRow[] {
  return rows.filter((row) => !row.recorded);
}
