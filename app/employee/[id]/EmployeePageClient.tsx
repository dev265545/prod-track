"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DatePicker } from "@/components/ui/date-picker";
import { openDB } from "@/lib/db/adapter";
import { isLoggedIn, checkExpiry } from "@/lib/auth";
import { getEmployee } from "@/lib/services/employeeService";
import {
  getProductionsByEmployee,
  saveProduction,
  deleteProduction,
} from "@/lib/services/productionService";
import {
  getAdvancesByEmployee,
  saveAdvance,
  deleteAdvance,
} from "@/lib/services/advanceService";
import {
  getDeductionForPeriod,
  saveDeduction,
} from "@/lib/services/advanceDeductionService";
import { getItems } from "@/lib/services/itemService";
import { getShifts } from "@/lib/services/shiftService";
import { saveEmployee } from "@/lib/services/employeeService";
import { getSalaryRecordsByEmployee } from "@/lib/services/salaryRecordService";
import {
  calculateSalary,
  getPrintableSalaryHtml,
} from "@/lib/services/salaryService";
import { getHolidaysInRange } from "@/lib/services/factoryHolidayService";
import { getAttendanceByEmployeeInRange } from "@/lib/services/attendanceService";
import {
  getWorkingDaysInMonth,
  getRatePerDay,
  getRatePerHour,
} from "@/lib/utils/salaryRates";
import { cn } from "@/lib/utils";
import { getPeriodForDate, getPeriodsWithData, today } from "@/lib/utils/date";
import { currency, dateDisplay, number } from "@/lib/utils/formatter";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function EmployeeCalendar({
  from,
  to,
  factoryHolidays,
  productions,
  attendance,
}: {
  from: string;
  to: string;
  factoryHolidays: string[];
  productions: Record<string, unknown>[];
  attendance: Record<string, unknown>[];
}) {
  const [y, m] = from.split("-").map(Number);
  const padM = String(m).padStart(2, "0");
  const monthStart = `${y}-${padM}-01`;
  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0).getDate();
  const startOffset = firstDay.getDay();
  const prodDates = new Set(productions.map((p) => p.date as string));
  const attByDate = Object.fromEntries(
    attendance.map((a) => [(a.date as string), a.status as string])
  );
  const holidaySet = new Set(factoryHolidays);

  function getDayStatus(dateStr: string): "holiday" | "present" | "absent" | null {
    if (holidaySet.has(dateStr)) return "holiday";
    const att = attByDate[dateStr];
    if (att === "absent") return "absent";
    if (att === "present" || prodDates.has(dateStr)) return "present";
    return null;
  }

  function isInPeriod(dateStr: string): boolean {
    return dateStr >= from && dateStr <= to;
  }

  const days: { date: string; day: number; status: "holiday" | "present" | "absent" | null; inPeriod: boolean }[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${y}-${padM}-${String(d).padStart(2, "0")}`;
    days.push({
      date: dateStr,
      day: d,
      status: getDayStatus(dateStr),
      inPeriod: isInPeriod(dateStr),
    });
  }

  const label = (d: (typeof days)[0]) => {
    if (!d.status) return `${d.day}`;
    const s = d.status === "holiday" ? "Holiday" : d.status === "present" ? "Present" : "Absent";
    return `${d.day}, ${s}`;
  };

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-[280px]">
        <div className="grid grid-cols-7 gap-px text-center text-sm">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 font-medium text-muted-foreground">
              {w}
            </div>
          ))}
          {Array.from({ length: startOffset }, (_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {days.map((d) => (
            <div
              key={d.date}
              className={cn(
                "aspect-square flex items-center justify-center rounded text-xs font-medium tabular-nums",
                d.inPeriod && "ring-2 ring-primary ring-inset bg-primary/5",
                d.status === "holiday" && "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200",
                d.status === "present" && "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200",
                d.status === "absent" && "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-200",
                !d.status && "text-muted-foreground"
              )}
              aria-label={label(d)}
              title={label(d)}
            >
              {d.day}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EmployeePageClient() {
  const params = useParams();
  const router = useRouter();
  const id = (params?.id ?? "") as string;
  const [ready, setReady] = useState(false);
  const [employee, setEmployee] = useState<Record<string, unknown> | null>(
    null,
  );
  const [periods, setPeriods] = useState<
    { from: string; to: string; label: string }[]
  >([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [salary, setSalary] = useState<{
    gross: number;
    advance: number;
    final: number;
    advanceToCut: number;
  } | null>(null);
  const [productions, setProductions] = useState<Record<string, unknown>[]>([]);
  const [advances, setAdvances] = useState<Record<string, unknown>[]>([]);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [advanceToCutInput, setAdvanceToCutInput] = useState(0);
  const [prodItem, setProdItem] = useState("");
  const [prodShift, setProdShift] = useState<"day" | "night">("day");
  const [prodQty, setProdQty] = useState(1);
  const [prodDate, setProdDate] = useState(today());
  const [advAmount, setAdvAmount] = useState(0);
  const [advDate, setAdvDate] = useState(today());
  const [storedSalaryRecords, setStoredSalaryRecords] = useState<
    Record<string, unknown>[]
  >([]);
  const [shifts, setShifts] = useState<Record<string, unknown>[]>([]);
  const [factoryHolidays, setFactoryHolidays] = useState<string[]>([]);
  const [calendarProductions, setCalendarProductions] = useState<
    Record<string, unknown>[]
  >([]);
  const [calendarAttendance, setCalendarAttendance] = useState<
    Record<string, unknown>[]
  >([]);

  const load = async () => {
    const emp = await getEmployee(id);
    if (!emp) {
      setEmployee(null);
      return;
    }
    setEmployee(emp);
    const [allProds, allAdvs, itemsList, salaryRecs, shiftList] =
      await Promise.all([
        getProductionsByEmployee(id, "2000-01-01", "2100-12-31"),
        getAdvancesByEmployee(id, "2000-01-01", "2100-12-31"),
        getItems(),
        getSalaryRecordsByEmployee(id),
        getShifts(),
      ]);
    setItems(itemsList);
    setStoredSalaryRecords(salaryRecs);
    setShifts(shiftList);
    const periodsWithData = getPeriodsWithData([...allProds, ...allAdvs]);
    const period = getPeriodForDate(today());
    const periodList = periodsWithData.length > 0 ? periodsWithData : [period];
    setPeriods(periodList);
    const initialFrom =
      periodsWithData.length > 0 &&
      periodsWithData.some((p) => p.from === period.from)
        ? period.from
        : (periodList[periodList.length - 1]?.from ?? period.from);
    const initialTo =
      periodList.find((p) => p.from === initialFrom)?.to ?? period.to;
    setFrom(initialFrom);
    setTo(initialTo);
  };

  useEffect(() => {
    openDB()
      .then(() => {
        if (!isLoggedIn() || checkExpiry()) {
          router.replace("/login");
          return;
        }
        load().then(() => setReady(true));
      })
      .catch(() => setReady(true));
  }, [router, id]);

  useEffect(() => {
    if (!id || !from || !to) return;
    Promise.all([
      calculateSalary(id, from, to),
      getDeductionForPeriod(id, from, to),
      getProductionsByEmployee(id, from, to),
      getAdvancesByEmployee(id, from, to),
    ]).then(([s, ded, prods, advs]) => {
      const advanceToCut = (ded?.amount as number) ?? 0;
      setAdvanceToCutInput(advanceToCut);
      setSalary({
        gross: s.gross,
        advance: s.advance,
        final: Math.max(0, s.gross - advanceToCut),
        advanceToCut,
      });
      setProductions(prods);
      setAdvances(advs);
    });
  }, [id, from, to]);

  useEffect(() => {
    if (!from || !id) return;
    const [y, m] = from.split("-").map(Number);
    const padM = String(m).padStart(2, "0");
    const monthStart = `${y}-${padM}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${y}-${padM}-${lastDay}`;
    Promise.all([
      getHolidaysInRange(monthStart, monthEnd),
      getProductionsByEmployee(id, monthStart, monthEnd),
      getAttendanceByEmployeeInRange(id, monthStart, monthEnd),
    ]).then(([holidays, prods, att]) => {
      setFactoryHolidays(holidays.map((h) => h.date as string));
      setCalendarProductions(prods);
      setCalendarAttendance(att);
    });
  }, [from, id]);

  if (!ready) {
    return (
      <AppShell>
        <main id="main" className="flex flex-col gap-8">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </main>
      </AppShell>
    );
  }

  if (!employee) {
    return (
      <AppShell>
        <main id="main" className="flex flex-col gap-8">
          <p className="text-lg text-muted-foreground">Employee not found.</p>
        </main>
      </AppShell>
    );
  }

  const itemMap = Object.fromEntries(
    items.map((i) => [i.id as string, i]),
  ) as Record<string, Record<string, unknown>>;

  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, s])
  ) as Record<string, Record<string, unknown>>;

  const [year, month] = from
    ? from.split("-").map(Number)
    : [new Date().getFullYear(), new Date().getMonth() + 1];
  const workingDays = getWorkingDaysInMonth(
    year,
    month - 1,
    factoryHolidays
  );
  const monthlySalary = (employee.monthlySalary as number) ?? 0;
  const shiftId = employee.shiftId as string | undefined;
  const selectedShift = shiftId ? shiftMap[shiftId] : null;
  const hoursPerDay = selectedShift
    ? ((selectedShift.hoursPerDay as number) ?? 8)
    : 8;
  const ratePerDay = getRatePerDay(monthlySalary, workingDays);
  const ratePerHour = getRatePerHour(monthlySalary, workingDays, hoursPerDay);

  return (
    <AppShell>
      <main id="main" className="flex flex-col gap-8 animate-fade-in">
        <div>
          <Link
            href="/employees"
            className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
          >
            ← Employees
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-foreground font-heading">
            {employee.name as string}
          </h1>
        </div>

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading">
              Shift &amp; salary
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="emp-shift">Shift</Label>
                <Select
                  value={(employee.shiftId as string) ?? "_none"}
                  onValueChange={async (v) => {
                    const shiftId = v === "_none" ? undefined : v;
                    const updated = {
                      ...employee,
                      shiftId,
                    };
                    await saveEmployee(updated);
                    setEmployee(updated);
                  }}
                >
                  <SelectTrigger id="emp-shift" className="w-48 min-h-12">
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No shift</SelectItem>
                    {shifts.map((s) => (
                      <SelectItem key={s.id as string} value={s.id as string}>
                        {s.name as string}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="emp-monthly-salary">Monthly salary (₹)</Label>
                <Input
                  id="emp-monthly-salary"
                  type="number"
                  min={0}
                  value={monthlySalary}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    setEmployee({ ...employee, monthlySalary: v });
                  }}
                  onBlur={async (e) => {
                    const v = parseFloat((e.target as HTMLInputElement).value) || 0;
                    const updated = { ...employee, monthlySalary: v };
                    await saveEmployee(updated);
                    setEmployee(updated);
                  }}
                  className="w-40 min-h-12"
                />
              </div>
            </div>
            {from && (
              <div className="mt-6 flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Working days: </span>
                  <span className="font-medium tabular-nums">{workingDays}</span>
                </div>
                {monthlySalary > 0 && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Rate per day: </span>
                      <span className="font-medium tabular-nums">
                        {currency(ratePerDay)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Rate per hour: </span>
                      <span className="font-medium tabular-nums">
                        {currency(ratePerHour)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {from && to && (
          <Card className="p-6 sm:p-8">
            <CardHeader className="p-0 mb-5">
              <CardTitle className="text-xl font-semibold font-heading">
                Calendar
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {dateDisplay(from)} – {dateDisplay(to)} (selected period
                highlighted)
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <EmployeeCalendar
                from={from}
                to={to}
                factoryHolidays={factoryHolidays}
                productions={calendarProductions}
                attendance={calendarAttendance}
              />
            </CardContent>
          </Card>
        )}

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading">
              Salary (15-day periods)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="salary-period">Period</Label>
                <Select
                  value={`${from}|${to}`}
                  onValueChange={(v) => {
                    const [f, t] = v.split("|");
                    setFrom(f);
                    setTo(t);
                  }}
                >
                  <SelectTrigger id="salary-period" className="min-w-[200px] w-56 min-h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.from + p.to} value={`${p.from}|${p.to}`}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                className="min-h-12 px-6"
                onClick={async () => {
                  const { html } = await getPrintableSalaryHtml(id, from, to);
                  const w = window.open("", "_blank");
                  if (w) {
                    w.document.write(html);
                    w.document.close();
                    w.print();
                  }
                }}
              >
                Print salary sheet
              </Button>
            </div>
            {salary && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end mt-6">
                <div className="flex flex-col gap-2">
                  <Label>Gross</Label>
                  <p className="text-base text-foreground font-medium">
                    {currency(salary.gross)}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="advance-to-cut">Advance to cut</Label>
                  <Input
                    id="advance-to-cut"
                    type="number"
                    min={0}
                    className="w-full min-w-[120px] max-w-[140px] min-h-12"
                    value={advanceToCutInput}
                    onChange={(e) =>
                      setAdvanceToCutInput(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Net</Label>
                  <p className="text-base text-foreground font-medium">
                    {currency(Math.max(0, salary.gross - advanceToCutInput))}
                  </p>
                </div>
              </div>
            )}
            <Button
              type="button"
              className="mt-6 min-h-12 px-6"
              onClick={async () => {
                await saveDeduction({
                  employeeId: id,
                  periodFrom: from,
                  periodTo: to,
                  amount: advanceToCutInput,
                });
                if (salary)
                  setSalary({
                    ...salary,
                    advanceToCut: advanceToCutInput,
                    final: Math.max(0, salary.gross - advanceToCutInput),
                  });
              }}
            >
              Save period settlement
            </Button>
          </CardContent>
        </Card>

        {storedSalaryRecords.length > 0 && (
          <Card className="p-6 sm:p-8">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-xl font-semibold font-heading">
                Stored salary records
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Salary sheet data by month (from imported or manual records).
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead className="text-right">Salary</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...storedSalaryRecords]
                    .sort((a, b) =>
                      (b.month as string).localeCompare(a.month as string),
                    )
                    .map((r) => (
                      <TableRow key={r.id as string}>
                        <TableCell>{r.month as string}</TableCell>
                        <TableCell>{r.shiftType as string}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {currency((r.salary as number) ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {currency((r.amount as number) ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading">
              Add production
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <form
              className="flex flex-wrap items-end gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!prodItem) return;
                await saveProduction({
                  employeeId: id,
                  itemId: prodItem,
                  date: prodDate,
                  quantity: prodQty,
                  shift: prodShift,
                });
                setProdQty(1);
                const [s, , prods, advs] = await Promise.all([
                  calculateSalary(id, from, to),
                  getDeductionForPeriod(id, from, to),
                  getProductionsByEmployee(id, from, to),
                  getAdvancesByEmployee(id, from, to),
                ]);
                const ded = await getDeductionForPeriod(id, from, to);
                setSalary({
                  gross: s.gross,
                  advance: s.advance,
                  final: Math.max(0, s.gross - ((ded?.amount as number) ?? 0)),
                  advanceToCut: (ded?.amount as number) ?? 0,
                });
                setProductions(prods);
                setAdvances(advs);
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-item">Packaging item group</Label>
                <Select value={prodItem} onValueChange={setProdItem}>
                  <SelectTrigger id="prod-item" className="w-56 min-h-12">
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
                <Label htmlFor="prod-shift">Shift</Label>
                <Select
                  value={prodShift}
                  onValueChange={(v) => setProdShift(v as "day" | "night")}
                >
                  <SelectTrigger id="prod-shift" className="min-w-[100px] min-h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-qty">Qty</Label>
                <Input
                  id="prod-qty"
                  type="number"
                  min={1}
                  value={prodQty}
                  onChange={(e) => setProdQty(parseInt(e.target.value, 10) || 1)}
                  className="w-24 min-h-12"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-date">Date</Label>
                <DatePicker
                  id="prod-date"
                  value={prodDate}
                  onChange={setProdDate}
                  className="min-w-[180px] min-h-12"
                />
              </div>
              <Button type="submit" className="min-h-12 px-6">
                Add
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading">
              Add advance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <form
              className="flex flex-wrap items-end gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                await saveAdvance({
                  employeeId: id,
                  amount: advAmount,
                  date: advDate,
                });
                setAdvAmount(0);
                const [s, , prods, advs] = await Promise.all([
                  calculateSalary(id, from, to),
                  getDeductionForPeriod(id, from, to),
                  getProductionsByEmployee(id, from, to),
                  getAdvancesByEmployee(id, from, to),
                ]);
                const ded = await getDeductionForPeriod(id, from, to);
                setSalary({
                  gross: s.gross,
                  advance: s.advance,
                  final: Math.max(0, s.gross - ((ded?.amount as number) ?? 0)),
                  advanceToCut: (ded?.amount as number) ?? 0,
                });
                setProductions(prods);
                setAdvances(advs);
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="adv-amount">Amount (₹)</Label>
                <Input
                  id="adv-amount"
                  type="number"
                  min={0}
                  value={advAmount}
                  onChange={(e) => setAdvAmount(parseFloat(e.target.value) || 0)}
                  className="w-36 min-w-[120px] min-h-12"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="adv-date">Date</Label>
                <DatePicker
                  id="adv-date"
                  value={advDate}
                  onChange={setAdvDate}
                  className="min-w-[180px] min-h-12"
                />
              </div>
              <Button type="submit" className="min-h-12 px-6">
                Add advance
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading">
              Production entries
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Packaging item group</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {productions.map((p) => {
                  const item = itemMap[p.itemId as string];
                  const rate = (item?.rate as number) || 0;
                  const qty = (p.quantity as number) || 0;
                  return (
                    <TableRow key={p.id as string}>
                      <TableCell>{dateDisplay(p.date as string)}</TableCell>
                      <TableCell>
                        {(item?.name as string) || (p.itemId as string)}
                      </TableCell>
                      <TableCell>
                        {p.shift === "night" ? "Night" : "Day"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {number(qty)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {currency(qty * rate)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (confirm("Delete this entry?")) {
                              await deleteProduction(p.id as string);
                              const [, , prods, advs] = await Promise.all([
                                calculateSalary(id, from, to),
                                getDeductionForPeriod(id, from, to),
                                getProductionsByEmployee(id, from, to),
                                getAdvancesByEmployee(id, from, to),
                              ]);
                              const ded = await getDeductionForPeriod(
                                id,
                                from,
                                to,
                              );
                              const s = await calculateSalary(id, from, to);
                              setSalary({
                                gross: s.gross,
                                advance: s.advance,
                                final: Math.max(
                                  0,
                                  s.gross - ((ded?.amount as number) ?? 0),
                                ),
                                advanceToCut: (ded?.amount as number) ?? 0,
                              });
                              setProductions(prods);
                              setAdvances(advs);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading">
              Advances in period
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((a) => (
                  <TableRow key={a.id as string}>
                    <TableCell>{dateDisplay(a.date as string)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency(a.amount)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (confirm("Delete this advance?")) {
                            await deleteAdvance(a.id as string);
                            const [, , prods, advs] = await Promise.all([
                              calculateSalary(id, from, to),
                              getDeductionForPeriod(id, from, to),
                              getProductionsByEmployee(id, from, to),
                              getAdvancesByEmployee(id, from, to),
                            ]);
                            const ded = await getDeductionForPeriod(id, from, to);
                            const s = await calculateSalary(id, from, to);
                            setSalary({
                              gross: s.gross,
                              advance: s.advance,
                              final: Math.max(
                                0,
                                s.gross - ((ded?.amount as number) ?? 0),
                              ),
                              advanceToCut: (ded?.amount as number) ?? 0,
                            });
                            setProductions(prods);
                            setAdvances(advs);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
