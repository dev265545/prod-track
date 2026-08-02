import type { InventoryMovement } from "@/lib/services/inventoryService";

export interface InventoryDateSummary {
  count: number;
  inward: number;
  outward: number;
}

export function groupInventoryMovementsByDate(
  movements: InventoryMovement[],
): Map<string, InventoryDateSummary> {
  const grouped = new Map<string, InventoryDateSummary>();

  for (const movement of movements) {
    const current = grouped.get(movement.date) ?? {
      count: 0,
      inward: 0,
      outward: 0,
    };
    current.count += 1;
    if (movement.type === "inward") current.inward += movement.qty;
    if (movement.type === "outward") current.outward += movement.qty;
    grouped.set(movement.date, current);
  }

  return grouped;
}

export function movementsForDate(
  movements: InventoryMovement[],
  date: string,
): InventoryMovement[] {
  return movements
    .filter((movement) => movement.date === date)
    .sort((a, b) => b.createdAt - a.createdAt);
}
