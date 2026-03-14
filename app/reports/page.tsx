"use client";

import { useEffect, useState } from "react";
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
import { openDB } from "@/lib/db/adapter";
import { isLoggedIn, checkExpiry } from "@/lib/auth";
import {
  getProductionsInRange,
  getProductions,
} from "@/lib/services/productionService";
import { getItems } from "@/lib/services/itemService";
import { getPeriodForDate, getPeriodsWithData } from "@/lib/utils/date";
import { number, dateDisplay } from "@/lib/utils/formatter";
import { useRouter } from "next/navigation";
import { printHtml } from "@/lib/utils/print";
import { Package, BarChart2 } from "lucide-react";

type PrintScope = "both" | "day" | "night";

interface CumulativeRow {
  itemId: string;
  itemName: string;
  dayQty: number;
  nightQty: number;
  qty: number;
}

export default function ReportsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [periods, setPeriods] = useState<
    { from: string; to: string; label: string }[]
  >([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [printScope, setPrintScope] = useState<PrintScope>("both");
  const [productions, setProductions] = useState<Record<string, unknown>[]>([]);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    openDB()
      .then(() => {
        if (!isLoggedIn() || checkExpiry()) {
          router.replace("/login");
          return;
        }
        getProductions().then((prods) => {
          const withData = getPeriodsWithData(prods);
          setPeriods(withData);
          const current = getPeriodForDate(
            new Date().toISOString().slice(0, 10),
          );
          const selected = withData.some((p) => p.from === current.from)
            ? current.from
            : (withData[withData.length - 1]?.from ?? "");
          const period = withData.find((p) => p.from === selected);
          if (period) {
            setFrom(period.from);
            setTo(period.to);
          }
          setReady(true);
        });
      })
      .catch(() => setReady(true));
  }, [router]);

  useEffect(() => {
    if (!ready || !from || !to) return;
    Promise.all([getProductionsInRange(from, to), getItems()]).then(
      ([prods, itemsList]) => {
        setProductions(prods);
        setItems(itemsList);
      },
    );
  }, [ready, from, to]);

  const itemMap = Object.fromEntries(
    items.map((i) => [i.id as string, i]),
  ) as Record<string, Record<string, unknown>>;

  const byItem: Record<string, number> = {};
  const byItemDay: Record<string, number> = {};
  const byItemNight: Record<string, number> = {};
  const byDateItemDay: Record<
    string,
    { date: string; itemId: string; qty: number }
  > = {};
  const byDateItemNight: Record<
    string,
    { date: string; itemId: string; qty: number }
  > = {};

  productions.forEach((p) => {
    const qty = (p.quantity as number) || 0;
    const shift = p.shift === "night" ? "night" : "day";
    const itemId = p.itemId as string;
    const date = p.date as string;
    byItem[itemId] = (byItem[itemId] || 0) + qty;
    const key = `${date}|${itemId}`;
    if (shift === "night") {
      byItemNight[itemId] = (byItemNight[itemId] || 0) + qty;
      if (!byDateItemNight[key])
        byDateItemNight[key] = { date, itemId, qty: 0 };
      byDateItemNight[key].qty += qty;
    } else {
      byItemDay[itemId] = (byItemDay[itemId] || 0) + qty;
      if (!byDateItemDay[key]) byDateItemDay[key] = { date, itemId, qty: 0 };
      byDateItemDay[key].qty += qty;
    }
  });

  const itemIds = Array.from(new Set(Object.keys(byItem)));
  const cumulativeRows: CumulativeRow[] = itemIds
    .map((itemId) => ({
      itemId,
      itemName: (itemMap[itemId]?.name as string) || itemId,
      dayQty: byItemDay[itemId] || 0,
      nightQty: byItemNight[itemId] || 0,
      qty: byItem[itemId],
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  const datesDay = Array.from(
    new Set(
      productions
        .filter((p) => p.shift !== "night")
        .map((p) => p.date as string),
    ),
  ).sort();
  const datesNight = Array.from(
    new Set(
      productions
        .filter((p) => p.shift === "night")
        .map((p) => p.date as string),
    ),
  ).sort();

  const handlePrint = async () => {
    const scope = printScope;
    const itemIdsPrint = Array.from(new Set(Object.keys(byItem)));
    const cumRows = itemIdsPrint
      .map((itemId) => ({
        itemId,
        itemName: (itemMap[itemId]?.name as string) || itemId,
        dayQty: byItemDay[itemId] || 0,
        nightQty: byItemNight[itemId] || 0,
        qty: byItem[itemId],
      }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName));

    const periodLabel = `${dateDisplay(from)} – ${dateDisplay(to)}`;
    const filterLabel =
      scope === "day"
        ? " (Day shift only)"
        : scope === "night"
          ? " (Night shift only)"
          : "";
    const cumulativeDesc =
      scope === "day"
        ? "Day-shift quantity per packaging item group (all employees)."
        : scope === "night"
          ? "Night-shift quantity per packaging item group (all employees)."
          : "Day and night quantity per packaging item group (all employees).";

    let cumulativeTableHeader: string;
    let cumulativeRowsHtml: string;
    if (scope === "day") {
      cumulativeTableHeader =
        '<tr class="border"><th class="border" style="padding:6px">Packaging item group</th><th class="border text-right" style="padding:6px">Day</th></tr>';
      cumulativeRowsHtml =
        cumRows.length === 0
          ? '<tr><td colspan="2" class="border" style="padding:6px;color:#71717a">No production in this period.</td></tr>'
          : cumRows
              .map(
                (r) =>
                  `<tr><td class="border" style="padding:4px 6px">${r.itemName}</td><td class="border text-right" style="padding:4px 6px">${number(r.dayQty)}</td></tr>`,
              )
              .join("");
    } else if (scope === "night") {
      cumulativeTableHeader =
        '<tr class="border"><th class="border" style="padding:6px">Packaging item group</th><th class="border text-right" style="padding:6px">Night</th></tr>';
      cumulativeRowsHtml =
        cumRows.length === 0
          ? '<tr><td colspan="2" class="border" style="padding:6px;color:#71717a">No production in this period.</td></tr>'
          : cumRows
              .map(
                (r) =>
                  `<tr><td class="border" style="padding:4px 6px">${r.itemName}</td><td class="border text-right" style="padding:4px 6px">${number(r.nightQty)}</td></tr>`,
              )
              .join("");
    } else {
      cumulativeTableHeader =
        '<tr class="border"><th class="border" style="padding:6px">Packaging item group</th><th class="border text-right" style="padding:6px">Day</th><th class="border text-right" style="padding:6px">Night</th><th class="border text-right" style="padding:6px">Total</th></tr>';
      cumulativeRowsHtml =
        cumRows.length === 0
          ? '<tr><td colspan="4" class="border" style="padding:6px;color:#71717a">No production in this period.</td></tr>'
          : cumRows
              .map(
                (r) =>
                  `<tr><td class="border" style="padding:4px 6px">${r.itemName}</td><td class="border text-right" style="padding:4px 6px">${number(r.dayQty)}</td><td class="border text-right" style="padding:4px 6px">${number(r.nightQty)}</td><td class="border text-right" style="padding:4px 6px">${number(r.qty)}</td></tr>`,
              )
              .join("");
    }

    const printStyles =
      "body{margin:0;font-family:system-ui,sans-serif;font-size:12px;color:#0a0a0a;background:#fff;padding:16px}.mb-4{margin-bottom:12px}.mb-6{margin-bottom:20px}.text-2xl{font-size:1.5rem;font-weight:700}.text-sm{font-size:0.75rem}.text-lg{font-size:1.125rem}.text-gray-600{color:#52525b}.border{border:1px solid #e4e4e7}.w-full{width:100%}.table{width:100%;font-size:11px;border-collapse:collapse}.table th,.table td{padding:4px 6px;text-align:left;border:1px solid #e4e4e7}.table th{background:#f4f4f5;font-weight:600}.text-right{text-align:right}";
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Production report – ${periodLabel}</title><style>${printStyles}</style></head><body><div style="max-width:100%;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px"><div><h1 class="text-2xl">ProdTrack Lite</h1><p class="text-sm text-gray-600">Production report${filterLabel}</p></div><div class="text-sm text-right"><p><strong>Period:</strong> ${periodLabel}</p></div></div><h2 class="text-lg" style="font-weight:600;margin-bottom:6px">Cumulative by packaging item group</h2><p class="text-sm text-gray-600 mb-4">${cumulativeDesc}</p><table class="table w-full mb-6"><thead>${cumulativeTableHeader}</thead><tbody>${cumulativeRowsHtml}</tbody></table></div></body></html>`;
    printHtml(html);
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
  const hasNoData = periods.length === 0;

  return (
    <AppShell>
      <main className="flex flex-col gap-8 animate-fade-in">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-bold text-foreground font-heading">
            Production report
          </h1>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label>Period</Label>
              <Select
                value={periodValue || undefined}
                onValueChange={(v) => {
                  if (!v) return;
                  const [f, t] = v.split("|");
                  setFrom(f);
                  setTo(t);
                }}
                disabled={hasNoData}
              >
                <SelectTrigger className="min-w-[220px] min-h-12">
                  <SelectValue placeholder={hasNoData ? "No periods with data" : "Loading…"} />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={`${p.from}|${p.to}`} value={`${p.from}|${p.to}`}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Print</Label>
              <Select
                value={printScope}
                onValueChange={(v) => setPrintScope(v as PrintScope)}
              >
                <SelectTrigger className="min-w-[180px] min-h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both (Day + Night)</SelectItem>
                  <SelectItem value="day">Day shift only</SelectItem>
                  <SelectItem value="night">Night shift only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={handlePrint}
              className="h-12 shrink-0 px-6"
            >
              Print report
            </Button>
          </div>
        </div>

        {hasNoData && (
          <p className="py-4 text-base text-muted-foreground">
            No production data yet. Add production from the Dashboard or Employee pages to see reports.
          </p>
        )}

        {!hasNoData && periodValue && (
          <div className="flex flex-col gap-8">
            <Card className="p-6 sm:p-8">
              <CardHeader className="p-0 mb-5">
                <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
                  <Package className="size-5 text-primary" />
                  Cumulative by packaging item group
                </CardTitle>
                <p className="text-base leading-relaxed text-muted-foreground mt-1">
                  Day and night quantity per packaging item group in the selected period (all
                  employees).
                </p>
              </CardHeader>
              <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Packaging item group</TableHead>
                      <TableHead className="text-right tabular-nums">Day</TableHead>
                      <TableHead className="text-right tabular-nums">Night</TableHead>
                      <TableHead className="text-right tabular-nums">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cumulativeRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground"
                        >
                          No production in this period.
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
                  <BarChart2 className="size-5 text-primary" />
                  By date – Day shift (matrix)
                </CardTitle>
                <p className="text-base text-muted-foreground mt-1">
                  Rows = dates, columns = packaging item groups. Day-shift quantity only.
                </p>
              </CardHeader>
              <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-card whitespace-nowrap">
                        Date
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
                          No production in this period.
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
                              byDateItemDay[`${date}|${i.itemId}`]?.qty ?? "";
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
                  <BarChart2 className="size-5 text-primary" />
                  By date – Night shift (matrix)
                </CardTitle>
                <p className="text-base text-muted-foreground mt-1">
                  Rows = dates, columns = packaging item groups. Night-shift quantity only.
                </p>
              </CardHeader>
              <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-card whitespace-nowrap">
                        Date
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
                          No production in this period.
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
                              byDateItemNight[`${date}|${i.itemId}`]?.qty ?? "";
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
