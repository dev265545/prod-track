"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, FileSpreadsheet, GripVertical, Printer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { saveEmployeeSortOrder } from "@/lib/services/employeeService";
import {
  getSalarySheetForRange,
  salarySheetRowHasAdjustment,
} from "@/lib/services/salarySheetService";
import type { SalarySheetRow } from "@/lib/services/salarySheetService";
import {
  clampDateToMonth,
  getMonthRange,
  getMonthRangePresets,
  getMonthRangeLabel,
  type MonthRangeMode,
  formatMonthYear,
  type DisplayLocale,
} from "@/lib/utils/date";
import { printHtml } from "@/lib/utils/print";
import {
  AUDIT_ACTIONS,
  record as auditRecord,
} from "@/lib/services/auditService";
import {
  SALARY_SHEET_COLUMNS,
  buildPrintableHtml,
} from "@/lib/print/salarySheet";
import {
  getProductionPaySheetForRange,
  type ProductionPaySheet,
} from "@/lib/services/productionPaySheetService";
import { ProductionPayRecord } from "@/components/salary-sheet/production-pay-record";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";
import type { MessageKey } from "@/lib/i18n/messages";

function getMonthOptions(
  count = 24,
  locale: DisplayLocale = "en",
): { year: number; month: number; label: string }[] {
  const now = new Date();
  const options: { year: number; month: number; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const iso = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    options.push({
      year: y,
      month: m,
      label: formatMonthYear(iso, locale),
    });
  }
  return options;
}

type SalarySheetCategory = "all" | "salaried" | "production" | "operator";

const CATEGORY_TABS: { value: SalarySheetCategory; labelKey: MessageKey }[] = [
  { value: "all", labelKey: "salarySheetTabAll" },
  { value: "salaried", labelKey: "employeeTypeSalaried" },
  { value: "production", labelKey: "employeeTypeProduction" },
  { value: "operator", labelKey: "employeeTypeOperator" },
];

