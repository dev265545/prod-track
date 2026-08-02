"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CATEGORY_LABEL_KEY } from "@/components/inventory/shared";
import { StockDeficitBar } from "@/components/inventory/charts";
import { formatInventoryQuantity } from "@/lib/services/inventoryCatalog";
import type { InventoryItem } from "@/lib/services/inventoryService";

export type NeedsStockRow = InventoryItem & {
  currentStock: number;
  isLow: boolean;
};

export interface NeedsStockTableProps {
  rows: NeedsStockRow[];
  onAddStock: (item: NeedsStockRow) => void;
  onTakeOut: (item: NeedsStockRow) => void;
}

/**
 * The action layer: the exact items the "needs attention" metric points at,
 * each with the two things the operator can do about it. The table scrolls
 * inside its own container so the page body never scrolls sideways.
 */
export function NeedsStockTable({
  rows,
  onAddStock,
  onTakeOut,
}: NeedsStockTableProps) {
  const { t } = useLanguage();

  if (rows.length === 0) {
    return (
      <Empty className="border border-dashed p-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCircle2 aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t("invHubAllStocked")}</EmptyTitle>
          <EmptyDescription>{t("invHubAllStockedDesc")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-3 py-2 font-medium text-muted-foreground">
              {t("invHubColItem")}
            </th>
            <th className="px-3 py-2 font-medium text-muted-foreground">
              {t("invHubColCategory")}
            </th>
            <th className="px-3 py-2 font-medium text-muted-foreground">
              {t("invHubColStock")}
            </th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">
              {t("invHubColActions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOut = row.currentStock <= 0;
            return (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-3 py-3">
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">
                      {row.name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.code}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {t(CATEGORY_LABEL_KEY[row.category])}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant={isOut ? "destructive" : "warning"}>
                        {isOut ? t("inventoryStatusOut") : t("inventoryStatusLow")}
                      </Badge>
                      <span className="tabular-nums text-foreground">
                        {formatInventoryQuantity(row.currentStock)}
                      </span>
                    </div>
                    <StockDeficitBar
                      current={row.currentStock}
                      threshold={row.lowStockThreshold}
                    />
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-[44px] gap-2"
                      onClick={() => onAddStock(row)}
                    >
                      <ArrowDownToLine className="size-4" aria-hidden />
                      {t("invHubAddStock")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-[44px] gap-2"
                      onClick={() => onTakeOut(row)}
                    >
                      <ArrowUpFromLine className="size-4" aria-hidden />
                      {t("invHubTakeOut")}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
