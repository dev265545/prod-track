"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  ArrowLeft,
  PackageSearch,
  Plus,
  Printer,
  LayoutGrid,
  Rows3,
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
import { ItemDetailsDialog } from "@/components/inventory/item-details-dialog";
import { ItemFormDialog } from "@/components/inventory/item-form-dialog";
import { MovementDialog } from "@/components/inventory/movement-dialog";
import { ProduceDialog } from "@/components/inventory/produce-dialog";
import { HistorySheet } from "@/components/inventory/history-sheet";
import { cn } from "@/lib/utils";
import type { MessageKey } from "@/lib/i18n/messages";

function isInventoryCategory(value: string): value is InventoryCategory {
  return INVENTORY_CATEGORIES.some((c) => c.value === value);
}

type StatusFilter = "all" | "ok" | "low" | "out";
type ViewMode = "cards" | "table";

type StockRow = Awaited<ReturnType<typeof getStockLevels>>[number];

interface CategoryPageClientProps {
  category: string;
}

export function CategoryPageClient({ category }: CategoryPageClientProps) {
  const { ready: guardReady } = useAuthGuard();
  const { t } = useLanguage();
  const router = useRouter();

  const valid = isInventoryCategory(category);

  const [dataLoaded, setDataLoaded] = useState(false);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<MovementType>("inward");

  const [produceDialogOpen, setProduceDialogOpen] = useState(false);
  const [produceItem, setProduceItem] = useState<InventoryItem | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<Awaited<ReturnType<typeof getStockLevels>>[number] | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);

  const load = async () => {
    const [stockLevels, movs] = await Promise.all([
      getStockLevels(),
      getMovements(),
    ]);
    setRows(stockLevels);
    setMovements(movs);
  };

  useEffect(() => {
    if (!guardReady || !valid) return;
    load().then(() => setDataLoaded(true));
  }, [guardReady, valid]);

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
      if (showArchived ? r.isActive !== false : r.isActive === false) return false;
      if (favoritesOnly && !r.isFavorite) return false;
      if (
        q &&
        !r.code.toLowerCase().includes(q) &&
        !r.name.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [categoryRows, statusFilter, search, favoritesOnly, showArchived]);

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

  const openAdd = () => {
    setEditingItem(null);
    setItemDialogOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setItemDialogOpen(true);
  };

  const openMovement = (item: InventoryItem, type: MovementType) => {
    setMovementItem(item);
    setMovementType(type);
    setMovementDialogOpen(true);
  };

  const openProduce = (item: InventoryItem) => {
    setProduceItem(item);
    setProduceDialogOpen(true);
  };

  const openHistory = (item: InventoryItem) => {
    setHistoryItem(item);
    setHistoryOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteInventoryItem(deleteTarget.id);
      toast.success(t("inventoryItemDeleted"));
      setDeleteTarget(null);
      await load();
    } catch {
      toast.error(t("commonErrorWithMessage", { msg: "delete" }));
    }
  };

  const toggleFavorite = async (item: InventoryItem) => {
    try {
      await saveInventoryItem({ ...item, isFavorite: !item.isFavorite });
      await load();
    } catch {
      toast.error(t("commonErrorWithMessage", { msg: "favourite" }));
    }
  };

  const toggleArchived = async (item: InventoryItem) => {
    try {
      await saveInventoryItem({ ...item, isActive: item.isActive === false });
      toast.success(item.isActive === false ? "Item restored" : "Item archived");
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

  const statusFilters: { key: StatusFilter; labelKey: MessageKey }[] = [
    { key: "all", labelKey: "inventoryFilterAll" },
    { key: "ok", labelKey: "inventoryFilterOk" },
    { key: "low", labelKey: "inventoryFilterLow" },
    { key: "out", labelKey: "inventoryFilterOut" },
  ];

  return (
    <AppShell>
      <main className="flex flex-col gap-6 animate-fade-in">
        <div className="flex flex-col gap-4">
          <Button
            variant="ghost"
            className="w-fit gap-2 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => router.push("/inventory")}
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t("inventoryBackToHub")}
          </Button>

          <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <span className={cn("absolute inset-y-0 left-0 w-1", theme!.stripe)} aria-hidden />
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex size-14 shrink-0 items-center justify-center rounded-2xl",
                  theme!.iconChip,
                )}
              >
                <Icon className="size-8" aria-hidden />
              </div>
              <div className="flex flex-col">
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

            <div className="flex flex-wrap gap-3">
              <Button
                className="min-h-[56px] px-5 text-base"
                onClick={openAdd}
              >
                <Plus className="size-5" data-icon="inline-start" aria-hidden />
                {t("inventoryAddInCategory", { category: categoryLabel })}
              </Button>
              <Button
                variant="outline"
                className="min-h-[56px] px-5 text-base"
                onClick={handlePrint}
              >
                <Printer className="size-5" data-icon="inline-start" aria-hidden />
                {t("inventoryPrint")}
              </Button>
            </div>
          </div>
        </div>

        {/* Filter chips + view toggle */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "min-h-[48px] rounded-xl border px-5 text-base font-bold transition-colors",
                  statusFilter === f.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {t(f.labelKey)}
              </button>
            ))}
            <Button
              type="button"
              variant={favoritesOnly ? "default" : "outline"}
              onClick={() => { setFavoritesOnly((value) => !value); setShowArchived(false); }}
            >
              ★ Favourites
            </Button>
            <Button
              type="button"
              variant={showArchived ? "default" : "outline"}
              onClick={() => { setShowArchived((value) => !value); setFavoritesOnly(false); }}
            >
              {showArchived ? "Archived" : "Active"}
            </Button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={cn(
                "flex min-h-[48px] items-center gap-2 rounded-xl border px-4 text-base font-bold transition-colors",
                viewMode === "cards"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="size-5" aria-hidden />
              {t("inventoryViewCards")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "flex min-h-[48px] items-center gap-2 rounded-xl border px-4 text-base font-bold transition-colors",
                viewMode === "table"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <Rows3 className="size-5" aria-hidden />
              {t("inventoryViewTable")}
            </button>
          </div>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("inventorySearchPlaceholder")}
          className="min-h-[52px] text-base"
        />

        {categoryRows.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            <PackageSearch className="size-10" aria-hidden />
            <span className="text-lg font-medium">
              {t("inventoryAddInCategory", { category: categoryLabel })}
            </span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            <span className="text-base font-medium">
              {t("inventoryNoResults")}
            </span>
          </div>
        ) : viewMode === "cards" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredRows.map((item) => (
              <BigItemCard
                key={item.id}
                item={item}
                onInward={(i) => openMovement(i, "inward")}
                onOutward={(i) => openMovement(i, "outward")}
                onDetails={setDetailsItem}
                onFavorite={toggleFavorite}
                onArchive={toggleArchived}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((item) => {
                  const sums = movementSummaries.get(item.id) ?? {
                    inward: 0,
                    outward: 0,
                  };
                  const status = stockStatus(
                    item.currentStock,
                    item.lowStockThreshold,
                  );
                  return (
                    <TableRow
                      key={item.id}
                      className={cn(
                        status === "out" && "bg-destructive/5",
                        status === "low" && "bg-warning/5",
                      )}
                    >
                      <TableCell className="font-mono text-xs">
                        {item.code}
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.name}
                      </TableCell>
                      <TableCell>
                        {t(
                          item.unit === "kg"
                            ? "inventoryUnitKg"
                            : "inventoryUnitPcs",
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.openingStock}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        {sums.inward}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">
                        {sums.outward}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {item.currentStock}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-bold",
                            status === "out"
                              ? "bg-destructive/10 text-destructive"
                              : status === "low"
                                ? "bg-warning/15 text-warning"
                                : "bg-success/15 text-success",
                          )}
                        >
                          {status === "out"
                            ? t("inventoryStatusOut")
                            : status === "low"
                              ? t("inventoryStatusLow")
                              : t("inventoryStatusOk")}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <ItemFormDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
        onSaved={load}
        lockCategory={category as InventoryCategory}
      />

      <MovementDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        item={movementItem}
        type={movementType}
        onSaved={load}
      />

      <ProduceDialog
        open={produceDialogOpen}
        onOpenChange={setProduceDialogOpen}
        item={produceItem}
        onSaved={load}
      />

      <HistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        item={historyItem}
        onChanged={load}
      />

      <ItemDetailsDialog
        open={!!detailsItem}
        onOpenChange={(open) => !open && setDetailsItem(null)}
        item={detailsItem}
        movementSummary={detailsItem ? movementSummaries.get(detailsItem.id) : undefined}
        canProduce={canProduce}
        onProduce={(item) => {
          setDetailsItem(null);
          openProduce(item);
        }}
        onHistory={(item) => {
          setDetailsItem(null);
          openHistory(item);
        }}
        onEdit={(item) => {
          setDetailsItem(null);
          openEdit(item);
        }}
        onDelete={(item) => {
          setDetailsItem(null);
          setDeleteTarget(item);
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("inventoryDeleteAction")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? t("inventoryDeleteDesc", { name: deleteTarget.name })
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
    </AppShell>
  );
}
