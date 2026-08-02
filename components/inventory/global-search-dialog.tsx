"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  PackageSearch,
  RotateCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import {
  CATEGORY_LABEL_KEY,
  stockStatus,
  stockStatusMeta,
} from "@/components/inventory/shared";
import { CATEGORY_THEME } from "@/components/inventory/category-theme";
import { formatInventoryQuantity } from "@/lib/services/inventoryCatalog";
import { searchInventoryItems } from "@/lib/utils/inventorySearch";
import type { InventoryItem } from "@/lib/services/inventoryService";
import { cn } from "@/lib/utils";

export type GlobalSearchRow = InventoryItem & {
  currentStock: number;
  isLow: boolean;
};

const MAX_RESULTS = 40;

export interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every item, from every category — the whole point of this dialog. */
  rows: GlobalSearchRow[];
  /** True when the stock could not be loaded, so "no match" is not a lie. */
  loadFailed?: boolean;
  onRetry?: () => void;
  onSelect: (row: GlobalSearchRow) => void;
}

/**
 * Find an item across every category by name or code. The operator knows the
 * code printed on the stock, not which category holds it, so making him pick a
 * category first is backwards — this searches all six at once.
 */
export function GlobalSearchDialog({
  open,
  onOpenChange,
  rows,
  loadFailed = false,
  onRetry,
  onSelect,
}: GlobalSearchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open, so the box starts empty on every visit. */}
      {open ? (
        <SearchBody
          rows={rows}
          loadFailed={loadFailed}
          onRetry={onRetry}
          onSelect={onSelect}
        />
      ) : null}
    </Dialog>
  );
}

function SearchBody({
  rows,
  loadFailed,
  onRetry,
  onSelect,
}: Pick<GlobalSearchDialogProps, "rows" | "onRetry" | "onSelect"> & {
  loadFailed: boolean;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const results = useMemo(
    () => searchInventoryItems(rows, query, { limit: MAX_RESULTS }),
    [rows, query],
  );

  return (
    <DialogContent className="flex max-h-[var(--dialog-max-h)] min-w-0 flex-col gap-4 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("invFindTitle")}</DialogTitle>
        <DialogDescription>{t("invFindDesc")}</DialogDescription>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label
          htmlFor="inv-find-input"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("invFindLabel")}
        </Label>
        <div className="relative min-w-0">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="inv-find-input"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("invFindPlaceholder")}
            className="min-h-[48px] w-full min-w-0 pl-10 text-base"
          />
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {loadFailed ? (
          <Empty className="border border-border p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlert aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("invFindErrorTitle")}</EmptyTitle>
              <EmptyDescription>{t("invFindErrorDesc")}</EmptyDescription>
            </EmptyHeader>
            {onRetry ? (
              <EmptyContent>
                <Button className="min-h-[44px] gap-2" onClick={onRetry}>
                  <RotateCw className="size-4" aria-hidden />
                  {t("invFindRetry")}
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : trimmed === "" ? (
          <Empty className="border border-dashed border-border p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("invFindStartTitle")}</EmptyTitle>
              <EmptyDescription>{t("invFindStartDesc")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : results.length === 0 ? (
          <Empty className="border border-dashed border-border p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageSearch aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("invFindNoResultsTitle")}</EmptyTitle>
              <EmptyDescription>{t("invFindNoResultsDesc")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {t("invFindResultCount", { count: results.length })}
            </p>
            <ul className="flex min-w-0 flex-col gap-1">
              {results.map((row) => (
                <li key={row.id} className="min-w-0">
                  <ResultRow row={row} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DialogContent>
  );
}

function ResultRow({
  row,
  onSelect,
}: {
  row: GlobalSearchRow;
  onSelect: (row: GlobalSearchRow) => void;
}) {
  const { t } = useLanguage();
  const status = stockStatus(row.currentStock, row.lowStockThreshold);
  const meta = stockStatusMeta(status);
  const theme = CATEGORY_THEME[row.category];

  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className="flex min-h-[44px] w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-surface-1 px-3 py-2 text-left outline-none hover:bg-surface-3 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {/* Category identity is a mark only — the name is always spelled out. */}
      <span
        className={cn("h-9 w-1 shrink-0 rounded-full", theme.stripe)}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {row.name}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          <span className="font-mono">{row.code}</span>
          {" · "}
          {t(CATEGORY_LABEL_KEY[row.category])}
          {" · "}
          {t("invHubColStock")}: {formatInventoryQuantity(row.currentStock)}
        </span>
      </span>
      <Badge variant={meta.variant} className="shrink-0">
        {t(meta.labelKey)}
      </Badge>
    </button>
  );
}
