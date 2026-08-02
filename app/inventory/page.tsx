"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Plus,
  Package,
  Layers,
  ShoppingCart,
  AlertTriangle,
  CheckCircle2,
  ArrowLeftRight,
  RefreshCw,
  TriangleAlert,
  PackageOpen,
  Search,
} from "lucide-react";
import {
  getStockLevels,
  getMovements,
  INVENTORY_CATEGORIES,
  type InventoryMovement,
  type InventoryCategory,
  type MovementType,
} from "@/lib/services/inventoryService";
import { migrateLegacyItems } from "@/lib/services/inventoryMigration";
import { formatInventoryQuantity } from "@/lib/services/inventoryCatalog";
import {
  exportInventoryToWorkbook,
  importInventoryFromFile,
  type InventoryImportMode,
} from "@/lib/services/inventoryExcel";
import { printInventory } from "@/lib/utils/inventoryPrint";
import { CATEGORY_LABEL_KEY } from "@/components/inventory/shared";
import { CATEGORY_THEME } from "@/components/inventory/category-theme";
import { StatTile } from "@/components/inventory/stat-tile";
import { DataMenu } from "@/components/inventory/data-menu";
import { countStockKinds } from "@/lib/services/inventoryStockKind";
import { ItemFormDialog } from "@/components/inventory/item-form-dialog";
import { MovementDialog } from "@/components/inventory/movement-dialog";
import { ItemPickerDialog } from "@/components/inventory/hub/item-picker-dialog";
import { GlobalSearchDialog } from "@/components/inventory/global-search-dialog";
import {
  NeedsStockTable,
  type NeedsStockRow,
} from "@/components/inventory/hub/needs-stock-table";
import {
  HealthDonut,
  HorizontalBarChart,
  MovementTrendChart,
  type TrendPoint,
} from "@/components/inventory/charts";

type StockRow = NeedsStockRow;

