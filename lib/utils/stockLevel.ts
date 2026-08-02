/**
 * ProdTrack Lite - Stock level meter geometry
 *
 * Turns "how much is on the shelf" into the two percentages a level bar needs.
 * Kept free of React so it can be unit-tested and reused by any surface that
 * wants to draw the same bar.
 */

export interface StockMeter {
  /** How much of the track is filled, 0-100, always finite. */
  percent: number;
  /**
   * Where the low-stock line sits on the track, 0-100, or `null` when the item
   * has no low line set and the mark would be meaningless.
   */
  lowMarkPercent: number | null;
}

/**
 * The low line sits at the MIDDLE of the track. That is the whole trick: a
 * full bar means "twice what I am allowed to drop to", half a bar means "I am
 * exactly at the low line", and anything left of centre is visibly short. The
 * operator reads a position, not a number.
 *
 * Items with no low line (0, missing, negative or non-finite) have no scale to
 * measure against, so the bar degrades honestly: full when there is stock,
 * empty when there is none, and no mark to misread.
 */
export function stockMeter(
  currentStock: number,
  lowStockThreshold: number,
): StockMeter {
  const stock = Number.isFinite(currentStock) ? currentStock : 0;

  if (!Number.isFinite(lowStockThreshold) || lowStockThreshold <= 0) {
    return { percent: stock > 0 ? 100 : 0, lowMarkPercent: null };
  }

  const full = lowStockThreshold * 2;
  return { percent: clampPercent((stock / full) * 100), lowMarkPercent: 50 };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > 100 ? 100 : value;
}
