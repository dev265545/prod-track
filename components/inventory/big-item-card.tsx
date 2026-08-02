"use client";

import { ArrowDownToLine, ArrowUpFromLine, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import { stockStatus, stockStatusMeta } from "@/components/inventory/shared";
import { CATEGORY_THEME } from "@/components/inventory/category-theme";
import { ItemActionsMenu } from "@/components/inventory/category/item-actions-menu";
import { formatInventoryQuantity } from "@/lib/services/inventoryCatalog";
import { stockMeter } from "@/lib/utils/stockLevel";
import { formatDisplayDate } from "@/lib/utils/date";
import type { InventoryItem } from "@/lib/services/inventoryService";

export type BigItemCardRow = InventoryItem & {
  currentStock: number;
  isLow: boolean;
};

export interface BigItemCardMovement {
  inward: number;
  outward: number;
  /** ISO date of the most recent movement, if the item has ever moved. */
  lastDate?: string;
}

export interface BigItemCardProps {
  item: BigItemCardRow;
  movementSummary?: BigItemCardMovement;
  onInward: (item: InventoryItem) => void;
  onOutward: (item: InventoryItem) => void;
  onDetails: (item: BigItemCardRow) => void;
  onFavorite?: (item: BigItemCardRow) => void;
  onArchive?: (item: BigItemCardRow) => void;
  className?: string;
}

/**
 * One item, read top to bottom in four falling weights:
 *
 *  1. IDENTITY — the name, the code chip the operator matches against the
 *     label on the physical stock, and the status badge.
 *  2. THE LEVEL — the quantity as the one dominant figure on the card, sitting
 *     directly on a bar whose fill answers "am I ok?" without arithmetic. The
 *     low line is a notch at the middle of the track (see `stockMeter`).
 *  3. MOVEMENT — what came in, what went out, when it last moved. One quiet
 *     line of text, not boxes: this is the context a table row cannot show,
 *     and it earns its space precisely by staying small.
 *  4. ACTIONS — the two things an operator actually does, side by side and
 *     labelled in words. Everything rarer is in the overflow menu.
 *
 * Colour is split on purpose: the left stripe is the CATEGORY identity (a
 * chart token, mark only, never behind text) while the bar and the badge carry
 * STATUS. The two never mix, so a green bar always means "stock is fine" and
 * never "this is the green category".
 */
export function BigItemCard({
  item,
  movementSummary,
  onInward,
  onOutward,
  onDetails,
  onFavorite,
  onArchive,
  className,
}: BigItemCardProps) {
  const { t, locale } = useLanguage();
  const status = stockStatus(item.currentStock, item.lowStockThreshold);
  const { labelKey, variant, meterFill } = stockStatusMeta(status);
  const meter = stockMeter(item.currentStock, item.lowStockThreshold);
  const unitLabel = t(
    item.unit === "kg" ? "inventoryUnitKg" : "inventoryUnitPcs",
  );
  const stockText = formatInventoryQuantity(item.currentStock);
  const lowText = formatInventoryQuantity(item.lowStockThreshold);
  const inward = movementSummary?.inward ?? 0;
  const outward = movementSummary?.outward ?? 0;

  return (
    <Card
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden transition-shadow duration-150 hover:shadow-md",
        className,
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          CATEGORY_THEME[item.category].stripe,
        )}
        aria-hidden
      />

      {/* 1. Identity */}
      <div className="flex min-w-0 items-start gap-2 py-4 pl-6 pr-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-1.5">
            {item.isFavorite && (
              // `role="img"` is load-bearing: a bare `aria-label` on an <svg>
              // is not reliably exposed, so the star silently said nothing and
              // "starred" was carried by colour and shape alone.
              <Star
                role="img"
                className="size-4 shrink-0 fill-current text-warning"
                aria-label={t("a11yFavouriteMark")}
              />
            )}
            <h3 className="min-w-0 truncate text-base font-semibold leading-snug text-foreground">
              {item.name}
            </h3>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
            <span className="max-w-full break-all rounded-md bg-surface-3 px-2 py-0.5 font-mono text-xs font-semibold tracking-wider text-foreground">
              {item.code}
            </span>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {unitLabel}
            </span>
          </div>
        </div>
        <Badge variant={variant} className="mt-0.5 shrink-0">
          {t(labelKey)}
        </Badge>
        <ItemActionsMenu
          item={item}
          onDetails={onDetails}
          onFavorite={onFavorite}
          onArchive={onArchive}
          className="-mr-2 -mt-2"
        />
      </div>

      {/* 2. The level — the one dominant element on the card */}
      <div className="min-w-0 pb-1 pl-6 pr-5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="font-heading text-[2.5rem] font-bold leading-none tabular-nums text-foreground">
            {stockText}
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-muted-foreground">
            {item.unit}
          </span>
        </div>

        <div
          className="mt-3.5"
          role="img"
          aria-label={
            meter.lowMarkPercent === null
              ? t("invCardLevelAriaNoLow", { qty: stockText, unit: item.unit })
              : t("invCardLevelAria", {
                  qty: stockText,
                  unit: item.unit,
                  low: lowText,
                })
          }
        >
          <div className="relative h-2.5 w-full min-w-0 overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                meterFill,
              )}
              style={{ width: `${meter.percent}%` }}
            />
            {meter.lowMarkPercent !== null && (
              <span
                className="absolute inset-y-0 w-0.5 bg-card"
                style={{ left: `calc(${meter.lowMarkPercent}% - 1px)` }}
              />
            )}
          </div>
          <p className="mt-2 min-w-0 truncate text-xs text-muted-foreground">
            {meter.lowMarkPercent === null
              ? t("invCardNoLowSet")
              : t("invCatLowBelow", { qty: lowText, unit: item.unit })}
          </p>
        </div>
      </div>

      {/* 3. Movement — quiet tertiary detail, deliberately not boxed */}
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border py-3 pl-6 pr-5 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <ArrowDownToLine className="size-3.5 shrink-0" aria-hidden />
          {t("invCardCameIn")}
          <span className="font-semibold tabular-nums text-foreground">
            {formatInventoryQuantity(inward)}
          </span>
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <ArrowUpFromLine className="size-3.5 shrink-0" aria-hidden />
          {t("invCardWentOut")}
          <span className="font-semibold tabular-nums text-foreground">
            {formatInventoryQuantity(outward)}
          </span>
        </span>
        <span className="min-w-0 truncate sm:ml-auto">
          {movementSummary?.lastDate
            ? t("invCardLastMoved", {
                date: formatDisplayDate(movementSummary.lastDate, locale),
              })
            : t("invCardNeverMoved")}
        </span>
      </div>

      {/* 4. Actions */}
      <div className="mt-auto flex min-w-0 flex-wrap gap-2 pb-4 pl-6 pr-5">
        <Button
          type="button"
          size="lg"
          className="min-h-[44px] flex-1 basis-36 text-base"
          onClick={() => onInward(item)}
        >
          <ArrowDownToLine data-icon="inline-start" aria-hidden />
          {t("invCatStockIn")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-[44px] flex-1 basis-36 text-base"
          onClick={() => onOutward(item)}
        >
          <ArrowUpFromLine data-icon="inline-start" aria-hidden />
          {t("invCatStockOut")}
        </Button>
      </div>
    </Card>
  );
}
