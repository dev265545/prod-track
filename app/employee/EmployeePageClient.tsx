"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, LayoutGrid, Package, UserCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeCalendar } from "@/components/employee-calendar";
import { SalarySheetAdjustDialog } from "@/components/salary-sheet-adjust-dialog";
import { useLanguage } from "@/components/language-provider";
import { describeMissingComponents } from "@/components/inventory/forms/produce-form";

import { AddAdvanceForm } from "@/components/employee/add-advance-form";
import {
  AddProductionForm,
  type ProductionDraft,
} from "@/components/employee/add-production-form";
import { AdvancesDialog } from "@/components/employee/advances-dialog";
import { DayAttendanceCard } from "@/components/employee/day-attendance-card";
import { EmployeePageHeader } from "@/components/employee/employee-page-header";
import {
  MonthAttendanceCard,
  StatTile,
  hoursTileValue,
  moneyCaption,
} from "@/components/employee/employee-stat-tiles";
import { MissingDataPopover } from "@/components/employee/missing-data-popover";
import { MonthlyAttendancePrintCard } from "@/components/employee/monthly-attendance-print-card";
import { OperatorSettingsCard } from "@/components/employee/operator-settings-card";
import { PaySettingsCards } from "@/components/employee/pay-settings-cards";
import { ProductionAdvancesCard } from "@/components/employee/production-advances-card";
import { ProductionsDialog } from "@/components/employee/productions-dialog";
import { SalaryRangeCard } from "@/components/employee/salary-range-card";
import { SettlementCard } from "@/components/employee/settlement-card";
import { StoredSalaryRecordsCard } from "@/components/employee/stored-salary-records-card";

import { isAdmin } from "@/lib/auth";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { getEmployee, saveEmployee } from "@/lib/services/employeeService";
import {
  getProductionsByEmployee,
  deleteProduction,
} from "@/lib/services/productionService";
import { saveProductionEntry } from "@/lib/services/productionEntryService";
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
import { getSalaryRecordsByEmployee } from "@/lib/services/salaryRecordService";
import {
  getSalarySheetRowForEmployee,
  salarySheetRowHasAdjustment,
  type SalarySheetRow,
} from "@/lib/services/salarySheetService";
import {
  calculateSalary,
  getPrintableAttendanceSalaryRangeHtml,
  getPrintableSalaryHtml,
  getPrintableMonthlyAttendanceSheetHtml,
} from "@/lib/services/salaryService";
import {
  getHolidayByDate,
  getHolidaysInRange,
} from "@/lib/services/factoryHolidayService";
import {
  getAttendanceByEmployeeInRange,
  saveAttendance,
  deleteAttendance,
} from "@/lib/services/attendanceService";
import { printHtml } from "@/lib/utils/print";
import {
  getWorkingDaysInMonth,
  getCalendarDaysInMonth,
  getRatePerDay,
  getRatePerHour,
} from "@/lib/utils/salaryRates";
import {
  buildAttendanceSalarySummaryForRange,
  computeAttendanceStats,
  computeHoursInRange,
} from "@/lib/utils/attendanceStats";
import { salarySheetRowToAttendanceSummary } from "@/lib/utils/salarySheetDayDisplay";
import {
  getMonthRange,
  getMonthRangeLabel,
  getPeriodForDate,
  getPeriodsWithData,
  getYearMonthFromIsoDate,
  today,
  isRestrictedForEntry,
  formatMonthYear,
  type MonthRangeMode,
} from "@/lib/utils/date";
import { getMissingDataDays } from "@/lib/utils/missingDataWarnings";
import { dateDisplay, number } from "@/lib/utils/formatter";
import {
  adjustCustomRange,
  computeDayHours,
  findAttendanceForDate,
  getEmployeeSections,
  getMonthIsoBounds,
  indexById,
  monthPickerOptions,
  parseHoursInput,
  pickInitialPeriod,
  resolveEmployeeType,
  resolveHoursInputs,
  resolveSalaryRange,
  salarySheetRequestKey,
  sumAdvances,
  sumProductionValue,
  sumQuantity,
  type HoursDraft,
  type Row,
} from "@/lib/utils/employeeDetail";

const NO_ROWS: Row[] = [];
const NO_DATES: string[] = [];

/** One month's calendar data, tagged with the month it was loaded for. */
type CalendarMonthData = {
  key: string;
  holidays: string[];
  productions: Row[];
  attendance: Row[];
};

/** A salary-sheet row request; two badges often want the very same one. */
type SheetRequest = {
  key: string;
  employeeId: string;
  year: number;
  month: number;
  from: string;
  to: string;
};

