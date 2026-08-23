export interface EmployeeOrderRecord {
  id?: string;
  createdAt?: string;
  sortOrder?: number;
}

function hasNumericSortOrder(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function compareCreatedAt(a?: string, b?: string): number {
  const aValue = a ?? "";
  const bValue = b ?? "";
  return aValue.localeCompare(bValue);
}

export function sortEmployeesByCustomOrder<T extends EmployeeOrderRecord>(
  employees: T[],
): T[] {
  return [...employees].sort((a, b) => {
    const aHasOrder = hasNumericSortOrder(a.sortOrder);
    const bHasOrder = hasNumericSortOrder(b.sortOrder);
    if (aHasOrder && bHasOrder) {
      const aOrder = a.sortOrder as number;
      const bOrder = b.sortOrder as number;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    }
    if (aHasOrder) return -1;
    if (bHasOrder) return 1;

    const createdAtComparison = compareCreatedAt(a.createdAt, b.createdAt);
    if (createdAtComparison !== 0) return createdAtComparison;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

/**
 * Move one person one step up or down **as the user sees them**.
 *
 * Every screen that reorders people is a *filtered* view of the same single
 * `sortOrder`: the salary sheet hides other categories, the production roster
 * shows only active production workers. The neighbour to swap with must
 * therefore be the neighbour in `visibleIds` — stepping through `orderedIds`
 * instead would jump over a hidden person, leaving the screen looking
 * unchanged while a different order was written to the database.
 *
 * @param orderedIds every employee id, in the order that will be persisted.
 * @param visibleIds the ids actually on screen, in screen order.
 * @param direction -1 to move up, 1 to move down.
 * @returns the full new order, or `null` when there is nothing to do (already
 *   at the visible edge, or the id is not on screen) so the caller can skip
 *   the write entirely.
 */
export function moveInVisibleOrder(input: {
  orderedIds: string[];
  visibleIds: string[];
  id: string;
  direction: -1 | 1;
}): string[] | null {
  const { orderedIds, visibleIds, id, direction } = input;

  const visibleIndex = visibleIds.indexOf(id);
  if (visibleIndex < 0) return null;
  const neighbourId = visibleIds[visibleIndex + direction];
  if (neighbourId === undefined) return null;

  const fromIndex = orderedIds.indexOf(id);
  const toIndex = orderedIds.indexOf(neighbourId);
  if (fromIndex < 0 || toIndex < 0) return null;

  const next = [...orderedIds];
  next[fromIndex] = orderedIds[toIndex];
  next[toIndex] = orderedIds[fromIndex];
  return next;
}

export function getNextEmployeeSortOrder<T extends EmployeeOrderRecord>(
  employees: T[],
): number {
  const maxOrder = employees.reduce((max, employee) => {
    if (!hasNumericSortOrder(employee.sortOrder)) return max;
    return Math.max(max, employee.sortOrder);
  }, -1);
  return maxOrder + 1;
}
