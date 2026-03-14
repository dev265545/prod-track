"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { printHtml } from "@/lib/utils/print";
import { getHolidaysInRange } from "@/lib/services/factoryHolidayService";
import {
  getAttendanceByEmployeeInRange,
  saveAttendance,
  deleteAttendance,
} from "@/lib/services/attendanceService";
import {
  getWorkingDaysInMonth,
  getRatePerDay,
  getRatePerHour,
} from "@/lib/utils/salaryRates";
import {
  getPeriodForDate,
  getPeriodsWithData,
  today,
  isRestrictedForEntry,
} from "@/lib/utils/date";
import { getHolidayByDate } from "@/lib/services/factoryHolidayService";
import { toast } from "sonner";
import { currency, dateDisplay, number } from "@/lib/utils/formatter";
import { EmployeeCalendar } from "@/components/employee-calendar";
import {
  Check,
  X,
  Clock,
  IndianRupee,
  UserCheck,
  CalendarDays,
  Package,
  LayoutGrid,
} from "lucide-react";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(today());

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
    if (!id) return;
    const padM = String(calMonth + 1).padStart(2, "0");
    const monthStart = `${calYear}-${padM}-01`;
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
    const monthEnd = `${calYear}-${padM}-${lastDay}`;
    Promise.all([
      getHolidaysInRange(monthStart, monthEnd),
      getProductionsByEmployee(id, monthStart, monthEnd),
      getAttendanceByEmployeeInRange(id, monthStart, monthEnd),
    ]).then(([holidays, prods, att]) => {
      setFactoryHolidays(holidays.map((h) => h.date as string));
      setCalendarProductions(prods);
      setCalendarAttendance(att);
    });
  }, [id, calYear, calMonth]);

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
    shifts.map((s) => [s.id as string, s]),
  ) as Record<string, Record<string, unknown>>;

  const workingDays = getWorkingDaysInMonth(calYear, calMonth, factoryHolidays);
  const monthlySalary = (employee.monthlySalary as number) ?? 0;
  const shiftId = employee.shiftId as string | undefined;
  const selectedShift = shiftId ? shiftMap[shiftId] : null;
  const hoursPerDay = selectedShift
    ? ((selectedShift.hoursPerDay as number) ?? 8)
    : 8;
  const ratePerDay = getRatePerDay(monthlySalary, workingDays);
  const ratePerHour = getRatePerHour(monthlySalary, workingDays, hoursPerDay);

  // Production for selected day and full month
  const dayProductions = selectedDate
    ? calendarProductions.filter((p) => (p.date as string) === selectedDate)
    : [];
  const dayProdQty = dayProductions.reduce(
    (sum, p) => sum + ((p.quantity as number) || 0),
    0,
  );
  const dayProdValue = dayProductions.reduce((sum, p) => {
    const item = itemMap[p.itemId as string];
    const rate = (item?.rate as number) || 0;
    return sum + ((p.quantity as number) || 0) * rate;
  }, 0);
  const monthProdQty = calendarProductions.reduce(
    (sum, p) => sum + ((p.quantity as number) || 0),
    0,
  );
  const monthProdValue = calendarProductions.reduce((sum, p) => {
    const item = itemMap[p.itemId as string];
    const rate = (item?.rate as number) || 0;
    return sum + ((p.quantity as number) || 0) * rate;
  }, 0);

  // Monthly attendance summary for calendar month
  const monthAttendance = calendarAttendance;
  const daysPresent = monthAttendance.filter(
    (a) => a.status === "present",
  ).length;
  const daysAbsent = monthAttendance.filter(
    (a) => a.status === "absent",
  ).length;
  const earnedSundays = Math.floor(daysPresent / 6);
  const totalPaidDays = daysPresent + earnedSundays;
  const calculatedSalary = totalPaidDays * ratePerDay;

  return (
    <AppShell>
      <main id="main" className="flex flex-col gap-8 animate-fade-in">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-foreground font-heading">
            {employee.name as string}
          </h1>
        </div>
        <div className="grid grid-cols-4 gap-4 xl:flex-1 xl:min-w-0">
          <Card className="p-5 sm:p-6">
            <CardHeader className="p-0 pb-2">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Shift
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Select
                value={(employee.shiftId as string) ?? "_none"}
                onValueChange={async (v) => {
                  const shiftId = v === "_none" ? undefined : v;
                  const updated = { ...employee, shiftId };
                  await saveEmployee(updated);
                  setEmployee(updated);
                }}
              >
                <SelectTrigger id="emp-shift" className="w-full min-h-10">
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
            </CardContent>
          </Card>
          <Card className="p-5 sm:p-6">
            <CardHeader className="p-0 pb-2">
              <div className="flex items-center gap-2">
                <IndianRupee className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Monthly salary
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
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
                  const v =
                    parseFloat((e.target as HTMLInputElement).value) || 0;
                  const updated = { ...employee, monthlySalary: v };
                  await saveEmployee(updated);
                  setEmployee(updated);
                }}
                className="w-full min-h-10"
                placeholder="0"
              />
            </CardContent>
          </Card>
          <Card className="p-5 sm:p-6">
            <CardHeader className="p-0 pb-2">
              <div className="flex items-center gap-2">
                <IndianRupee className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Daily rate
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-xl font-bold font-heading text-foreground">
                {currency(ratePerDay)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {workingDays} working days in {MONTH_NAMES[calMonth]}
              </p>
            </CardContent>
          </Card>
          <Card className="p-5 sm:p-6">
            <CardHeader className="p-0 pb-2">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Hourly rate
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-xl font-bold font-heading text-foreground">
                {currency(ratePerHour)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {hoursPerDay}h shift
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col xl:flex-row gap-6 xl:items-stretch">
          <div className="xl:shrink-0 xl:min-w-[380px] xl:w-[380px]">
            <EmployeeCalendar
              year={calYear}
              month={calMonth}
              onMonthChange={(y, m) => {
                setCalYear(y);
                setCalMonth(m);
              }}
              productions={calendarProductions}
              attendance={calendarAttendance}
              factoryHolidays={factoryHolidays}
              selectedDate={selectedDate}
              onDateClick={(date) => {
                setSelectedDate(date);
                const p = getPeriodForDate(date);
                setFrom(p.from);
                setTo(p.to);
              }}
              periodFrom={from || ""}
              periodTo={to || ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 flex-1 min-w-0 xl:min-w-[280px]">
            <Card className="p-5 sm:p-6 flex flex-col min-h-0">
              <CardHeader className="p-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <UserCheck className="size-4 text-primary shrink-0" />
                  Attendance — {MONTH_NAMES[calMonth]}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <p className="text-muted-foreground text-xs">Present</p>
                    <p className="font-semibold tabular-nums text-foreground">
                      {daysPresent}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <p className="text-muted-foreground text-xs">Absent</p>
                    <p className="font-semibold tabular-nums text-foreground">
                      {daysAbsent}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <p className="text-muted-foreground text-xs">Sundays</p>
                    <p className="font-semibold tabular-nums text-foreground">
                      {earnedSundays}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <p className="text-muted-foreground text-xs">Paid days</p>
                    <p className="font-bold tabular-nums text-foreground">
                      {totalPaidDays}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-lg border-2 border-primary/30 bg-primary/10 px-4 py-3">
                    <p className="text-muted-foreground text-xs font-medium">
                      Salary
                    </p>
                    <p className="text-xl font-bold tabular-nums text-foreground">
                      {currency(calculatedSalary)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="p-5 sm:p-6 ">
              <CardHeader className="p-0 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <Package className="size-5 text-primary shrink-0" />
                  <CardTitle className="text-sm font-medium text-muted-foreground truncate">
                    Day production
                  </CardTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedDate ? dateDisplay(selectedDate) : "Select a date"}
                </p>
              </CardHeader>
              <CardContent className="p-0 mt-auto pt-2">
                <p className="text-3xl font-bold font-heading text-foreground tabular-nums leading-tight">
                  {number(dayProdQty)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {currency(dayProdValue)}
                </p>
              </CardContent>
            </Card>
            <Card className="p-5 sm:p-6 flex flex-col min-h-0">
              <CardHeader className="p-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <CalendarDays className="size-4 text-primary shrink-0" />
                  {selectedDate
                    ? `${dateDisplay(selectedDate)} — Attendance`
                    : "Select a date"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 mt-2">
                {!selectedDate ? (
                  <p className="text-xs text-muted-foreground">
                    Click a date on the calendar to mark attendance.
                  </p>
                ) : isRestrictedForEntry(selectedDate, factoryHolidays) ? (
                  <p className="text-xs text-muted-foreground">
                    Cannot mark on Sundays or holidays.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={
                        calendarAttendance.find(
                          (a) => (a.date as string) === selectedDate,
                        )?.status === "present"
                          ? "default"
                          : "secondary"
                      }
                      size="sm"
                      className={
                        calendarAttendance.find(
                          (a) => (a.date as string) === selectedDate,
                        )?.status === "present"
                          ? "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-[hsl(var(--success-foreground))]"
                          : ""
                      }
                      onClick={async () => {
                        const existing = calendarAttendance.find(
                          (a) => (a.date as string) === selectedDate,
                        );
                        await saveAttendance({
                          ...(existing?.id
                            ? { id: existing.id as string }
                            : {}),
                          employeeId: id,
                          date: selectedDate,
                          status: "present",
                        });
                        const padM = String(calMonth + 1).padStart(2, "0");
                        const monthStart = `${calYear}-${padM}-01`;
                        const lastDay = new Date(
                          calYear,
                          calMonth + 1,
                          0,
                        ).getDate();
                        const monthEnd = `${calYear}-${padM}-${lastDay}`;
                        const att = await getAttendanceByEmployeeInRange(
                          id,
                          monthStart,
                          monthEnd,
                        );
                        setCalendarAttendance(att);
                      }}
                    >
                      <Check data-icon="inline-start" />
                      Present
                    </Button>
                    <Button
                      type="button"
                      variant={
                        calendarAttendance.find(
                          (a) => (a.date as string) === selectedDate,
                        )?.status === "absent"
                          ? "destructive"
                          : "secondary"
                      }
                      size="sm"
                      onClick={async () => {
                        const existing = calendarAttendance.find(
                          (a) => (a.date as string) === selectedDate,
                        );
                        await saveAttendance({
                          ...(existing?.id
                            ? { id: existing.id as string }
                            : {}),
                          employeeId: id,
                          date: selectedDate,
                          status: "absent",
                        });
                        const padM = String(calMonth + 1).padStart(2, "0");
                        const monthStart = `${calYear}-${padM}-01`;
                        const lastDay = new Date(
                          calYear,
                          calMonth + 1,
                          0,
                        ).getDate();
                        const monthEnd = `${calYear}-${padM}-${lastDay}`;
                        const att = await getAttendanceByEmployeeInRange(
                          id,
                          monthStart,
                          monthEnd,
                        );
                        setCalendarAttendance(att);
                      }}
                    >
                      <X data-icon="inline-start" />
                      Absent
                    </Button>
                    {calendarAttendance.some(
                      (a) => (a.date as string) === selectedDate,
                    ) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={async () => {
                          const rec = calendarAttendance.find(
                            (a) => (a.date as string) === selectedDate,
                          );
                          if (rec?.id) await deleteAttendance(rec.id as string);
                          setCalendarAttendance((prev) =>
                            prev.filter(
                              (a) => (a.date as string) !== selectedDate,
                            ),
                          );
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="p-5 sm:p-6 flex flex-col min-h-0">
              <CardHeader className="p-0 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="size-5 text-primary shrink-0" />
                  <CardTitle className="text-sm font-medium text-muted-foreground truncate">
                    Monthly production
                  </CardTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {MONTH_NAMES[calMonth]} {calYear}
                </p>
              </CardHeader>
              <CardContent className="p-0 mt-auto pt-2">
                <p className="text-3xl font-bold font-heading text-foreground tabular-nums leading-tight">
                  {number(monthProdQty)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {currency(monthProdValue)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

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
                  <SelectTrigger
                    id="salary-period"
                    className="min-w-[200px] w-56 min-h-12"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem
                        key={p.from + p.to}
                        value={`${p.from}|${p.to}`}
                      >
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
                  printHtml(html);
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
                const holiday = await getHolidayByDate(prodDate);
                const holidayDates = holiday ? [prodDate] : [];
                if (isRestrictedForEntry(prodDate, holidayDates)) {
                  toast.error(
                    "Cannot add production on Sundays or factory holidays.",
                  );
                  return;
                }
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
                  <SelectTrigger
                    id="prod-shift"
                    className="min-w-[100px] min-h-12"
                  >
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
                  onChange={(e) =>
                    setProdQty(parseInt(e.target.value, 10) || 1)
                  }
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
                  onChange={(e) =>
                    setAdvAmount(parseFloat(e.target.value) || 0)
                  }
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
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