export function EmployeePageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale, t } = useLanguage();
  /** Static export: real IDs are passed via ?id= (only /employee is pre-rendered). */
  const id = searchParams?.get("id") ?? "";
  const { ready: guardReady } = useAuthGuard();

  const [dataLoaded, setDataLoaded] = useState(false);
  const [employee, setEmployee] = useState<Row | null>(null);
  const [periods, setPeriods] = useState<
    { from: string; to: string; label: string }[]
  >([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [salary, setSalary] = useState<{ gross: number } | null>(null);
  const [productions, setProductions] = useState<Row[]>([]);
  const [allAdvances, setAllAdvances] = useState<Row[]>([]);
  const [deductions, setDeductions] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [shifts, setShifts] = useState<Row[]>([]);
  const [sundayCategories, setSundayCategories] = useState<SundayCategory[]>(
    [],
  );
  const [storedSalaryRecords, setStoredSalaryRecords] = useState<Row[]>([]);
  const [missingDataDays, setMissingDataDays] = useState<{ date: string }[]>(
    [],
  );
  const [periodAttendance, setPeriodAttendance] = useState<Row[]>([]);
  const [advanceToCutInput, setAdvanceToCutInput] = useState(0);
  const [advancesModalOpen, setAdvancesModalOpen] = useState(false);
  const [productionsModalOpen, setProductionsModalOpen] = useState(false);
  const [productionDraft, setProductionDraft] = useState<ProductionDraft>({
    itemId: "",
    shift: "day",
    quantity: 1,
    date: today(),
  });
  const [advAmount, setAdvAmount] = useState(0);
  const [advDate, setAdvDate] = useState(today());

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const monthKey = `${calYear}-${calMonth}`;
  const [calendarData, setCalendarData] = useState<CalendarMonthData | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(today());
  /** Typed hours, tagged with the day they were typed for. */
  const [hoursDraft, setHoursDraft] = useState<HoursDraft | null>(null);

  const [salaryRangeMode, setSalaryRangeMode] =
    useState<MonthRangeMode>("full-month");
  const [salaryCustomFrom, setSalaryCustomFrom] = useState("");
  const [salaryCustomTo, setSalaryCustomTo] = useState("");

  const [sheetRows, setSheetRows] = useState<
    Record<string, SalarySheetRow | null>
  >({});
  const [sheetVersion, setSheetVersion] = useState(0);
  const sheetFetched = useRef<Set<string>>(new Set());
  const sheetInFlight = useRef<Set<string>>(new Set());

  /** Ignores stale results when the calendar month changes before fetch completes. */
  const calendarLoadGen = useRef(0);
  /** Ignores stale missing-data results so the last edit wins, not the last reply. */
  const missingDataGen = useRef(0);

  const ready = guardReady && dataLoaded;
  const admin = isAdmin();

  // ---------------------------------------------------------------- loading

  useEffect(() => {
    if (!id) {
      router.replace("/employees");
      return;
    }
    if (!guardReady) return;
    let cancelled = false;
    const run = async () => {
      const emp = await getEmployee(id);
      if (cancelled) return;
      if (!emp) {
        setEmployee(null);
        setDataLoaded(true);
        return;
      }
      const [
        allProds,
        allAdvs,
        itemsList,
        salaryRecs,
        shiftList,
        deductionsList,
        sundayCategoryList,
      ] = await Promise.all([
        getProductionsByEmployee(id, "2000-01-01", "2100-12-31"),
        getAdvancesByEmployee(id, "2000-01-01", "2100-12-31"),
        getItems(),
        getSalaryRecordsByEmployee(id),
        getShifts(),
        getDeductionsByEmployee(id),
        getSundayCategories(),
      ]);
      if (cancelled) return;
      const initial = pickInitialPeriod(
        getPeriodsWithData([...allProds, ...allAdvs], 24, locale),
        getPeriodForDate(today(), locale),
      );
      setEmployee(emp);
      setItems(itemsList);
      setStoredSalaryRecords(salaryRecs);
      setShifts(shiftList);
      setSundayCategories(sundayCategoryList);
      setAllAdvances(allAdvs);
      setDeductions(deductionsList);
      setPeriods(initial.periods);
      setFrom(initial.from);
      setTo(initial.to);
      setDataLoaded(true);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [router, id, locale, guardReady]);

  useEffect(() => {
    if (!id || !from || !to) return;
    let cancelled = false;
    void Promise.all([
      calculateSalary(id, from, to),
      getDeductionForPeriod(id, from, to),
      getProductionsByEmployee(id, from, to),
      getAttendanceByEmployeeInRange(id, from, to),
    ]).then(([s, ded, prods, periodAtt]) => {
      if (cancelled) return;
      setAdvanceToCutInput((ded?.amount as number) ?? 0);
      setSalary({ gross: s.gross });
      setProductions(prods);
      setPeriodAttendance(periodAtt);
    });
    return () => {
      cancelled = true;
    };
  }, [id, from, to]);

  const loadCalendarMonth = useCallback(async () => {
    if (!id) return;
    const gen = ++calendarLoadGen.current;
    const { monthStart, monthEnd } = getMonthIsoBounds(calYear, calMonth);
    const [holidays, prods, att] = await Promise.all([
      getHolidaysInRange(monthStart, monthEnd),
      getProductionsByEmployee(id, monthStart, monthEnd),
      getAttendanceByEmployeeInRange(id, monthStart, monthEnd),
    ]);
    if (gen !== calendarLoadGen.current) return;
    setCalendarData({
      key: `${calYear}-${calMonth}`,
      holidays: holidays.map((h) => h.date as string),
      productions: prods,
      attendance: att,
    });
  }, [id, calYear, calMonth]);

  useEffect(() => {
    void loadCalendarMonth();
  }, [loadCalendarMonth]);

  const employeeCreatedAt = (employee?.createdAt as string) || "";

  /**
   * Rechecks which days in the period have no data. Generation-guarded: a
   * slow earlier response can no longer overwrite a newer one.
   */
  const refreshMissingData = useCallback(() => {
    if (!id || !employee || !from || !to) return;
    const gen = ++missingDataGen.current;
    const start = employeeCreatedAt || from;
    void getHolidaysInRange(from, to)
      .then((holidays) =>
        getMissingDataDays(
          id,
          start,
          from,
          to,
          holidays.map((h) => h.date as string),
        ),
      )
      .then((days) => {
        if (gen === missingDataGen.current) setMissingDataDays(days);
      });
  }, [id, employee, employeeCreatedAt, from, to]);

  useEffect(() => {
    refreshMissingData();
  }, [refreshMissingData]);

  // ------------------------------------------------------- derived calendar

  const monthLoaded = calendarData?.key === monthKey;
  const factoryHolidays = monthLoaded ? calendarData.holidays : NO_DATES;
  const calendarProductions = monthLoaded ? calendarData.productions : NO_ROWS;
  const calendarAttendance = monthLoaded ? calendarData.attendance : NO_ROWS;

  const setMonthAttendance = useCallback((attendance: Row[]) => {
    setCalendarData((prev) => (prev ? { ...prev, attendance } : prev));
  }, []);

  // --------------------------------------------------------- derived values

  const employeeType = resolveEmployeeType(employee?.employeeType);
  const sections = getEmployeeSections(employeeType, {
    isAdmin: admin,
    hasStoredSalaryRecords: storedSalaryRecords.length > 0,
  });
  const hideRates = sections.hideRates;

  const itemMap = useMemo(() => indexById(items), [items]);
  const itemRate = useCallback(
    (itemId: string) => (itemMap[itemId]?.rate as number) || 0,
    [itemMap],
  );
  const shiftMap = useMemo(() => indexById(shifts), [shifts]);
  const sundayCategoryMap = useMemo(
    () => indexById(sundayCategories as unknown as Row[]),
    [sundayCategories],
  );

  const monthlySalary = (employee?.monthlySalary as number) ?? 0;
  const shiftId = employee?.shiftId as string | undefined;
  const selectedShift = shiftId ? shiftMap[shiftId] : null;
  const sundayCategoryId = employee?.sundayCategoryId as string | undefined;
  const selectedSundayCategory = sundayCategoryId
    ? ((sundayCategoryMap[sundayCategoryId] as unknown as SundayCategory) ??
      null)
    : null;
  const sundayCategoryRule = resolveSundayCategoryRule(selectedSundayCategory);
  const hoursPerDay = selectedShift
    ? ((selectedShift.hoursPerDay as number) ?? 8)
    : 8;
  const calendarDaysInMonth = getCalendarDaysInMonth(calYear, calMonth);
  const workingDays = getWorkingDaysInMonth(calYear, calMonth, factoryHolidays);
  const ratePerDay = getRatePerDay(monthlySalary, calendarDaysInMonth);
  const ratePerHour = getRatePerHour(
    monthlySalary,
    calendarDaysInMonth,
    hoursPerDay,
  );

  const monthOptions = useMemo(() => monthPickerOptions(36, locale), [locale]);
  const monthBounds = useMemo(
    () => getMonthRange(calYear, calMonth),
    [calYear, calMonth],
  );
  const salaryRange = useMemo(
    () =>
      resolveSalaryRange({
        year: calYear,
        month: calMonth,
        mode: salaryRangeMode,
        customFrom: salaryCustomFrom,
        customTo: salaryCustomTo,
        locale,
      }),
    [
      calYear,
      calMonth,
      salaryRangeMode,
      salaryCustomFrom,
      salaryCustomTo,
      locale,
    ],
  );

  const attendanceForStats = useMemo(
    () =>
      calendarAttendance.map((a) => ({
        date: a.date as string,
        status: a.status as string,
        hoursWorked: a.hoursWorked as number | undefined,
        hoursReduced: a.hoursReduced as number | undefined,
        hoursExtra: a.hoursExtra as number | undefined,
      })),
    [calendarAttendance],
  );

  const attendanceStats = computeAttendanceStats({
    year: calYear,
    month: calMonth,
    holidayDates: factoryHolidays,
    attendance: attendanceForStats,
    hoursPerDay,
    sundayCategoryRule,
  });
  const calculatedSalary =
    Math.round(attendanceStats.totalPaidDays * ratePerDay * 100) / 100;

  const salaryRangeSummary = buildAttendanceSalarySummaryForRange({
    fromDate: salaryRange.from,
    toDate: salaryRange.to,
    holidayDates: factoryHolidays,
    attendance: attendanceForStats,
    hoursPerDay,
    ratePerDay,
    sundayCategoryRule,
  });
  const calendarMonthTitle = formatMonthYear(
    `${calYear}-${String(calMonth + 1).padStart(2, "0")}-01`,
    locale,
  );
  const salaryRangeLabel =
    salaryRangeMode === "full-month"
      ? formatMonthYear(monthBounds.from, locale)
      : salaryRange.label;
  const currentPeriodLabel =
    from && to ? getMonthRangeLabel(from, to, locale) : "";

  const dayProductions = selectedDate
    ? calendarProductions.filter((p) => (p.date as string) === selectedDate)
    : NO_ROWS;
  const monthProdQty = sumQuantity(calendarProductions);
  const monthProdValue = sumProductionValue(calendarProductions, itemRate);
  const periodProdQty = sumQuantity(productions);
  const periodProdValue = sumProductionValue(productions, itemRate);
  const totalAdvancePaid = sumAdvances(allAdvances);

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

  const selectedRecord = findAttendanceForDate(
    calendarAttendance,
    selectedDate,
  );
  const dayHours = computeDayHours(selectedRecord, hoursPerDay);
  const hoursInputs = resolveHoursInputs(
    hoursDraft,
    selectedDate,
    selectedRecord,
  );

  // ------------------------------------------------------- salary sheet rows

  const periodRequest: SheetRequest | null = useMemo(() => {
    if (!id || !from || !to) return null;
    const ym = getYearMonthFromIsoDate(from);
    if (!ym) return null;
    return {
      key: salarySheetRequestKey(id, from, to),
      employeeId: id,
      year: ym.year,
      month: ym.month,
      from,
      to,
    };
  }, [id, from, to]);

  const rangeRequest: SheetRequest | null = useMemo(() => {
    // Production workers never see the range card, so never pay for its row.
    if (!sections.attendanceSalary) return null;
    if (!id || !salaryRange.from || !salaryRange.to) return null;
    const ym = getYearMonthFromIsoDate(salaryRange.from);
    if (!ym) return null;
    return {
      key: salarySheetRequestKey(id, salaryRange.from, salaryRange.to),
      employeeId: id,
      year: ym.year,
      month: ym.month,
      from: salaryRange.from,
      to: salaryRange.to,
    };
  }, [id, salaryRange.from, salaryRange.to, sections.attendanceSalary]);

  const periodRequestKey = periodRequest?.key ?? null;
  const rangeRequestKey = rangeRequest?.key ?? null;

  /**
   * Fetches each distinct salary-sheet row once. The two payroll badges
   * usually want the same range, and the service builds rows for every
   * employee on each call, so asking twice is expensive.
   */
  useEffect(() => {
    const requests = [periodRequest, rangeRequest].filter(
      (r): r is SheetRequest => r !== null,
    );
    const seen = new Set<string>();
    for (const req of requests) {
      if (seen.has(req.key)) continue;
      seen.add(req.key);
      if (sheetFetched.current.has(req.key)) continue;
      if (sheetInFlight.current.has(req.key)) continue;
      sheetInFlight.current.add(req.key);
      void getSalarySheetRowForEmployee(
        req.employeeId,
        req.year,
        req.month,
        req.from,
        req.to,
      )
        .then((row) => {
          sheetFetched.current.add(req.key);
          setSheetRows((prev) => ({ ...prev, [req.key]: row }));
        })
        .finally(() => {
          sheetInFlight.current.delete(req.key);
        });
    }
  }, [periodRequest, rangeRequest, sheetVersion]);

  /** Attendance and payroll edits make every cached sheet row stale. */
  const invalidateSheetRows = useCallback(() => {
    sheetFetched.current.clear();
    setSheetRows({});
    setSheetVersion((v) => v + 1);
  }, []);

  const periodSheetRow = periodRequestKey
    ? (sheetRows[periodRequestKey] ?? null)
    : null;
  const rangeSheetRow = rangeRequestKey
    ? (sheetRows[rangeRequestKey] ?? null)
    : null;
  const periodRowLoading = periodRequestKey
    ? !(periodRequestKey in sheetRows)
    : false;
  const rangeRowLoading = rangeRequestKey
    ? !(rangeRequestKey in sheetRows)
    : false;

  const effectiveSalaryRangeSummary = salarySheetRowHasAdjustment(rangeSheetRow)
    ? salarySheetRowToAttendanceSummary(
        rangeSheetRow,
        salaryRangeSummary.totalHoursWorked,
      )
    : salaryRangeSummary;

  // ------------------------------------------------------------ adjust dialogs

  const periodDialogKey = `${from}|${to}|${monthKey}`;
  const rangeDialogKey = `${salaryRange.from}|${salaryRange.to}|${monthKey}`;
  const [payrollAdjustKey, setPayrollAdjustKey] = useState<string | null>(null);
  const [rangeAdjustKey, setRangeAdjustKey] = useState<string | null>(null);
  /** Derived, so changing period or month closes the dialog without an effect. */
  const payrollAdjustOpen = payrollAdjustKey === periodDialogKey;
  const rangeAdjustOpen = rangeAdjustKey === rangeDialogKey;

  const openPayrollAdjust = () => {
    if (!from || !to) {
      toast.message(t("empPayrollToastSelectDate"));
      return;
    }
    if (!periodRequest) {
      toast.error(t("empPayrollToastLoadFailed"));
      return;
    }
    if (periodRowLoading) {
      toast.message(t("empPayrollToastLoading"));
      return;
    }
    if (!periodSheetRow) {
      toast.error(t("empPayrollToastLoadFailed"));
      return;
    }
    setPayrollAdjustKey(periodDialogKey);
  };

  const openRangeAdjust = () => {
    if (!salaryRange.from || !salaryRange.to) {
      toast.message(t("empPayrollToastSelectDate"));
      return;
    }
    if (!rangeRequest) {
      toast.error(t("empPayrollToastLoadFailed"));
      return;
    }
    if (rangeRowLoading) {
      toast.message(t("empPayrollToastLoading"));
      return;
    }
    if (!rangeSheetRow) {
      toast.error(t("empPayrollToastLoadFailed"));
      return;
    }
    setRangeAdjustKey(rangeDialogKey);
  };

  // ------------------------------------------------------------------ writes

  /**
   * Saves an employee field. On failure the old value is put back and the
   * user is told, so the screen can never show something the DB does not have.
   */
  const updateEmployee = useCallback(
    async (patch: Row) => {
      if (!employee) return;
      const previous = employee;
      const updated = { ...employee, ...patch };
      setEmployee(updated);
      try {
        await saveEmployee(updated);
      } catch {
        setEmployee(previous);
        toast.error(t("emp2SaveFailed"));
      }
    },
    [employee, t],
  );

  /** Local-only edit while typing; the blur handler persists it. */
  const draftEmployee = useCallback((patch: Row) => {
    setEmployee((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  /** Re-reads attendance for the calendar month and the selected period. */
  const refreshAttendance = useCallback(async () => {
    const { monthStart, monthEnd } = getMonthIsoBounds(calYear, calMonth);
    const [att, periodAtt] = await Promise.all([
      getAttendanceByEmployeeInRange(id, monthStart, monthEnd),
      from && to
        ? getAttendanceByEmployeeInRange(id, from, to)
        : Promise.resolve([] as Row[]),
    ]);
    setMonthAttendance(att);
    if (from && to) setPeriodAttendance(periodAtt);
    invalidateSheetRows();
    refreshMissingData();
  }, [
    id,
    calYear,
    calMonth,
    from,
    to,
    setMonthAttendance,
    invalidateSheetRows,
    refreshMissingData,
  ]);

  /** Re-reads the money figures for the selected period. */
  const refreshPeriodTotals = useCallback(async () => {
    const [s, ded, prods] = await Promise.all([
      calculateSalary(id, from, to),
      getDeductionForPeriod(id, from, to),
      getProductionsByEmployee(id, from, to),
    ]);
    setAdvanceToCutInput((ded?.amount as number) ?? 0);
    setSalary({ gross: s.gross });
    setProductions(prods);
  }, [id, from, to]);

  const markAttendance = async (status: "present" | "absent") => {
    if (!selectedDate) return;
    const existing = findAttendanceForDate(calendarAttendance, selectedDate);
    const reduced =
      status === "present" ? parseHoursInput(hoursInputs.reduced) : undefined;
    const extra =
      status === "present" ? parseHoursInput(hoursInputs.extra) : undefined;
    await saveAttendance({
      ...(existing?.id ? { id: existing.id as string } : {}),
      employeeId: id,
      date: selectedDate,
      status,
      ...(reduced != null ? { hoursReduced: reduced } : {}),
      ...(extra != null ? { hoursExtra: extra } : {}),
    });
    setHoursDraft(null);
    await refreshAttendance();
    toast.success(
      t(
        status === "present" ? "empToastMarkedPresent" : "empToastMarkedAbsent",
        { date: dateDisplay(selectedDate) },
      ),
    );
  };

  const clearAttendance = useCallback(async () => {
    if (!selectedDate) return;
    try {
      const rec = findAttendanceForDate(calendarAttendance, selectedDate);
      if (rec?.id) await deleteAttendance(rec.id as string);
      setHoursDraft(null);
      await refreshAttendance();
      toast.success(
        t("empToastAttendanceCleared", { date: dateDisplay(selectedDate) }),
      );
    } catch {
      toast.error(t("empToastAttendanceClearFailed"));
    }
  }, [selectedDate, calendarAttendance, refreshAttendance, t]);

  const saveHours = async () => {
    const existing = findAttendanceForDate(calendarAttendance, selectedDate);
    if (!existing) return;
    const reduced = hoursInputs.reduced ? parseFloat(hoursInputs.reduced) : 0;
    const extra = hoursInputs.extra ? parseFloat(hoursInputs.extra) : 0;
    await saveAttendance({
      ...existing,
      hoursReduced: Number.isNaN(reduced) ? undefined : reduced,
      hoursExtra: Number.isNaN(extra) ? undefined : extra,
    });
    setHoursDraft(null);
    await refreshAttendance();
    toast.success(t("empToastHoursUpdated"));
  };

  const submitProduction = useCallback(async () => {
    if (!productionDraft.itemId) return;
    const holiday = await getHolidayByDate(productionDraft.date);
    const holidayDates = holiday ? [productionDraft.date] : [];
    if (isRestrictedForEntry(productionDraft.date, holidayDates)) {
      toast.error(t("empToastProdHolidayBlock"));
      return;
    }
    let missingParts = "";
    try {
      // saveProductionEntry, never the raw saveProduction: writing work down
      // here has to draw the material out of stock too, exactly as the
      // production screen does. Two entry paths that disagree about stock is
      // the bug this replaces.
      const { inventory } = await saveProductionEntry({
        employeeId: id,
        itemId: productionDraft.itemId,
        date: productionDraft.date,
        quantity: productionDraft.quantity,
        shift: productionDraft.shift,
      });
      if (inventory && inventory.missing.length > 0) {
        missingParts = describeMissingComponents(inventory.missing, t);
      }
    } catch {
      toast.error(t("empToastProdAddFail"));
      return;
    }
    setProductionDraft((prev) => ({ ...prev, quantity: 1 }));
    await refreshPeriodTotals();
    await loadCalendarMonth();
    invalidateSheetRows();
    refreshMissingData();
    toast.success(t("empToastProdAdded"));
    if (missingParts) {
      toast.warning(t("invSvcNotDeducted", { parts: missingParts }), {
        duration: 10000,
      });
    }
  }, [
    productionDraft,
    id,
    refreshPeriodTotals,
    loadCalendarMonth,
    invalidateSheetRows,
    refreshMissingData,
    t,
  ]);

  const removeProduction = useCallback(
    async (productionId: string) => {
      try {
        await deleteProduction(productionId);
        await refreshPeriodTotals();
        await loadCalendarMonth();
        invalidateSheetRows();
        refreshMissingData();
        toast.success(t("empToastProdDeleted"));
      } catch {
        toast.error(t("empToastProdDeleteFail"));
      }
    },
    [
      refreshPeriodTotals,
      loadCalendarMonth,
      invalidateSheetRows,
      refreshMissingData,
      t,
    ],
  );

  const submitAdvance = useCallback(async () => {
    try {
      await saveAdvance({ employeeId: id, amount: advAmount, date: advDate });
    } catch {
      toast.error(t("empToastAdvanceAddFail"));
      return;
    }
    setAdvAmount(0);
    const allAdvs = await getAdvancesByEmployee(id, "2000-01-01", "2100-12-31");
    setAllAdvances(allAdvs);
    await refreshPeriodTotals();
    toast.success(t("empToastAdvanceAdded"));
  }, [id, advAmount, advDate, refreshPeriodTotals, t]);

  const removeAdvance = useCallback(
    async (advanceId: string) => {
      try {
        await deleteAdvance(advanceId);
        const allAdvs = await getAdvancesByEmployee(
          id,
          "2000-01-01",
          "2100-12-31",
        );
        setAllAdvances(allAdvs);
        await refreshPeriodTotals();
        toast.success(t("empToastAdvanceDeleted"));
      } catch {
        toast.error(t("empToastAdvanceDeleteFail"));
      }
    },
    [id, refreshPeriodTotals, t],
  );

  const saveSettlement = useCallback(async () => {
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
    setDeductions(await getDeductionsByEmployee(id));
    toast.success(t("empToastSettlementSaved"));
  }, [id, from, to, advanceToCutInput, t]);

  const printMonthlyAttendance = useCallback(async () => {
    const { html } = await getPrintableMonthlyAttendanceSheetHtml(
      id,
      calYear,
      calMonth,
    );
    await printHtml(html);
  }, [id, calYear, calMonth]);

  const printSalaryRange = useCallback(async () => {
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
  }, [id, salaryRange.from, salaryRange.to, t]);

  const printProductionAdvances = useCallback(async () => {
    const { html } = await getPrintableSalaryHtml(id, from, to);
    await printHtml(html);
  }, [id, from, to]);

  const periodOptions = useMemo(
    () =>
      periods.map((p) => ({
        from: p.from,
        to: p.to,
        label: getPeriodForDate(p.from, locale).label,
      })),
    [periods, locale],
  );

  // ------------------------------------------------------------------ render

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

  const periodCaption =
    from && to
      ? `${dateDisplay(from)} – ${dateDisplay(to)}`
      : t("empSelectPeriod");
  const dayCaption = selectedDate
    ? dateDisplay(selectedDate)
    : t("empSelectDateShort");

  return (
    <AppShell headerContent={<EmployeePageHeader />}>
      <main id="main" className="flex flex-col gap-8">
        <div className="animate-fade-in flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-words font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {employee.name as string}
            </h1>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              {t("ux3EmployeeIntro")}
            </p>
          </div>
          <MissingDataPopover days={missingDataDays} />
        </div>

        {sections.paySettings && (
          <PaySettingsCards
            shiftId={shiftId}
            sundayCategoryId={sundayCategoryId}
            monthlySalary={monthlySalary}
            shifts={shifts}
            sundayCategories={sundayCategories}
            ratePerDay={ratePerDay}
            ratePerHour={ratePerHour}
            hoursPerDay={hoursPerDay}
            calendarDaysInMonth={calendarDaysInMonth}
            workingDays={workingDays}
            monthTitle={calendarMonthTitle}
            hideRates={hideRates}
            onSave={updateEmployee}
            onMonthlySalaryDraft={(v) => draftEmployee({ monthlySalary: v })}
          />
        )}

        {sections.operatorSettings && (
          <OperatorSettingsCard
            requiredPresentDays={(employee.requiredPresentDays as number) ?? 26}
            sundayMultiplier={(employee.sundayMultiplier as number) ?? 1.2}
            onDraft={draftEmployee}
            onSave={updateEmployee}
          />
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
                setProductionDraft((prev) => ({ ...prev, date }));
                const p = getPeriodForDate(date, locale);
                setFrom(p.from);
                setTo(p.to);
              }}
              periodFrom={from || ""}
              periodTo={to || ""}
              periodStatusLabel={currentPeriodLabel}
              periodAdjusted={salarySheetRowHasAdjustment(periodSheetRow)}
              onPeriodBadgeClick={openPayrollAdjust}
              periodBadgeLoading={periodRowLoading}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 min-w-0 xl:min-w-[280px]">
            <MonthAttendanceCard
              icon={<UserCheck className="size-3.5 text-primary shrink-0" />}
              monthTitle={calendarMonthTitle}
              presentDays={attendanceStats.presentDays}
              absentDays={attendanceStats.absentDays}
              earnedSundayPayDays={attendanceStats.earnedSundayPayDays}
              sundayPresentBonusDays={attendanceStats.sundayPresentBonusDays}
              totalPaidDays={attendanceStats.totalPaidDays}
              calculatedSalary={calculatedSalary}
              hideRates={hideRates}
            />
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <StatTile
                icon={<Clock className="size-3.5 text-primary shrink-0" />}
                title={t("empPeriodHours")}
                caption={periodCaption}
                value={hoursTileValue(periodHours)}
                money={moneyCaption(periodHours * ratePerHour, hideRates)}
              />
              <StatTile
                icon={<Package className="size-3.5 text-primary shrink-0" />}
                title={t("empPeriodProduction")}
                caption={periodCaption}
                value={number(periodProdQty)}
                money={moneyCaption(periodProdValue, hideRates)}
              />
              <StatTile
                icon={<Clock className="size-3.5 text-primary shrink-0" />}
                title={t("empMonthlyHours")}
                caption={calendarMonthTitle}
                value={hoursTileValue(attendanceStats.totalHoursWorked)}
                money={moneyCaption(
                  attendanceStats.totalHoursWorked * ratePerHour,
                  hideRates,
                )}
              />
              <StatTile
                icon={<LayoutGrid className="size-3.5 text-primary shrink-0" />}
                title={t("empMonthlyProduction")}
                caption={calendarMonthTitle}
                value={number(monthProdQty)}
                money={moneyCaption(monthProdValue, hideRates)}
              />
            </div>

            <DayAttendanceCard
              selectedDate={selectedDate}
              record={selectedRecord}
              hoursReduced={hoursInputs.reduced}
              hoursExtra={hoursInputs.extra}
              ratePerHour={ratePerHour}
              hideRates={hideRates}
              onHoursReducedChange={(value) =>
                selectedDate &&
                setHoursDraft({
                  date: selectedDate,
                  reduced: value,
                  extra: hoursInputs.extra,
                })
              }
              onHoursExtraChange={(value) =>
                selectedDate &&
                setHoursDraft({
                  date: selectedDate,
                  reduced: hoursInputs.reduced,
                  extra: value,
                })
              }
              onMarkPresent={() => void markAttendance("present")}
              onMarkAbsent={() => void markAttendance("absent")}
              onClear={() => void clearAttendance()}
              onSaveHours={() => void saveHours()}
            />

            <div className="grid min-w-0 grid-cols-2 gap-2">
              <StatTile
                icon={<Clock className="size-3.5 text-primary shrink-0" />}
                title={t("empDayHours")}
                caption={dayCaption}
                value={hoursTileValue(dayHours)}
                money={moneyCaption(dayHours * ratePerHour, hideRates)}
              />
              <StatTile
                icon={<Package className="size-3.5 text-primary shrink-0" />}
                title={t("empDayProduction")}
                caption={dayCaption}
                value={number(sumQuantity(dayProductions))}
                money={moneyCaption(
                  sumProductionValue(dayProductions, itemRate),
                  hideRates,
                )}
              />
            </div>
          </div>
        </div>

        {sections.attendanceSalary && (
          <>
            <MonthlyAttendancePrintCard
              year={calYear}
              month={calMonth}
              monthOptions={monthOptions}
              onMonthChange={(y, m) => {
                setCalYear(y);
                setCalMonth(m);
              }}
              onPrint={() => void printMonthlyAttendance()}
            />
            <SalaryRangeCard
              year={calYear}
              month={calMonth}
              monthOptions={monthOptions}
              onMonthChange={(y, m) => {
                setCalYear(y);
                setCalMonth(m);
              }}
              mode={salaryRangeMode}
              onModeChange={setSalaryRangeMode}
              range={salaryRange}
              rangeLabel={salaryRangeLabel}
              monthBounds={monthBounds}
              onCustomFromChange={(value) => {
                const next = adjustCustomRange({
                  edited: "from",
                  value,
                  currentFrom: salaryCustomFrom,
                  currentTo: salaryCustomTo,
                  year: calYear,
                  month: calMonth,
                });
                setSalaryCustomFrom(next.from);
                setSalaryCustomTo(next.to);
              }}
              onCustomToChange={(value) => {
                const next = adjustCustomRange({
                  edited: "to",
                  value,
                  currentFrom: salaryCustomFrom,
                  currentTo: salaryCustomTo,
                  year: calYear,
                  month: calMonth,
                });
                setSalaryCustomFrom(next.from);
                setSalaryCustomTo(next.to);
              }}
              summary={effectiveSalaryRangeSummary}
              hideRates={hideRates}
              showBadge={currentPeriodLabel !== ""}
              badgeAdjusted={salarySheetRowHasAdjustment(rangeSheetRow)}
              badgeLoading={rangeRowLoading}
              onBadgeClick={openRangeAdjust}
              onPrint={() => void printSalaryRange()}
            />
          </>
        )}

        {sections.productionAdvances && (
          <ProductionAdvancesCard
            periods={periodOptions}
            from={from}
            to={to}
            onPeriodChange={(f, tTo) => {
              setFrom(f);
              setTo(tTo);
            }}
            gross={salary?.gross ?? 0}
            advanceToCut={advanceToCutInput}
            showTotals={salary !== null}
            onPrint={() => void printProductionAdvances()}
          />
        )}

        <SettlementCard
          gross={salary?.gross ?? 0}
          totalAdvancePaid={totalAdvancePaid}
          advanceToCut={advanceToCutInput}
          loaded={salary !== null}
          onAdvanceToCutChange={setAdvanceToCutInput}
          onSave={() => void saveSettlement()}
        />

        {sections.storedSalaryRecords && (
          <StoredSalaryRecordsCard records={storedSalaryRecords} />
        )}

        {sections.productionLog && (
          <AddProductionForm
            items={items}
            draft={productionDraft}
            onDraftChange={(patch) =>
              setProductionDraft((prev) => ({ ...prev, ...patch }))
            }
            onSubmit={() => void submitProduction()}
          />
        )}

        <AddAdvanceForm
          amount={advAmount}
          date={advDate}
          onAmountChange={setAdvAmount}
          onDateChange={setAdvDate}
          onSubmit={() => void submitAdvance()}
        />

        {sections.productionLog && (
          <ProductionsDialog
            open={productionsModalOpen}
            onOpenChange={setProductionsModalOpen}
            productions={productions}
            itemMap={itemMap}
            onDelete={(productionId) => void removeProduction(productionId)}
          />
        )}

        <AdvancesDialog
          open={advancesModalOpen}
          onOpenChange={setAdvancesModalOpen}
          advances={allAdvances}
          deductions={deductions}
          onDeleteAdvance={(advanceId) => void removeAdvance(advanceId)}
        />

        <SalarySheetAdjustDialog
          open={payrollAdjustOpen}
          onOpenChange={(open) =>
            setPayrollAdjustKey(open ? periodDialogKey : null)
          }
          row={periodSheetRow}
          year={periodRequest?.year ?? calYear}
          month={periodRequest?.month ?? calMonth}
          periodFrom={from}
          periodTo={to}
          onSaved={async () => {
            invalidateSheetRows();
          }}
        />
        <SalarySheetAdjustDialog
          open={rangeAdjustOpen}
          onOpenChange={(open) =>
            setRangeAdjustKey(open ? rangeDialogKey : null)
          }
          row={rangeSheetRow}
          year={rangeRequest?.year ?? calYear}
          month={rangeRequest?.month ?? calMonth}
          periodFrom={salaryRange.from}
          periodTo={salaryRange.to}
          onSaved={async () => {
            invalidateSheetRows();
          }}
        />
      </main>
    </AppShell>
  );
}
