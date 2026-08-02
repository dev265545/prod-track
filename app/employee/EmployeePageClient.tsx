"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
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
import { isAdmin } from "@/lib/auth";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { getEmployee } from "@/lib/services/employeeService";
import {
  getProductionsByEmployee,
  deleteProduction,
} from "@/lib/services/productionService";
import { saveProductionEntry } from "@/lib/services/productionEntryService";
import { describeMissingComponents } from "@/components/inventory/forms/produce-form";
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
import {
  getSundayCategories,
  resolveSundayCategoryRule,
  type SundayCategory,
} from "@/lib/services/sundayCategoryService";
import { saveEmployee } from "@/lib/services/employeeService";
import { getSalaryRecordsByEmployee } from "@/lib/services/salaryRecordService";
import {
  getSalarySheetRowForEmployee,
  type SalarySheetRow,
} from "@/lib/services/salarySheetService";
import {
  calculateSalary,
  getPrintableAttendanceSalaryRangeHtml,
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
  buildAttendanceSalarySummaryForRange,
  buildMonthSalaryBreakdown,
  computeAttendanceStats,
  computeHoursInRange,
} from "@/lib/utils/attendanceStats";
import {
  applySalaryTargetsToDayRows,
  salarySheetRowToAttendanceSummary,
} from "@/lib/utils/salarySheetDayDisplay";
import { salarySheetRowHasAdjustment } from "@/lib/services/salarySheetService";
import {
  clampDateToMonth,
  getMonthRange,
  getMonthRangeLabel,
  getMonthRangePresets,
  getPeriodForDate,
  getPeriodsWithData,
  getYearMonthFromIsoDate,
  today,
  isRestrictedForEntry,
  formatMonthYear,
  toISODate,
  type MonthRangeMode,
  type DisplayLocale,
} from "@/lib/utils/date";
import { getMissingDataDays } from "@/lib/utils/missingDataWarnings";
import { getHolidayByDate } from "@/lib/services/factoryHolidayService";
import { toast } from "sonner";
import { currency, dateDisplay, number } from "@/lib/utils/formatter";
import { EmployeeCalendar } from "@/components/employee-calendar";
import { SalarySheetAdjustDialog } from "@/components/salary-sheet-adjust-dialog";
import { PayrollPeriodBadge } from "@/components/payroll-period-badge";
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
import { useLanguage } from "@/components/language-provider";

