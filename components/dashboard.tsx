"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  saveProduction,
  getProductionsInRange,
} from "@/lib/services/productionService";
import { getItems } from "@/lib/services/itemService";
import { getEmployees } from "@/lib/services/employeeService";
import { calculateSalaryForPeriod } from "@/lib/services/salaryService";
import { getDeductionForPeriod } from "@/lib/services/advanceDeductionService";
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
import { isRestrictedForEntry } from "@/lib/utils/date";
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
import {
  Package,
  IndianRupee,
  Users,
  CalendarDays,
  LayoutGrid,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function getYearMonth(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split("-").map(Number);
  return { year: y, month: m - 1 };
}

export function Dashboard() {
  const router = useRouter();
  const [date, setDate] = useState(today());
  const [calYear, setCalYear] = useState(() => getYearMonth(today()).year);
  const [calMonth, setCalMonth] = useState(() => getYearMonth(today()).month);
  const [calendarProductions, setCalendarProductions] = useState<
    Record<string, unknown>[]
  >([]);
  const [calendarHolidays, setCalendarHolidays] = useState<string[]>([]);
  const [aggregated, setAggregated] = useState<{
    totals: Record<string, number>;
    day: Record<string, number>;
    night: Record<string, number>;
  } | null>(null);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([]);
  const [period, setPeriod] = useState<{
    from: string;
    to: string;
    label: string;
  } | null>(null);
  const [salaryRows, setSalaryRows] = useState<
    {
      id: string;
      name: string;
      gross: number;
      advanceToCut: number;
      final: number;
    }[]
  >([]);
  const [periodProduction, setPeriodProduction] = useState<{
    totalQty: number;
    totalValue: number;
  }>({ totalQty: 0, totalValue: 0 });
  const [monthProduction, setMonthProduction] = useState<{
    totalQty: number;
    totalValue: number;
  }>({ totalQty: 0, totalValue: 0 });
  const [quickEmp, setQuickEmp] = useState("");
  const [quickItem, setQuickItem] = useState("");
  const [quickShift, setQuickShift] = useState<"day" | "night">("day");
  const [quickQty, setQuickQty] = useState(1);
  const [quickDate, setQuickDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [missingData, setMissingData] = useState<Map<string, MissingDay[]>>(new Map());

  const load = useCallback(async () => {
    const [dailyAgg, itemsList, employeesList, periodData] = await Promise.all([
      getDailyAggregated(date),
      getItems(),
      getEmployees(true),
      getPeriodForDate(date),
    ]);
    setAggregated(dailyAgg);
    setItems(itemsList);
    setEmployees(employeesList);
    setPeriod(periodData);

    const salaryData = await Promise.all(
      employeesList.map(async (e) => {
        const s = await calculateSalaryForPeriod(e.id as string, date);
        const ded = await getDeductionForPeriod(
          e.id as string,
          periodData.from,
          periodData.to,
        );
        const advanceToCut = (ded?.amount as number) ?? 0;
        const net = Math.max(0, s.gross - advanceToCut);
        return {
          id: e.id as string,
          name: e.name as string,
          gross: s.gross,
          advanceToCut,
          final: net,
        };
      }),
    );
    setSalaryRows(salaryData);

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
  }, [date]);

  const loadCalendar = useCallback(async () => {
    const { from, to } = getMonthRange(calYear, calMonth);
    const [prods, hols] = await Promise.all([
      getProductionsInRange(from, to),
      getHolidaysInRange(from, to),
    ]);
    setCalendarProductions(prods);
    setCalendarHolidays(hols.map((h) => h.date as string));
  }, [calYear, calMonth]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    const { year, month } = getYearMonth(date);
    setCalYear(year);
    setCalMonth(month);
  }, [date]);

  // Keep quick-add date in sync with selected dashboard date (calendar or date picker)
  useEffect(() => {
    setQuickDate(date);
  }, [date]);

  const handleCalendarDateClick = useCallback((dateStr: string) => {
    setDate(dateStr);
    const { year, month } = getYearMonth(dateStr);
    setCalYear(year);
    setCalMonth(month);
  }, []);

  const handleCalendarMonthChange = useCallback((year: number, month: number) => {
    setCalYear(year);
    setCalMonth(month);
  }, []);

  const handleToggleHoliday = useCallback(
    async (dateStr: string) => {
      const existing = await getHolidayByDate(dateStr);
      if (existing?.id) {
        await deleteHoliday(existing.id as string);
        toast.success("Holiday removed");
      } else {
        await saveHoliday({ date: dateStr });
        toast.success("Holiday added");
      }
      await loadCalendar();
    },
    [loadCalendar]
  );

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEmp || !quickItem) return;
    const holiday = await getHolidayByDate(quickDate);
    const holidayDates = holiday ? [quickDate] : [];
    if (isRestrictedForEntry(quickDate, holidayDates)) {
      toast.error("Cannot add production on Sundays or factory holidays.");
      return;
    }
    setSaving(true);
    try {
      await saveProduction({
        employeeId: quickEmp,
        itemId: quickItem,
        date: quickDate,
        quantity: quickQty,
        shift: quickShift,
      });
      setQuickQty(1);
      await load();
      toast.success("Production added");
    } catch {
      toast.error("Failed to add production");
    } finally {
      setSaving(false);
    }
  };

  if (!aggregated || !period) {
    return (
      <AppShell>
        <main className="flex flex-col gap-8">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
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
              Dashboard
            </h1>
            {(() => {
              const entries = Array.from(missingData.entries()).filter(
                ([_, days]) => days.length > 0
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
                      className="relative flex items-center justify-center rounded-lg p-2 text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive/30 transition-colors"
                      aria-label={`${totalMissing} days with missing data`}
                    >
                      <AlertTriangle className="size-5" />
                      <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse">
                        {totalMissing > 9 ? "9+" : totalMissing}
                      </span>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-destructive">Missing data</DialogTitle>
                      <p className="text-sm text-muted-foreground">
                        {totalMissing} working day{totalMissing !== 1 ? "s" : ""} without production or attendance across{" "}
                        {entries.length} employee{entries.length !== 1 ? "s" : ""}.
                      </p>
                    </DialogHeader>
                    <ul className="flex flex-col gap-2 text-sm max-h-60 overflow-y-auto">
                      {entries.map(([empId, days]) => (
                        <li key={empId}>
                          <span className="font-medium">{empNames[empId] ?? empId}</span>:{" "}
                          {days.length} day{days.length !== 1 ? "s" : ""} —{" "}
                          {days
                            .slice(0, 5)
                            .map((d) => formatDisplayDate(d.date))
                            .join(", ")}
                          {days.length > 5 && ` +${days.length - 5} more`}
                        </li>
                      ))}
                    </ul>
                  </DialogContent>
                </Dialog>
              );
            })()}
          </div>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="dashboardDate"
              className="text-base font-medium text-muted-foreground"
            >
              Date
            </Label>
            <DatePicker
              id="dashboardDate"
              value={date}
              onChange={setDate}
              className="min-h-[44px] w-[180px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground border-b border-border pb-4">
          <span>
            <strong className="text-foreground font-medium">Viewing date:</strong>{" "}
            {formatDisplayDate(date)}
          </span>
          <span>
            <strong className="text-foreground font-medium">Month:</strong>{" "}
            {formatMonthYear(date)}
          </span>
          {period && (
            <span>
              <strong className="text-foreground font-medium">Salary period:</strong>{" "}
              {period.label}
            </span>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-4 lg:items-stretch lg:min-h-[340px]">
          <div className="lg:shrink-0 lg:self-stretch">
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
          <div className="grid grid-cols-2 grid-rows-[1fr_1fr_auto] gap-3 h-full min-h-0 flex-1 min-w-[280px] max-w-[400px] lg:self-stretch">
          <Card className="p-3 sm:p-4 flex flex-col min-h-0">
            <CardHeader className="p-0 pb-1">
              <div className="flex items-center gap-1.5">
                <Package className="size-4 text-primary shrink-0" />
                <CardTitle className="text-xs font-medium text-muted-foreground truncate">
                  Daily production
                </CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatDisplayDate(date)}
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
                  Daily value
                </CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatDisplayDate(date)}
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
                  Period production
                </CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {period?.label ?? "—"}
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
                  Monthly production
                </CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatMonthYear(date)}
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
                  Active employees
                </CardTitle>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                As of {formatDisplayDate(date)}
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
              Daily production by item
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDisplayDate(date)}
            </p>
          </CardHeader>
          <CardContent className="p-0">
          {dailyRows.length === 0 ? (
              <Empty className="py-6 border-0">
                <EmptyHeader>
                  <EmptyTitle>No production for this date</EmptyTitle>
                  <EmptyDescription>
                    Add production using the form below or from an employee page.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right tabular-nums">Day</TableHead>
                  <TableHead className="text-right tabular-nums">Night</TableHead>
                  <TableHead className="text-right tabular-nums">Total</TableHead>
                  <TableHead className="text-right tabular-nums">Value</TableHead>
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

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <LayoutGrid className="size-5 text-primary" />
              Quick add production
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Adds to selected date: {formatDisplayDate(date)}
            </p>
          </CardHeader>
          <CardContent className="p-0">
          <form
            onSubmit={handleQuickAdd}
            className="flex flex-wrap gap-4 items-end"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="quickEmp">Employee</Label>
              <Select
                value={quickEmp}
                onValueChange={setQuickEmp}
              >
                <SelectTrigger id="quickEmp" className="w-48 min-h-[44px]">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id as string} value={e.id as string}>
                      {e.name as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="quickItem">Item</Label>
              <Select value={quickItem} onValueChange={setQuickItem}>
                <SelectTrigger id="quickItem" className="w-56 min-h-[44px]">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((i) => (
                    <SelectItem key={i.id as string} value={i.id as string}>
                      {i.name as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="quickShift">Shift</Label>
              <Select
                value={quickShift}
                onValueChange={(v) => setQuickShift(v as "day" | "night")}
              >
                <SelectTrigger id="quickShift" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="quickQty">Qty</Label>
              <Input
                type="number"
                id="quickQty"
                min={1}
                value={quickQty}
                onChange={(e) =>
                  setQuickQty(parseInt(e.target.value, 10) || 1)
                }
                className="w-24 min-h-[44px]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="quickDate">Date</Label>
              <DatePicker
                id="quickDate"
                value={quickDate}
                onChange={setQuickDate}
                className="min-h-[44px] w-[180px]"
              />
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-6 py-3 text-base rounded-xl"
            >
              {saving ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Adding…
                </>
              ) : (
                "Add"
              )}
            </Button>
          </form>
          </CardContent>
        </Card>

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <Receipt className="size-5 text-primary" />
              Salary summary (current period)
            </CardTitle>
            <p className="text-base text-muted-foreground mt-1">{period.label}</p>
          </CardHeader>
          <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right tabular-nums">Gross</TableHead>
                  <TableHead className="text-right tabular-nums">Advance to cut</TableHead>
                  <TableHead className="text-right tabular-nums">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salaryRows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() =>
                      router.push(`/employee?id=${encodeURIComponent(String(r.id))}`)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/employee?id=${encodeURIComponent(String(r.id))}`);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`View ${r.name}`}
                  >
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{currency(r.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums">{currency(r.advanceToCut)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{currency(r.final)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
