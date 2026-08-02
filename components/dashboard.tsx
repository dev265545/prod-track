"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadError } from "@/components/load-error";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDailyAggregated,
  getProductionsByDate,
  getProductionsInRange,
} from "@/lib/services/productionService";
import {
  ProductionEntryForm,
  type ProductionEntryFormHandle,
} from "@/components/production/production-entry-form";
import {
  ProductionRosterList,
  ProductionSummaryBar,
} from "@/components/production/production-roster";
import {
  buildProductionRoster,
  isProductionEmployee,
  summarizeProductionRoster,
} from "@/lib/utils/productionRoster";
import { getItems } from "@/lib/services/itemService";
import {
  loadProductionCatalog,
  type ProductionCatalog,
} from "@/lib/services/productionCatalog";
import {
  getEmployees,
  saveEmployeeSortOrder,
} from "@/lib/services/employeeService";
import { moveInVisibleOrder } from "@/lib/utils/employeeOrder";
import { backfillEmployeeTypes } from "@/lib/services/employeeTypeMigration";
import { EmployeeTypeConfirmDialog } from "@/components/employee-type-confirm-dialog";
import {
  getHolidaysInRange,
  getHolidayByDate,
  saveHoliday,
  deleteHoliday,
} from "@/lib/services/factoryHolidayService";
import {
  getMissingDataForAllEmployees,
  type MissingDay,
} from "@/lib/utils/missingDataWarnings";
import { toast } from "sonner";
import {
  today,
  getPeriodForDate,
  getMonthRange,
  formatDisplayDate,
  formatMonthYear,
} from "@/lib/utils/date";
import { currency, number } from "@/lib/utils/formatter";
import { DashboardCalendar } from "@/components/dashboard-calendar";
import Link from "next/link";
import {
  Info,
  Package,
  IndianRupee,
  Users,
  CalendarDays,
  LayoutGrid,
  AlertTriangle,
  GripVertical,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useIsAdmin } from "@/lib/hooks/useClientValue";
import { useLanguage } from "@/components/language-provider";

function getYearMonth(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split("-").map(Number);
  return { year: y, month: m - 1 };
}

