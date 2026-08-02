"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Archive,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  LayoutGrid,
  Package,
  PackageSearch,
  Plus,
  Printer,
  RotateCw,
  Rows3,
  Search,
  Star,
  TriangleAlert,
} from "lucide-react";
import {
  getStockLevels,
  getMovements,
  deleteInventoryItem,
  saveInventoryItem,
  INVENTORY_CATEGORIES,
  type InventoryItem,
  type InventoryMovement,
  type InventoryCategory,
  type MovementType,
} from "@/lib/services/inventoryService";
import { printInventory } from "@/lib/utils/inventoryPrint";
import { CATEGORY_THEME } from "@/components/inventory/category-theme";
import { stockStatus } from "@/components/inventory/shared";
import { BigItemCard } from "@/components/inventory/big-item-card";
import { CategorySubnav } from "@/components/inventory/category/category-subnav";
import { ItemTable } from "@/components/inventory/category/item-table";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/components/inventory/category/segmented-control";
import { ItemDetailsDialog } from "@/components/inventory/item-details-dialog";
import { ItemFormDialog } from "@/components/inventory/item-form-dialog";
import { MovementDialog } from "@/components/inventory/movement-dialog";
import { ProduceDialog } from "@/components/inventory/produce-dialog";
import { HistorySheet } from "@/components/inventory/history-sheet";
import { GlobalSearchDialog } from "@/components/inventory/global-search-dialog";
import { cn } from "@/lib/utils";

function isInventoryCategory(value: string): value is InventoryCategory {
  return INVENTORY_CATEGORIES.some((c) => c.value === value);
}

type StatusFilter = "all" | "ok" | "low" | "out";
type ScopeFilter = "active" | "favourites" | "archived";
type ViewMode = "cards" | "table";

/** The operator's last choice of cards-vs-table, so it is not re-picked daily. */
const VIEW_MODE_STORAGE_KEY = "prodtrack-inventory-view";

function isViewMode(value: string | null): value is ViewMode {
  return value === "cards" || value === "table";
}

/**
 * Table is the default view — it fits more items on one screen and matches the
 * printed sheet. Cards stay one tap away, and the last choice is remembered.
 */
function readSavedViewMode(): ViewMode {
  if (typeof window === "undefined") return "table";
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return isViewMode(raw) ? raw : "table";
  } catch {
    return "table";
  }
}

/** The item id a global-search result asked us to open, if any. */
function readRequestedItemId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("item");
}

type StockRow = Awaited<ReturnType<typeof getStockLevels>>[number];

/**
 * One dialog can be open at a time, so one nullable union replaces the eight
 * open/target state pairs this page used to carry. `null` means "nothing open".
 */
type ActiveDialog =
  | { kind: "form"; item: InventoryItem | null }
  | { kind: "movement"; item: InventoryItem; type: MovementType }
  | { kind: "produce"; item: InventoryItem }
  | { kind: "history"; item: InventoryItem }
  | { kind: "details"; item: StockRow }
  | { kind: "delete"; item: InventoryItem }
  | { kind: "archive"; item: InventoryItem }
  | { kind: "find" }
  | null;

interface CategoryPageClientProps {
  category: string;
}

