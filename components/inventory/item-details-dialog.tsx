"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Factory,
  History,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/language-provider";
import { stockStatus } from "@/components/inventory/shared";
import { ProduceForm } from "@/components/inventory/forms/produce-form";
import type { InventoryItem } from "@/lib/services/inventoryService";
import type { BigItemCardRow } from "@/components/inventory/big-item-card";

interface ItemDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: BigItemCardRow | null;
  movementSummary?: { inward: number; outward: number };
  canProduce?: boolean;
  /**
   * Refresh callback. When provided, production is recorded inline here in a
   * single step instead of closing this dialog and opening a second one.
   */
  onSaved?: () => Promise<void> | void;
  /** Legacy two-step path, used only when `onSaved` is not supplied. */
  onProduce?: (item: InventoryItem) => void;
  onInward?: (item: InventoryItem) => void;
  onOutward?: (item: InventoryItem) => void;
  onHistory: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
}

export function ItemDetailsDialog({
  open,
  onOpenChange,
  item,
  movementSummary = { inward: 0, outward: 0 },
  canProduce = false,
  onSaved,
  onProduce,
  onInward,
  onOutward,
  onHistory,
  onEdit,
  onDelete,
}: ItemDetailsDialogProps) {
  const { t } = useLanguage();
  if (!item) return null;
  const status = stockStatus(item.currentStock ?? 0, item.lowStockThreshold);
  const statusLabel =
    status === "out"
      ? t("inventoryStatusOut")
      : status === "low"
        ? t("inventoryStatusLow")
        : t("inventoryStatusOk");
  const inlineProduce = canProduce && !!onSaved;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[var(--dialog-max-h)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">{item.name}</DialogTitle>
          <DialogDescription className="break-words">
            {item.code} · {item.unit}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-lg bg-surface-3 p-3">
            <span className="text-xs text-muted-foreground">
              {t("inventoryCurrentStock")}
            </span>
            <p className="font-heading text-2xl font-bold tabular-nums">
              {item.currentStock}
            </p>
          </div>
          <div className="flex min-w-0 items-center justify-center rounded-lg bg-surface-3 p-3">
            <Badge
              variant={
                status === "out"
                  ? "destructive"
                  : status === "low"
                    ? "warning"
                    : "success"
              }
            >
              {statusLabel}
            </Badge>
          </div>
          <div className="min-w-0 rounded-lg border border-border p-3">
            <span className="text-xs text-muted-foreground">
              {t("inventoryOpeningLabel")}
            </span>
            <p className="font-semibold tabular-nums">{item.openingStock}</p>
          </div>
          <div className="min-w-0 rounded-lg border border-border p-3">
            <span className="text-xs text-muted-foreground">
              {t("invDlgTypeIn")} / {t("invDlgTypeOut")}
            </span>
            <p className="font-semibold tabular-nums">
              {movementSummary.inward} / {movementSummary.outward}
            </p>
          </div>
          {/* Packing parts belong to finished goods only. A raw material like
              dana is not packed with a box, sticker and poly, so showing three
              dashes here was noise on most of the catalogue. */}
          {canProduce && (
          <div className="min-w-0 rounded-lg border border-border p-3 sm:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("invDlgPartsTitle")}
            </p>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">
                  {t("invDlgPartBox")}
                </dt>
                <dd className="truncate font-mono text-sm font-semibold">
                  {item.boxCode || "—"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">
                  {t("invDlgPartSticker")}
                </dt>
                <dd className="truncate font-mono text-sm font-semibold">
                  {item.stickerCode || "—"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">
                  {t("invDlgPartPoly")}
                </dt>
                <dd className="truncate font-mono text-sm font-semibold">
                  {item.polyCode || "—"}
                </dd>
              </div>
            </dl>
          </div>
          )}
        </div>

        {inlineProduce && (
          <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4 shadow-sm">
            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <Factory className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0">{t("invDlgMadeTitle")}</span>
            </p>
            <ProduceForm
              active={open}
              item={item}
              idPrefix="details-prod"
              onSaved={async () => {
                await onSaved?.();
              }}
              onDone={() => onOpenChange(false)}
            />
          </div>
        )}

        <DialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:space-x-0">
          {/* The reason most people open this dialog. Previously it offered only
              History/Edit/Delete, so for a raw material it was a dead end for the
              one task the operator actually came to do. */}
          {onInward && (
            <Button
              type="button"
              className="h-11 w-full"
              onClick={() => onInward(item)}
            >
              <ArrowDownToLine data-icon="inline-start" aria-hidden />{" "}
              {t("invCatStockIn")}
            </Button>
          )}
          {onOutward && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => onOutward(item)}
            >
              <ArrowUpFromLine data-icon="inline-start" aria-hidden />{" "}
              {t("invCatStockOut")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => onHistory(item)}
          >
            <History data-icon="inline-start" /> {t("inventoryHistory")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => onEdit(item)}
          >
            <Pencil data-icon="inline-start" /> {t("inventoryEditAction")}
          </Button>
          {!inlineProduce && canProduce && onProduce && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full sm:col-span-2"
              onClick={() => onProduce(item)}
            >
              <Factory data-icon="inline-start" /> {t("invDlgMadeTitle")}
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            className="h-11 w-full sm:col-span-2"
            onClick={() => onDelete(item)}
          >
            <Trash2 data-icon="inline-start" /> {t("inventoryDeleteAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
