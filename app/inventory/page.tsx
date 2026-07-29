"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Plus,
  Download,
  Upload,
  Printer,
  Package,
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  Flame,
} from "lucide-react";
import {
  getStockLevels,
  getMovements,
  INVENTORY_CATEGORIES,
  type InventoryMovement,
  type InventoryCategory,
  type MovementType,
} from "@/lib/services/inventoryService";
import { getEmployees } from "@/lib/services/employeeService";
import { saveProductionEntry } from "@/lib/services/productionEntryService";
import { getProductions } from "@/lib/services/productionService";
import { migrateLegacyItems } from "@/lib/services/inventoryMigration";
import {
  exportInventoryToWorkbook,
  importInventoryFromFile,
  type InventoryImportMode,
} from "@/lib/services/inventoryExcel";
import { printInventory } from "@/lib/utils/inventoryPrint";
import { CATEGORY_LABEL_KEY } from "@/components/inventory/shared";
import { CATEGORY_THEME } from "@/components/inventory/category-theme";
import { StatTile } from "@/components/inventory/stat-tile";
import { ItemFormDialog } from "@/components/inventory/item-form-dialog";
import {
  HealthDonut,
  HorizontalBarChart,
  MovementTrendChart,
  StockDeficitBar,
  type TrendPoint,
} from "@/components/inventory/charts";
import { cn } from "@/lib/utils";
import { InventoryCalendar } from "@/components/inventory/inventory-calendar";
import { movementsForDate } from "@/lib/utils/inventoryCalendar";

type StockRow = Awaited<ReturnType<typeof getStockLevels>>[number];

const TREND_DAYS = 14;
const LEADERBOARD_SIZE = 10;
const TOP_MOVERS_SIZE = 6;
const RECENT_ACTIVITY_SIZE = 8;