export function CategoryPageClient({ category }: CategoryPageClientProps) {
  const { ready: guardReady } = useAuthGuard();
  const { t } = useLanguage();
  const router = useRouter();

  const valid = isInventoryCategory(category);

  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [scope, setScope] = useState<ScopeFilter>("active");
  const [search, setSearch] = useState("");
  const [viewMode, setViewModeState] = useState<ViewMode>(readSavedViewMode);

  const setViewMode = useCallback((next: ViewMode) => {
    setViewModeState(next);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const [dialog, setDialog] = useState<ActiveDialog>(null);
  const closeDialog = useCallback(() => setDialog(null), []);

  /** Always resolves. A failed load sets the error flag; it never looks like "no data". */
  const load = useCallback(async () => {
    try {
      const [stockLevels, movs] = await Promise.all([
        getStockLevels(),
        getMovements(),
      ]);
      setRows(stockLevels);
      setMovements(movs);
      setLoadFailed(false);
      return stockLevels;
    } catch {
      setLoadFailed(true);
      return [];
    }
  }, []);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!guardReady || !valid) return;
    let cancelled = false;
    const run = async () => {
      const loaded = await load();
      if (cancelled) return;
      setDataLoaded(true);
      /**
       * Arriving from the global search: `?item=<id>` opens that item straight
       * away, so the operator lands on what he searched for instead of a list
       * he has to re-scan. The query is then dropped from the URL so a refresh
       * does not re-open the dialog.
       */
      const wanted = readRequestedItemId();
      if (!wanted) return;
      window.history.replaceState(null, "", window.location.pathname);
      const match = loaded.find((r) => r.id === wanted);
      if (match) setDialog({ kind: "details", item: match });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [guardReady, valid, load]);

  useEffect(() => {
    if (guardReady && !valid) {
      router.replace("/inventory");
    }
  }, [guardReady, valid, router]);



  const ready = guardReady && valid && dataLoaded;

  const categoryMeta = valid
    ? INVENTORY_CATEGORIES.find((c) => c.value === category)
    : undefined;
  const canProduce = categoryMeta?.layer === "finished";

  const theme = valid ? CATEGORY_THEME[category as InventoryCategory] : null;
  const categoryLabel = theme ? t(theme.labelKey) : "";

  const categoryRows = useMemo(
    () => (valid ? rows.filter((r) => r.category === category) : []),
    [rows, category, valid],
  );

  const movementSummaries = useMemo(() => {
    const map = new Map<string, { inward: number; outward: number }>();
    for (const m of movements) {
      const entry = map.get(m.itemId) ?? { inward: 0, outward: 0 };
      if (m.type === "inward") entry.inward += m.qty;
      else if (m.type === "outward") entry.outward += m.qty;
      map.set(m.itemId, entry);
    }
    return map;
  }, [movements]);

  const lowCount = categoryRows.filter(
    (r) => r.currentStock > 0 && r.isLow,
  ).length;
  const outCount = categoryRows.filter((r) => r.currentStock <= 0).length;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categoryRows.filter((r) => {
      const status = stockStatus(r.currentStock, r.lowStockThreshold);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (scope === "archived") {
        if (r.isActive !== false) return false;
      } else {
        if (r.isActive === false) return false;
        if (scope === "favourites" && !r.isFavorite) return false;
      }
      if (
        q &&
        !r.code.toLowerCase().includes(q) &&
        !r.name.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [categoryRows, statusFilter, search, scope]);

  const handlePrint = async () => {
    if (!valid) return;
    try {
      await printInventory(rows, movements, {
        title: categoryLabel || t("inventoryPageTitle"),
        category,
      });
      toast.success(t("inventoryPrintSuccess"));
    } catch {
      toast.error(t("commonErrorWithMessage", { msg: "print" }));
    }
  };

  const handleDelete = async () => {
    if (dialog?.kind !== "delete") return;
    const target = dialog.item;
    try {
      await deleteInventoryItem(target.id);
      toast.success(t("inventoryItemDeleted"));
      closeDialog();
      await load();
    } catch {
      toast.error(t("commonErrorWithMessage", { msg: "delete" }));
    }
  };

  const toggleFavorite = async (item: InventoryItem) => {
    const next = !item.isFavorite;
    try {
      await saveInventoryItem({ ...item, isFavorite: next });
      toast.success(
        next ? t("invCatFavouriteAdded") : t("invCatFavouriteRemoved"),
      );
      await load();
    } catch {
      toast.error(t("commonErrorWithMessage", { msg: "favourite" }));
    }
  };

  const handleArchive = async () => {
    if (dialog?.kind !== "archive") return;
    const target = dialog.item;
    const restoring = target.isActive === false;
    try {
      await saveInventoryItem({ ...target, isActive: restoring });
      toast.success(
        restoring ? t("invCatItemRestored") : t("invCatItemArchived"),
      );
      closeDialog();
      await load();
    } catch {
      toast.error(t("commonErrorWithMessage", { msg: "archive" }));
    }
  };

  if (!ready) {
    return (
      <AppLoadingScreen
        title={t("inventoryLoadingTitle")}
        description={t("inventoryLoadingDescription")}
      />
    );
  }

  const Icon = theme!.icon;

  const statusOptions: SegmentedOption<StatusFilter>[] = [
    { value: "all", label: t("inventoryFilterAll"), icon: Package },
    { value: "ok", label: t("inventoryFilterOk"), icon: CircleCheck },
    { value: "low", label: t("inventoryFilterLow"), icon: CircleAlert },
    { value: "out", label: t("inventoryFilterOut"), icon: CircleSlash },
  ];

  const scopeOptions: SegmentedOption<ScopeFilter>[] = [
    { value: "active", label: t("invCatScopeActive"), icon: Package },
    { value: "favourites", label: t("invCatScopeFavourites"), icon: Star },
    { value: "archived", label: t("invCatScopeArchived"), icon: Archive },
  ];

  const viewOptions: SegmentedOption<ViewMode>[] = [
    { value: "table", label: t("inventoryViewTable"), icon: Rows3 },
    { value: "cards", label: t("inventoryViewCards"), icon: LayoutGrid },
  ];

  const archiveTarget = dialog?.kind === "archive" ? dialog.item : null;
  const archiveRestoring = archiveTarget?.isActive === false;

  return (
    <AppShell>
      <main className="flex w-full min-w-0 flex-col gap-5 animate-fade-in">
        {/* Hero: what this page is, plus the two page-level actions. */}
        <section className="relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <span
            className={cn("absolute inset-y-0 left-0 w-1", theme!.stripe)}
            aria-hidden
          />
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div
                className={cn(
                  "flex size-14 shrink-0 items-center justify-center rounded-2xl",
                  theme!.iconChip,
                )}
              >
                <Icon className="size-8" aria-hidden />
              </div>
              <div className="flex min-w-0 flex-col">
                <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                  {categoryLabel}
                </h1>
                <span className="text-sm font-medium text-muted-foreground">
                  {t("inventoryCountSummary", {
                    total: categoryRows.length,
                    low: lowCount,
                    out: outCount,
                  })}
                </span>
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap gap-3">
              <Button className="min-h-[52px] px-5 text-base" onClick={() => setDialog({ kind: "form", item: null })}>
                <Plus className="size-5" data-icon="inline-start" aria-hidden />
                {t("inventoryAddInCategory", { category: categoryLabel })}
              </Button>
              <Button
                variant="outline"
                className="min-h-[52px] px-5 text-base"
                onClick={() => setDialog({ kind: "find" })}
              >
                <Search className="size-5" data-icon="inline-start" aria-hidden />
                {t("invFindOpen")}
              </Button>
              <Button
                variant="outline"
                className="min-h-[52px] px-5 text-base"
                onClick={handlePrint}
              >
                <Printer className="size-5" data-icon="inline-start" aria-hidden />
                {t("inventoryPrint")}
              </Button>
            </div>
          </div>
        </section>

        <CategorySubnav current={category as InventoryCategory} />

        {/* One toolbar: search + the three choosers, all wrapping together. */}
        <section className="flex w-full min-w-0 flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
          <div className="flex min-w-[min(100%,15rem)] flex-1 flex-col gap-1.5">
            <Label htmlFor="inv-cat-search" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("invCatSearchLabel")}
            </Label>
            <div className="relative min-w-0">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="inv-cat-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("inventorySearchPlaceholder")}
                className="min-h-[48px] w-full min-w-0 pl-10 text-base"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("invCatFilterStatusLabel")}
            </span>
            <SegmentedControl
              label={t("invCatFilterStatusLabel")}
              value={statusFilter}
              options={statusOptions}
              onChange={setStatusFilter}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("invCatFilterScopeLabel")}
            </span>
            <SegmentedControl
              label={t("invCatFilterScopeLabel")}
              value={scope}
              options={scopeOptions}
              onChange={setScope}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("invCatViewLabel")}
            </span>
            <SegmentedControl
              label={t("invCatViewLabel")}
              value={viewMode}
              options={viewOptions}
              onChange={setViewMode}
            />
          </div>
        </section>

        {loadFailed ? (
          <Empty className="border border-border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlert aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("invCatLoadErrorTitle")}</EmptyTitle>
              <EmptyDescription>{t("invCatLoadErrorDesc")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button className="min-h-[48px] px-5 text-base" onClick={reload}>
                <RotateCw className="size-5" data-icon="inline-start" aria-hidden />
                {t("invCatRetry")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : categoryRows.length === 0 ? (
          <Empty className="border border-dashed border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageSearch aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("invCatEmptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("invCatEmptyDesc", { category: categoryLabel })}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                className="min-h-[48px] px-5 text-base"
                onClick={() => setDialog({ kind: "form", item: null })}
              >
                <Plus className="size-5" data-icon="inline-start" aria-hidden />
                {t("inventoryAddInCategory", { category: categoryLabel })}
              </Button>
            </EmptyContent>
          </Empty>
        ) : filteredRows.length === 0 ? (
          <Empty className="border border-dashed border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("invCatNoResultsTitle")}</EmptyTitle>
              <EmptyDescription>{t("invCatNoResultsDesc")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : viewMode === "cards" ? (
          <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredRows.map((item) => (
              <BigItemCard
                key={item.id}
                item={item}
                onInward={(i) => setDialog({ kind: "movement", item: i, type: "inward" })}
                onOutward={(i) => setDialog({ kind: "movement", item: i, type: "outward" })}
                onDetails={(i) => setDialog({ kind: "details", item: i })}
                onFavorite={toggleFavorite}
                onArchive={(i) => setDialog({ kind: "archive", item: i })}
              />
            ))}
          </div>
        ) : (
          <ItemTable
            rows={filteredRows}
            movementSummaries={movementSummaries}
            onInward={(i) => setDialog({ kind: "movement", item: i, type: "inward" })}
            onOutward={(i) => setDialog({ kind: "movement", item: i, type: "outward" })}
            onDetails={(i) => setDialog({ kind: "details", item: i })}
            onFavorite={toggleFavorite}
            onArchive={(i) => setDialog({ kind: "archive", item: i })}
          />
        )}
      </main>

      <GlobalSearchDialog
        open={dialog?.kind === "find"}
        onOpenChange={(open) => !open && closeDialog()}
        rows={rows}
        loadFailed={loadFailed}
        onRetry={reload}
        onSelect={(row) => {
          if (row.category === category) {
            setDialog({ kind: "details", item: row });
            return;
          }
          closeDialog();
          router.push(`/inventory/${row.category}?item=${encodeURIComponent(row.id)}`);
        }}
      />

      <ItemFormDialog
        open={dialog?.kind === "form"}
        onOpenChange={(open) => !open && closeDialog()}
        item={dialog?.kind === "form" ? dialog.item : null}
        onSaved={reload}
        lockCategory={category as InventoryCategory}
      />

      <MovementDialog
        open={dialog?.kind === "movement"}
        onOpenChange={(open) => !open && closeDialog()}
        item={dialog?.kind === "movement" ? dialog.item : null}
        type={dialog?.kind === "movement" ? dialog.type : "inward"}
        onSaved={reload}
      />

      <ProduceDialog
        open={dialog?.kind === "produce"}
        onOpenChange={(open) => !open && closeDialog()}
        item={dialog?.kind === "produce" ? dialog.item : null}
        onSaved={reload}
      />

      <HistorySheet
        open={dialog?.kind === "history"}
        onOpenChange={(open) => !open && closeDialog()}
        item={dialog?.kind === "history" ? dialog.item : null}
        onChanged={reload}
      />

      <ItemDetailsDialog
        open={dialog?.kind === "details"}
        onOpenChange={(open) => !open && closeDialog()}
        item={dialog?.kind === "details" ? dialog.item : null}
        movementSummary={
          dialog?.kind === "details"
            ? movementSummaries.get(dialog.item.id)
            : undefined
        }
        canProduce={canProduce}
        onSaved={reload}
        onProduce={(item) => setDialog({ kind: "produce", item })}
        onHistory={(item) => setDialog({ kind: "history", item })}
        onEdit={(item) => setDialog({ kind: "form", item })}
        onDelete={(item) => setDialog({ kind: "delete", item })}
      />

      <AlertDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("inventoryDeleteAction")}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.kind === "delete"
                ? t("inventoryDeleteDesc", { name: dialog.item.name })
                : t("inventoryDeleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {t("inventoryDeleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialog?.kind === "archive"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveRestoring
                ? t("invCatRestoreTitle")
                : t("invCatArchiveTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget
                ? t(
                    archiveRestoring ? "invCatRestoreDesc" : "invCatArchiveDesc",
                    { name: archiveTarget.name },
                  )
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>
              {archiveRestoring
                ? t("invCatRestoreAction")
                : t("invCatArchiveAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