function monthPickerOptions(
  count = 36,
  locale: DisplayLocale = "en",
): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${d.getMonth()}`,
      label: formatMonthYear(toISODate(d), locale),
    });
  }
  return out;
}

function EmployeePageHeader() {
  const { t } = useLanguage();
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">{t("navHome")}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/employees">{t("navModuleAttendance")}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/employees">{t("navEmployees")}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{t("breadcrumbEmployee")}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function EmployeePageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale, t } = useLanguage();
  /** Static export: real IDs are passed via ?id= (only /employee is pre-rendered). */
  const id = searchParams?.get("id") ?? "";
  const { ready: guardReady } = useAuthGuard();
  const [dataLoaded, setDataLoaded] = useState(false);
  const ready = guardReady && dataLoaded;
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
  const [sundayCategories, setSundayCategories] = useState<SundayCategory[]>(
    [],
  );
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
  const [salaryRangeMode, setSalaryRangeMode] =
    useState<MonthRangeMode>("full-month");
  const [salaryCustomFrom, setSalaryCustomFrom] = useState("");
  const [salaryCustomTo, setSalaryCustomTo] = useState("");
  /** Ignores stale results when the calendar month changes before fetch completes. */
  const calendarLoadGen = useRef(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(today());
  const [hoursReducedInput, setHoursReducedInput] = useState("");
  const [hoursExtraInput, setHoursExtraInput] = useState("");
  const [salarySheetRowForPeriod, setSalarySheetRowForPeriod] =
    useState<SalarySheetRow | null>(null);
  const [salarySheetRowForSalaryRange, setSalarySheetRowForSalaryRange] =
    useState<SalarySheetRow | null>(null);
  const [salarySheetRowLoading, setSalarySheetRowLoading] = useState(false);
  const [salaryRangeRowLoading, setSalaryRangeRowLoading] = useState(false);
  const [payrollAdjustOpen, setPayrollAdjustOpen] = useState(false);
  const [salaryRangeAdjustOpen, setSalaryRangeAdjustOpen] = useState(false);

  const load = async () => {
    const emp = await getEmployee(id);
    if (!emp) {
      setEmployee(null);
      return;
    }
    setEmployee(emp);
    const [
      allProds,
      allAdvs,
      itemsList,
      salaryRecs,
      shiftList,
      deductionsList,
      sundayCategoryList,
    ] =
      await Promise.all([
        getProductionsByEmployee(id, "2000-01-01", "2100-12-31"),
        getAdvancesByEmployee(id, "2000-01-01", "2100-12-31"),
        getItems(),
        getSalaryRecordsByEmployee(id),
        getShifts(),
        getDeductionsByEmployee(id),
        getSundayCategories(),
      ]);
    setItems(itemsList);
    setStoredSalaryRecords(salaryRecs);
    setShifts(shiftList);
    setSundayCategories(sundayCategoryList);
    setAllAdvances(allAdvs);
    setDeductions(deductionsList);
    const periodsWithData = getPeriodsWithData([...allProds, ...allAdvs], 24, locale);
    const period = getPeriodForDate(today(), locale);
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
    if (!guardReady) return;
    load().then(() => setDataLoaded(true));
  }, [router, id, locale, guardReady]);

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

  useEffect(() => {
    setPayrollAdjustOpen(false);
  }, [from, to, calYear, calMonth]);

  useEffect(() => {
    if (!id || !from || !to) {
      setSalarySheetRowForPeriod(null);
      setSalarySheetRowLoading(false);
      return;
    }
    const ym = getYearMonthFromIsoDate(from);
    if (!ym) {
      setSalarySheetRowForPeriod(null);
      setSalarySheetRowLoading(false);
      return;
    }
    let cancelled = false;
    setSalarySheetRowLoading(true);
    void getSalarySheetRowForEmployee(id, ym.year, ym.month, from, to)
      .then((row) => {
        if (!cancelled) setSalarySheetRowForPeriod(row);
      })
      .finally(() => {
        if (!cancelled) setSalarySheetRowLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, from, to]);

  const salaryRangeBounds = useMemo(
    () => getMonthRange(calYear, calMonth),
    [calYear, calMonth],
  );

  const resolvedSalaryRange = useMemo(() => {
    const presets = getMonthRangePresets(calYear, calMonth, locale);
    if (salaryRangeMode === "custom") {
      const resolvedFrom = clampDateToMonth(
        salaryCustomFrom || salaryRangeBounds.from,
        calYear,
        calMonth,
      );
      const resolvedTo = clampDateToMonth(
        salaryCustomTo || salaryRangeBounds.to,
        calYear,
        calMonth,
      );
      const from =
        resolvedFrom <= resolvedTo ? resolvedFrom : resolvedTo;
      const to =
        resolvedFrom <= resolvedTo ? resolvedTo : resolvedFrom;
      return {
        from,
        to,
        label: getMonthRangeLabel(from, to, locale),
      };
    }
    return presets.find((preset) => preset.mode === salaryRangeMode) ?? presets[0];
  }, [
    calYear,
    calMonth,
    locale,
    salaryCustomFrom,
    salaryCustomTo,
    salaryRangeBounds.from,
    salaryRangeBounds.to,
    salaryRangeMode,
  ]);

  useEffect(() => {
    setSalaryRangeAdjustOpen(false);
  }, [resolvedSalaryRange.from, resolvedSalaryRange.to, calYear, calMonth]);

  useEffect(() => {
    if (!id || !resolvedSalaryRange.from || !resolvedSalaryRange.to) {
      setSalarySheetRowForSalaryRange(null);
      setSalaryRangeRowLoading(false);
      return;
    }
    const ym = getYearMonthFromIsoDate(resolvedSalaryRange.from);
    if (!ym) {
      setSalarySheetRowForSalaryRange(null);
      setSalaryRangeRowLoading(false);
      return;
    }
    let cancelled = false;
    setSalaryRangeRowLoading(true);
    void getSalarySheetRowForEmployee(
      id,
      ym.year,
      ym.month,
      resolvedSalaryRange.from,
      resolvedSalaryRange.to,
    )
      .then((row) => {
        if (!cancelled) setSalarySheetRowForSalaryRange(row);
      })
      .finally(() => {
        if (!cancelled) setSalaryRangeRowLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, resolvedSalaryRange.from, resolvedSalaryRange.to]);

  const openPayrollAdjust = useCallback(() => {
    if (!from || !to) {
      toast.message(t("empPayrollToastSelectDate"));
      return;
    }
    if (!getYearMonthFromIsoDate(from)) {
      toast.error(t("empPayrollToastLoadFailed"));
      return;
    }
    if (salarySheetRowLoading) {
      toast.message(t("empPayrollToastLoading"));
      return;
    }
    if (!salarySheetRowForPeriod) {
      toast.error(t("empPayrollToastLoadFailed"));
      return;
    }
    setPayrollAdjustOpen(true);
  }, [
    from,
    to,
    salarySheetRowLoading,
    salarySheetRowForPeriod,
    t,
  ]);

  const openSalaryRangeAdjust = useCallback(() => {
    if (!resolvedSalaryRange.from || !resolvedSalaryRange.to) {
      toast.message(t("empPayrollToastSelectDate"));
      return;
    }
    if (!getYearMonthFromIsoDate(resolvedSalaryRange.from)) {
      toast.error(t("empPayrollToastLoadFailed"));
      return;
    }
    if (salaryRangeRowLoading) {
      toast.message(t("empPayrollToastLoading"));
      return;
    }
    if (!salarySheetRowForSalaryRange) {
      toast.error(t("empPayrollToastLoadFailed"));
      return;
    }
    setSalaryRangeAdjustOpen(true);
  }, [
    resolvedSalaryRange.from,
    resolvedSalaryRange.to,
    salaryRangeRowLoading,
    salarySheetRowForSalaryRange,
    t,
  ]);

  const salaryRangeSheetYearMonth = useMemo(
    () => getYearMonthFromIsoDate(resolvedSalaryRange.from),
    [resolvedSalaryRange.from],
  );

  const payrollSheetYearMonth = useMemo(
    () => (from ? getYearMonthFromIsoDate(from) : null),
    [from],
  );

  if (!ready) {
    return (
      <AppShell headerContent={<EmployeePageHeader />}>
        <main id="main" className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
      <AppShell headerContent={<EmployeePageHeader />}>
        <main id="main" className="flex flex-col gap-8">
          <p className="text-lg text-muted-foreground">{t("empNotFound")}</p>
        </main>
      </AppShell>
    );
  }

  const employeeType = ((employee.employeeType as string) || "salaried") as
    | "salaried"
    | "production"
    | "operator";
  const isProductionEmp = employeeType === "production";
  const isOperatorEmp = employeeType === "operator";
  const admin = isAdmin();
  const hideOperatorRates = isOperatorEmp && !admin;

  const itemMap = Object.fromEntries(
    items.map((i) => [i.id as string, i]),
  ) as Record<string, Record<string, unknown>>;

  const shiftMap = Object.fromEntries(
    shifts.map((s) => [s.id as string, s]),
  ) as Record<string, Record<string, unknown>>;
  const sundayCategoryMap = Object.fromEntries(
    sundayCategories.map((c) => [c.id as string, c]),
  ) as Record<string, SundayCategory>;

  const workingDays = getWorkingDaysInMonth(calYear, calMonth, factoryHolidays);
  const calendarDaysInMonth = getCalendarDaysInMonth(calYear, calMonth);
  const monthlySalary = (employee.monthlySalary as number) ?? 0;
  const shiftId = employee.shiftId as string | undefined;
  const selectedShift = shiftId ? shiftMap[shiftId] : null;
  const sundayCategoryId = employee.sundayCategoryId as string | undefined;
  const selectedSundayCategory = sundayCategoryId
    ? sundayCategoryMap[sundayCategoryId]
    : null;
  const sundayCategoryRule = resolveSundayCategoryRule(selectedSundayCategory);
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

  // Monthly attendance: up to 4 extra pay days from 15-day cycles (≥12 working presents each); Sunday present = +1 day rate
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
    sundayCategoryRule,
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

  const monthSheetOptions = monthPickerOptions(36, locale);
  const monthBounds = salaryRangeBounds;
  const salaryRange = resolvedSalaryRange;
  const salaryRangeSummary = buildAttendanceSalarySummaryForRange({
    fromDate: salaryRange.from,
    toDate: salaryRange.to,
    holidayDates: factoryHolidays,
    attendance: calendarAttendance.map((a) => ({
      date: a.date as string,
      status: a.status as string,
      hoursWorked: a.hoursWorked as number | undefined,
      hoursReduced: a.hoursReduced as number | undefined,
      hoursExtra: a.hoursExtra as number | undefined,
    })),
    hoursPerDay,
    ratePerDay,
    sundayCategoryRule,
  });
  const salaryRangeLabel =
    salaryRangeMode === "full-month"
      ? formatMonthYear(monthBounds.from, locale)
      : salaryRange.label;
  const monthAttendanceBreakdown = buildMonthSalaryBreakdown({
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
    productionPayByDate: new Map(),
    hoursPerDay,
    ratePerDay,
    includeProductionPay: false,
    sundayCategoryRule,
  });
  const salaryRangeDayRows = monthAttendanceBreakdown.days.filter(
    (row) => row.date >= salaryRange.from && row.date <= salaryRange.to,
  );
  const effectiveSalaryRangeSummary = salarySheetRowHasAdjustment(
    salarySheetRowForSalaryRange,
  )
    ? salarySheetRowToAttendanceSummary(
        salarySheetRowForSalaryRange,
        salaryRangeSummary.totalHoursWorked,
      )
    : salaryRangeSummary;
  const currentPeriodLabel =
    from && to ? getMonthRangeLabel(from, to, locale) : "";

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

  const handleSalaryCustomFromChange = (value: string) => {
    const nextFrom = clampDateToMonth(value, calYear, calMonth);
    const nextTo = clampDateToMonth(
      salaryCustomTo || monthBounds.to,
      calYear,
      calMonth,
    );
    setSalaryCustomFrom(nextFrom);
    if (nextTo < nextFrom) setSalaryCustomTo(nextFrom);
  };

  const handleSalaryCustomToChange = (value: string) => {
    const nextTo = clampDateToMonth(value, calYear, calMonth);
    const nextFrom = clampDateToMonth(
      salaryCustomFrom || monthBounds.from,
      calYear,
      calMonth,
    );
    setSalaryCustomTo(nextTo);
    if (nextTo < nextFrom) setSalaryCustomFrom(nextTo);
  };

  const calendarMonthTitle = formatMonthYear(
    `${calYear}-${String(calMonth + 1).padStart(2, "0")}-01`,
    locale,
  );

  return (
    <AppShell
      headerContent={<EmployeePageHeader />}
    >
      <main id="main" className="flex flex-col gap-8">
        <div className="animate-fade-in flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold text-foreground sm:text-3xl">
              {employee.name as string}
            </h1>
          </div>
          {missingDataDays.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative flex size-11 shrink-0 items-center justify-center rounded-lg p-2 text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive/30 transition-colors"
                  aria-label={t("dashboardMissingDataAria", {
                    count: missingDataDays.length,
                  })}
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
                    {t("dashboardMissingDataTitle")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("empMissingPopoverBody", {
                      count: missingDataDays.length,
                    })}
                  </p>
                  <ul className="text-sm max-h-40 overflow-y-auto space-y-1">
                    {missingDataDays
                      .slice(0, 15)
                      .map((d) => (
                        <li key={d.date}>{dateDisplay(d.date)}</li>
                      ))}
                    {missingDataDays.length > 15 && (
                      <li className="text-muted-foreground">
                        {t("dashboardMissingMore", {
                          n: missingDataDays.length - 15,
                        })}
                      </li>
                    )}
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {!isProductionEmp && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5 xl:flex-1 xl:min-w-0 animate-fade-in animate-stagger-1">
          <Card className="p-5 sm:p-6">
            <CardHeader className="p-0 pb-2">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("labelShift")}
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
                  <SelectValue placeholder={t("empSelectShiftPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t("empNoShift")}</SelectItem>
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
                <CalendarDays className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("employeesColSundayCat")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Select
                value={(employee.sundayCategoryId as string) ?? "_default"}
                onValueChange={async (v) => {
                  const sundayCategoryId = v === "_default" ? undefined : v;
                  const updated = { ...employee, sundayCategoryId };
                  await saveEmployee(updated);
                  setEmployee(updated);
                }}
              >
                <SelectTrigger id="emp-sunday-category" className="w-full min-h-10">
                  <SelectValue placeholder={t("employeesSundayDefault")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_default">{t("employeesSundayDefault")}</SelectItem>
                  {sundayCategories.map((c) => (
                    <SelectItem key={c.id as string} value={c.id as string}>
                      {c.name as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          {!hideOperatorRates && (
          <Card className="p-5 sm:p-6">
            <CardHeader className="p-0 pb-2">
              <div className="flex items-center gap-2">
                <IndianRupee className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("empMonthlySalary")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <NumberInput
                id="emp-monthly-salary"
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
          )}
          {!hideOperatorRates && (
          <Card className="p-5 sm:p-6">
            <CardHeader className="p-0 pb-2">
              <div className="flex items-center gap-2">
                <IndianRupee className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("empDailyRate")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-xl font-bold font-heading text-foreground">
                {currency(ratePerDay)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("empDailyRateHint", {
                  calendarDays: calendarDaysInMonth,
                  workingDays,
                  month: calendarMonthTitle,
                })}
              </p>
            </CardContent>
          </Card>
          )}
          {!hideOperatorRates && (
          <Card className="p-5 sm:p-6">
            <CardHeader className="p-0 pb-2">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("empHourlyRate")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-xl font-bold font-heading text-foreground">
                {currency(ratePerHour)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("empShiftHoursLabel", { hours: hoursPerDay })}
              </p>
            </CardContent>
          </Card>
          )}
        </div>
        )}

        {isOperatorEmp && admin && (
          <Card className="p-5 sm:p-6 animate-fade-in animate-stagger-1">
            <CardHeader className="p-0 pb-2">
              <CardTitle className="text-base font-semibold font-heading">
                {t("empOperatorSettingsTitle")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("empOperatorSettingsDesc")}
              </p>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="emp-required-present-days">
                    {t("empRequiredPresentDays")}
                  </Label>
                  <NumberInput
                    id="emp-required-present-days"
                    min={1}
                    value={(employee.requiredPresentDays as number) ?? 26}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10) || 26;
                      setEmployee({ ...employee, requiredPresentDays: v });
                    }}
                    onBlur={async (e) => {
                      const v =
                        parseInt((e.target as HTMLInputElement).value, 10) ||
                        26;
                      const updated = { ...employee, requiredPresentDays: v };
                      await saveEmployee(updated);
                      setEmployee(updated);
                    }}
                    className="w-40 min-h-10"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="emp-sunday-multiplier">
                    {t("empSundayMultiplier")}
                  </Label>
                  <NumberInput
                    id="emp-sunday-multiplier"
                    decimal
                    min={1}
                    value={(employee.sundayMultiplier as number) ?? 1.2}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 1.2;
                      setEmployee({ ...employee, sundayMultiplier: v });
                    }}
                    onBlur={async (e) => {
                      const v =
                        parseFloat((e.target as HTMLInputElement).value) ||
                        1.2;
                      const updated = { ...employee, sundayMultiplier: v };
                      await saveEmployee(updated);
                      setEmployee(updated);
                    }}
                    className="w-40 min-h-10"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col xl:flex-row gap-4 xl:items-stretch animate-fade-in animate-stagger-2">
          <div className="min-w-0 xl:shrink-0 xl:min-w-[350px] xl:w-[350px]">
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
                const p = getPeriodForDate(date, locale);
                setFrom(p.from);
                setTo(p.to);
              }}
              onDateDoubleClick={async (date) => {
                const existing = calendarAttendance.find(
                  (a) => (a.date as string) === date,
                );
                if (existing?.status === "present" && existing?.id) {
                  await deleteAttendance(existing.id as string);
                } else {
                  await saveAttendance({
                    ...(existing?.id ? { id: existing.id as string } : {}),
                    employeeId: id,
                    date,
                    status: "present",
                  });
                }
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
                toast.success(
                  existing?.status === "present"
                    ? t("empToastClearedPresent", {
                        date: dateDisplay(date),
                      })
                    : t("empToastMarkedPresent", {
                        date: dateDisplay(date),
                      }),
                );
              }}
              periodFrom={from || ""}
              periodTo={to || ""}
              periodStatusLabel={currentPeriodLabel}
              periodAdjusted={salarySheetRowHasAdjustment(salarySheetRowForPeriod)}
              onPeriodBadgeClick={openPayrollAdjust}
              periodBadgeLoading={salarySheetRowLoading}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 min-w-0 xl:min-w-[280px]">
            <Card className="p-3 flex flex-col min-h-0 min-w-0">
              <CardHeader className="p-0 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <UserCheck className="size-3.5 text-primary shrink-0" />
                  {t("empAttendanceCardTitle", { month: calendarMonthTitle })}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pt-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="rounded-lg border bg-muted/40 px-2 py-1.5 text-xs">
                    <p className="text-muted-foreground text-[10px] font-medium">
                      {t("empLegendPresent")}
                    </p>
                    <p className="font-bold tabular-nums text-foreground text-sm">
                      {daysPresent}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-2 py-1.5 text-xs">
                    <p className="text-muted-foreground text-[10px] font-medium">
                      {t("empLegendAbsent")}
                    </p>
                    <p className="font-bold tabular-nums text-foreground text-sm">
                      {daysAbsent}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-2 py-1.5 text-xs">
                    <p className="text-muted-foreground text-[10px] font-medium">
                      {t("empEarnedSundayShort")}
                    </p>
                    <p className="font-bold tabular-nums text-foreground text-sm">
                      {earnedSundayPayDays} / {sundayPresentBonusDays}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 px-2 py-1.5 text-xs">
                    <p className="text-muted-foreground text-[10px] font-medium">
                      {t("empPaidDaysShort")}
                    </p>
                    <p className="font-bold tabular-nums text-foreground text-sm">
                      {totalPaidDays}
                    </p>
                  </div>
                  {!hideOperatorRates && (
                  <div className="col-span-2 rounded-lg border-2 border-primary/30 bg-primary/10 px-2 py-2">
                    <p className="text-muted-foreground text-[10px] font-medium">
                      {t("salarySheetColSalary")}
                    </p>
                    <p className="text-base font-bold tabular-nums text-foreground">
                      {currency(calculatedSalary)}
                    </p>
                  </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <Card className="p-3 min-w-0">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3.5 text-primary shrink-0" />
                    {t("empPeriodHours")}
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {from && to
                      ? `${dateDisplay(from)} – ${dateDisplay(to)}`
                      : t("empSelectPeriod")}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(periodHours)}h
                  </p>
                  {!hideOperatorRates && (
                  <p className="text-xs text-muted-foreground">
                    {currency(periodHours * ratePerHour)}
                  </p>
                  )}
                </CardContent>
              </Card>
              <Card className="p-3 min-w-0">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Package className="size-3.5 text-primary shrink-0" />
                    {t("empPeriodProduction")}
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {from && to
                      ? `${dateDisplay(from)} – ${dateDisplay(to)}`
                      : t("empSelectPeriod")}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(periodProdQty)}
                  </p>
                  {!hideOperatorRates && (
                  <p className="text-xs text-muted-foreground">
                    {currency(periodProdValue)}
                  </p>
                  )}
                </CardContent>
              </Card>
              <Card className="p-3 min-w-0">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3.5 text-primary shrink-0" />
                    {t("empMonthlyHours")}
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground">
                    {calendarMonthTitle}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(monthHours)}h
                  </p>
                  {!hideOperatorRates && (
                  <p className="text-xs text-muted-foreground">
                    {currency(monthHours * ratePerHour)}
                  </p>
                  )}
                </CardContent>
              </Card>
              <Card className="p-3 min-w-0">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <LayoutGrid className="size-3.5 text-primary shrink-0" />
                    {t("empMonthlyProduction")}
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground">
                    {calendarMonthTitle}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(monthProdQty)}
                  </p>
                  {!hideOperatorRates && (
                  <p className="text-xs text-muted-foreground">
                    {currency(monthProdValue)}
                  </p>
                  )}
                </CardContent>
              </Card>
            </div>
            <Card className="p-3 flex flex-col min-h-0 min-w-0">
              <CardHeader className="p-0 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="size-3.5 text-primary shrink-0" />
                  {selectedDate
                    ? t("empAttendanceDateTitle", {
                        date: dateDisplay(selectedDate),
                      })
                    : t("empSelectDateShort")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 mt-2">
                {!selectedDate ? (
                  <p className="text-sm text-muted-foreground">
                    {t("empClickDateForAttendance")}
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
                          toast.success(
                            t("empToastMarkedPresent", {
                              date: selectedDate
                                ? dateDisplay(selectedDate)
                                : t("empThisDate"),
                            }),
                          );
                        }}
                      >
                        <Check data-icon="inline-start" />
                        {t("empBtnPresent")}
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
                          toast.success(
                            t("empToastMarkedAbsent", {
                              date: selectedDate
                                ? dateDisplay(selectedDate)
                                : t("empThisDate"),
                            }),
                          );
                        }}
                      >
                        <X data-icon="inline-start" />
                        {t("empBtnAbsent")}
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
                              {t("commonClear")}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("empClearAttendanceTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("empClearAttendanceDesc", {
                                  date: selectedDate
                                    ? dateDisplay(selectedDate)
                                    : t("empThisDate"),
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t("commonCancel")}
                              </AlertDialogCancel>
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
                                    toast.success(
                                      t("empToastAttendanceCleared", {
                                        date: selectedDate
                                          ? dateDisplay(selectedDate)
                                          : t("empThisDate"),
                                      }),
                                    );
                                  } catch {
                                    toast.error(
                                      t("empToastAttendanceClearFailed"),
                                    );
                                  }
                                }}
                              >
                                {t("commonClear")}
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
                          {t("empAdjustHoursDayTitle")}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label
                              htmlFor="hours-reduced"
                              className="text-sm text-muted-foreground"
                            >
                              {t("empHoursLessLabel")}
                            </Label>
                            <NumberInput
                              id="hours-reduced"
                              decimal
                              min={0}
                              max={24}
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
                              {t("empHoursExtraShortLabel")}
                            </Label>
                            <NumberInput
                              id="hours-extra"
                              decimal
                              min={0}
                              max={24}
                              placeholder="0"
                              className="h-10 w-full text-base tabular-nums"
                              value={hoursExtraInput}
                              onChange={(e) =>
                                setHoursExtraInput(e.target.value)
                              }
                            />
                          </div>
                        </div>
                        {!hideOperatorRates && (
                        <p className="text-xs text-muted-foreground">
                          {t("empRatePerHourLine", {
                            rate: currency(ratePerHour),
                          })}
                        </p>
                        )}
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
                                toast.success(t("empToastHoursUpdated"));
                              }}
                            >
                              {t("empSaveHours")}
                            </Button>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid min-w-0 grid-cols-2 gap-2">
              <Card className="p-3 min-w-0">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3.5 text-primary shrink-0" />
                    {t("empDayHours")}
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {selectedDate ? dateDisplay(selectedDate) : t("empSelectDateShort")}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(dayHours)}h
                  </p>
                  {!hideOperatorRates && (
                  <p className="text-xs text-muted-foreground">
                    {currency(dayHours * ratePerHour)}
                  </p>
                  )}
                </CardContent>
              </Card>
              <Card className="p-3 min-w-0">
                <CardHeader className="p-0 pb-1 shrink-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Package className="size-3.5 text-primary shrink-0" />
                    {t("empDayProduction")}
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {selectedDate ? dateDisplay(selectedDate) : t("empSelectDateShort")}
                  </p>
                </CardHeader>
                <CardContent className="p-0 pt-1">
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {number(dayProdQty)}
                  </p>
                  {!hideOperatorRates && (
                  <p className="text-xs text-muted-foreground">
                    {currency(dayProdValue)}
                  </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {!isProductionEmp && (
        <>
        <Card className="p-6 sm:p-8 transition-all duration-300 ease-out animate-fade-in animate-stagger-3">
          <CardHeader className="p-0 mb-4 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
                <FileSpreadsheet className="size-5 text-primary shrink-0" />
                {t("empMonthlyAttendancePrint")}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                {t("empMonthlyAttendancePrintDesc")}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3 shrink-0">
              <div className="flex flex-col gap-2">
                <Label htmlFor="month-sheet-month">{t("labelMonth")}</Label>
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
                {t("empPrintMonthlyAttendance")}
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card className="p-6 sm:p-8 transition-all duration-300 ease-out animate-fade-in animate-stagger-4">
          <CardHeader className="p-0 mb-5">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl font-semibold font-heading">
                    {t("empSalaryAttendanceRange")}
                  </CardTitle>
                  {currentPeriodLabel ? (
                    <PayrollPeriodBadge
                      label={salaryRangeLabel}
                      adjusted={
                        salarySheetRowHasAdjustment(salarySheetRowForSalaryRange)
                      }
                      loading={salaryRangeRowLoading}
                      onClick={openSalaryRangeAdjust}
                    />
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  {t("empSalaryAttendanceRangeDesc")}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3 shrink-0">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="attendance-salary-month">{t("labelMonth")}</Label>
                  <Select
                    value={`${calYear}-${calMonth}`}
                    onValueChange={(v) => {
                      const [y, m] = v.split("-").map(Number);
                      setCalYear(y);
                      setCalMonth(m);
                    }}
                  >
                    <SelectTrigger
                      id="attendance-salary-month"
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
                <div className="flex flex-col gap-2">
                  <Label htmlFor="attendance-salary-range-mode">
                    {t("empSalaryRangeBoxRange")}
                  </Label>
                  <Select
                    value={salaryRangeMode}
                    onValueChange={(value) =>
                      setSalaryRangeMode(value as MonthRangeMode)
                    }
                  >
                    <SelectTrigger
                      id="attendance-salary-range-mode"
                      className="min-w-[180px] min-h-12"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-month">
                        {t("empSalaryRangeFullMonth")}
                      </SelectItem>
                      <SelectItem value="first-half">
                        {t("empSalaryRangeFirstHalf")}
                      </SelectItem>
                      <SelectItem value="second-half">
                        {t("empSalaryRangeSecondHalf", {
                          lastDay: new Date(calYear, calMonth + 1, 0).getDate(),
                        })}
                      </SelectItem>
                      <SelectItem value="custom">
                        {t("empSalaryRangeCustom")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {salaryRangeMode === "custom" && (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="attendance-salary-from">
                        {t("labelFrom")}
                      </Label>
                      <DatePicker
                        id="attendance-salary-from"
                        value={salaryRange.from}
                        onChange={handleSalaryCustomFromChange}
                        min={monthBounds.from}
                        max={monthBounds.to}
                        className="min-w-[180px] min-h-12"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="attendance-salary-to">{t("labelTo")}</Label>
                      <DatePicker
                        id="attendance-salary-to"
                        value={salaryRange.to}
                        onChange={handleSalaryCustomToChange}
                        min={monthBounds.from}
                        max={monthBounds.to}
                        className="min-w-[180px] min-h-12"
                      />
                    </div>
                  </>
                )}
                <Button
                  type="button"
                  className="min-h-12 px-6"
                  onClick={async () => {
                    const ym = getYearMonthFromIsoDate(salaryRange.from);
                    if (!ym) {
                      toast.error(t("empPayrollToastLoadFailed"));
                      return;
                    }
                    const html = await getPrintableAttendanceSalaryRangeHtml(
                      id,
                      ym.year,
                      ym.month,
                      salaryRange.from,
                      salaryRange.to,
                    );
                    await printHtml(html);
                  }}
                >
                  <Printer data-icon="inline-start" className="size-4" />
                  {t("empPrintAttendanceSalary")}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("empSalaryRangeBoxRange")}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {salaryRangeLabel}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {dateDisplay(salaryRange.from)} – {dateDisplay(salaryRange.to)}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("empPresentAbsent")}
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                  {number(effectiveSalaryRangeSummary.presentDays)} / {number(effectiveSalaryRangeSummary.absentDays)}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("empEarnedSundayShort")}
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                  {number(effectiveSalaryRangeSummary.earnedSundayPayDays)} / {number(effectiveSalaryRangeSummary.sundayPresentBonusDays)}
                </p>
              </div>
              {!hideOperatorRates && (
              <div className="rounded-xl border-2 border-primary/25 bg-primary/10 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("empSalaryContribution")}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                  {currency(effectiveSalaryRangeSummary.calculatedSalary)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("empPaidDaysHoursSummary", {
                    paid: number(effectiveSalaryRangeSummary.totalPaidDays),
                    extra: number(effectiveSalaryRangeSummary.hoursExtraTotal),
                    reduced: number(effectiveSalaryRangeSummary.hoursReducedTotal),
                  })}
                </p>
              </div>
              )}
            </div>
          </CardContent>
        </Card>
        </>
        )}

        {isProductionEmp && (
        <Card className="p-6 sm:p-8 transition-all duration-300 ease-out animate-fade-in animate-stagger-4">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading">
              {t("empProductionAdvancesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="salary-period">{t("reportsPeriod")}</Label>
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
                        {getPeriodForDate(p.from, locale).label}
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
                <Printer data-icon="inline-start" className="size-4" />
                {t("empPrintProductionAdvances")}
              </Button>
            </div>
            {salary && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end mt-6">
                <div className="flex flex-col gap-2">
                  <Label>{t("colGross")}</Label>
                  <p className="text-base text-foreground font-medium">
                    {currency(salary.gross)}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("colAdvanceToCut")}</Label>
                  <p className="text-base text-foreground font-medium">
                    {currency(advanceToCutInput)}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("colNet")}</Label>
                  <p className="text-base text-foreground font-medium">
                    {currency(Math.max(0, salary.gross - advanceToCutInput))}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        <Card className="p-6 sm:p-8 transition-all duration-300 ease-out animate-fade-in animate-stagger-5">
          <CardHeader className="p-0 mb-4">
            <CardTitle className="text-xl font-semibold font-heading">
              {t("empSettlementTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t("empSettlementDesc")}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {salary ? (
              <div className="space-y-4 max-w-xl">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">
                    {t("empTotalMakingGross")}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {currency(salary.gross)}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">
                    {t("empTotalAdvancePaidAllTime")}
                  </span>
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
                  <Label htmlFor="advance-to-cut">
                    {t("empAdvanceToCutThisPeriod")}
                  </Label>
                  <NumberInput
                    id="advance-to-cut"
                    min={0}
                    className="w-full max-w-[200px] min-h-12"
                    value={advanceToCutInput}
                    onChange={(e) =>
                      setAdvanceToCutInput(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
                <Separator className="my-4" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{t("empNetThisPeriod")}</span>
                  <span className="font-bold text-lg tabular-nums">
                    {currency(Math.max(0, salary.gross - advanceToCutInput))}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">
                    {t("empAdvanceLeftAfter")}
                  </span>
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
                      toast.error(t("empToastSettlementFailed"));
                      return;
                    }
                    const updatedDeductions = await getDeductionsByEmployee(id);
                    setDeductions(updatedDeductions);
                    setSalary({
                      ...salary,
                      advanceToCut: advanceToCutInput,
                      final: Math.max(0, salary.gross - advanceToCutInput),
                    });
                    toast.success(t("empToastSettlementSaved"));
                  }}
                >
                  {t("empSavePeriodSettlement")}
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

        {admin && storedSalaryRecords.length > 0 && (
          <Card className="p-6 sm:p-8">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-xl font-semibold font-heading">
                {t("empStoredSalaryRecords")}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {t("empStoredSalaryRecordsDesc")}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("empTableMonth")}</TableHead>
                    <TableHead>{t("labelShift")}</TableHead>
                    <TableHead className="text-right">
                      {t("salarySheetColSalary")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("empTableAmount")}
                    </TableHead>
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

        {isProductionEmp && (
        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading">
              {t("empAddProduction")}
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
                  toast.error(t("empToastProdHolidayBlock"));
                  return;
                }
                let missingParts = "";
                try {
                  // saveProductionEntry, never the raw saveProduction: writing
                  // work down here has to draw the material out of stock too,
                  // exactly as the production screen does. Two entry paths that
                  // disagree about stock is the bug this replaces.
                  const { inventory } = await saveProductionEntry({
                    employeeId: id,
                    itemId: prodItem,
                    date: prodDate,
                    quantity: prodQty,
                    shift: prodShift,
                  });
                  if (inventory && inventory.missing.length > 0) {
                    missingParts = describeMissingComponents(
                      inventory.missing,
                      t,
                    );
                  }
                } catch {
                  toast.error(t("empToastProdAddFail"));
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
                toast.success(t("empToastProdAdded"));
                if (missingParts) {
                  toast.warning(t("invSvcNotDeducted", { parts: missingParts }), {
                    duration: 10000,
                  });
                }
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-item">{t("reportsColPackagingGroup")}</Label>
                <Select value={prodItem} onValueChange={setProdItem}>
                  <SelectTrigger id="prod-item" className="w-56 min-h-12">
                    <SelectValue placeholder={t("selectPlaceholder")} />
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
                <Label htmlFor="prod-shift">{t("labelShift")}</Label>
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
                    <SelectItem value="day">{t("shiftDay")}</SelectItem>
                    <SelectItem value="night">{t("shiftNight")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-qty">{t("labelQty")}</Label>
                <NumberInput
                  id="prod-qty"
                  min={1}
                  value={prodQty}
                  onChange={(e) =>
                    setProdQty(parseInt(e.target.value, 10) || 1)
                  }
                  className="w-24 min-h-12"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-date">{t("labelDate")}</Label>
                <DatePicker
                  id="prod-date"
                  value={prodDate}
                  onChange={setProdDate}
                  className="min-w-[180px] min-h-12"
                />
              </div>
              <Button type="submit" className="min-h-12 px-6">
                {t("add")}
              </Button>
            </form>
          </CardContent>
        </Card>
        )}

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading">
              {t("empAddAdvance")}
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
                  toast.error(t("empToastAdvanceAddFail"));
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
                toast.success(t("empToastAdvanceAdded"));
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="adv-amount">{t("empAmountRupee")}</Label>
                <NumberInput
                  id="adv-amount"
                  min={0}
                  value={advAmount}
                  onChange={(e) =>
                    setAdvAmount(parseFloat(e.target.value) || 0)
                  }
                  className="w-36 min-w-[120px] min-h-12"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="adv-date">{t("labelDate")}</Label>
                <DatePicker
                  id="adv-date"
                  value={advDate}
                  onChange={setAdvDate}
                  className="min-w-[180px] min-h-12"
                />
              </div>
              <Button type="submit" className="min-h-12 px-6">
                {t("empAddAdvance")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {isProductionEmp && (
        <Dialog open={productionsModalOpen} onOpenChange={setProductionsModalOpen}>
          <DialogTrigger asChild>
            <Card className="p-6 sm:p-8 cursor-pointer transition-all duration-200 ease-out hover:ring-2 hover:ring-primary/20 focus-within:ring-2 focus-within:ring-primary/20 focus:outline-none">
              <CardContent className="p-0 flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <Package className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("empProductionEntries")}
                    </p>
                    <p className="text-2xl font-bold tabular-nums">
                      {t("empThisPeriodCount", { count: productions.length })}
                    </p>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">
                  {t("empViewDetailsArrow")}
                </span>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[var(--dialog-max-h)] flex flex-col">
            <DialogHeader>
              <DialogTitle>{t("empProdDialogTitle")}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {productions.length === 0 ? (
                <Empty className="py-10 border-0 animate-fade-in">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Package className="size-6 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>{t("empNoProductionPeriod")}</EmptyTitle>
                    <EmptyDescription>
                      {t("empNoProductionPeriodDesc")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("labelDate")}</TableHead>
                      <TableHead>{t("reportsColPackagingGroup")}</TableHead>
                      <TableHead>{t("labelShift")}</TableHead>
                      <TableHead className="text-right">{t("labelQty")}</TableHead>
                      <TableHead className="text-right">{t("colValue")}</TableHead>
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
                            {p.shift === "night"
                              ? t("shiftNight")
                              : t("shiftDay")}
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
                                  className="size-11 p-0 text-destructive hover:text-destructive"
                                >
                                  <X className="size-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {t("empDeleteProductionTitle")}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t("empDeleteProductionDesc", {
                                      date: dateDisplay(p.date as string),
                                    })}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    {t("commonCancel")}
                                  </AlertDialogCancel>
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
                                        toast.success(t("empToastProdDeleted"));
                                      } catch {
                                        toast.error(t("empToastProdDeleteFail"));
                                      }
                                    }}
                                  >
                                    {t("commonDelete")}
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
        )}

        <Dialog open={advancesModalOpen} onOpenChange={setAdvancesModalOpen}>
          <DialogTrigger asChild>
            <Card className="p-6 sm:p-8 cursor-pointer transition-all duration-200 ease-out hover:ring-2 hover:ring-primary/20 focus-within:ring-2 focus-within:ring-primary/20 focus:outline-none">
              <CardContent className="p-0 flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <Wallet className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("empTotalAdvancesPaid")}
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
                <span className="text-sm text-muted-foreground">
                  {t("empViewDetailsArrow")}
                </span>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("empAdvancesSettlementsTitle")}</DialogTitle>
            </DialogHeader>
            <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
              <button
                type="button"
                className={`min-h-[44px] min-w-0 flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  advancesModalTab === "advances"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setAdvancesModalTab("advances")}
              >
                {t("empTabAdvances")}
              </button>
              <button
                type="button"
                className={`min-h-[44px] min-w-0 flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  advancesModalTab === "settlements"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setAdvancesModalTab("settlements")}
              >
                {t("empTabSettlements")}
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
                      <EmptyTitle>{t("empNoAdvancesYet")}</EmptyTitle>
                      <EmptyDescription>
                        {t("empNoAdvancesDesc")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("labelDate")}</TableHead>
                        <TableHead className="text-right">
                          {t("empTableAmount")}
                        </TableHead>
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
                                    className="size-11 p-0 text-destructive hover:text-destructive"
                                  >
                                    <X className="size-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      {t("empDeleteAdvanceTitle")}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t("empDeleteAdvanceDesc", {
                                        amount: currency(
                                          (a.amount as number) ?? 0,
                                        ),
                                        date: dateDisplay(a.date as string),
                                      })}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                    {t("commonCancel")}
                                  </AlertDialogCancel>
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
                                          toast.success(t("empToastAdvanceDeleted"));
                                        } catch {
                                          toast.error(t("empToastAdvanceDeleteFail"));
                                        }
                                      }}
                                    >
                                      {t("commonDelete")}
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
                      <EmptyTitle>{t("empNoSettlementsYet")}</EmptyTitle>
                      <EmptyDescription>
                        {t("empNoSettlementsDesc")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("reportsPeriod")}</TableHead>
                        <TableHead className="text-right">
                          {t("empTableDeducted")}
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
        <SalarySheetAdjustDialog
          open={payrollAdjustOpen}
          onOpenChange={setPayrollAdjustOpen}
          row={salarySheetRowForPeriod}
          year={payrollSheetYearMonth?.year ?? calYear}
          month={payrollSheetYearMonth?.month ?? calMonth}
          periodFrom={from}
          periodTo={to}
          onSaved={async () => {
            const ym = from ? getYearMonthFromIsoDate(from) : null;
            if (!ym || !from || !to) return;
            const row = await getSalarySheetRowForEmployee(
              id,
              ym.year,
              ym.month,
              from,
              to,
            );
            setSalarySheetRowForPeriod(row);
          }}
        />
        <SalarySheetAdjustDialog
          open={salaryRangeAdjustOpen}
          onOpenChange={setSalaryRangeAdjustOpen}
          row={salarySheetRowForSalaryRange}
          year={salaryRangeSheetYearMonth?.year ?? calYear}
          month={salaryRangeSheetYearMonth?.month ?? calMonth}
          periodFrom={resolvedSalaryRange.from}
          periodTo={resolvedSalaryRange.to}
          onSaved={async () => {
            const ym = getYearMonthFromIsoDate(resolvedSalaryRange.from);
            if (!ym) return;
            const row = await getSalarySheetRowForEmployee(
              id,
              ym.year,
              ym.month,
              resolvedSalaryRange.from,
              resolvedSalaryRange.to,
            );
            setSalarySheetRowForSalaryRange(row);
          }}
        />
      </main>
    </AppShell>
  );
}
