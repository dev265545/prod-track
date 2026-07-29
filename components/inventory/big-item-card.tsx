"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  MoreVertical,
  Star,
  Archive,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import { stockStatus } from "@/components/inventory/shared";
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
 * Large, calm item card for the factory floor: big tabular-nums stock
 * number, one clear status Badge, and big labeled action buttons.
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
  const statusConfig = status === "out"
    ? { label: t("inventoryStatusOut"), variant: "destructive" as const }
    : status === "low"
      ? { label: t("inventoryStatusLow"), variant: "warning" as const }
      : { label: t("inventoryStatusOk"), variant: "success" as const };

  return (
    <Card
      className={cn(
        "flex min-h-[248px] flex-col overflow-hidden border-border/80 bg-card shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
    >
      <CardHeader className="gap-3 p-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded-md border border-border bg-muted/60 px-2 py-1 font-mono text-[11px] font-medium text-muted-foreground">
              {item.code}
            </span>
            <Badge variant={statusConfig.variant} className="px-2 py-1 text-[11px]">
              {statusConfig.label}
            </Badge>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0 rounded-xl"
            onClick={() => onDetails(item)}
            aria-label={t("inventoryViewDetails")}
          >
            <MoreVertical aria-hidden />
          </Button>
          {onFavorite && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("size-9 shrink-0", item.isFavorite && "text-warning")}
              onClick={() => onFavorite(item)}
              aria-label={item.isFavorite ? "Remove favourite" : "Add favourite"}
            >
              <Star className={cn(item.isFavorite && "fill-current")} aria-hidden />
            </Button>
          )}
          {onArchive && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={() => onArchive(item)}
              aria-label={item.isActive === false ? "Restore item" : "Archive item"}
            >
              <Archive aria-hidden />
            </Button>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-base font-semibold leading-snug text-foreground sm:text-lg">
            {item.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(item.unit === "kg" ? "inventoryUnitKg" : "inventoryUnitPcs")}
          </p>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 px-5 pb-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-muted/65 p-3">
            <span className="block text-xs text-muted-foreground">
              {t("inventoryCurrentStock")}
            </span>
            <span className="mt-1 block font-heading text-2xl font-bold leading-none tabular-nums text-foreground">
              {item.currentStock.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span className="ml-1 text-xs font-medium text-muted-foreground">{item.unit}</span>
            </span>
          </div>
          <div className="rounded-2xl bg-muted/65 p-3">
            <span className="block text-xs text-muted-foreground">
              {t("inventoryColThreshold")}
            </span>
            <span className="mt-1 block font-heading text-2xl font-bold leading-none tabular-nums text-foreground">
              {item.lowStockThreshold.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span className="ml-1 text-xs font-medium text-muted-foreground">{item.unit}</span>
            </span>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2">
          <Button className="h-10" onClick={() => onInward(item)}>
            <ArrowDownToLine data-icon="inline-start" aria-hidden />
            {t("inventoryMoveInward")}
          </Button>
          <Button variant="outline" className="h-10" onClick={() => onOutward(item)}>
            <ArrowUpFromLine data-icon="inline-start" aria-hidden />
            {t("inventoryMoveOutward")}
          </Button>
        </div>
      </CardContent>

      <div className="px-5 pb-5 pt-0">
        <Button
          type="button"
          variant="ghost"
          className="h-8 w-full text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={() => onDetails(item)}
        >
          {t("inventoryViewDetails")} <span aria-hidden>→</span>
        </Button>
      </div>
    </Card>
  );
}
