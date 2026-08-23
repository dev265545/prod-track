import type { InventoryCategory } from "@/lib/services/inventoryService";
import type { MessageKey } from "@/lib/i18n/messages";

export const CATEGORY_LABEL_KEY: Record<InventoryCategory, MessageKey> = {
  box: "inventoryCatBox",
  dana: "inventoryCatDana",
  poly: "inventoryCatPoly",
  container: "inventoryCatContainer",
  sticker: "inventoryCatSticker",
  glass: "inventoryCatGlass",
};

export function stockStatus(
  currentStock: number,
  threshold: number,
): "out" | "low" | "ok" {
  if (currentStock <= 0) return "out";
  if (currentStock < threshold) return "low";
  return "ok";
}

export type StockStatus = ReturnType<typeof stockStatus>;

export interface StockStatusMeta {
  labelKey: MessageKey;
  variant: "destructive" | "warning" | "success";
  /** Fill colour for the level bar — the same semantic ink as the badge. */
  meterFill: string;
}

/**
 * Single source of truth for how a stock status is labelled and coloured, so
 * the card view and the table view can never drift apart.
 */
export function stockStatusMeta(status: StockStatus): StockStatusMeta {
  if (status === "out")
    return {
      labelKey: "inventoryStatusOut",
      variant: "destructive",
      meterFill: "bg-destructive",
    };
  if (status === "low")
    return {
      labelKey: "inventoryStatusLow",
      variant: "warning",
      meterFill: "bg-warning",
    };
  return {
    labelKey: "inventoryStatusOk",
    variant: "success",
    meterFill: "bg-success",
  };
}
