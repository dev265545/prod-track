"use client";

import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import { stockStatus, stockStatusMeta } from "@/components/inventory/shared";
import { ItemActionsMenu } from "@/components/inventory/category/item-actions-menu";
import { formatInventoryQuantity } from "@/lib/services/inventoryCatalog";
import type { BigItemCardRow } from "@/components/inventory/big-item-card";
import type { InventoryItem } from "@/lib/services/inventoryService";

export interface MovementSummary {
  inward: number;
  outward: number;
  /** ISO date of the most recent movement — shown on the card view. */
  lastDate?: string;
}

export interface ItemTableProps {
  rows: BigItemCardRow[];
  movementSummaries: Map<string, MovementSummary>;
  onInward: (item: InventoryItem) => void;
  onOutward: (item: InventoryItem) => void;
  onDetails: (item: BigItemCardRow) => void;
  onFavorite: (item: BigItemCardRow) => void;
  onArchive: (item: BigItemCardRow) => void;
}

const EMPTY_SUMMARY: MovementSummary = { inward: 0, outward: 0 };

/**
 * Dense list view. It offers exactly the same actions as the card view —
 * inward, outward, star, put away and details — so no task is trapped in one
 * view. The table lives inside its own `overflow-x-auto` box: the table may
 * scroll sideways, the page never does.
 */
export function ItemTable({
  rows,
  movementSummaries,
  onInward,
  onOutward,
  onDetails,
  onFavorite,
  onArchive,
}: ItemTableProps) {
  const { t } = useLanguage();

  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("inventoryColCode")}</TableHead>
            <TableHead>{t("inventoryColName")}</TableHead>
            <TableHead>{t("inventoryColUnit")}</TableHead>
            <TableHead className="text-right">
              {t("inventoryColOpening")}
            </TableHead>
            <TableHead className="text-right">
              {t("inventoryColInward")}
            </TableHead>
            <TableHead className="text-right">
              {t("inventoryColOutward")}
            </TableHead>
            <TableHead className="text-right">
              {t("inventoryColClosing")}
            </TableHead>
            <TableHead>{t("inventoryColStatus")}</TableHead>
            <TableHead className="text-right">
              {t("invCatColActions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => {
            const sums = movementSummaries.get(item.id) ?? EMPTY_SUMMARY;
            const status = stockStatus(item.currentStock, item.lowStockThreshold);
            const { labelKey, variant } = stockStatusMeta(status);

            return (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                <TableCell className="font-medium text-foreground">
                  {item.name}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t(item.unit === "kg" ? "inventoryUnitKg" : "inventoryUnitPcs")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInventoryQuantity(item.openingStock)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInventoryQuantity(sums.inward)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInventoryQuantity(sums.outward)}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums text-foreground">
                  {formatInventoryQuantity(item.currentStock)}
                </TableCell>
                <TableCell>
                  <Badge variant={variant}>{t(labelKey)}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
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
                    <ItemActionsMenu
                      item={item}
                      onDetails={onDetails}
                      onFavorite={onFavorite}
                      onArchive={onArchive}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
