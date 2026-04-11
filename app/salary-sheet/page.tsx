"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Printer, FileSpreadsheet } from "lucide-react";
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
import { openDB } from "@/lib/db/adapter";
import { isLoggedIn, checkExpiry } from "@/lib/auth";
import { getSalarySheetForMonth } from "@/lib/services/salarySheetService";
import type { SalarySheetRow } from "@/lib/services/salarySheetService";
import {
  getMonthRange,
  formatMonthYear,
  today,
} from "@/lib/utils/date";
import { currency, number } from "@/lib/utils/formatter";
import { printHtml } from "@/lib/utils/print";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getMonthOptions(count = 24): { year: number; month: number; label: string }[] {
  const now = new Date();
  const options: { year: number; month: number; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  return options;
}

function buildPrintableHtml(
  rows: SalarySheetRow[],
  monthLabel: string,
  from: string,
  to: string
): string {
  const printStyles =
    "body{margin:0;font-family:system-ui,sans-serif;font-size:12px;color:#0a0a0a;background:#fff;padding:16px}.mb-4{margin-bottom:12px}.mb-6{margin-bottom:20px}.text-2xl{font-size:1.5rem;font-weight:700}.text-sm{font-size:0.75rem}.text-gray-600{color:#52525b}.border{border:1px solid #e4e4e7}.w-full{width:100%}.table{width:100%;font-size:10px;border-collapse:collapse}.table th,.table td{padding:5px 6px;text-align:left;border:1px solid #e4e4e7}.table th{background:#f4f4f5;font-weight:600}.text-right{text-align:right}.no-print{display:none!important}";

  const colCount = 12;
  const rowsHtml =
    rows.length === 0
      ? `<tr><td colspan="${colCount}" class="border" style="padding:12px;color:#71717a;text-align:center">No employees for this month.</td></tr>`
      : rows
          .map(
            (r) =>
              `<tr>
                <td class="border" style="padding:5px 6px">${r.name}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.presentDays)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.absentDays)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.earnedSundayPayDays)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.sundayPresentBonusDays)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.totalPaidDays)}</td>
                <td class="border text-right" style="padding:5px 6px">${currency(r.monthlySalary)}</td>
                <td class="border text-right" style="padding:5px 6px">${currency(r.ratePerDay)}</td>
                <td class="border text-right" style="padding:5px 6px">${currency(r.ratePerHour)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.hoursExtraTotal)}</td>
                <td class="border text-right" style="padding:5px 6px">${number(r.hoursReducedTotal)}</td>
                <td class="border text-right font-semibold" style="padding:5px 6px">${currency(r.calculatedSalary)}</td>
              </tr>`
          )
          .join("");

  const totalSalary = rows.reduce((sum, r) => sum + r.calculatedSalary, 0);
  const totalRow =
    rows.length > 0
      ? `<tr class="border-t-2" style="border-top:2px solid #0a0a0a">
          <td class="border font-semibold" style="padding:8px">Total</td>
          <td class="border text-right" colspan="${colCount - 2}" style="padding:8px"></td>
          <td class="border text-right font-bold" style="padding:8px">${currency(totalSalary)}</td>
        </tr>`
      : "";

  const head = `<tr class="border"><th class="border" style="padding:5px 6px">Employee</th><th class="border text-right" style="padding:5px 6px">Present</th><th class="border text-right" style="padding:5px 6px">Absent</th><th class="border text-right" style="padding:5px 6px">Earned Sun.</th><th class="border text-right" style="padding:5px 6px">Sun. +</th><th class="border text-right" style="padding:5px 6px">Paid days</th><th class="border text-right" style="padding:5px 6px">Mo. salary</th><th class="border text-right" style="padding:5px 6px">/ day</th><th class="border text-right" style="padding:5px 6px">/ hr</th><th class="border text-right" style="padding:5px 6px">+ hrs</th><th class="border text-right" style="padding:5px 6px">− hrs</th><th class="border text-right" style="padding:5px 6px">Salary</th></tr>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Salary sheet – ${monthLabel}</title><style>${printStyles}</style></head><body id="printArea"><div style="max-width:100%;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px"><div><h1 class="text-2xl">ProdTrack Lite</h1><p class="text-sm text-gray-600">Salary sheet – ${monthLabel}</p></div><div class="text-sm text-right"><p><strong>Month:</strong> ${monthLabel}</p><p><strong>Period:</strong> ${from} – ${to}</p></div></div><table class="table w-full"><thead>${head}</thead><tbody>${rowsHtml}${totalRow}</tbody></table></div></body></html>`;
}

export default function SalarySheetPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(() => {
    const t = new Date();
    return t.getFullYear();
  });
  const [month, setMonth] = useState(() => {
    const t = new Date();
    return t.getMonth();
  });
  const [rows, setRows] = useState<SalarySheetRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const monthOptions = getMonthOptions(24);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSalarySheetForMonth(year, month);
      setRows(result.rows);
      setFrom(result.from);
      setTo(result.to);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    openDB()
      .then(() => {
        if (!isLoggedIn() || checkExpiry()) {
          router.replace("/login");
          return;
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  const handleMonthChange = (value: string) => {
    const [y, m] = value.split("-").map(Number);
    setYear(y);
    setMonth(m);
  };

  const handlePrint = () => {
    console.log("[print] Print button clicked (salary sheet)");
    const monthLabel = formatMonthYear(`${year}-${String(month + 1).padStart(2, "0")}-01`);
    const html = buildPrintableHtml(rows, monthLabel, from, to);
    console.log("[print] Got HTML, length:", html?.length ?? 0);
    printHtml(html);
  };

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner className="size-5" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  const monthValue = `${year}-${month}`;
  const monthLabel = formatMonthYear(`${year}-${String(month + 1).padStart(2, "0")}-01`);
  const hasNoEmployees = rows.length === 0 && !loading;

  return (
    <AppShell>
      <main className="flex flex-col gap-8 animate-fade-in">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-bold text-foreground font-heading">
            Salary sheet
          </h1>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="salary-month">Month</Label>
              <Select
                value={monthValue}
                onValueChange={handleMonthChange}
              >
                <SelectTrigger id="salary-month" className="min-w-[200px] min-h-12">
                  <SelectValue placeholder="Select month" />
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
            <Button
              type="button"
              onClick={handlePrint}
              className="min-h-12 px-6"
            >
              <Printer data-icon="inline-start" className="size-4" />
              Print
            </Button>
          </div>
        </div>

        <Card className="p-6 sm:p-8">
          <CardHeader className="p-0 mb-5">
            <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" />
              {monthLabel}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Attendance, hourly adjustments (extra / less), monthly and effective rates, and calculated salary for the selected month.
            </p>
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
                  <EmptyTitle>No employees</EmptyTitle>
                  <EmptyDescription>
                    Add employees in Settings to see the salary sheet for this month.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right tabular-nums">Present</TableHead>
                      <TableHead className="text-right tabular-nums">Absent</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">Earned Sun.</TableHead>
                      <TableHead className="text-right tabular-nums">Sun. +</TableHead>
                      <TableHead className="text-right tabular-nums">Paid days</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">Monthly</TableHead>
                      <TableHead className="text-right tabular-nums">/ day</TableHead>
                      <TableHead className="text-right tabular-nums">/ hr</TableHead>
                      <TableHead className="text-right tabular-nums">+ hrs</TableHead>
                      <TableHead className="text-right tabular-nums">− hrs</TableHead>
                      <TableHead className="text-right tabular-nums">Salary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
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
                        aria-label={`View ${r.name}`}
                      >
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(r.presentDays)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(r.absentDays)}</TableCell>
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