export function Dashboard() {
  const { t, locale } = useLanguage();
  const [date, setDate] = useState(today());
  const [calYear, setCalYear] = useState(() => getYearMonth(today()).year);
  const [calMonth, setCalMonth] = useState(() => getYearMonth(today()).month);
  const [calendarProductions, setCalendarProductions] = useState<
    Record<string, unknown>[]
  >([]);
  const [calendarHolidays, setCalendarHolidays] = useState<string[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  /** Bumped by the error card's "Try again" to re-run the load effects. */
  const [retryKey, setRetryKey] = useState(0);
  const [aggregated, setAggregated] = useState<{
    totals: Record<string, number>;
    day: Record<string, number>;
    night: Record<string, number>;
  } | null>(null);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  /**
   * What the picker offers. `items` above stays the *pay* list and is what
   * prices rows already written down, whichever list they were entered from.
   */
  const [catalog, setCatalog] = useState<ProductionCatalog | null>(null);
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([]);
  const [period, setPeriod] = useState<{
    from: string;
    to: string;
    label: string;
  } | null>(null);
  const [periodProduction, setPeriodProduction] = useState<{
    totalQty: number;
    totalValue: number;
  }>({ totalQty: 0, totalValue: 0 });
  const [monthProduction, setMonthProduction] = useState<{
    totalQty: number;
    totalValue: number;
  }>({ totalQty: 0, totalValue: 0 });
  /** Everything written down for the selected date, for the roster below. */
  const [dayProductions, setDayProductions] = useState<
    Record<string, unknown>[]
  >([]);
  const [dateIsHoliday, setDateIsHoliday] = useState(false);
  const [holidayUnlocked, setHolidayUnlocked] = useState(false);
  const entryFormRef = useRef<ProductionEntryFormHandle>(null);
  const [missingData, setMissingData] = useState<Map<string, MissingDay[]>>(new Map());
  /**
   * Arranging the roster into the order the operator physically walks the
   * floor. Off by default and separate from "Add" so recording output can
   * never reshuffle people by a mis-tap.
   */
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // `isAdmin()` touches localStorage, so it cannot be called plainly during
  // render — the first-paint markup would disagree with the client and
  // hydrate the wrong controls. `useIsAdmin` reads it as an external store:
  // `false` on the server, the real answer from hydration onward, and no
  // effect and no cascading render in between. Mirrors app-sidebar.tsx.
  const admin = useIsAdmin();

  const load = useCallback(async () => {
    // Give people who were added before pay types existed a starting guess, so
    // the salary sheet stops quietly treating them all as salaried. The guess is
    // never treated as confirmed — the review dialog below still asks a human.
    // Safe to run on every load; a failure here must not blank the dashboard.
    try {
      await backfillEmployeeTypes();
    } catch (error) {
      console.error("employee type guess failed", error);
    }

    const [
      dailyAgg,
      itemsList,
      employeesList,
      periodData,
      dayProds,
      dayHoliday,
      productionCatalog,
    ] =
      await Promise.all([
        getDailyAggregated(date),
        getItems(),
        getEmployees(true),
        getPeriodForDate(date, locale),
        getProductionsByDate(date),
        getHolidayByDate(date),
        loadProductionCatalog(),
      ]);
    setAggregated(dailyAgg);
    setItems(itemsList);
    setCatalog(productionCatalog);
    setEmployees(employeesList);
    setPeriod(periodData);
    setDayProductions(dayProds);
    setDateIsHoliday(Boolean(dayHoliday));

    const { from: periodFrom, to: periodTo } = periodData;
    const { from: monthFrom, to: monthTo } = getMonthRange(
      new Date(date + "T12:00:00").getFullYear(),
      new Date(date + "T12:00:00").getMonth()
    );
    const [periodProds, monthProds] = await Promise.all([
      getProductionsInRange(periodFrom, periodTo),
      getProductionsInRange(monthFrom, monthTo),
    ]);
    const itemsMap = Object.fromEntries(
      itemsList.map((i) => [i.id as string, i])
    ) as Record<string, Record<string, unknown>>;
    const aggregateProds = (prods: Record<string, unknown>[]) => {
      let qty = 0;
      let val = 0;
      prods.forEach((p) => {
        qty += (p.quantity as number) || 0;
        const item = itemsMap[p.itemId as string];
        const rate = (item?.rate as number) || 0;
        val += ((p.quantity as number) || 0) * rate;
      });
      return { totalQty: qty, totalValue: val };
    };
    setPeriodProduction(aggregateProds(periodProds));
    setMonthProduction(aggregateProds(monthProds));

    const [holidaysForWarnings] = await Promise.all([
      getHolidaysInRange(periodFrom, periodTo),
    ]);
    const missing = await getMissingDataForAllEmployees(
      employeesList.map((e) => ({
        id: e.id as string,
        createdAt: e.createdAt as string | undefined,
      })),
      periodFrom,
      periodTo,
      holidaysForWarnings.map((h) => h.date as string)
    );
    setMissingData(missing);
  }, [date, locale]);

  const loadCalendar = useCallback(async () => {
    const { from, to } = getMonthRange(calYear, calMonth);
    const [prods, hols] = await Promise.all([
      getProductionsInRange(from, to),
      getHolidaysInRange(from, to),
    ]);
    setCalendarProductions(prods);
    setCalendarHolidays(hols.map((h) => h.date as string));
  }, [calYear, calMonth]);

  // Both loads used to be fire-and-forget. A rejection left `aggregated` null
  // forever, which the guard below renders as a skeleton — a failed read looked
  // exactly like a slow one, with no way out.
  useEffect(() => {
    load().catch((err) => {
      console.error("daily entry: load failed", err);
      setLoadFailed(true);
    });
  }, [load, retryKey]);

  useEffect(() => {
    loadCalendar().catch((err) => {
      console.error("daily entry: calendar load failed", err);
      setLoadFailed(true);
    });
  }, [loadCalendar, retryKey]);


  /**
   * The single entry point for changing the day. A new day is a fresh decision
   * about whether to write on a factory holiday, so the unlock never carries
   * over from the day the operator just left.
   */
  const changeDate = useCallback((next: string) => {
    if (!next) return;
    setHolidayUnlocked(false);
    setDate(next);
    // Bringing the calendar to the chosen day used to be an effect watching
    // `date` — a second render pass whose only job was to catch up with a
    // change this function had just made. It belongs here, in the one place a
    // day is chosen, where it happens in the same render as the change.
    const { year, month } = getYearMonth(next);
    setCalYear(year);
    setCalMonth(month);
  }, []);

  const handleCalendarDateClick = changeDate;

  const handleCalendarMonthChange = useCallback((year: number, month: number) => {
    setCalYear(year);
    setCalMonth(month);
  }, []);

  const handleToggleHoliday = useCallback(
    async (dateStr: string) => {
      // This writes a record that changes what a day pays, so a failure has to
      // say so. It used to have no catch at all: the write rejected, the
      // calendar silently kept the old state, and the operator believed the
      // holiday had been set.
      try {
        const existing = await getHolidayByDate(dateStr);
        if (existing?.id) {
          await deleteHoliday(existing.id as string);
          toast.success(t("toastHolidayRemoved"));
        } else {
          await saveHoliday({ date: dateStr });
          toast.success(t("toastHolidayAdded"));
        }
        await loadCalendar();
      } catch (err) {
        console.error("dashboard: holiday toggle failed", err);
        toast.error(t("ux2HolidaySaveFailed"));
      }
    },
    [loadCalendar, t],
  );

  /**
   * The production roster: who is paid for what they make, and what is written
   * down for them on the selected date. These people have no attendance to
   * mark — recording their output *is* the record of their working day — so
   * this list is the equivalent of the attendance roster's "still to write".
   */
  const rosterRows = useMemo(
    () =>
      buildProductionRoster({
        date,
        employees: employees.map((e) => ({
          id: e.id as string,
          name: String(e.name ?? ""),
          employeeType: e.employeeType as string | undefined,
          isActive: e.isActive as boolean | undefined,
        })),
        productions: dayProductions.map((p) => ({
          employeeId: p.employeeId as string,
          itemId: p.itemId as string,
          date: p.date as string,
          quantity: (p.quantity as number) ?? 0,
          shift: p.shift as string | undefined,
        })),
      }),
    [date, employees, dayProductions],
  );
  const rosterSummary = useMemo(
    () => summarizeProductionRoster(rosterRows),
    [rosterRows],
  );

  /**
   * Move one person one step, against the list the user can actually see.
   *
   * The roster is a filtered view — only active production workers — while the
   * order written to the database covers everyone in `employees`. Handing both
   * lists to `moveInVisibleOrder` is what stops a "move up" from trading places
   * with a hidden neighbour, which would save a new order while the screen
   * looked unchanged.
   */
  const handleMoveWorker = useCallback(
    async (employeeId: string, direction: -1 | 1) => {
      if (savingOrder) return;
      const previousEmployees = employees;
      const nextIds = moveInVisibleOrder({
        orderedIds: employees.map((e) => e.id as string),
        visibleIds: rosterRows.map((row) => row.employeeId),
        id: employeeId,
        direction,
      });
      if (!nextIds) return;

      const byId = new Map(employees.map((e) => [e.id as string, e]));
      const nextEmployees = nextIds
        .map((id) => byId.get(id))
        .filter((e): e is Record<string, unknown> => Boolean(e));

      setSavingOrder(true);
      setEmployees(nextEmployees);
      try {
        await saveEmployeeSortOrder(nextIds);
      } catch (error) {
        console.error("save production order failed", error);
        setEmployees(previousEmployees);
        toast.error(t("prodOrdSaveFailed"));
      } finally {
        setSavingOrder(false);
      }
    },
    [employees, rosterRows, savingOrder, t],
  );
  const entryEmployees = useMemo(
    () =>
      employees
        .filter(
          (e) =>
            e.isActive !== false &&
            isProductionEmployee({
              employeeType: e.employeeType as string | undefined,
            }),
        )
        .map((e) => ({ id: e.id as string, name: String(e.name ?? "") })),
    [employees],
  );
  const entryItems = useMemo(() => catalog?.entries ?? [], [catalog]);
  /**
   * Stock items the production list has never heard of. Shown rather than
   * silently dropped: an owner who added an item under Stock and cannot find
   * it here has no other way to discover why.
   */
  const unlinkedStock = catalog?.unlinkedInventoryNames ?? [];
  const itemNames = useMemo(
    () =>
      Object.fromEntries(
        items.map((i) => [i.id as string, String(i.name ?? "")]),
      ) as Record<string, string>,
    [items],
  );

  const handleEntrySaved = useCallback(async () => {
    await Promise.all([load(), loadCalendar()]);
  }, [load, loadCalendar]);

  const handleAddFor = useCallback((employeeId: string) => {
    entryFormRef.current?.focusFor(employeeId);
  }, []);

  // Factory holidays stay writable, but only on purpose: the old quick-add
  // refused outright, which left an operator with genuine holiday work stuck.
  const entryBlocked = dateIsHoliday && !holidayUnlocked;

  // Checked before the skeleton: a read that threw is not a read in progress.
  if (loadFailed) {
    return (
      <AppShell>
        <main className="flex min-w-0 flex-col gap-8">
          <LoadError
            onRetry={() => {
              setLoadFailed(false);
              setAggregated(null);
              setRetryKey((n) => n + 1);
            }}
          />
        </main>
      </AppShell>
    );
  }

  if (!aggregated || !period) {
    return (
      <AppShell>
        <main className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Skeleton className="h-10 w-48 max-w-full animate-fade-in rounded-lg" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-14 animate-fade-in animate-stagger-1 rounded-md" />
              <Skeleton className="h-11 w-[180px] animate-fade-in animate-stagger-1 rounded-xl" />
            </div>
          </div>
          <Skeleton className="h-12 w-full max-w-2xl animate-fade-in animate-stagger-2 rounded-lg" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <Skeleton className="h-[min(360px,55vh)] min-h-[280px] w-full shrink-0 animate-fade-in animate-stagger-2 rounded-2xl lg:max-w-[340px]" />
            <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-rows-[1fr_1fr_auto]">
              <Skeleton className="h-28 animate-fade-in animate-stagger-3 rounded-2xl" />
              <Skeleton className="h-28 animate-fade-in animate-stagger-3 rounded-2xl" />
              <Skeleton className="h-28 animate-fade-in animate-stagger-4 rounded-2xl" />
              <Skeleton className="h-28 animate-fade-in animate-stagger-4 rounded-2xl" />
              <Skeleton className="col-span-2 h-24 animate-fade-in animate-stagger-5 rounded-2xl" />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-56 animate-fade-in rounded-lg" />
            <Skeleton className="h-48 animate-fade-in animate-stagger-5 rounded-2xl" />
            <Skeleton className="h-40 animate-fade-in animate-stagger-6 rounded-2xl" />
          </div>
        </main>
      </AppShell>
    );
  }

  const itemMap = Object.fromEntries(
    items.map((i) => [i.id as string, i]),
  ) as Record<string, Record<string, unknown>>;
  let totalQty = 0;
  let totalValue = 0;
  const dailyRows: {
    name: string;
    dayQty: number;
    nightQty: number;
    qty: number;
    value: number;
  }[] = [];
  for (const itemId of Object.keys(aggregated.totals)) {
    const qty = aggregated.totals[itemId];
    const dayQty = aggregated.day[itemId] || 0;
    const nightQty = aggregated.night[itemId] || 0;
    const item = itemMap[itemId];
    const rate = (item?.rate as number) || 0;
    const value = qty * rate;
    totalQty += qty;
    totalValue += value;
    dailyRows.push({
      name: (item?.name as string) || itemId,
      dayQty,
      nightQty,
      qty,
      value,
    });
  }

  return (
    <AppShell>
      <main className="flex flex-col gap-8 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground font-heading">
              {t("navLinkDailyEntry")}
            </h1>
            {(() => {
              const entries = Array.from(missingData.entries()).filter(
                ([, days]) => days.length > 0
              );
              const totalMissing = entries.reduce((s, [, d]) => s + d.length, 0);
              if (totalMissing === 0) return null;
              const empNames = Object.fromEntries(
                employees.map((e) => [e.id, e.name as string])
              );
              return (
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive/30 transition-colors"
                      aria-label={t("dashboardMissingDataAria", {
                        count: totalMissing,
                      })}
                    >
                      <AlertTriangle className="size-5" />
                      <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse">
                        {totalMissing > 9 ? "9+" : totalMissing}
                      </span>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-destructive">
                        {t("dashboardMissingDataTitle")}
                      </DialogTitle>
                      <p className="text-sm text-muted-foreground">
                        {t("dashboardMissingDataIntro", {
                          totalMissing,
                          empCount: entries.length,
                        })}
                      </p>
                    </DialogHeader>
                    <ul className="flex flex-col gap-2 text-sm max-h-60 overflow-y-auto">
                      {entries.map(([empId, days]) => (
                        <li key={empId}>
                          {t("dashboardMissingLine", {
                            name: String(empNames[empId] ?? empId),
                            dayCount: days.length,
                            dates: days
                              .slice(0, 5)
                              .map((d) => formatDisplayDate(d.date, locale))
                              .join(", "),
                            more:
                              days.length > 5
                                ? t("dashboardMissingMore", {
                                    n: days.length - 5,
                                  })
                                : "",
                          })}
                        </li>
                      ))}
                    </ul>
                  </DialogContent>
                </Dialog>
              );
            })()}
            {/* Admin-only: employeeType selects the salary formula
                (salarySheetService branches on operator/production), and
                app/employees/page.tsx already restricts the operator option to
                admins. This dialog renders on the worker-reachable dashboard,
                so without this gate a worker session could change how people
                are paid. */}
            {admin && (
              <EmployeeTypeConfirmDialog
                employees={employees.filter(
                  (e) => e.employeeTypeConfirmed !== true,
                )}
                onSaved={load}
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="dashboardDate"
              className="text-base font-medium text-muted-foreground"
            >
              {t("dashboardDate")}
            </Label>
            <DatePicker
              id="dashboardDate"
              value={date}
              onChange={changeDate}
              className="min-h-[44px] w-[180px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground border-b border-border pb-4">
          <span>
            <strong className="text-foreground font-medium">
              {t("dashboardViewingDate")}
            </strong>{" "}
            {formatDisplayDate(date, locale)}
          </span>
          <span>
            <strong className="text-foreground font-medium">
              {t("dashboardMonth")}
            </strong>{" "}
            {formatMonthYear(date, locale)}
          </span>
          {period && (
            <span>
              <strong className="text-foreground font-medium">
                {t("dashboardSalaryPeriod")}
              </strong>{" "}
              {getPeriodForDate(period.from, locale).label}
            </span>
          )}
        </div>


        {/* Writing work down comes before looking at it: this is the job the
            operator opens the screen to do. One date above, then person /
            item / shift / how many, over and over. */}
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-xl font-semibold text-foreground font-heading">
              {t("prodEntryTitle")}
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              {t("prodPageIntro")}
            </p>
          </div>

          {dateIsHoliday ? (
            <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-4">
              <div className="flex min-w-0 items-start gap-2">
                <Info className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                <p className="min-w-0 text-sm text-foreground">
                  {holidayUnlocked
                    ? t("rostHolidayUnlocked")
                    : t("rostHolidayBody")}
                </p>
              </div>
              {!holidayUnlocked ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] self-start px-4"
                  onClick={() => setHolidayUnlocked(true)}
                >
                  {t("rostHolidayUnlock")}
                </Button>
              ) : null}
            </div>
          ) : null}

          {unlinkedStock.length > 0 && (
            <div className="flex min-w-0 flex-col gap-2 rounded-xl border-2 border-border bg-surface-2 p-4">
              <p className="flex min-w-0 items-start gap-2 text-base font-medium text-foreground">
                <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span className="min-w-0">
                  {t("cfgUnlinkedTitle", { count: unlinkedStock.length })}
                </span>
              </p>
              <p className="min-w-0 text-sm leading-relaxed text-muted-foreground">
                {t("cfgUnlinkedNames", { names: unlinkedStock.join(", ") })}
              </p>
              <p className="min-w-0 text-sm leading-relaxed text-muted-foreground">
                {t("cfgUnlinkedHelpOff")}
              </p>
              {admin && (
                <Button asChild variant="outline" className="mt-1 min-h-[44px] self-start px-4">
                  <Link href="/settings">
                    <LayoutGrid data-icon="inline-start" aria-hidden />
                    {t("cfgOpenSettings")}
                  </Link>
                </Button>
              )}
            </div>
          )}

          {entryEmployees.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyTitle>{t("prodNoPeople")}</EmptyTitle>
                <EmptyDescription>{t("prodNoPeopleDesc")}</EmptyDescription>
              </EmptyHeader>
              <Button asChild className="mt-4 min-h-[44px] px-4">
                <Link href="/employees">
                  <Users data-icon="inline-start" aria-hidden />
                  {t("prodGoToPeople")}
                </Link>
              </Button>
            </Empty>
          ) : entryItems.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyTitle>{t("prodNoItems")}</EmptyTitle>
                <EmptyDescription>{t("prodNoItemsDesc")}</EmptyDescription>
              </EmptyHeader>
              <Button asChild className="mt-4 min-h-[44px] px-4">
                <Link href="/items">
                  <Package data-icon="inline-start" aria-hidden />
                  {t("prodGoToItems")}
                </Link>
              </Button>
            </Empty>
          ) : (
            <>
              <ProductionEntryForm
                ref={entryFormRef}
                date={date}
                employees={entryEmployees}
                items={entryItems}
                onSaved={handleEntrySaved}
                disabled={entryBlocked}
              />

              <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="text-base font-semibold text-foreground font-heading">
                    {t("prodRosterTitle")}
                  </h3>
                  <p className="max-w-prose text-sm text-muted-foreground">
                    {t("prodRosterIntro")}
                  </p>
                </div>
                {rosterRows.length > 1 ? (
                  <Button
                    type="button"
                    variant={reorderMode ? "secondary" : "outline"}
                    onClick={() => setReorderMode((value) => !value)}
                    aria-pressed={reorderMode}
                    className="min-h-[44px] shrink-0 px-4"
                  >
                    <GripVertical
                      data-icon="inline-start"
                      className="size-4"
                      aria-hidden
                    />
                    {reorderMode ? t("prodOrdDone") : t("prodOrdStart")}
                  </Button>
                ) : null}
              </div>
              {reorderMode ? (
                <p className="max-w-prose text-sm text-muted-foreground">
                  {t("prodOrdHint")}
                </p>
              ) : null}
              <ProductionSummaryBar summary={rosterSummary} />
              <ProductionRosterList
                rows={rosterRows}
                itemNames={itemNames}
                onAddFor={handleAddFor}
                disabled={entryBlocked}
                reorderMode={reorderMode}
                savingOrder={savingOrder}
                onMove={(id, direction) => void handleMoveWorker(id, direction)}
              />
            </>
          )}
        </section>

        <div className="flex flex-col lg:flex-row gap-4 lg:items-stretch lg:min-h-[340px] w-full">
          <div className="shrink-0 w-full lg:w-auto lg:self-stretch">
            <DashboardCalendar
              year={calYear}
              month={calMonth}
              onMonthChange={handleCalendarMonthChange}
              productions={calendarProductions}
              factoryHolidays={calendarHolidays}
              employees={employees}
              selectedDate={date}
              onDateClick={handleCalendarDateClick}
              onToggleHoliday={handleToggleHoliday}
              periodFrom={period?.from}
              periodTo={period?.to}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-0 sm:min-w-[280px] max-w-[400px] w-full lg:w-auto lg:grid-rows-[1fr_1fr_auto] lg:h-full lg:flex-1 lg:self-stretch min-h-[260px] lg:min-h-0">
          <Card className="p-3 sm:p-4 flex flex-col min-h-0">
            <CardHeader className="p-0 pb-1">
              <div className="flex items-center gap-1.5">
                <Package className="size-4 text-primary shrink-0" />
                <CardTitle className="text-xs font-medium text-muted-foreground truncate">
                  {t("dashboardDailyProduction")}
                </CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatDisplayDate(date, locale)}
              </p>
            </CardHeader>
            <CardContent className="p-0 mt-auto">
              <p className="text-xl font-bold text-foreground font-heading tabular-nums">
                {number(totalQty)}
              </p>
            </CardContent>
          </Card>
          <Card className="p-3 sm:p-4 flex flex-col min-h-0">
            <CardHeader className="p-0 pb-1">
              <div className="flex items-center gap-1.5">
                <IndianRupee className="size-4 text-primary shrink-0" />
                <CardTitle className="text-xs font-medium text-muted-foreground truncate">
                  {t("dashboardDailyValue")}
                </CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatDisplayDate(date, locale)}
              </p>
            </CardHeader>
            <CardContent className="p-0 mt-auto">
              <p className="text-xl font-bold text-foreground font-heading tabular-nums">
                {currency(totalValue)}
              </p>
            </CardContent>
          </Card>
          <Card className="p-3 sm:p-4 flex flex-col min-h-0">
            <CardHeader className="p-0 pb-1">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="size-4 text-primary shrink-0" />
                <CardTitle className="text-xs font-medium text-muted-foreground truncate">
                  {t("dashboardPeriodProduction")}
                </CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {period
                  ? getPeriodForDate(period.from, locale).label
                  : "—"}
              </p>
            </CardHeader>
            <CardContent className="p-0 mt-auto">
              <p className="text-xl font-bold text-foreground font-heading tabular-nums">
                {number(periodProduction.totalQty)}
              </p>
              <p className="text-xs text-muted-foreground">
                {currency(periodProduction.totalValue)}
              </p>
            </CardContent>
          </Card>
          <Card className="p-3 sm:p-4 flex flex-col min-h-0">
            <CardHeader className="p-0 pb-1">
              <div className="flex items-center gap-1.5">
                <LayoutGrid className="size-4 text-primary shrink-0" />
                <CardTitle className="text-xs font-medium text-muted-foreground truncate">
                  {t("dashboardMonthlyProduction")}
                </CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatMonthYear(date, locale)}
              </p>
            </CardHeader>
            <CardContent className="p-0 mt-auto">
              <p className="text-xl font-bold text-foreground font-heading tabular-nums">
                {number(monthProduction.totalQty)}
              </p>
              <p className="text-xs text-muted-foreground">
                {currency(monthProduction.totalValue)}
              </p>
            </CardContent>
          </Card>
          <Card className="p-3 sm:p-4 flex flex-col min-h-0 col-span-2">
            <CardHeader className="p-0 pb-1">
              <div className="flex items-center gap-1.5">
                <Users className="size-4 text-primary shrink-0" />
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {t("dashboardActiveEmployees")}
                </CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t("dashboardAsOf", {
                  date: formatDisplayDate(date, locale),
                })}
              </p>
            </CardHeader>
            <CardContent className="p-0 mt-auto">
              <p className="text-xl font-bold text-foreground font-heading tabular-nums">
                {employees.length}
              </p>
            </CardContent>
          </Card>
          </div>
        </div>

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <Package className="size-5 text-primary" />
              {t("dashboardDailyByItem")}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDisplayDate(date, locale)}
            </p>
          </CardHeader>
          <CardContent className="p-0">
          {dailyRows.length === 0 ? (
              <Empty className="py-6 border-0">
                <EmptyHeader>
                  <EmptyTitle>{t("dashboardNoProductionTitle")}</EmptyTitle>
                  <EmptyDescription>
                    {t("dashboardNoProductionDesc")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colItem")}</TableHead>
                  <TableHead className="text-right tabular-nums">{t("colDay")}</TableHead>
                  <TableHead className="text-right tabular-nums">{t("colNight")}</TableHead>
                  <TableHead className="text-right tabular-nums">{t("colTotal")}</TableHead>
                  <TableHead className="text-right tabular-nums">{t("colValue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyRows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{number(r.dayQty)}</TableCell>
                    <TableCell className="text-right tabular-nums">{number(r.nightQty)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{number(r.qty)}</TableCell>
                    <TableCell className="text-right tabular-nums">{currency(r.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

      </main>
    </AppShell>
  );
}
