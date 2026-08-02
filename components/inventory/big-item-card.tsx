"use client";

import { ArrowDownToLine, ArrowUpFromLine, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import { stockStatus, stockStatusMeta } from "@/components/inventory/shared";
import { ItemActionsMenu } from "@/components/inventory/category/item-actions-menu";
import { formatInventoryQuantity } from "@/lib/services/inventoryCatalog";
import type { InventoryItem } from "@/lib/services/inventoryService";

export type BigItemCardRow = InventoryItem & {
  currentStock: number;
  isLow: boolean;
};

export interface BigItemCardProps {
  item: BigItemCardRow;
  onInward: (item: InventoryItem) => void;
  onOutward: (item: InventoryItem) => void;
  onDetails: (item: BigItemCardRow) => void;
  onFavorite?: (item: BigItemCardRow) => void;
  onArchive?: (item: BigItemCardRow) => void;
  className?: string;
}

/**
 * A compact stock row-card. One item, one screenful of information: the
 * quantity is the hero figure, the threshold is quiet reference text folded
 * under the status badge, and everything that is not "add stock" or "take
 * out" lives in a single overflow menu. Deliberately short so an operator can
 * scan a whole shelf without scrolling.
 */
export function BigItemCard({
  item,
  onInward,
  onOutward,
  onDetails,
  onFavorite,
  onArchive,
  className,
}: BigItemCardProps) {
  const { t } = useLanguage();
  const status = stockStatus(item.currentStock, item.lowStockThreshold);
  const { labelKey, variant } = stockStatusMeta(status);
  const unitLabel = t(
    item.unit === "kg" ? "inventoryUnitKg" : "inventoryUnitPcs",
  );

  return (
    <Card
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border-border p-3.5 shadow-sm transition-shadow duration-150 hover:shadow-md",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {item.isFavorite && (
              <Star
                className="size-3.5 shrink-0 fill-current text-warning"
                aria-label={t("invCatScopeFavourites")}
              />
            )}
            <h3 className="min-w-0 truncate text-sm font-semibold leading-tight text-foreground">
              {item.name}
            </h3>
          </div>
          <p className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
            {item.code} · {unitLabel}
          </p>
        </div>
        <Badge variant={variant} className="mt-0.5 shrink-0">
          {t(labelKey)}
        </Badge>
        <ItemActionsMenu
          item={item}
          onDetails={onDetails}
          onFavorite={onFavorite}
          onArchive={onArchive}
          className="-mr-1.5 -mt-1.5"
        />
      </div>

      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="font-heading text-[1.75rem] font-bold leading-none tabular-nums text-foreground">
            {formatInventoryQuantity(item.currentStock)}
            <span className="ml-1 text-xs font-medium text-muted-foreground">
              {item.unit}
            </span>
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {t("invCatLowBelow", {
              qty: formatInventoryQuantity(item.lowStockThreshold),
              unit: item.unit,
            })}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="lg"
            className="min-h-[44px]"
            onClick={() => onInward(item)}
          >
            <ArrowDownToLine data-icon="inline-start" aria-hidden />
            {t("invCatStockIn")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-[44px]"
            onClick={() => onOutward(item)}
          >
            <ArrowUpFromLine data-icon="inline-start" aria-hidden />
            {t("invCatStockOut")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