function localISODate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatInventoryQuantity(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function InventoryPage() {
  const { ready: guardReady } = useAuthGuard();
  const { t } = useLanguage();
  const router = useRouter();
  const [dataLoaded, setDataLoaded] = useState(false);
  const ready = guardReady && dataLoaded;

  const [rows, setRows] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([]);
  const [productions, setProductions] = useState<Record<string, unknown>[]>([]);
  const [calendarDate, setCalendarDate] = useState(localISODate);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [entryItemId, setEntryItemId] = useState("");
  const [entryType, setEntryType] = useState<MovementType>("inward");
  const [entryEmployeeId, setEntryEmployeeId] = useState("");
  const [entryShift, setEntryShift] = useState<"day" | "night">("day");
  const [entryQty, setEntryQty] = useState(0);
  const [entryNote, setEntryNote] = useState("");
  const [entrySaving, setEntrySaving] = useState(false);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);

  const [importModeDialogOpen, setImportModeDialogOpen] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importModeRef = useRef<InventoryImportMode>("update");

  const load = async () => {
    await migrateLegacyItems();
    const [stockLevels, movs, employeeRows, productionRows] = await Promise.all([
      getStockLevels(),
      getMovements(),
      getEmployees(true),
      getProductions(),
    ]);
    setRows(stockLevels);
    setMovements(movs);
    setEmployees(employeeRows);
    setProductions(productionRows);
  };

  useEffect(() => {
    if (!guardReady) return;
    load().then(() => setDataLoaded(true));
  }, [guardReady]);

  useEffect(() => {
    if (!entryItemId && rows.length > 0) {
      const firstFinished = rows.find((row) => row.category === "container" || row.category === "glass");
      setEntryItemId(firstFinished?.id ?? rows[0].id);
    }
    if (!entryEmployeeId && employees.length > 0) setEntryEmployeeId(String(employees[0].id));
  }, [entryItemId, entryEmployeeId, rows, employees]);

  const itemsById = useMemo(() => {
    const map = new Map<string, StockRow>();
    for (const r of rows) map.set(r.id, r);
    return map;
  }, [rows]);

  const totalItems = rows.length;
  const totalStockUnits = rows.reduce((sum, r) => sum + Math.max(r.currentStock, 0), 0);
  const totalStockUnitsLabel = Math.round(totalStockUnits).toLocaleString();
  const lowCount = rows.filter((r) => r.isLow && r.currentStock > 0).length;
  const outCount = rows.filter((r) => r.currentStock <= 0).length;
  const okCount = Math.max(totalItems - lowCount - outCount, 0);
  const attentionCount = lowCount + outCount;
  const today = localISODate();
  const todayProductions = productions.filter((production) => production.date === today);
  const todayQuantity = todayProductions.reduce((sum, production) => sum + Number(production.quantity ?? 0), 0);
  const dayQuantity = todayProductions.filter((production) => production.shift !== "night").reduce((sum, production) => sum + Number(production.quantity ?? 0), 0);
  const nightQuantity = todayProductions.filter((production) => production.shift === "night").reduce((sum, production) => sum + Number(production.quantity ?? 0), 0);
  const activeProductionEmployees = new Set(todayProductions.map((production) => String(production.employeeId))).size;
  const selectedDateMovements = useMemo(
    () => movementsForDate(movements, calendarDate),
    [movements, calendarDate],
  );

  const layerByCategory = useMemo(() => {
    const map = new Map<InventoryCategory, "raw" | "finished">();
    for (const c of INVENTORY_CATEGORIES) map.set(c.value, c.layer);
    return map;
  }, []);
  const rawCount = rows.filter((r) => layerByCategory.get(r.category) === "raw").length;
  const finishedCount = rows.filter((r) => layerByCategory.get(r.category) === "finished").length;

  const categoryStats = useMemo(() => {
    const map = new Map<
      InventoryCategory,
      { items: number; low: number; out: number; totalStock: number }
    >();
    for (const c of INVENTORY_CATEGORIES) {
      map.set(c.value, { items: 0, low: 0, out: 0, totalStock: 0 });
    }
    for (const r of rows) {
      const entry = map.get(r.category);
      if (!entry) continue;
      entry.items += 1;
      entry.totalStock += Math.max(r.currentStock, 0);
      if (r.currentStock <= 0) entry.out += 1;
      else if (r.isLow) entry.low += 1;
    }
    return map;
  }, [rows]);

  const stockByCategory = useMemo(() => {
    return INVENTORY_CATEGORIES.map((c) => ({
      key: c.value,
      label: t(CATEGORY_LABEL_KEY[c.value]),
      value: categoryStats.get(c.value)?.totalStock ?? 0,
      colorClassName: CATEGORY_THEME[c.value].stripe,
    })).sort((a, b) => b.value - a.value);
  }, [categoryStats, t]);

  const lowStockLeaderboard = useMemo(() => {
    return rows
      .filter((r) => r.currentStock <= 0 || r.isLow)
      .map((r) => ({
        ...r,
        ratio: r.lowStockThreshold > 0 ? r.currentStock / r.lowStockThreshold : 0,
      }))
      .sort((a, b) => {
        const aOut = a.currentStock <= 0 ? 0 : 1;
        const bOut = b.currentStock <= 0 ? 0 : 1;
        if (aOut !== bOut) return aOut - bOut;
        return a.ratio - b.ratio;
      })
      .slice(0, LEADERBOARD_SIZE);
  }, [rows]);

  const trendPoints: TrendPoint[] = useMemo(() => {
    const byDate = new Map<string, { inward: number; outward: number }>();
    const start = isoDaysAgo(TREND_DAYS - 1);
    for (const m of movements) {
      if (m.date < start) continue;
      if (m.type !== "inward" && m.type !== "outward") continue;
      const entry = byDate.get(m.date) ?? { inward: 0, outward: 0 };
      if (m.type === "inward") entry.inward += m.qty;
      else entry.outward += m.qty;
      byDate.set(m.date, entry);
    }
    const points: TrendPoint[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const date = isoDaysAgo(i);
      const d = new Date(date + "T00:00:00");
      const entry = byDate.get(date) ?? { inward: 0, outward: 0 };
      points.push({
        date,
        dayLabel: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        inward: entry.inward,
        outward: entry.outward,
      });
    }
    return points;
  }, [movements]);

  const hasMovementData = trendPoints.some((p) => p.inward > 0 || p.outward > 0);

  const topMovers = useMemo(() => {
    const start = isoDaysAgo(TREND_DAYS - 1);
    const totals = new Map<string, number>();
    for (const m of movements) {
      if (m.date < start) continue;
      if (m.type !== "inward" && m.type !== "outward") continue;
      totals.set(m.itemId, (totals.get(m.itemId) ?? 0) + Math.abs(m.qty));
    }
    return Array.from(totals.entries())
      .map(([itemId, qty]) => ({ item: itemsById.get(itemId), qty }))
      .filter((x): x is { item: StockRow; qty: number } => !!x.item)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, TOP_MOVERS_SIZE);
  }, [movements, itemsById]);

  const recentActivity = useMemo(() => {
    return [...movements]
      .sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)))
      .slice(0, RECENT_ACTIVITY_SIZE)
      .map((m) => ({ movement: m, item: itemsById.get(m.itemId) }));
  }, [movements, itemsById]);

  const handleExport = async () => {
    try {
      await exportInventoryToWorkbook();
      toast.success(t("inventoryExportSuccess"));
    } catch {
      toast.error(t("commonErrorWithMessage", { msg: "export" }));
    }
  };

  const handleImportFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
      await load();
    } catch {
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
    } catch {
      toast.error(t("commonErrorWithMessage", { msg: "print" }));
    }
  };

  const handleQuickEntry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entryItemId || entryQty <= 0) return;
    setEntrySaving(true);
    try {
      await saveProductionEntry({
        employeeId: entryEmployeeId,
        itemId: entryItemId,
        date: calendarDate,
        shift: entryShift,
        quantity: entryQty,
        note: entryNote,
      });
      toast.success("Production and inventory updated");
      setEntryQty(0);
      setEntryNote("");
      await load();
    } catch {
      toast.error(t("commonErrorWithMessage", { msg: "movement" }));
    } finally {
      setEntrySaving(false);
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

  return (
    <AppShell>
      <main className="inventory-dashboard flex flex-col gap-8 animate-fade-in">
        {/* Header + toolbar */}
        <header className="inventory-hero flex flex-col gap-6 rounded-[1.75rem] px-6 py-7 sm:px-8 sm:py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
              <span className="size-2 rounded-full bg-primary" aria-hidden />
              {t("inventoryNavDashboard")}
            </div>
            <h1 className="font-heading text-4xl font-bold tracking-[-0.04em] text-foreground md:text-5xl">
              {t("inventoryPageTitle")}
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              {t("inventoryPageDescription")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-[32rem] lg:justify-end">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setImportModeDialogOpen(true)}
            >
              <Upload className="size-4" aria-hidden />
              {t("inventoryImportExcel")}
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="size-4" aria-hidden />
              {t("inventoryExportExcel")}
            </Button>
            <Button variant="outline" className="gap-2" onClick={handlePrint}>
              <Printer className="size-4" aria-hidden />
              {t("inventoryPrint")}
            </Button>
            <Button className="gap-2" onClick={() => setItemDialogOpen(true)}>
              <Plus className="size-4" aria-hidden />
              {t("inventoryAddItem")}
            </Button>
          </div>
        </header>

        {/* Alert banner */}
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
            className="inventory-panel flex min-h-[76px] w-full items-center gap-4 rounded-2xl bg-card px-5 py-4 text-left transition-colors hover:bg-destructive/5 sm:px-6"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="size-6" aria-hidden />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-foreground sm:text-lg">
                {t("inventoryHubAttention", { count: attentionCount })}
              </span>
              <span className="text-sm text-muted-foreground">
                {t("inventoryHubAttentionDesc")}
              </span>
            </div>
          </button>
        ) : (
          <div className="inventory-panel flex min-h-[76px] w-full items-center gap-4 rounded-2xl bg-card px-5 py-4 sm:px-6">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
              <CheckCircle2 className="size-6" aria-hidden />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-foreground sm:text-lg">
                {t("inventoryAllHealthy")}
              </span>
              <span className="text-sm text-muted-foreground">
                {t("inventoryAllHealthyDesc")}
              </span>
            </div>
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-8">
          <StatTile
            label={t("inventoryTotalItems")}
            value={totalItems}
            icon={Package}
            tone="neutral"
          />
          <StatTile
            label={t("inventoryTotalStockUnits")}
            value={totalStockUnitsLabel}
            icon={Layers}
            tone="neutral"
          />
          <StatTile
            label={t("inventoryLowCount")}
            value={lowCount}
            icon={AlertTriangle}
            tone="amber"
          />
          <StatTile
            label={t("inventoryOutOfStockCount")}
            value={outCount}
            icon={XCircle}
            tone="red"
          />
          <StatTile
            label={t("inventoryRawFinishedSplit")}
            value={`${rawCount} / ${finishedCount}`}
            icon={Layers}
            tone="neutral"
            className="col-span-2 lg:col-span-1"
          />
          <StatTile label="Today produced" value={formatInventoryQuantity(todayQuantity)} icon={ArrowDownToLine} tone="neutral" />
          <StatTile label="Day / Night" value={`${formatInventoryQuantity(dayQuantity)} / ${formatInventoryQuantity(nightQuantity)}`} icon={Flame} tone="neutral" />
          <StatTile label="Active employees" value={activeProductionEmployees} icon={Package} tone="neutral" />
        </div>

        <section className="flex">
          <Card className="inventory-panel w-full max-w-[432px] overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-xl">
                {t("inventoryQuickEntryTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("inventoryQuickEntryDesc")}
              </p>
            </CardHeader>
            <CardContent>
              <InventoryCalendar
                year={calendarYear}
                month={calendarMonth}
                movements={movements}
                selectedDate={calendarDate}
                onMonthChange={(year, month) => {
                  setCalendarYear(year);
                  setCalendarMonth(month);
                }}
                onDateClick={(date) => {
                  setCalendarDate(date);
                  setQuickEntryOpen(true);
                }}
              />
          </CardContent>
          </Card>
          <Button
            type="button"
            className="ml-4 self-end"
            onClick={() => setQuickEntryOpen(true)}
          >
            <Plus data-icon="inline-start" />
            {t("inventorySaveEntry")}
          </Button>
        </section>

        <Dialog open={quickEntryOpen} onOpenChange={setQuickEntryOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto backdrop-blur-xl sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("inventorySelectedDate")}: {calendarDate}</DialogTitle>
              <DialogDescription>
                {selectedDateMovements.length === 0
                  ? t("inventoryNoEntriesForDate")
                  : `${selectedDateMovements.length} ${t("inventoryCalendarEntries")}`}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-5">
              <form className="flex flex-col gap-4" onSubmit={handleQuickEntry}>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="inventory-entry-item">{t("inventoryEntryItem")}</Label>
                  <Select value={entryItemId} onValueChange={setEntryItemId}>
                    <SelectTrigger id="inventory-entry-item" className="h-10 w-full">
                      <SelectValue placeholder={t("inventoryEntryItem")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {rows.filter((item) => item.isActive && (item.category === "container" || item.category === "glass")).map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.code} · {item.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="inventory-entry-employee">Employee</Label>
                  <Select value={entryEmployeeId} onValueChange={setEntryEmployeeId}>
                    <SelectTrigger id="inventory-entry-employee" className="h-10 w-full">
                      <SelectValue placeholder="Choose employee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {employees.map((employee) => (
                          <SelectItem key={String(employee.id)} value={String(employee.id)}>
                            {String(employee.name ?? employee.id)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Shift</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant={entryShift === "day" ? "default" : "outline"} onClick={() => setEntryShift("day")}>Day</Button>
                    <Button type="button" variant={entryShift === "night" ? "default" : "outline"} onClick={() => setEntryShift("night")}>Night</Button>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="inventory-entry-qty">{t("inventoryEntryQuantity")}</Label>
                  <Input
                    id="inventory-entry-qty"
                    type="number"
                    min={0}
                    step="0.01"
                    value={entryQty || ""}
                    onChange={(event) => setEntryQty(Number(event.target.value) || 0)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="inventory-entry-date">{t("inventorySelectedDate")}</Label>
                  <DatePicker id="inventory-entry-date" value={calendarDate} onChange={setCalendarDate} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="inventory-entry-note">{t("inventoryEntryNote")}</Label>
                  <Input id="inventory-entry-note" value={entryNote} onChange={(event) => setEntryNote(event.target.value)} />
                </div>
                <Button type="submit" disabled={entrySaving || !entryItemId || !entryEmployeeId || entryQty <= 0}>
                  <Plus data-icon="inline-start" />
                  {t("inventorySaveEntry")}
                </Button>
              </form>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                {selectedDateMovements.map((movement) => {
                  const item = itemsById.get(movement.itemId);
                  const inward = movement.type === "inward";
                  return (
                    <div key={movement.id} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <span className={cn("font-bold", inward ? "text-success" : "text-destructive")}>
                        {inward ? "+" : "−"}{formatInventoryQuantity(Math.abs(movement.qty))}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item?.name ?? movement.itemId}</span>
                      <span className="text-xs text-muted-foreground">{item?.code}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Analytics grid: stock health + stock by category */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="inventory-panel lg:col-span-2" style={{ animationDelay: "60ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base">
                {t("inventoryStockHealthTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("inventoryStockHealthDesc")}</p>
            </CardHeader>
            <CardContent>
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

          <Card className="inventory-panel lg:col-span-3" style={{ animationDelay: "100ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base">
                {t("inventoryStockByCategoryTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("inventoryStockByCategoryDesc")}</p>
            </CardHeader>
            <CardContent>
              <HorizontalBarChart data={stockByCategory} />
            </CardContent>
          </Card>
        </div>

        {/* Low stock leaderboard */}
        <Card className="inventory-panel" style={{ animationDelay: "140ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base">
              {t("inventoryLowStockLeaderboardTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("inventoryLowStockLeaderboardDesc")}</p>
          </CardHeader>
          <CardContent>
            {lowStockLeaderboard.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("inventoryNoLowStock")}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {lowStockLeaderboard.map((r) => {
                  const theme = CATEGORY_THEME[r.category];
                  const out = r.currentStock <= 0;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => router.push(`/inventory/${r.category}`)}
                        className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/40"
                      >
                        <div
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg",
                            theme.iconChip,
                          )}
                        >
                          <theme.icon className="size-4.5" aria-hidden />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {r.code}
                            </span>
                            <span className="truncate text-sm font-semibold">{r.name}</span>
                          </div>
                          <span className={cn("text-xs", theme.text)}>
                            {t(CATEGORY_LABEL_KEY[r.category])}
                          </span>
                        </div>
                        <Badge
                          variant={out ? "destructive" : "warning"}
                          className={cn("hidden shrink-0 sm:inline-flex", out && "bg-destructive/10 text-destructive")}
                        >
                          {out ? t("inventoryStatusOut") : t("inventoryStatusLow")}
                        </Badge>
                        <StockDeficitBar current={r.currentStock} threshold={r.lowStockThreshold} />
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Movement trend + top movers */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="inventory-panel lg:col-span-3" style={{ animationDelay: "180ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base">
                {t("inventoryMovementTrendTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("inventoryMovementTrendDesc")}</p>
            </CardHeader>
            <CardContent>
              {hasMovementData ? (
                <MovementTrendChart
                  points={trendPoints}
                  inwardLabel={t("inventoryColInward")}
                  outwardLabel={t("inventoryColOutward")}
                />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t("inventoryNoMovementData")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="inventory-panel lg:col-span-2" style={{ animationDelay: "220ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base">
                {t("inventoryTopMovingTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("inventoryTopMovingDesc")}</p>
            </CardHeader>
            <CardContent>
              {topMovers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("inventoryNoMovementData")}
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {topMovers.map(({ item, qty }, i) => {
                    const theme = CATEGORY_THEME[item.category];
                    return (
                      <li key={item.id} className="flex items-center gap-3">
                        <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">
                          {i + 1}
                        </span>
                        <div
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg",
                            theme.iconChip,
                          )}
                        >
                          <Flame className="size-4" aria-hidden />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold">{item.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.code}
                          </span>
                        </div>
                        <span className="shrink-0 text-sm font-bold tabular-nums">{qty}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent activity + jump to category */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="inventory-panel lg:col-span-3" style={{ animationDelay: "260ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base">
                {t("inventoryRecentActivityTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("inventoryRecentActivityDesc")}</p>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("inventoryNoRecentActivity")}
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {recentActivity.map(({ movement, item }) => {
                    const isInward = movement.type === "inward";
                    const isAdjustment = movement.type === "adjustment";
                    return (
                      <li
                        key={movement.id}
                        className="flex items-center gap-3 py-2.5 text-sm"
                      >
                        <div
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg",
                            isAdjustment
                              ? "bg-muted text-muted-foreground"
                              : isInward
                                ? "bg-success/15 text-success"
                                : "bg-destructive/10 text-destructive",
                          )}
                        >
                          {isAdjustment ? (
                            <Layers className="size-4" aria-hidden />
                          ) : isInward ? (
                            <ArrowDownToLine className="size-4" aria-hidden />
                          ) : (
                            <ArrowUpFromLine className="size-4" aria-hidden />
                          )}
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item?.code ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item?.name ?? ""}</span>
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            isAdjustment
                              ? "text-foreground"
                              : isInward
                                ? "text-success"
                                : "text-destructive",
                          )}
                        >
                          {isAdjustment ? "" : isInward ? "+" : "−"}
                          {formatInventoryQuantity(Math.abs(movement.qty))}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {movement.date}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="inventory-panel lg:col-span-2" style={{ animationDelay: "300ms" }}>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base">
                {t("inventoryJumpToCategory")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {INVENTORY_CATEGORIES.map((c) => {
                  const theme = CATEGORY_THEME[c.value];
                  const stats = categoryStats.get(c.value) ?? {
                    items: 0,
                    low: 0,
                    out: 0,
                    totalStock: 0,
                  };
                  return (
                    <li key={c.value}>
                      <button
                        type="button"
                        onClick={() => router.push(`/inventory/${c.value}`)}
                        className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                      >
                        <div
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg",
                            theme.iconChip,
                          )}
                        >
                          <theme.icon className="size-4" aria-hidden />
                        </div>
                        <span className="flex-1 truncate text-sm font-semibold">
                          {t(CATEGORY_LABEL_KEY[c.value])}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {stats.items}
                        </span>
                        {(stats.out > 0 || stats.low > 0) && (
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              stats.out > 0 ? "bg-destructive" : "bg-warning",
                            )}
                            aria-hidden
                          />
                        )}
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>

      <ItemFormDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={null}
        onSaved={load}
      />

      <Dialog open={importModeDialogOpen} onOpenChange={setImportModeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inventoryImportExcel")}</DialogTitle>
            <DialogDescription>
              {t("inventoryPageDescription")}
            </DialogDescription>
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