export default function SalarySheetPage() {
  const { t: tr, locale } = useLanguage();
  const { ready } = useAuthGuard({ requireAdmin: true });
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(() => {
    const t = new Date();
    return t.getFullYear();
  });
  const [month, setMonth] = useState(() => {
    const t = new Date();
    return t.getMonth();
  });
  const [rangeMode, setRangeMode] = useState<MonthRangeMode>("full-month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<SalarySheetRow[]>([]);
  const [productionSheet, setProductionSheet] =
    useState<ProductionPaySheet | null>(null);
  // Only the setters are read: the loaded range is echoed back into state so
  // a later print uses exactly what the sheet on screen was built from.
  const [, setFrom] = useState("");
  const [, setTo] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [category, setCategory] = useState<SalarySheetCategory>("all");
  const [loadFailed, setLoadFailed] = useState(false);

  const monthOptions = getMonthOptions(24, locale);
  const monthBounds = getMonthRange(year, month);
  const rangePresets = getMonthRangePresets(year, month, locale);
  const resolvedCustomFrom = clampDateToMonth(
    customFrom || monthBounds.from,
    year,
    month,
  );
  const resolvedCustomTo = clampDateToMonth(
    customTo || monthBounds.to,
    year,
    month,
  );
  const selectedRange =
    rangeMode === "custom"
      ? {
          from:
            resolvedCustomFrom <= resolvedCustomTo
              ? resolvedCustomFrom
              : resolvedCustomTo,
          to:
            resolvedCustomFrom <= resolvedCustomTo
              ? resolvedCustomTo
              : resolvedCustomFrom,
          label: getMonthRangeLabel(
            resolvedCustomFrom <= resolvedCustomTo
              ? resolvedCustomFrom
              : resolvedCustomTo,
            resolvedCustomFrom <= resolvedCustomTo
              ? resolvedCustomTo
              : resolvedCustomFrom,
            locale,
          ),
        }
      : rangePresets.find((preset) => preset.mode === rangeMode) ?? rangePresets[0];

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [result, production] = await Promise.all([
        getSalarySheetForRange(
          year,
          month,
          selectedRange.from,
          selectedRange.to,
        ),
        getProductionPaySheetForRange(selectedRange.from, selectedRange.to),
      ]);
      setRows(result.rows);
      setProductionSheet(production);
      setFrom(result.from);
      setTo(result.to);
    } catch (error) {
      console.error("[salary-sheet] failed to load", error);
      setRows([]);
      setProductionSheet(null);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [year, month, selectedRange.from, selectedRange.to]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  const handleMonthChange = (value: string) => {
    const [y, m] = value.split("-").map(Number);
    setYear(y);
    setMonth(m);
  };

  const handleCustomFromChange = (value: string) => {
    const nextFrom = clampDateToMonth(value, year, month);
    const nextTo = clampDateToMonth(customTo || monthBounds.to, year, month);
    setCustomFrom(nextFrom);
    if (nextTo < nextFrom) setCustomTo(nextFrom);
  };

  const handleCustomToChange = (value: string) => {
    const nextTo = clampDateToMonth(value, year, month);
    const nextFrom = clampDateToMonth(customFrom || monthBounds.from, year, month);
    setCustomTo(nextTo);
    if (nextTo < nextFrom) setCustomFrom(nextTo);
  };

  // Production workers are no longer on this attendance-based sheet at all
  // (the service leaves them out), so the Production tab shows their own
  // work record instead of an empty table.
  const showSalaryTable = category !== "production";
  const showProductionRecord = category === "all" || category === "production";
  const visibleRows =
    category === "all" ? rows : rows.filter((r) => r.employeeType === category);

  const handlePrint = async () => {
    console.log("[print] Print button clicked (salary sheet)");
    const titleLabel =
      rangeMode === "full-month"
        ? formatMonthYear(
            `${year}-${String(month + 1).padStart(2, "0")}-01`,
            locale,
          )
        : selectedRange.label;
    let fresh: Awaited<ReturnType<typeof getSalarySheetForRange>>;
    let freshProduction: ProductionPaySheet;
    try {
      [fresh, freshProduction] = await Promise.all([
        getSalarySheetForRange(
          year,
          month,
          selectedRange.from,
          selectedRange.to,
        ),
        getProductionPaySheetForRange(selectedRange.from, selectedRange.to),
      ]);
    } catch (error) {
      console.error("[salary-sheet] failed to load for print", error);
      toast.error(tr("plainSalarySheetLoadFailed"));
      return;
    }
    const freshVisibleRows =
      category === "all"
        ? fresh.rows
        : fresh.rows.filter((r) => r.employeeType === category);
    const categoryLabel =
      category === "all"
        ? ""
        : ` – ${tr(CATEGORY_TABS.find((c) => c.value === category)!.labelKey)}`;
    const html = buildPrintableHtml({
      rows: showSalaryTable ? freshVisibleRows : null,
      productionSheet: showProductionRecord ? freshProduction : null,
      monthLabel: `${titleLabel}${categoryLabel}`,
      from: fresh.from,
      to: fresh.to,
      tr,
    });
    console.log("[print] Got HTML, length:", html?.length ?? 0);
    await printHtml(html);
    void auditRecord(
      AUDIT_ACTIONS.salaryPrint,
      "salary_records",
      null,
      tr("auditWireSalarySheetPrint", { period: `${titleLabel}${categoryLabel}` }),
      {
        from: fresh.from,
        to: fresh.to,
        employeesOnSheet: freshVisibleRows.length,
      },
    );
  };

  /**
   * Swap a row with its neighbour *as displayed*. Under a category tab some
   * rows are hidden, so the neighbour in `visibleRows` is the one the user
   * sees — stepping through the unfiltered `rows` would jump a hidden row
   * and save an order different from the one on screen.
   */
  const moveRow = async (rowId: SalarySheetRow["id"], direction: -1 | 1) => {
    if (savingOrder) return;
    const visibleIndex = visibleRows.findIndex((row) => row.id === rowId);
    const neighbour = visibleRows[visibleIndex + direction];
    if (visibleIndex < 0 || !neighbour) return;

    const fromIndex = rows.findIndex((row) => row.id === rowId);
    const toIndex = rows.findIndex((row) => row.id === neighbour.id);
    if (fromIndex < 0 || toIndex < 0) return;

    const nextRows = [...rows];
    nextRows[fromIndex] = rows[toIndex];
    nextRows[toIndex] = rows[fromIndex];
    const previousRows = rows;
    setRows(nextRows);
    setSavingOrder(true);
    try {
      await saveEmployeeSortOrder(nextRows.map((row) => row.id));
    } catch {
      setRows(previousRows);
      toast.error(tr("salarySheetToastOrderFail"));
    } finally {
      setSavingOrder(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner className="size-5" />
          <span>{tr("loading")}</span>
        </div>
      </div>
    );
  }

  const monthValue = `${year}-${month}`;
  const monthLabel = formatMonthYear(
    `${year}-${String(month + 1).padStart(2, "0")}-01`,
    locale,
  );
  const hasNoEmployees = visibleRows.length === 0 && !loading && !loadFailed;

  return (
    <AppShell>
      <main className="flex flex-col gap-8 animate-fade-in">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {tr("navSalarySheet")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {tr("salarySheetIntro")}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-end gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="salary-month">{tr("dashboardMonth")}</Label>
              <Select
                value={monthValue}
                onValueChange={handleMonthChange}
              >
                <SelectTrigger id="salary-month" className="w-full min-w-0 min-h-12 sm:min-w-[200px]">
                  <SelectValue placeholder={tr("salarySheetSelectMonth")} />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem
                      key={`${opt.year}-${opt.month}`}
                      value={`${opt.year}-${opt.month}`}
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="salary-range-mode">{tr("salarySheetRange")}</Label>
              <Select
                value={rangeMode}
                onValueChange={(value) => setRangeMode(value as MonthRangeMode)}
              >
                <SelectTrigger
                  id="salary-range-mode"
                  className="w-full min-w-0 min-h-12 sm:min-w-[200px]"
                >
                  <SelectValue placeholder={tr("salarySheetSelectRange")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full-month">{tr("salarySheetRangeFullMonth")}</SelectItem>
                  <SelectItem value="first-half">{tr("salarySheetRangeFirstHalf")}</SelectItem>
                  <SelectItem value="second-half">
                    {tr("salarySheetRangeSecondHalf", {
                      lastDay: new Date(year, month + 1, 0).getDate(),
                    })}
                  </SelectItem>
                  <SelectItem value="custom">{tr("salarySheetRangeCustom")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rangeMode === "custom" && (
              <>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="salary-range-from">{tr("salarySheetLabelFrom")}</Label>
                  <DatePicker
                    id="salary-range-from"
                    value={selectedRange.from}
                    onChange={handleCustomFromChange}
                    min={monthBounds.from}
                    max={monthBounds.to}
                    className="w-full min-w-0 min-h-12 sm:min-w-[180px]"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="salary-range-to">{tr("salarySheetLabelTo")}</Label>
                  <DatePicker
                    id="salary-range-to"
                    value={selectedRange.to}
                    onChange={handleCustomToChange}
                    min={monthBounds.from}
                    max={monthBounds.to}
                    className="w-full min-w-0 min-h-12 sm:min-w-[180px]"
                  />
                </div>
              </>
            )}
            {showSalaryTable && (
              <Button
                type="button"
                variant={reorderMode ? "secondary" : "outline"}
                onClick={() => setReorderMode((value) => !value)}
                className="min-h-12 px-6"
              >
                <GripVertical data-icon="inline-start" className="size-4" />
                {reorderMode ? tr("salarySheetReorderDone") : tr("salarySheetReorderStart")}
              </Button>
            )}
            <Button
              type="button"
              onClick={handlePrint}
              className="min-h-12 px-6"
            >
              <Printer data-icon="inline-start" className="size-4" />
              {tr("salarySheetPrint")}
            </Button>
          </div>
        </div>

        <Tabs
          value={category}
          onValueChange={(value) => setCategory(value as SalarySheetCategory)}
        >
          {/* The four tabs together can be wider than a phone screen, so the
              strip scrolls on its own instead of widening the page. */}
          <div className="min-w-0 overflow-x-auto">
            <TabsList className="h-auto">
              {CATEGORY_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="min-h-11 px-4"
                >
                  {tr(tab.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        {showSalaryTable && (
        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
              <FileSpreadsheet className="size-5 shrink-0 text-primary" />
              {rangeMode === "full-month" ? monthLabel : selectedRange.label}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {tr("salarySheetCardIntro")}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground mt-2 max-w-3xl">
              {tr("plainSalarySheetLegend")}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground mt-2 max-w-3xl">
              {tr("prepNoteOnSalarySheet")}
            </p>
            {reorderMode && (
              <p className="text-sm text-muted-foreground mt-2">
                {tr("salarySheetReorderHint")}
              </p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col gap-4 py-8">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-64 w-full rounded-lg" />
              </div>
            ) : loadFailed ? (
              <Empty className="py-12 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileSpreadsheet className="size-6 text-destructive" />
                  </EmptyMedia>
                  <EmptyTitle>{tr("plainSalarySheetLoadFailed")}</EmptyTitle>
                  <EmptyDescription>
                    {tr("plainSalarySheetLoadFailedDesc")}
                  </EmptyDescription>
                </EmptyHeader>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 min-h-12 px-6"
                  onClick={() => void load()}
                >
                  {tr("plainTryAgain")}
                </Button>
              </Empty>
            ) : hasNoEmployees ? (
              <Empty className="py-12 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileSpreadsheet className="size-6 text-muted-foreground" />
                  </EmptyMedia>
                  <EmptyTitle>{tr("salarySheetEmptyTitle")}</EmptyTitle>
                  <EmptyDescription>
                    {tr("salarySheetEmptyDesc")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="min-w-0 overflow-x-auto">
                <Table aria-label={tr("navSalarySheet")}>
                  <TableHeader>
                    <TableRow>
                      {reorderMode && (
                        <TableHead scope="col" className="w-[104px]">
                          {tr("salarySheetColOrder")}
                        </TableHead>
                      )}
                      {SALARY_SHEET_COLUMNS.map((col) => (
                        <TableHead
                          key={col.key}
                          scope="col"
                          className={cn(
                            col.align === "right" && "text-right tabular-nums",
                            col.nowrap && "whitespace-nowrap",
                          )}
                        >
                          {tr(col.labelKey)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((r) => (
                      // Not `role="button"` on the row: with the reorder arrows
                      // and the name link inside it, that was
                      // nested-interactive markup which flattened every cell
                      // into one unreadable button label. The link is in the
                      // name cell, which is also the row's header.
                      <TableRow
                        key={r.id}
                        className="transition-colors hover:bg-surface-2"
                      >
                        {reorderMode && (
                          <TableCell className="w-[104px]">
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="size-11"
                                disabled={savingOrder || visibleRows[0]?.id === r.id}
                                onClick={() => void moveRow(r.id, -1)}
                                aria-label={tr("salarySheetMoveUpAria", { name: r.name })}
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="size-11"
                                disabled={savingOrder || visibleRows[visibleRows.length - 1]?.id === r.id}
                                onClick={() => void moveRow(r.id, 1)}
                                aria-label={tr("salarySheetMoveDownAria", { name: r.name })}
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                        {SALARY_SHEET_COLUMNS.map((col) => {
                          const body = (
                            <>
                              {col.isName ? (
                                <Link
                                  href={`/employee?id=${encodeURIComponent(String(r.id))}`}
                                  aria-label={tr("viewEmployeeAria", {
                                    name: r.name,
                                  })}
                                  className="inline-flex min-h-[44px] items-center rounded-md underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  {col.format(r)}
                                </Link>
                              ) : (
                                col.format(r)
                              )}
                              {col.isName && salarySheetRowHasAdjustment(r) ? (
                                <span className="ml-2 text-xs font-normal text-warning">
                                  ({tr("salarySheetAdjustedBadge")})
                                </span>
                              ) : null}
                            </>
                          );
                          const className = cn(
                            col.align === "right" && "text-right tabular-nums",
                            col.muted && "text-muted-foreground",
                            col.emphasis && "font-semibold",
                            col.isName && "font-medium",
                          );
                          // The name identifies the row, so it is the row's
                          // header cell — otherwise a screen reader reading
                          // "₹8,240" ten columns in cannot say whose it is.
                          return col.isName ? (
                            <TableHead
                              key={col.key}
                              scope="row"
                              className={cn("h-auto p-4 text-foreground", className)}
                            >
                              {body}
                            </TableHead>
                          ) : (
                            <TableCell key={col.key} className={className}>
                              {body}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {showProductionRecord &&
          !loading &&
          !loadFailed &&
          productionSheet !== null && (
            <ProductionPayRecord
              sheet={productionSheet}
              periodLabel={
                rangeMode === "full-month" ? monthLabel : selectedRange.label
              }
            />
          )}

        {showProductionRecord && loading && (
          <Skeleton className="h-64 w-full rounded-lg" />
        )}

        {category === "production" && loadFailed && (
          <Empty className="py-12 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileSpreadsheet className="size-6 text-destructive" />
              </EmptyMedia>
              <EmptyTitle>{tr("prepLoadFailed")}</EmptyTitle>
              <EmptyDescription>{tr("prepLoadFailedDesc")}</EmptyDescription>
            </EmptyHeader>
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-12 px-6"
              onClick={() => void load()}
            >
              {tr("plainTryAgain")}
            </Button>
          </Empty>
        )}

      </main>
    </AppShell>
  );
}
