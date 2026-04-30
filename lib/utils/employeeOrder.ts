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

export function getNextEmployeeSortOrder<T extends EmployeeOrderRecord>(
  employees: T[],
): number {
  const maxOrder = employees.reduce((max, employee) => {
    if (!hasNumericSortOrder(employee.sortOrder)) return max;
    return Math.max(max, employee.sortOrder);
  }, -1);
  return maxOrder + 1;
}
