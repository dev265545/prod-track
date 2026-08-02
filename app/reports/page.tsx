"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
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
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import {
  getProductionsInRange,
  getProductions,
} from "@/lib/services/productionService";
import { getItems } from "@/lib/services/itemService";
import { getPeriodForDate, getPeriodsWithData } from "@/lib/utils/date";
import { number, dateDisplay } from "@/lib/utils/formatter";
import { printHtml } from "@/lib/utils/print";
import {
  AUDIT_ACTIONS,
  record as auditRecord,
} from "@/lib/services/auditService";
import { buildProductionReportHtml } from "@/lib/print/productionReport";
import { Package, BarChart2, AlertTriangle, Printer } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";

type PrintScope = "both" | "day" | "night";

interface CumulativeRow {
  itemId: string;
  itemName: string;
  dayQty: number;
  nightQty: number;
  qty: number;
}

export default function ReportsPage() {
  const { ready: guardReady } = useAuthGuard();
  const { locale, t } = useLanguage();
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  const [periods, setPeriods] = useState<
    { from: string; to: string; label: string }[]
  >([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [printScope, setPrintScope] = useState<PrintScope>("both");
  const [productions, setProductions] = useState<Record<string, unknown>[]>([]);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const ready = guardReady && periodsLoaded;

  const loadPeriods = useCallback(
    () =>
      getProductions()
        .then((prods) => {
          const withData = getPeriodsWithData(prods, 24, locale);
          setLoadFailed(false);
          setPeriods(withData);
          const current = getPeriodForDate(
            new Date().toISOString().slice(0, 10),
            locale,
          );
          const selected = withData.some((p) => p.from === current.from)
            ? current.from
            : (withData[withData.length - 1]?.from ?? "");
          const period = withData.find((p) => p.from === selected);
          if (period) {
            setFrom(period.from);
            setTo(period.to);
          }
          setPeriodsLoaded(true);
        })
        .catch((error: unknown) => {
          console.error("[reports] failed to load periods", error);
          setLoadFailed(true);
          // Stop the skeleton: the page must show the error, not spin forever.
          setPeriodsLoaded(true);
        }),
    [locale],
  );

  useEffect(() => {
    if (!guardReady) return;
    void loadPeriods();
  }, [guardReady, loadPeriods]);

  const loadRange = useCallback(() => {
    if (!from || !to) return Promise.resolve();
    return Promise.all([getProductionsInRange(from, to), getItems()])
      .then(([prods, itemsList]) => {
        setLoadFailed(false);
        setProductions(prods);
        setItems(itemsList);
      })
      .catch((error: unknown) => {
        console.error("[reports] failed to load productions", error);
        setProductions([]);
        setItems([]);
        setLoadFailed(true);
      });
  }, [from, to]);

  useEffect(() => {
    if (!ready) return;
    void loadRange();
  }, [ready, loadRange]);

  /**
   * All of the per-item / per-date totals in one pass. Memoised so typing in
   * an unrelated control does not re-total every production row.
   */
  const {
    cumulativeRows,
    byDateItemDay,
    byDateItemNight,
    datesDay,
    datesNight,
  } = useMemo(() => {
    const itemMap = Object.fromEntries(
      items.map((i) => [i.id as string, i]),
    ) as Record<string, Record<string, unknown>>;

    const byItem: Record<string, number> = {};
    const byItemDay: Record<string, number> = {};
    const byItemNight: Record<string, number> = {};
    const dayCells: Record<string, number> = {};
    const nightCells: Record<string, number> = {};
    const dayDates = new Set<string>();
    const nightDates = new Set<string>();

    productions.forEach((p) => {
      const qty = (p.quantity as number) || 0;
      const isNight = p.shift === "night";
      const itemId = p.itemId as string;
      const date = p.date as string;
      const key = `${date}|${itemId}`;
      byItem[itemId] = (byItem[itemId] || 0) + qty;
      if (isNight) {
        byItemNight[itemId] = (byItemNight[itemId] || 0) + qty;
        nightCells[key] = (nightCells[key] || 0) + qty;
        nightDates.add(date);
      } else {
        byItemDay[itemId] = (byItemDay[itemId] || 0) + qty;
        dayCells[key] = (dayCells[key] || 0) + qty;
        dayDates.add(date);
      }
    });

    const rows: CumulativeRow[] = Object.keys(byItem)
      .map((itemId) => ({
        itemId,
        itemName: (itemMap[itemId]?.name as string) || itemId,
        dayQty: byItemDay[itemId] || 0,
        nightQty: byItemNight[itemId] || 0,
        qty: byItem[itemId],
      }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName));

    return {
      cumulativeRows: rows,
      byDateItemDay: dayCells,
      byDateItemNight: nightCells,
      datesDay: Array.from(dayDates).sort(),
      datesNight: Array.from(nightDates).sort(),
    };
  }, [productions, items]);

  const handlePrint = async () => {
    const periodLabel = `${dateDisplay(from)} – ${dateDisplay(to)}`;
    const html = buildProductionReportHtml({
      rows: cumulativeRows,
      scope: printScope,
      periodLabel,
      tr: t,
      lang: locale === "hi" ? "hi" : "en",
    });
    try {
      await printHtml(html);
      // Logged only once the print actually went out: an entry for a print
      // that failed would claim paper exists that nobody ever held.
      void auditRecord(
        AUDIT_ACTIONS.reportPrint,
        "productions",
        null,
        t("auditWireReportPrint", { period: periodLabel }),
        { from, to, scope: printScope, itemsOnReport: cumulativeRows.length },
      );
    } catch (error) {
      console.error("[reports] print failed", error);
      toast.error(t("plainReportsLoadFailed"));
    }
  };

  if (!ready) {
    return (
      <AppShell>
        <main className="flex flex-col gap-8">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 rounded-2xl" />
        </main>
      </AppShell>
    );
  }

  const periodValue = from && to ? `${from}|${to}` : "";
  const hasNoData = periods.length === 0 && !loadFailed;

  if (loadFailed) {
    return (
      <AppShell>
        <main className="flex flex-col gap-6 animate-fade-in">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t("reportsPageTitle")}
          </h1>
          <Card className="p-6 sm:p-8">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
                <AlertTriangle className="size-5 shrink-0 text-destructive" />
                {t("plainReportsLoadFailed")}
              </CardTitle>
              <p className="text-base text-muted-foreground mt-1">
                {t("plainReportsLoadFailedDesc")}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Button
                type="button"
                variant="outline"
                className="h-12 px-6"
                onClick={() => {
                  setPeriodsLoaded(false);
                  void loadPeriods();
                }}
              >
                {t("plainTryAgain")}
              </Button>
            </CardContent>
          </Card>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex flex-col gap-8 animate-fade-in">
        <PageHeader
          title={t("reportsPageTitle")}
          intro={t("ux3ReportsIntro")}
          action={
            <>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>{t("reportsPeriod")}</Label>
              <Select
                value={periodValue || undefined}
                onValueChange={(v) => {
                  if (!v) return;
                  const [f, tVal] = v.split("|");
                  setFrom(f);
                  setTo(tVal);
                }}
                disabled={hasNoData}
              >
                <SelectTrigger className="w-full min-w-0 min-h-12 sm:min-w-[220px]">
                  <SelectValue
                    placeholder={
                      hasNoData
                        ? t("reportsNoPeriodsPlaceholder")
                        : t("loading")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={`${p.from}|${p.to}`} value={`${p.from}|${p.to}`}>
                      {getPeriodForDate(p.from, locale).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>{t("reportsPrint")}</Label>
              <Select
                value={printScope}
                onValueChange={(v) => setPrintScope(v as PrintScope)}
              >
                <SelectTrigger className="w-full min-w-0 min-h-12 sm:min-w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">{t("reportsPrintBoth")}</SelectItem>
                  <SelectItem value="day">{t("reportsPrintDay")}</SelectItem>
                  <SelectItem value="night">{t("reportsPrintNight")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={handlePrint}
              className="min-h-12 px-6"
            >
              <Printer data-icon="inline-start" className="size-4" aria-hidden />
              {t("reportsPrintButton")}
            </Button>
            </>
          }
        />

        {hasNoData && (
          <p className="py-4 text-base text-muted-foreground">
            {t("reportsNoDataHint")}
          </p>
        )}

        {!hasNoData && periodValue && (
          <div className="flex flex-col gap-8">
            <Card className="p-6 sm:p-8">
              <CardHeader className="p-0 mb-5">
                <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
                  <Package className="size-5 shrink-0 text-primary" />
                  {t("reportsCumulativeTitle")}
                </CardTitle>
                <p className="text-base leading-relaxed text-muted-foreground mt-1">
                  {t("reportsCumulativeDesc")}
                </p>
              </CardHeader>
              <CardContent className="p-0">
              <div className="min-w-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("reportsColPackagingGroup")}</TableHead>
                      <TableHead className="text-right tabular-nums">{t("colDay")}</TableHead>
                      <TableHead className="text-right tabular-nums">{t("colNight")}</TableHead>
                      <TableHead className="text-right tabular-nums">{t("colTotal")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cumulativeRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground"
                        >
                          {t("reportsNoProductionInPeriod")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      cumulativeRows.map((r) => (
                        <TableRow key={r.itemId}>
                          <TableCell>{r.itemName}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{number(r.dayQty)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{number(r.nightQty)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{number(r.qty)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              </CardContent>
            </Card>

            <Card className="p-6 sm:p-8">
              <CardHeader className="p-0 mb-5">
                <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
                  <BarChart2 className="size-5 shrink-0 text-primary" />
                  {t("reportsByDateDayTitle")}
                </CardTitle>
                <p className="text-base text-muted-foreground mt-1">
                  {t("reportsByDateDayDesc")}
                </p>
              </CardHeader>
              <CardContent className="p-0">
              <div className="min-w-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-card whitespace-nowrap">
                        {t("dashboardDate")}
                      </TableHead>
                      {cumulativeRows.map((i) => (
                        <TableHead
                          key={i.itemId}
                          className="whitespace-nowrap text-right"
                        >
                          {i.itemName}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datesDay.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={cumulativeRows.length + 1}
                          className="text-center text-muted-foreground"
                        >
                          {t("reportsNoProductionInPeriod")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      datesDay.map((date) => (
                        <TableRow key={date}>
                          <TableCell className="sticky left-0 z-10 bg-card font-medium text-muted-foreground whitespace-nowrap">
                            {date}
                          </TableCell>
                          {cumulativeRows.map((i) => {
                            const qty =
                              byDateItemDay[`${date}|${i.itemId}`] ?? "";
                            return (
                              <TableCell
                                key={i.itemId}
                                className="text-right tabular-nums"
                              >
                                {typeof qty === "number" ? number(qty) : "—"}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              </CardContent>
            </Card>

            <Card className="p-6 sm:p-8">
              <CardHeader className="p-0 mb-5">
                <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
                  <BarChart2 className="size-5 shrink-0 text-primary" />
                  {t("reportsByDateNightTitle")}
                </CardTitle>
                <p className="text-base text-muted-foreground mt-1">
                  {t("reportsByDateNightDesc")}
                </p>
              </CardHeader>
              <CardContent className="p-0">
              <div className="min-w-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-card whitespace-nowrap">
                        {t("dashboardDate")}
                      </TableHead>
                      {cumulativeRows.map((i) => (
                        <TableHead
                          key={i.itemId}
                          className="whitespace-nowrap text-right"
                        >
                          {i.itemName}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datesNight.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={cumulativeRows.length + 1}
                          className="text-center text-muted-foreground"
                        >
                          {t("reportsNoProductionInPeriod")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      datesNight.map((date) => (
                        <TableRow key={date}>
                          <TableCell className="sticky left-0 z-10 bg-card font-medium text-muted-foreground whitespace-nowrap">
                            {date}
                          </TableCell>
                          {cumulativeRows.map((i) => {
                            const qty =
                              byDateItemNight[`${date}|${i.itemId}`] ?? "";
                            return (
                              <TableCell
                                key={i.itemId}
                                className="text-right tabular-nums"
                              >
                                {typeof qty === "number" ? number(qty) : "—"}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </AppShell>
  );
}
