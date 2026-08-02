import type { InventoryCategory } from "@/lib/services/inventoryService";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * What a stock category *is* to the people using the app: something the
 * factory buys in and consumes, or something the factory makes and sells.
 *
 * This is the same distinction the data model calls `layer` ("raw" /
 * "finished") — that field stays, because `canProduce` depends on it — but
 * "raw" and "finished" are developer words, and "finished" is worse than
 * useless on a stock screen where it reads as "we ran out". Everything the
 * operator sees is worded from here instead.
 *
 * Type-only imports keep this module free of the database adapter, so it can
 * be unit-tested on its own.
 */
export type StockKind = "bought" | "made";

const KIND_BY_CATEGORY: Record<InventoryCategory, StockKind> = {
  box: "bought",
  dana: "bought",
  poly: "bought",
  sticker: "bought",
  container: "made",
  glass: "made",
};

/** Every category, in the order the app lists them. */
export const STOCK_KIND_CATEGORIES = Object.keys(
  KIND_BY_CATEGORY,
) as InventoryCategory[];

export function stockKindFor(category: InventoryCategory): StockKind {
  return KIND_BY_CATEGORY[category];
}

/** The full plain-language name, e.g. for a badge on the category page. */
export const STOCK_KIND_LABEL_KEY: Record<StockKind, MessageKey> = {
  bought: "invUxKindBought",
  made: "invUxKindMade",
};

/** The short form, for tight spots like a chip or a legend. */
export const STOCK_KIND_SHORT_KEY: Record<StockKind, MessageKey> = {
  bought: "invUxKindBoughtShort",
  made: "invUxKindMadeShort",
};

export interface StockKindCounts {
  bought: number;
  made: number;
}

/**
 * How many stock items of each kind exist. Rows in an unknown category are
 * ignored rather than guessed at, so a stray category can never inflate a
 * count the owner reads as fact.
 */
export function countStockKinds(
  rows: readonly { category: InventoryCategory }[],
): StockKindCounts {
  const counts: StockKindCounts = { bought: 0, made: 0 };
  for (const row of rows) {
    const kind = KIND_BY_CATEGORY[row.category];
    if (kind) counts[kind] += 1;
  }
  return counts;
}
