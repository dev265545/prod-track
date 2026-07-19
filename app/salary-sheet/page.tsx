"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { currency, number } from "@/lib/utils/formatter";
import { printHtml } from "@/lib/utils/print";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
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

function buildPrintableHtml(
  rows: SalarySheetRow[],
  monthLabel: string,
  from: string,
  to: string,
  tr: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  const printStyles =
    "body{margin:0;font-family:system-ui,sans-serif;font-size:12px;color:#0a0a0a;background:#fff;padding:16px}.mb-4{margin-bottom:12px}.mb-6{margin-bottom:20px}.text-2xl{font-size:1.5rem;font-weight:700}.text-sm{font-size:0.75rem}.text-gray-600{color:#52525b}.border{border:1px solid #e4e4e7}.w-full{width:100%}.table{width:100%;font-size:10px;border-collapse:collapse}.table th,.table td{padding:5px 6px;text-align:left;border:1px solid #e4e4e7}.table th{background:#f4f4f5;font-weight:600}.text-right{text-align:right}.no-print{display:none!important}";

  const colCount = 13;
  const rowsHtml =
    rows.length === 0
      ? `<tr><td colspan="${colCount}" class="border" style="padding:12px;color:#71717a;text-align:center">${tr("salarySheetPrintEmpty")}</td></tr>`
      : rows
          .map(
            (r) =>
              `<tr>
                <td class="border" style="padding:5px 6px">${r.name}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.presentDays)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.absentDays)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.holidayPresentDays)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.earnedSundayPayDays)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.sundayPresentBonusDays)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.totalPaidDays)}</td>
                <td class="border text-right" style="padding:5px 6px">${currency(r.monthlySalary)}</td>
                <td class="border text-right" style="padding:5px 6px">${currency(r.ratePerDay)}</td>
                <td class="border text-right" style="padding:5px 6px">${currency(r.ratePerHour)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.hoursExtraTotal)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.hoursReducedTotal)}</td>
                <td class="border text-right font-semibold" style="padding:5px 6px">${currency(r.calculatedSalary)}</td>
              </tr>`,
          )
          .join("");

  const totalSalary = rows.reduce((sum, r) => sum + r.calculatedSalary, 0);
  const totalRow =
    rows.length > 0
      ? `<tr class="border-t-2" style="border-top:2px solid #0a0a0a">
          <td class="border font-semibold" style="padding:8px">${tr("salarySheetPrintTotal")}</td>
          <td class="border text-right" colspan="${colCount - 2}" style="padding:8px"></td>
          <td class="border text-right font-bold" style="padding:8px">${currency(totalSalary)}</td>
        </tr>`
      : "";

  const head = `<tr class="border"><th class="border" style="padding:5px 6px">${tr("colEmployee")}</th><th class="border text-right" style="padding:5px 6px">${tr("calTitlePresent")}</th><th class="border text-right" style="padding:5px 6px">${tr("calTitleAbsent")}</th><th class="border text-right" style="padding:5px 6px">${tr("salarySheetColHolidayPresent")}</th><th class="border text-right" style="padding:5px 6px">${tr("salarySheetColEarnedSun")}</th><th class="border text-right" style="padding:5px 6px">${tr("salarySheetColSunPlus")}</th><th class="border text-right" style="padding:5px 6px">${tr("salarySheetColPaidDays")}</th><th class="border text-right" style="padding:5px 6px">${tr("salarySheetColMonthly")}</th><th class="border text-right" style="padding:5px 6px">${tr("salarySheetColPerDay")}</th><th class="border text-right" style="padding:5px 6px">${tr("salarySheetColPerHr")}</th><th class="border text-right" style="padding:5px 6px">${tr("salarySheetColPlusHrs")}</th><th class="border text-right" style="padding:5px 6px">${tr("salarySheetColMinusHrs")}</th><th class="border text-right" style="padding:5px 6px">${tr("salarySheetColSalary")}</th></tr>`;

  const title = `${tr("navSalarySheet")} – ${monthLabel}`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${printStyles}</style></head><body id="printArea"><div style="max-width:100%;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px"><div><h1 class="text-2xl">ProdTrack Lite</h1><p class="text-sm text-gray-600">${title}</p></div><div class="text-sm text-right"><p><strong>${tr("salarySheetPrintMonth")}</strong> ${monthLabel}</p><p><strong>${tr("salarySheetPrintPeriod")}</strong> ${from} – ${to}</p></div></div><table class="table w-full"><thead>${head}</thead><tbody>${rowsHtml}${totalRow}</tbody></table></div></body></html>`;
}

export default function SalarySheetPage() {
  const router = useRouter();
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [category, setCategory] = useState<SalarySheetCategory>("all");

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
    try {
      const result = await getSalarySheetForRange(
        year,
        month,
        selectedRange.from,
        selectedRange.to,
      );
      setRows(result.rows);
      setFrom(result.from);
      setTo(result.to);
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

  const handlePrint = async () => {
    console.log("[print] Print button clicked (salary sheet)");
    const titleLabel =
      rangeMode === "full-month"
        ? formatMonthYear(
            `${year}-${String(month + 1).padStart(2, "0")}-01`,
            locale,
          )
        : selectedRange.label;
    const fresh = await getSalarySheetForRange(
      year,
      month,
      selectedRange.from,
      selectedRange.to,
    );
    const freshVisibleRows =
      category === "all"
        ? fresh.rows
        : fresh.rows.filter((r) => r.employeeType === category);
    const categoryLabel =
      category === "all"
        ? ""
        : ` – ${tr(CATEGORY_TABS.find((c) => c.value === category)!.labelKey)}`;
    const html = buildPrintableHtml(
      freshVisibleRows,
      `${titleLabel}${categoryLabel}`,
      fresh.from,
      fresh.to,
      tr,
    );
    console.log("[print] Got HTML, length:", html?.length ?? 0);
    await printHtml(html);
  };

  const moveRow = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= rows.length || savingOrder) return;

    const nextRows = [...rows];
    const [moved] = nextRows.splice(index, 1);
    nextRows.splice(nextIndex, 0, moved);
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
  const visibleRows =
    category === "all" ? rows : rows.filter((r) => r.employeeType === category);
  const hasNoEmployees = visibleRows.length === 0 && !loading;

  return (
    <AppShell>
      <main className="flex flex-col gap-8 animate-fade-in">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground font-heading">
              {tr("navSalarySheet")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {tr("salarySheetIntro")}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="salary-month">{tr("dashboardMonth")}</Label>
              <Select
                value={monthValue}
                onValueChange={handleMonthChange}
              >
                <SelectTrigger id="salary-month" className="min-w-[200px] min-h-12">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="salary-range-mode">{tr("salarySheetRange")}</Label>
              <Select
                value={rangeMode}
                onValueChange={(value) => setRangeMode(value as MonthRangeMode)}
              >
                <SelectTrigger
                  id="salary-range-mode"
                  className="min-w-[200px] min-h-12"
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
                <div className="flex flex-col gap-2">
                  <Label htmlFor="salary-range-from">{tr("salarySheetLabelFrom")}</Label>
                  <DatePicker
                    id="salary-range-from"
                    value={selectedRange.from}
                    onChange={handleCustomFromChange}
                    min={monthBounds.from}
                    max={monthBounds.to}
                    className="min-w-[180px] min-h-12"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="salary-range-to">{tr("salarySheetLabelTo")}</Label>
                  <DatePicker
                    id="salary-range-to"
                    value={selectedRange.to}
                    onChange={handleCustomToChange}
                    min={monthBounds.from}
                    max={monthBounds.to}
                    className="min-w-[180px] min-h-12"
                  />
                </div>
              </>
            )}
            <Button
              type="button"
              variant={reorderMode ? "secondary" : "outline"}
              onClick={() => setReorderMode((value) => !value)}
              className="min-h-12 px-6"
            >
              <GripVertical data-icon="inline-start" className="size-4" />
              {reorderMode ? tr("salarySheetReorderDone") : tr("salarySheetReorderStart")}
            </Button>
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
          <TabsList>
            {CATEGORY_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tr(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" />
              {rangeMode === "full-month" ? monthLabel : selectedRange.label}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {tr("salarySheetCardIntro")}
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {reorderMode && (
                        <TableHead className="w-[88px]">{tr("salarySheetColOrder")}</TableHead>
                      )}
                      <TableHead>{tr("colEmployee")}</TableHead>
                      <TableHead className="text-right tabular-nums">{tr("calTitlePresent")}</TableHead>
                      <TableHead className="text-right tabular-nums">{tr("calTitleAbsent")}</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">{tr("salarySheetColHolidayPresent")}</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">{tr("salarySheetColEarnedSun")}</TableHead>
                      <TableHead className="text-right tabular-nums">{tr("salarySheetColSunPlus")}</TableHead>
                      <TableHead className="text-right tabular-nums">{tr("salarySheetColPaidDays")}</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">{tr("salarySheetColMonthly")}</TableHead>
                      <TableHead className="text-right tabular-nums">{tr("salarySheetColPerDay")}</TableHead>
                      <TableHead className="text-right tabular-nums">{tr("salarySheetColPerHr")}</TableHead>
                      <TableHead className="text-right tabular-nums">{tr("salarySheetColPlusHrs")}</TableHead>
                      <TableHead className="text-right tabular-nums">{tr("salarySheetColMinusHrs")}</TableHead>
                      <TableHead className="text-right tabular-nums">{tr("salarySheetColSalary")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((r) => (
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
                        aria-label={tr("viewEmployeeAria", { name: r.name })}
                      >
                        {reorderMode && (
                          <TableCell
                            className="w-[88px]"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={savingOrder || visibleRows[0]?.id === r.id}
                                onClick={() => void moveRow(rows.findIndex((row) => row.id === r.id), -1)}
                                aria-label={tr("salarySheetMoveUpAria", { name: r.name })}
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={savingOrder || visibleRows[visibleRows.length - 1]?.id === r.id}
                                onClick={() => void moveRow(rows.findIndex((row) => row.id === r.id), 1)}
                                aria-label={tr("salarySheetMoveDownAria", { name: r.name })}
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                        <TableCell className="font-medium">
                          {r.name}
                          {salarySheetRowHasAdjustment(r) ? (
                            <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-400">
                              ({tr("salarySheetAdjustedBadge")})
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{number(r.presentDays)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(r.absentDays)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(r.holidayPresentDays)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(r.earnedSundayPayDays)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(r.sundayPresentBonusDays)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(r.totalPaidDays)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{currency(r.monthlySalary)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{currency(r.ratePerDay)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{currency(r.ratePerHour)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(r.hoursExtraTotal)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(r.hoursReducedTotal)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{currency(r.calculatedSalary)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

      </main>
    </AppShell>
  );
}
