"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
} from "@/lib/services/productionService";
import { getItems } from "@/lib/services/itemService";
import { getEmployees } from "@/lib/services/employeeService";
import { calculateSalaryForPeriod } from "@/lib/services/salaryService";
import { getDeductionForPeriod } from "@/lib/services/advanceDeductionService";
import { today, getPeriodForDate } from "@/lib/utils/date";
import { currency, number } from "@/lib/utils/formatter";

export function Dashboard() {
  const [date, setDate] = useState(today());
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
  const [quickEmp, setQuickEmp] = useState("");
  const [quickItem, setQuickItem] = useState("");
  const [quickShift, setQuickShift] = useState<"day" | "night">("day");
  const [quickQty, setQuickQty] = useState(1);
  const [quickDate, setQuickDate] = useState(today());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [agg, itemsList, employeesList, periodData] = await Promise.all([
      getDailyAggregated(date),
      getItems(),
      getEmployees(true),
      getPeriodForDate(date),
    ]);
    setAggregated(agg);
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
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEmp || !quickItem) return;
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
          <h1 className="text-3xl font-bold text-foreground font-heading">
            Dashboard
          </h1>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card className="p-6 sm:p-8">
            <CardHeader className="p-0 pb-2">
              <CardTitle className="text-base font-medium text-muted-foreground">
                Production today
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-3xl font-bold text-foreground font-heading">
                {number(totalQty)}
              </p>
            </CardContent>
          </Card>
          <Card className="p-6 sm:p-8">
            <CardHeader className="p-0 pb-2">
              <CardTitle className="text-base font-medium text-muted-foreground">
                Value today
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-3xl font-bold text-foreground font-heading">
                {currency(totalValue)}
              </p>
            </CardContent>
          </Card>
          <Card className="p-6 sm:p-8">
            <CardHeader className="p-0 pb-2">
              <CardTitle className="text-base font-medium text-muted-foreground">
                Active employees
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-3xl font-bold text-foreground font-heading">
                {employees.length}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold">
              Daily production by item
            </CardTitle>
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
            <CardTitle className="text-xl font-semibold">
              Quick add production
            </CardTitle>
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
            <CardTitle className="text-xl font-semibold">
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
                  <TableHead className="w-14" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {salaryRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{currency(r.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums">{currency(r.advanceToCut)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{currency(r.final)}</TableCell>
                    <TableCell>
                      <Link
                        href={`/employee/${r.id}`}
                        className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                      >
                        View
                      </Link>
                    </TableCell>
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
