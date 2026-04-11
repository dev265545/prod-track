"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
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
  getDeductionsByEmployee,
  saveDeduction,
} from "@/lib/services/advanceDeductionService";
import { getItems } from "@/lib/services/itemService";
import { getShifts } from "@/lib/services/shiftService";
import { saveEmployee } from "@/lib/services/employeeService";
import { getSalaryRecordsByEmployee } from "@/lib/services/salaryRecordService";
import {
  calculateSalary,
  getPrintableSalaryHtml,
  getPrintableMonthlyAttendanceSheetHtml,
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
  getCalendarDaysInMonth,
  getRatePerDay,
  getRatePerHour,
} from "@/lib/utils/salaryRates";
import {
  computeAttendanceStats,
  computeHoursInRange,
} from "@/lib/utils/attendanceStats";
import {
  getPeriodForDate,
  getPeriodsWithData,
  today,
  isRestrictedForEntry,
  formatMonthYear,
  toISODate,
} from "@/lib/utils/date";
import { getMissingDataDays } from "@/lib/utils/missingDataWarnings";
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
  Wallet,
  AlertTriangle,
  Printer,
  FileSpreadsheet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

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

function monthPickerOptions(count = 36): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${d.getMonth()}`,
      label: formatMonthYear(toISODate(d)),
    });
  }
  return out;
}

export function EmployeePageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  /** Static export: real IDs are passed via ?id= (only /employee is pre-rendered). */
  const id = searchParams?.get("id") ?? "";
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
  const [allAdvances, setAllAdvances] = useState<Record<string, unknown>[]>([]);
  const [deductions, setDeductions] = useState<Record<string, unknown>[]>([]);
  const [advancesModalOpen, setAdvancesModalOpen] = useState(false);
  const [advancesModalTab, setAdvancesModalTab] = useState<"advances" | "settlements">("advances");
  const [productionsModalOpen, setProductionsModalOpen] = useState(false);
  const [missingDataDays, setMissingDataDays] = useState<{ date: string }[]>([]);
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
  const [periodAttendance, setPeriodAttendance] = useState<
    Record<string, unknown>[]
  >([]);
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  /** Ignores stale results when the calendar month changes before fetch completes. */
  const calendarLoadGen = useRef(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(today());
  const [hoursReducedInput, setHoursReducedInput] = useState("");
  const [hoursExtraInput, setHoursExtraInput] = useState("");

  const load = async () => {
    const emp = await getEmployee(id);
    if (!emp) {
      setEmployee(null);
      return;
    }
    setEmployee(emp);
    const [allProds, allAdvs, itemsList, salaryRecs, shiftList, deductionsList] =
      await Promise.all([
        getProductionsByEmployee(id, "2000-01-01", "2100-12-31"),
        getAdvancesByEmployee(id, "2000-01-01", "2100-12-31"),
        getItems(),
        getSalaryRecordsByEmployee(id),
        getShifts(),
        getDeductionsByEmployee(id),
      ]);
    setItems(itemsList);
    setStoredSalaryRecords(salaryRecs);
    setShifts(shiftList);
    setAllAdvances(allAdvs);
    setDeductions(deductionsList);
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
    if (!id) {
      router.replace("/employees");
      return;
    }
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
      getAttendanceByEmployeeInRange(id, from, to),
    ]).then(([s, ded, prods, advs, periodAtt]) => {
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
      setPeriodAttendance(periodAtt);
    });
  }, [id, from, to]);

  const loadCalendarMonth = useCallback(async () => {
    if (!id) return;
    const gen = ++calendarLoadGen.current;
    const padM = String(calMonth + 1).padStart(2, "0");
    const monthStart = `${calYear}-${padM}-01`;
    const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
    const monthEnd = `${calYear}-${padM}-${lastDay}`;
    const [holidays, prods, att] = await Promise.all([
      getHolidaysInRange(monthStart, monthEnd),
      getProductionsByEmployee(id, monthStart, monthEnd),
      getAttendanceByEmployeeInRange(id, monthStart, monthEnd),
    ]);
    if (gen !== calendarLoadGen.current) return;
    setFactoryHolidays(holidays.map((h) => h.date as string));
    setCalendarProductions(prods);
    setCalendarAttendance(att);
  }, [id, calYear, calMonth]);

  useEffect(() => {
    setCalendarAttendance([]);
    setCalendarProductions([]);
    void loadCalendarMonth();
  }, [loadCalendarMonth]);

  const refreshMissingData = () => {
    if (!id || !employee || !from || !to) return;
    const start = (employee.createdAt as string) || from;
    getHolidaysInRange(from, to).then((holidays) =>
      getMissingDataDays(
        id,
        start,
        from,
        to,
        holidays.map((h) => h.date as string)
      ).then(setMissingDataDays)
    );
  };

  useEffect(() => {
    refreshMissingData();
  }, [id, employee, from, to]);

  useEffect(() => {
    const rec = calendarAttendance.find(
      (a) => (a.date as string) === selectedDate,
    );
    if (rec?.status === "present") {
      setHoursReducedInput(
        rec.hoursReduced != null ? String(rec.hoursReduced) : "",
      );
      setHoursExtraInput(rec.hoursExtra != null ? String(rec.hoursExtra) : "");
    } else {
      setHoursReducedInput("");
      setHoursExtraInput("");
    }
  }, [selectedDate, calendarAttendance]);

  if (!ready) {
    return (
      <AppShell>
        <main id="main" className="flex flex-col gap-8">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-64" />
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
            <div className="space-y-4">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
          </div>
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
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
  const calendarDaysInMonth = getCalendarDaysInMonth(calYear, calMonth);
  const monthlySalary = (employee.monthlySalary as number) ?? 0;
  const shiftId = employee.shiftId as string | undefined;
  const selectedShift = shiftId ? shiftMap[shiftId] : null;
  const hoursPerDay = selectedShift
    ? ((selectedShift.hoursPerDay as number) ?? 8)
    : 8;
  const ratePerDay = getRatePerDay(monthlySalary, calendarDaysInMonth);
  const ratePerHour = getRatePerHour(
    monthlySalary,
    calendarDaysInMonth,
    hoursPerDay,
  );

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

  // Monthly attendance summary (5 working presents → 1 earned Sunday pay unit; Sunday present = +1 day rate)
  const attendanceStats = computeAttendanceStats({
    year: calYear,
    month: calMonth,
    holidayDates: factoryHolidays,
    attendance: calendarAttendance.map((a) => ({
      date: a.date as string,
      status: a.status as string,
      hoursWorked: a.hoursWorked as number | undefined,
      hoursReduced: a.hoursReduced as number | undefined,
      hoursExtra: a.hoursExtra as number | undefined,
    })),
    hoursPerDay,
  });
  const {
    presentDays: daysPresent,
    absentDays: daysAbsent,
    earnedSundayPayDays,
    sundayPresentBonusDays,
    totalPaidDays,
    totalHoursWorked: monthHours,
  } = attendanceStats;
  const calculatedSalary =
    Math.round(totalPaidDays * ratePerDay * 100) / 100;

  const monthSheetOptions = monthPickerOptions(36);

  const periodProdQty = productions.reduce(
    (sum, p) => sum + ((p.quantity as number) || 0),
    0,
  );
  const periodProdValue = productions.reduce((sum, p) => {
    const item = itemMap[p.itemId as string];
    const rate = (item?.rate as number) || 0;
    return sum + ((p.quantity as number) || 0) * rate;
  }, 0);
  const periodHours =
    from && to
      ? computeHoursInRange(
          periodAttendance.map((a) => ({
            date: a.date as string,
            status: a.status as string,
            hoursWorked: a.hoursWorked as number | undefined,
            hoursReduced: a.hoursReduced as number | undefined,
            hoursExtra: a.hoursExtra as number | undefined,
          })),
          from,
          to,
          hoursPerDay,
        )
      : 0;
  const dayHours = selectedDate
    ? (() => {
        const rec = calendarAttendance.find(
          (a) => (a.date as string) === selectedDate,
        );
        if (!rec || (rec.status as string) !== "present") return 0;
        const extra =
          ((rec.hoursExtra as number) ?? 0) -
          ((rec.hoursReduced as number) ?? 0);
        return (rec.hoursWorked as number) ?? hoursPerDay + extra;
      })()
    : 0;

  return (
    <AppShell>
      <main id="main" className="flex flex-col gap-8">
        <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4">
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
          {missingDataDays.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative flex items-center justify-center rounded-lg p-2 text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive/30 transition-colors"
                  aria-label={`${missingDataDays.length} day${missingDataDays.length !== 1 ? "s" : ""} with missing data`}
                >
                  <AlertTriangle className="size-5" />
                  <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse">
                    {missingDataDays.length > 9 ? "9+" : missingDataDays.length}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <div className="space-y-2">
                  <p className="font-medium text-destructive">
                    Missing data
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {missingDataDays.length} working day{missingDataDays.length !== 1 ? "s" : ""} without attendance:
                  </p>
                  <ul className="text-sm max-h-40 overflow-y-auto space-y-1">
                    {missingDataDays
                      .slice(0, 15)
                      .map((d) => (
                        <li key={d.date}>{dateDisplay(d.date)}</li>
                      ))}
                    {missingDataDays.length > 15 && (
                      <li className="text-muted-foreground">
                        +{missingDataDays.length - 15} more
                      </li>
                    )}
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <div className="grid grid-cols-4 gap-4 xl:flex-1 xl:min-w-0 animate-fade-in animate-stagger-1">
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
                {calendarDaysInMonth} calendar days (rate) · {workingDays}{" "}
                working days in {MONTH_NAMES[calMonth]}
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

        <div className="flex flex-col xl:flex-row gap-4 xl:items-stretch animate-fade-in animate-stagger-2">
          <div className="xl:shrink-0 xl:min-w-[350px] xl:w-[350px]">
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
                setProdDate(date);
                const p = getPeriodForDate(date);
                setFrom(p.from);
                setTo(p.to);
              }}
              onDateDoubleClick={async (date) => {
                const existing = calendarAttendance.find(
                  (a) => (a.date as string) === date,
                );
                await saveAttendance({
                  ...(existing?.id ? { id: existing.id as string } : {}),
                  employeeId: id,
                  date,
                  status: "present",
                });
                const padM = String(calMonth + 1).padStart(2, "0");
                const monthStart = `${calYear}-${padM}-01`;
                const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
                const monthEnd = `${calYear}-${padM}-${String(lastDay).padStart(2, "0")}`;
                const [att, periodAtt] = await Promise.all([
                  getAttendanceByEmployeeInRange(id, monthStart, monthEnd),
                  from && to
                    ? getAttendanceByEmployeeInRange(id, from, to)
                    : Promise.resolve([]),
                ]);
                setCalendarAttendance(att);
                if (from && to) setPeriodAttendance(periodAtt);
                setSelectedDate(date);
                refreshMissingData();
                toast.success(`Marked present for ${dateDisplay(date)}`);
              }}
              periodFrom={from || ""}
              periodTo={to || ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 flex-1 min-w-0 xl:min-w-[280px]">
            <Card className="p-3 flex flex-col min-h-0">
              <CardHeader className="p-0 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <UserCheck className="size-3.5 text-primary shrink-0" />
                  Attendance — {MONTH_NAMES[calMonth]}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pt-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="rounded-lg border bg-muted/40 px-2 py-1.5 text-xs">
                    <p className="text-muted-foreground text-[10px] font-medium">
                      Present
                    </p>
                    <p className="font-bold tabular-nums text-foreground text-sm">
                      {daysPresent}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-2 py-1.5 text-xs">
                    <p className="text-muted-foreground text-[10px] font-medium">
                      Absent
                    </p>
                    <p className="font-bold tabular-nums text-foreground text-sm">
                      {daysAbsent}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-2 py-1.5 text-xs">
                    <p className="text-muted-foreground text-[10px] font-medium">
                      Earned Sun. / Sun. +
                    </p>
                    <p className="font-bold tabular-nums text-foreground text-sm">
                      {earnedSundayPayDays} / {sundayPresentBonusDays}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-2 py-1.5 text-xs">
                    <p className="text-muted-foreground text-[10px] font-medium">
                      Paid days
                    </p>
                    <p className="font-bold tabular-nums text-foreground text-sm">
                      {totalPaidDays}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-lg border-2 border-primary/30 bg-primary/10 px-2 py-2">
                    <p className="text-muted-foreground text-[10px] font-medium">
                      Salary
                    </p>
                    <p className="text-base font-bold tabular-nums text-foreground">
                      {currency(calculatedSalary)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-2">
              <Card className="p-3">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3.5 text-primary shrink-0" />
                    Period hours
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {from && to
                      ? `${dateDisplay(from)} – ${dateDisplay(to)}`
                      : "Select period"}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(periodHours)}h
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currency(periodHours * ratePerHour)}
                  </p>
                </CardContent>
              </Card>
              <Card className="p-3">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Package className="size-3.5 text-primary shrink-0" />
                    Period production
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {from && to
                      ? `${dateDisplay(from)} – ${dateDisplay(to)}`
                      : "Select period"}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(periodProdQty)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currency(periodProdValue)}
                  </p>
                </CardContent>
              </Card>
              <Card className="p-3">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3.5 text-primary shrink-0" />
                    Monthly hours
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground">
                    {MONTH_NAMES[calMonth]} {calYear}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(monthHours)}h
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currency(monthHours * ratePerHour)}
                  </p>
                </CardContent>
              </Card>
              <Card className="p-3">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <LayoutGrid className="size-3.5 text-primary shrink-0" />
                    Monthly production
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground">
                    {MONTH_NAMES[calMonth]} {calYear}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(monthProdQty)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currency(monthProdValue)}
                  </p>
                </CardContent>
              </Card>
            </div>
            <Card className="p-3 flex flex-col min-h-0">
              <CardHeader className="p-0 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="size-3.5 text-primary shrink-0" />
                  {selectedDate
                    ? `${dateDisplay(selectedDate)} — Attendance`
                    : "Select a date"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 mt-2">
                {!selectedDate ? (
                  <p className="text-sm text-muted-foreground">
                    Click a date on the calendar to mark attendance.
                  </p>
                ) : (
                  <div className="space-y-3">
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
                            ? "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-[hsl(var(--success-foreground))] h-8 px-3 text-xs"
                            : "h-8 px-3 text-xs"
                        }
                        onClick={async () => {
                          const existing = calendarAttendance.find(
                            (a) => (a.date as string) === selectedDate,
                          );
                          const reduced = hoursReducedInput
                            ? parseFloat(hoursReducedInput)
                            : undefined;
                          const extra = hoursExtraInput
                            ? parseFloat(hoursExtraInput)
                            : undefined;
                          await saveAttendance({
                            ...(existing?.id
                              ? { id: existing.id as string }
                              : {}),
                            employeeId: id,
                            date: selectedDate,
                            status: "present",
                            ...(reduced != null &&
                            !Number.isNaN(reduced) &&
                            reduced >= 0
                              ? { hoursReduced: reduced }
                              : {}),
                            ...(extra != null &&
                            !Number.isNaN(extra) &&
                            extra >= 0
                              ? { hoursExtra: extra }
                              : {}),
                          });
                          const padM = String(calMonth + 1).padStart(2, "0");
                          const monthStart = `${calYear}-${padM}-01`;
                          const lastDay = new Date(
                            calYear,
                            calMonth + 1,
                            0,
                          ).getDate();
                          const monthEnd = `${calYear}-${padM}-${lastDay}`;
                          const [att, periodAtt] = await Promise.all([
                            getAttendanceByEmployeeInRange(
                              id,
                              monthStart,
                              monthEnd,
                            ),
                            from && to
                              ? getAttendanceByEmployeeInRange(id, from, to)
                              : Promise.resolve([]),
                          ]);
                          setCalendarAttendance(att);
                          if (from && to) setPeriodAttendance(periodAtt);
                          refreshMissingData();
                          toast.success(`Marked present for ${selectedDate ? dateDisplay(selectedDate) : "this date"}`);
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
                        className="h-8 px-3 text-xs"
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
                          const [att, periodAtt] = await Promise.all([
                            getAttendanceByEmployeeInRange(
                              id,
                              monthStart,
                              monthEnd,
                            ),
                            from && to
                              ? getAttendanceByEmployeeInRange(id, from, to)
                              : Promise.resolve([]),
                          ]);
                          setCalendarAttendance(att);
                          if (from && to) setPeriodAttendance(periodAtt);
                          refreshMissingData();
                          toast.success(`Marked absent for ${selectedDate ? dateDisplay(selectedDate) : "this date"}`);
                        }}
                      >
                        <X data-icon="inline-start" />
                        Absent
                      </Button>
                      {calendarAttendance.some(
                        (a) => (a.date as string) === selectedDate,
                      ) && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs h-8 px-3"
                            >
                              Clear
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Clear attendance?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Remove the attendance record for {selectedDate ? dateDisplay(selectedDate) : "this date"}. You can add it again later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={async () => {
                                  try {
                                    const rec = calendarAttendance.find(
                                      (a) => (a.date as string) === selectedDate,
                                    );
                                    if (rec?.id) await deleteAttendance(rec.id as string);
                                    setCalendarAttendance((prev) =>
                                      prev.filter(
                                        (a) => (a.date as string) !== selectedDate,
                                      ),
                                    );
                                    refreshMissingData();
                                    toast.success("Attendance cleared");
                                  } catch {
                                    toast.error("Failed to clear attendance");
                                  }
                                }}
                              >
                                Clear
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                    {calendarAttendance.find(
                      (a) => (a.date as string) === selectedDate,
                    )?.status === "present" && (
                      <div className="space-y-3 pt-3 border-t">
                        <p className="text-xs font-medium text-foreground">
                          Adjust hours for this day
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label
                              htmlFor="hours-reduced"
                              className="text-sm text-muted-foreground"
                            >
                              Hours less (−)
                            </Label>
                            <Input
                              id="hours-reduced"
                              type="number"
                              min={0}
                              max={24}
                              step={0.5}
                              placeholder="0"
                              className="h-10 w-full text-base tabular-nums"
                              value={hoursReducedInput}
                              onChange={(e) =>
                                setHoursReducedInput(e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label
                              htmlFor="hours-extra"
                              className="text-sm text-muted-foreground"
                            >
                              Extra hours (+)
                            </Label>
                            <Input
                              id="hours-extra"
                              type="number"
                              min={0}
                              max={24}
                              step={0.5}
                              placeholder="0"
                              className="h-10 w-full text-base tabular-nums"
                              value={hoursExtraInput}
                              onChange={(e) =>
                                setHoursExtraInput(e.target.value)
                              }
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Rate: {currency(ratePerHour)}/h
                        </p>
                        {(() => {
                          const rec = calendarAttendance.find(
                            (a) => (a.date as string) === selectedDate,
                          );
                          const storedReduced = rec?.hoursReduced as
                            | number
                            | undefined;
                          const storedExtra = rec?.hoursExtra as
                            | number
                            | undefined;
                          const hasChanged =
                            (hoursReducedInput !== "" &&
                              parseFloat(hoursReducedInput) !==
                                (storedReduced ?? 0)) ||
                            (hoursExtraInput !== "" &&
                              parseFloat(hoursExtraInput) !==
                                (storedExtra ?? 0));
                          return hasChanged ? (
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="mt-1 h-9 text-sm px-4"
                              onClick={async () => {
                                const existing = calendarAttendance.find(
                                  (a) => (a.date as string) === selectedDate,
                                );
                                if (!existing) return;
                                const reduced = hoursReducedInput
                                  ? parseFloat(hoursReducedInput)
                                  : 0;
                                const extra = hoursExtraInput
                                  ? parseFloat(hoursExtraInput)
                                  : 0;
                                await saveAttendance({
                                  ...existing,
                                  hoursReduced: Number.isNaN(reduced)
                                    ? undefined
                                    : reduced,
                                  hoursExtra: Number.isNaN(extra)
                                    ? undefined
                                    : extra,
                                });
                                const padM = String(calMonth + 1).padStart(
                                  2,
                                  "0",
                                );
                                const monthStart = `${calYear}-${padM}-01`;
                                const lastDay = new Date(
                                  calYear,
                                  calMonth + 1,
                                  0,
                                ).getDate();
                                const monthEnd = `${calYear}-${padM}-${lastDay}`;
                                const [att, periodAtt] = await Promise.all([
                                  getAttendanceByEmployeeInRange(
                                    id,
                                    monthStart,
                                    monthEnd,
                                  ),
                                  from && to
                                    ? getAttendanceByEmployeeInRange(
                                        id,
                                        from,
                                        to,
                                      )
                                    : Promise.resolve([]),
                                ]);
                                setCalendarAttendance(att);
                                if (from && to) setPeriodAttendance(periodAtt);
                                refreshMissingData();
                                toast.success("Hours updated");
                              }}
                            >
                              Save hours
                            </Button>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-2">
              <Card className="p-3">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3.5 text-primary shrink-0" />
                    Day hours
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {selectedDate ? dateDisplay(selectedDate) : "Select date"}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(dayHours)}h
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currency(dayHours * ratePerHour)}
                  </p>
                </CardContent>
              </Card>
              <Card className="p-3">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Package className="size-3.5 text-primary shrink-0" />
                    Day production
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {selectedDate ? dateDisplay(selectedDate) : "Select date"}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(dayProdQty)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currency(dayProdValue)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Card className="p-6 sm:p-8 transition-all duration-300 ease-out animate-fade-in animate-stagger-3">
          <CardHeader className="p-0 mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
                <FileSpreadsheet className="size-5 text-primary shrink-0" />
                Monthly attendance (print)
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Full-month attendance, hours, and day pay—only in the printout. Pick the month here or from the calendar, then print.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3 shrink-0">
              <div className="flex flex-col gap-2">
                <Label htmlFor="month-sheet-month">Month</Label>
                <Select
                  value={`${calYear}-${calMonth}`}
                  onValueChange={(v) => {
                    const [y, m] = v.split("-").map(Number);
                    setCalYear(y);
                    setCalMonth(m);
                  }}
                >
                  <SelectTrigger
                    id="month-sheet-month"
                    className="min-w-[200px] w-56 min-h-12"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthSheetOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="min-h-12"
                onClick={async () => {
                  const { html } = await getPrintableMonthlyAttendanceSheetHtml(
                    id,
                    calYear,
                    calMonth,
                  );
                  await printHtml(html);
                }}
              >
                <Printer data-icon="inline-start" className="size-4" />
                Print monthly attendance
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card className="p-6 sm:p-8 transition-all duration-300 ease-out animate-fade-in animate-stagger-4">
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
                  await printHtml(html);
                }}
              >
                Print production & advances
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
                  <Label>Advance to cut</Label>
                  <p className="text-base text-foreground font-medium">
                    {currency(advanceToCutInput)}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Net</Label>
                  <p className="text-base text-foreground font-medium">
                    {currency(Math.max(0, salary.gross - advanceToCutInput))}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="p-6 sm:p-8 transition-all duration-300 ease-out animate-fade-in animate-stagger-5">
          <CardHeader className="p-0 mb-4">
            <CardTitle className="text-xl font-semibold font-heading">
              Salary for this period
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Set how much advance to cut this 15-day cycle. Net = Gross − Advance to cut. Submit to save.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {salary ? (
              <div className="space-y-4 max-w-xl">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">Total making (gross)</span>
                  <span className="font-semibold tabular-nums">
                    {currency(salary.gross)}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">Total advance paid (all time)</span>
                  <span className="font-semibold tabular-nums">
                    {currency(
                      allAdvances.reduce(
                        (sum, a) => sum + ((a.amount as number) || 0),
                        0
                      )
                    )}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="advance-to-cut">Advance to cut this period (₹)</Label>
                  <Input
                    id="advance-to-cut"
                    type="number"
                    min={0}
                    step={1}
                    className="w-full max-w-[200px] min-h-12"
                    value={advanceToCutInput}
                    onChange={(e) =>
                      setAdvanceToCutInput(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
                <Separator className="my-4" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">Net this period</span>
                  <span className="font-bold text-lg tabular-nums">
                    {currency(Math.max(0, salary.gross - advanceToCutInput))}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">Advance left after this period</span>
                  <span className="font-semibold tabular-nums">
                    {currency(
                      Math.max(
                        0,
                        allAdvances.reduce(
                          (sum, a) => sum + ((a.amount as number) || 0),
                          0
                        ) - advanceToCutInput
                      )
                    )}
                  </span>
                </div>
                <Button
                  type="button"
                  className="min-h-12 px-6"
                  onClick={async () => {
                    try {
                      await saveDeduction({
                        employeeId: id,
                        periodFrom: from,
                        periodTo: to,
                        amount: advanceToCutInput,
                      });
                    } catch {
                      toast.error("Failed to save period settlement");
                      return;
                    }
                    const updatedDeductions = await getDeductionsByEmployee(id);
                    setDeductions(updatedDeductions);
                    setSalary({
                      ...salary,
                      advanceToCut: advanceToCutInput,
                      final: Math.max(0, salary.gross - advanceToCutInput),
                    });
                    toast.success("Period settlement saved");
                  }}
                >
                  Save period settlement
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            )}
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
                    "Cannot add production on factory holidays.",
                  );
                  return;
                }
                try {
                  await saveProduction({
                    employeeId: id,
                    itemId: prodItem,
                    date: prodDate,
                    quantity: prodQty,
                    shift: prodShift,
                  });
                } catch {
                  toast.error("Failed to add production entry");
                  return;
                }
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
                await loadCalendarMonth();
                refreshMissingData();
                toast.success("Production entry added");
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
                try {
                  await saveAdvance({
                    employeeId: id,
                    amount: advAmount,
                    date: advDate,
                  });
                } catch {
                  toast.error("Failed to add advance");
                  return;
                }
                setAdvAmount(0);
                const [allAdvs, s, ded, prods, advs] = await Promise.all([
                  getAdvancesByEmployee(id, "2000-01-01", "2100-12-31"),
                  calculateSalary(id, from, to),
                  getDeductionForPeriod(id, from, to),
                  getProductionsByEmployee(id, from, to),
                  getAdvancesByEmployee(id, from, to),
                ]);
                setAllAdvances(allAdvs);
                setSalary({
                  gross: s.gross,
                  advance: s.advance,
                  final: Math.max(0, s.gross - ((ded?.amount as number) ?? 0)),
                  advanceToCut: (ded?.amount as number) ?? 0,
                });
                setProductions(prods);
                setAdvances(advs);
                toast.success("Advance added");
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

        <Dialog open={productionsModalOpen} onOpenChange={setProductionsModalOpen}>
          <DialogTrigger asChild>
            <Card className="p-6 sm:p-8 cursor-pointer transition-all duration-200 ease-out hover:ring-2 hover:ring-primary/20 focus-within:ring-2 focus-within:ring-primary/20 focus:outline-none">
              <CardContent className="p-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <Package className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Production entries
                    </p>
                    <p className="text-2xl font-bold tabular-nums">
                      {productions.length} this period
                    </p>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">View details →</span>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Production entries</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {productions.length === 0 ? (
                <Empty className="py-10 border-0 animate-fade-in">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Package className="size-6 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>No production this period</EmptyTitle>
                    <EmptyDescription>
                      Add production entries above or pick another pay period from the 15-day selector.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Packaging item group</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="w-16" />
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
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                >
                                  <X className="size-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete production entry?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove the entry for {dateDisplay(p.date as string)}. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={async () => {
                                      try {
                                        await deleteProduction(p.id as string);
                                        const [s, ded, prods, advs] = await Promise.all([
                                          calculateSalary(id, from, to),
                                          getDeductionForPeriod(id, from, to),
                                          getProductionsByEmployee(id, from, to),
                                          getAdvancesByEmployee(id, from, to),
                                        ]);
                                        setAdvanceToCutInput((ded?.amount as number) ?? 0);
                                        setSalary({
                                          gross: s.gross,
                                          advance: s.advance,
                                          final: Math.max(0, s.gross - ((ded?.amount as number) ?? 0)),
                                          advanceToCut: (ded?.amount as number) ?? 0,
                                        });
                                        setProductions(prods);
                                        setAdvances(advs);
                                        await loadCalendarMonth();
                                        refreshMissingData();
                                        toast.success("Production entry deleted");
                                      } catch {
                                        toast.error("Failed to delete production entry");
                                      }
                                    }}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={advancesModalOpen} onOpenChange={setAdvancesModalOpen}>
          <DialogTrigger asChild>
            <Card className="p-6 sm:p-8 cursor-pointer transition-all duration-200 ease-out hover:ring-2 hover:ring-primary/20 focus-within:ring-2 focus-within:ring-primary/20 focus:outline-none">
              <CardContent className="p-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <Wallet className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Total advances paid
                    </p>
                    <p className="text-2xl font-bold tabular-nums">
                      {currency(
                        allAdvances.reduce(
                          (sum, a) => sum + ((a.amount as number) || 0),
                          0
                        )
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">View details →</span>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Advances & settlements</DialogTitle>
            </DialogHeader>
            <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  advancesModalTab === "advances"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setAdvancesModalTab("advances")}
              >
                Advances
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  advancesModalTab === "settlements"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setAdvancesModalTab("settlements")}
              >
                Settlements
              </button>
            </div>
            {advancesModalTab === "advances" ? (
              <div className="max-h-[40vh] overflow-y-auto -mx-1 px-1">
                {allAdvances.length === 0 ? (
                  <Empty className="py-8 border-0 animate-fade-in">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Wallet className="size-6 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle>No advances yet</EmptyTitle>
                      <EmptyDescription>
                        Advances you record appear here with date and amount.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...allAdvances]
                        .sort(
                          (a, b) =>
                            (b.date as string).localeCompare(a.date as string)
                        )
                        .map((a) => (
                          <TableRow key={a.id as string}>
                            <TableCell>{dateDisplay(a.date as string)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {currency((a.amount as number) ?? 0)}
                            </TableCell>
                            <TableCell>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                  >
                                    <X className="size-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete advance?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will remove the advance of {currency((a.amount as number) ?? 0)} from {dateDisplay(a.date as string)}. This cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={async () => {
                                        try {
                                          await deleteAdvance(a.id as string);
                                          const [allAdvs, s, ded, prods, advs] =
                                            await Promise.all([
                                              getAdvancesByEmployee(id, "2000-01-01", "2100-12-31"),
                                              calculateSalary(id, from, to),
                                              getDeductionForPeriod(id, from, to),
                                              getProductionsByEmployee(id, from, to),
                                              getAdvancesByEmployee(id, from, to),
                                            ]);
                                          setAllAdvances(allAdvs);
                                          setAdvanceToCutInput((ded?.amount as number) ?? 0);
                                          setSalary({
                                            gross: s.gross,
                                            advance: s.advance,
                                            final: Math.max(0, s.gross - ((ded?.amount as number) ?? 0)),
                                            advanceToCut: (ded?.amount as number) ?? 0,
                                          });
                                          setProductions(prods);
                                          setAdvances(advs);
                                          toast.success("Advance deleted");
                                        } catch {
                                          toast.error("Failed to delete advance");
                                        }
                                      }}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ) : (
              <div className="max-h-[40vh] overflow-y-auto -mx-1 px-1">
                {deductions.length === 0 ? (
                  <Empty className="py-8 border-0 animate-fade-in">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <IndianRupee className="size-6 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle>No settlements yet</EmptyTitle>
                      <EmptyDescription>
                        Saved period deductions show here after you submit a settlement.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">
                          Deducted
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...deductions]
                        .sort(
                          (a, b) =>
                            (b.periodFrom as string).localeCompare(
                              a.periodFrom as string
                            )
                        )
                        .map((d) => (
                          <TableRow key={d.id as string}>
                            <TableCell>
                              {dateDisplay(d.periodFrom as string)} –{" "}
                              {dateDisplay(d.periodTo as string)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {currency((d.amount as number) ?? 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </AppShell>
  );
}