const TREND_DAYS = 14;
const NEEDS_STOCK_SIZE = 10;

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function InventoryPage() {
  const { ready: guardReady } = useAuthGuard();
  const { t } = useLanguage();
  const router = useRouter();

  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const ready = guardReady && dataLoaded;

  const [rows, setRows] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [movementItem, setMovementItem] = useState<StockRow | null>(null);
  const [movementType, setMovementType] = useState<MovementType>("inward");
  const [movementOpen, setMovementOpen] = useState(false);

  const [importModeDialogOpen, setImportModeDialogOpen] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importModeRef = useRef<InventoryImportMode>("update");

  const load = useCallback(async () => {
    await migrateLegacyItems();
    const [stockLevels, movs] = await Promise.all([
      getStockLevels(),
      getMovements(),
    ]);
    setRows(stockLevels);
    setMovements(movs);
    setLoadFailed(false);
  }, []);

  /** Never let a failed load look like "no data" — it gets its own state. */
  const reload = useCallback(async () => {
    try {
      await load();
    } catch (error) {
      console.error("inventory load failed", error);
      setLoadFailed(true);
      toast.error(t("invHubLoadFailed"));
    }
  }, [load, t]);

  useEffect(() => {
    if (!guardReady) return;
    let cancelled = false;
    load()
      .catch((error) => {
        console.error("inventory load failed", error);
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setDataLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [guardReady, load]);

  const totalItems = rows.length;
  const totalStockUnits = rows.reduce(
    (sum, r) => sum + Math.max(r.currentStock, 0),
    0,
  );
  const lowCount = rows.filter((r) => r.isLow && r.currentStock > 0).length;
  const outCount = rows.filter((r) => r.currentStock <= 0).length;
  const okCount = Math.max(totalItems - lowCount - outCount, 0);
  const attentionCount = lowCount + outCount;

  /** How many items we buy in versus make — in words, never a bare ratio. */
  const kindCounts = useMemo(() => countStockKinds(rows), [rows]);

  const categoryStats = useMemo(() => {
    const map = new Map<InventoryCategory, { out: number; low: number; totalStock: number }>();
    for (const c of INVENTORY_CATEGORIES) {
      map.set(c.value, { out: 0, low: 0, totalStock: 0 });
    }
    for (const r of rows) {
      const entry = map.get(r.category);
      if (!entry) continue;
      entry.totalStock += Math.max(r.currentStock, 0);
      if (r.currentStock <= 0) entry.out += 1;
      else if (r.isLow) entry.low += 1;
    }
    return map;
  }, [rows]);

  const stockByCategory = useMemo(
    () =>
      INVENTORY_CATEGORIES.map((c) => ({
        key: c.value,
        label: t(CATEGORY_LABEL_KEY[c.value]),
        value: Math.round(categoryStats.get(c.value)?.totalStock ?? 0),
        colorClassName: CATEGORY_THEME[c.value].stripe,
      })).sort((a, b) => b.value - a.value),
    [categoryStats, t],
  );

  const needsStock = useMemo(
    () =>
      rows
        .filter((r) => r.currentStock <= 0 || r.isLow)
        .map((r) => ({
          row: r,
          ratio: r.lowStockThreshold > 0 ? r.currentStock / r.lowStockThreshold : 0,
        }))
        .sort((a, b) => {
          const aOut = a.row.currentStock <= 0 ? 0 : 1;
          const bOut = b.row.currentStock <= 0 ? 0 : 1;
          if (aOut !== bOut) return aOut - bOut;
          return a.ratio - b.ratio;
        })
        .slice(0, NEEDS_STOCK_SIZE)
        .map((x) => x.row),
    [rows],
  );

  const trendStart = useMemo(() => isoDaysAgo(TREND_DAYS - 1), []);

  const trendPoints: TrendPoint[] = useMemo(() => {
    const byDate = new Map<string, { inward: number; outward: number }>();
    for (const m of movements) {
      if (m.date < trendStart) continue;
      if (m.type !== "inward" && m.type !== "outward") continue;
      const entry = byDate.get(m.date) ?? { inward: 0, outward: 0 };
      if (m.type === "inward") entry.inward += m.qty;
      else entry.outward += m.qty;
      byDate.set(m.date, entry);
    }
    const points: TrendPoint[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const date = isoDaysAgo(i);
      const d = new Date(`${date}T00:00:00`);
      const entry = byDate.get(date) ?? { inward: 0, outward: 0 };
      points.push({
        date,
        dayLabel: d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        inward: entry.inward,
        outward: entry.outward,
      });
    }
    return points;
  }, [movements, trendStart]);

  const hasMovementData = trendPoints.some((p) => p.inward > 0 || p.outward > 0);
  const movedRecently = trendPoints.reduce(
    (sum, p) => sum + p.inward + p.outward,
    0,
  );

  const openMovement = (item: StockRow, type: MovementType) => {
    setMovementItem(item);
    setMovementType(type);
    setMovementOpen(true);
  };

  const handleExport = async () => {
    try {
      await exportInventoryToWorkbook();
      toast.success(t("inventoryExportSuccess"));
    } catch (error) {
      console.error("inventory export failed", error);
      toast.error(t("commonErrorWithMessage", { msg: "export" }));
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const mode = importModeRef.current;
    e.target.value = "";
    if (!file) return;
    try {
      const result = await importInventoryFromFile(file, { mode });
      if (result.unchanged) {
        toast.info(t("inventoryImportUnchanged"));
      } else if (result.mode === "replace") {
        toast.success(
          t("inventoryImportReplaced", { created: result.itemsCreated }),
        );
      } else {
        toast.success(
          t("inventoryImportSuccess", {
            created: result.itemsCreated,
            updated: result.itemsUpdated,
            movements: result.movementsCreated,
          }),
        );
      }
      if (result.skipped && result.skipped.length > 0) {
        toast.error(
          t("commonErrorWithMessage", {
            msg: `${result.skipped.length} row(s) skipped during import`,
          }),
        );
      }
      await reload();
    } catch (error) {
      console.error("inventory import failed", error);
      toast.error(t("commonErrorWithMessage", { msg: "import" }));
    }
  };

  const startImport = (mode: InventoryImportMode) => {
    importModeRef.current = mode;
    setImportModeDialogOpen(false);
    setReplaceConfirmOpen(false);
    fileInputRef.current?.click();
  };

  const handlePrint = async () => {
    try {
      await printInventory(rows, movements, {
        title: t("inventoryPageTitle"),
        category: "all",
      });
      toast.success(t("inventoryPrintSuccess"));
    } catch (error) {
      console.error("inventory print failed", error);
      toast.error(t("commonErrorWithMessage", { msg: "print" }));
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

  /**
   * Laid out by how often each job is done, not by what the code can do.
   * Recording a movement is the daily job, so it is the one big filled button
   * with the hint under it; finding and adding an item are occasional outline
   * buttons; import/export/print are the owner's rare jobs and live together
   * behind the Data menu.
   */
  const toolbar = (
    <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Button
          className="min-h-[56px] w-full min-w-0 px-6 text-base font-semibold sm:w-auto"
          onClick={() => setPickerOpen(true)}
          disabled={rows.length === 0}
        >
          <ArrowLeftRight className="size-5" data-icon="inline-start" aria-hidden />
          {t("invHubRecordStock")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("invUxRecordStockHint")}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          variant="outline"
          className="min-h-[44px] gap-2"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="size-4" aria-hidden />
          {t("invFindOpen")}
        </Button>
        <Button
          variant="outline"
          className="min-h-[44px] gap-2"
          onClick={() => setItemDialogOpen(true)}
        >
          <Plus className="size-4" aria-hidden />
          {t("inventoryAddItem")}
        </Button>
        <DataMenu
          onImport={() => setImportModeDialogOpen(true)}
          onExport={handleExport}
          onPrint={handlePrint}
        />
      </div>
    </div>
  );

  const header = (
    <header className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-heading text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
          {t("inventoryPageTitle")}
        </h1>
        <p className="text-base text-muted-foreground">
          {t("inventoryPageDescription")}
        </p>
      </div>
      {toolbar}
    </header>
  );

  if (loadFailed) {
    return (
      <AppShell>
        <main className="flex min-w-0 flex-col gap-8">
          {header}
          <Card className="min-w-0 border-border bg-card shadow-sm">
            <CardContent className="p-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TriangleAlert aria-hidden />
                  </EmptyMedia>
                  <EmptyTitle>{t("invHubLoadFailed")}</EmptyTitle>
                  <EmptyDescription>
                    {t("invHubLoadFailedDesc")}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button className="min-h-[44px] gap-2" onClick={reload}>
                    <RefreshCw className="size-4" aria-hidden />
                    {t("invHubRetry")}
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        </main>

        <GlobalSearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          rows={rows}
          loadFailed
          onRetry={reload}
          onSelect={() => setSearchOpen(false)}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex min-w-0 flex-col gap-8">
        {header}

        {rows.length === 0 ? (
          <Card className="min-w-0 border-border bg-card shadow-sm">
            <CardContent className="p-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PackageOpen aria-hidden />
                  </EmptyMedia>
                  <EmptyTitle>{t("invHubNoItems")}</EmptyTitle>
                  <EmptyDescription>{t("invHubNoItemsDesc")}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    className="min-h-[44px] gap-2"
                    onClick={() => setItemDialogOpen(true)}
                  >
                    <Plus className="size-4" aria-hidden />
                    {t("inventoryAddItem")}
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Status line — the one thing to act on today. */}
            {attentionCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  const worst = INVENTORY_CATEGORIES.map((c) => ({
                    value: c.value,
                    stats: categoryStats.get(c.value)!,
                  })).sort(
                    (a, b) =>
                      b.stats.out - a.stats.out || b.stats.low - a.stats.low,
                  )[0];
                  if (worst) router.push(`/inventory/${worst.value}`);
                }}
                className="flex min-h-[76px] w-full min-w-0 items-center gap-4 rounded-lg border border-border bg-card px-5 py-4 text-left shadow-sm hover:bg-surface-3"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-6" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-base font-bold text-foreground sm:text-lg">
                    {t("inventoryHubAttention", { count: attentionCount })}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("inventoryHubAttentionDesc")}
                  </span>
                </span>
              </button>
            ) : (
              <div className="flex min-h-[76px] w-full min-w-0 items-center gap-4 rounded-lg border border-border bg-card px-5 py-4 shadow-sm">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
                  <CheckCircle2 className="size-6" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-base font-bold text-foreground sm:text-lg">
                    {t("inventoryAllHealthy")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("inventoryAllHealthyDesc")}
                  </span>
                </span>
              </div>
            )}

            {/* Metric layer — four stock facts, each shown exactly once. */}
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label={t("inventoryTotalItems")}
                value={totalItems}
                icon={Package}
              />
              <StatTile
                label={t("inventoryTotalStockUnits")}
                value={formatInventoryQuantity(Math.round(totalStockUnits))}
                icon={Layers}
              />
              <StatTile
                label={t("invUxStockKindLabel")}
                value={kindCounts.bought}
                caption={t("invUxStockKindValue", { made: kindCounts.made })}
                icon={ShoppingCart}
              />
              <StatTile
                label={t("invHubMovedRecently")}
                value={formatInventoryQuantity(Math.round(movedRecently))}
                icon={ArrowLeftRight}
              />
            </div>

            {/* Chart layer */}
            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-5">
              <Card className="min-w-0 border-border bg-card shadow-sm lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-base">
                    {t("inventoryStockHealthTitle")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("inventoryStockHealthDesc")}
                  </p>
                </CardHeader>
                <CardContent className="min-w-0">
                  <HealthDonut
                    centerLabel={t("inventoryTotalItems")}
                    centerValue={totalItems}
                    segments={[
                      {
                        key: "ok",
                        label: t("inventoryStatusOk"),
                        value: okCount,
                        colorClassName: "stroke-success",
                      },
                      {
                        key: "low",
                        label: t("inventoryStatusLow"),
                        value: lowCount,
                        colorClassName: "stroke-warning",
                      },
                      {
                        key: "out",
                        label: t("inventoryStatusOut"),
                        value: outCount,
                        colorClassName: "stroke-destructive",
                      },
                    ]}
                  />
                </CardContent>
              </Card>

              <Card className="min-w-0 border-border bg-card shadow-sm lg:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-base">
                    {t("inventoryStockByCategoryTitle")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("inventoryStockByCategoryDesc")}
                  </p>
                </CardHeader>
                <CardContent className="min-w-0">
                  <HorizontalBarChart data={stockByCategory} />
                </CardContent>
              </Card>
            </div>

            <Card className="min-w-0 border-border bg-card shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-base">
                  {t("inventoryMovementTrendTitle")}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t("inventoryMovementTrendDesc")}
                </p>
              </CardHeader>
              <CardContent className="min-w-0">
                {hasMovementData ? (
                  <MovementTrendChart
                    points={trendPoints}
                    inwardLabel={t("inventoryColInward")}
                    outwardLabel={t("inventoryColOutward")}
                  />
                ) : (
                  <Empty className="border border-dashed p-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ArrowLeftRight aria-hidden />
                      </EmptyMedia>
                      <EmptyTitle>{t("inventoryNoMovementData")}</EmptyTitle>
                      <EmptyDescription>
                        {t("invHubNoMovementDesc")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>

            {/* Action layer — the items the metrics point at. */}
            <Card className="min-w-0 border-border bg-card shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-base">
                  {t("invHubNeedsStockTitle")}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t("invHubNeedsStockDesc")}
                </p>
              </CardHeader>
              <CardContent className="min-w-0">
                <NeedsStockTable
                  rows={needsStock}
                  onAddStock={(item) => openMovement(item, "inward")}
                  onTakeOut={(item) => openMovement(item, "outward")}
                />
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <ItemFormDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={null}
        onSaved={reload}
      />

      <GlobalSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        rows={rows}
        loadFailed={loadFailed}
        onRetry={reload}
        onSelect={(row) => {
          setSearchOpen(false);
          router.push(`/inventory/${row.category}?item=${encodeURIComponent(row.id)}`);
        }}
      />

      <ItemPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        items={rows.filter((row) => row.isActive)}
        onPick={(item) => {
          setPickerOpen(false);
          openMovement(item as StockRow, "inward");
        }}
      />

      <MovementDialog
        open={movementOpen}
        onOpenChange={setMovementOpen}
        item={movementItem}
        type={movementType}
        onSaved={reload}
      />

      <Dialog open={importModeDialogOpen} onOpenChange={setImportModeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inventoryImportExcel")}</DialogTitle>
            <DialogDescription>{t("inventoryPageDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="min-h-[44px] justify-start"
              onClick={() => startImport("update")}
            >
              {t("inventoryImportUpdate")}
            </Button>
            <Button
              variant="outline"
              className="min-h-[44px] justify-start border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => {
                setImportModeDialogOpen(false);
                setReplaceConfirmOpen(true);
              }}
            >
              {t("inventoryImportReplace")}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportModeDialogOpen(false)}>
              {t("commonCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={replaceConfirmOpen} onOpenChange={setReplaceConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("inventoryImportReplace")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("inventoryImportReplaceWarn")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => startImport("replace")}
            >
              {t("inventoryImportReplace")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xlsm,.xlsb,.xls"
        className="hidden"
        onChange={handleImportFile}
      />
    </AppShell>
  );
}
