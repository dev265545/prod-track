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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { saveEmployeeSortOrder } from "@/lib/services/employeeService";
import { getSalarySheetForRange } from "@/lib/services/salarySheetService";
import type { SalarySheetRow } from "@/lib/services/salarySheetService";
import {
  saveSalarySheetOverride,
  type SalarySheetOverrideValues,
} from "@/lib/services/salarySheetOverrideService";
import {
  clampDateToMonth,
  getMonthRange,
  getMonthRangePresets,
  getMonthRangeLabel,
  type MonthRangeMode,
  formatMonthYear,
} from "@/lib/utils/date";
import { currency, number } from "@/lib/utils/formatter";
import { printHtml } from "@/lib/utils/print";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type EditableOverrideField = keyof SalarySheetOverrideValues;

const OVERRIDE_FIELDS: Array<{
  key: EditableOverrideField;
  label: string;
}> = [
  { key: "presentDays", label: "Present days" },
  { key: "absentDays", label: "Absent days" },
  { key: "holidayPresentDays", label: "Holiday present" },
  { key: "earnedSundayPayDays", label: "Extra days earned" },
  { key: "sundayPresentBonusDays", label: "Sunday present bonus" },
  { key: "totalPaidDays", label: "Total paid days" },
  { key: "hoursExtraTotal", label: "Extra hours" },
  { key: "hoursReducedTotal", label: "Less hours" },
  { key: "calculatedSalary", label: "Salary" },
];

function formatOverrideValue(value: number | undefined): string {
  return value == null ? "" : String(value);
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.round(parsed * 100) / 100;
}

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

  const colCount = 13;
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

  const head = `<tr class="border"><th class="border" style="padding:5px 6px">Employee</th><th class="border text-right" style="padding:5px 6px">Present</th><th class="border text-right" style="padding:5px 6px">Absent</th><th class="border text-right" style="padding:5px 6px">Holiday present</th><th class="border text-right" style="padding:5px 6px">Earned Sun.</th><th class="border text-right" style="padding:5px 6px">Sun. +</th><th class="border text-right" style="padding:5px 6px">Paid days</th><th class="border text-right" style="padding:5px 6px">Mo. salary</th><th class="border text-right" style="padding:5px 6px">/ day</th><th class="border text-right" style="padding:5px 6px">/ hr</th><th class="border text-right" style="padding:5px 6px">+ hrs</th><th class="border text-right" style="padding:5px 6px">− hrs</th><th class="border text-right" style="padding:5px 6px">Salary</th></tr>`;

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
  const [rangeMode, setRangeMode] = useState<MonthRangeMode>("full-month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<SalarySheetRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [editingRow, setEditingRow] = useState<SalarySheetRow | null>(null);
  const [draftOverrideValues, setDraftOverrideValues] = useState<
    Partial<Record<EditableOverrideField, string>>
  >({});
  const [draftNotes, setDraftNotes] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  const monthOptions = getMonthOptions(24);
  const monthBounds = getMonthRange(year, month);
  const rangePresets = getMonthRangePresets(year, month);
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

  const handlePrint = () => {
    console.log("[print] Print button clicked (salary sheet)");
    const titleLabel =
      rangeMode === "full-month"
        ? formatMonthYear(`${year}-${String(month + 1).padStart(2, "0")}-01`)
        : selectedRange.label;
    const html = buildPrintableHtml(rows, titleLabel, from, to);
    console.log("[print] Got HTML, length:", html?.length ?? 0);
    printHtml(html);
  };

  const openAdjustModal = (row: SalarySheetRow) => {
    setEditingRow(row);
    setDraftOverrideValues(
      OVERRIDE_FIELDS.reduce<Partial<Record<EditableOverrideField, string>>>(
        (acc, field) => {
          acc[field.key] = formatOverrideValue(row.overrideValues[field.key]);
          return acc;
        },
        {},
      ),
    );
    setDraftNotes(row.overrideNotes);
  };

  const closeAdjustModal = (force = false) => {
    if (savingOverride && !force) return;
    setEditingRow(null);
    setDraftOverrideValues({});
    setDraftNotes("");
  };

  const resetDraftField = (field: EditableOverrideField) => {
    setDraftOverrideValues((current) => ({
      ...current,
      [field]: "",
    }));
  };

  const resetAllDraftFields = () => {
    setDraftOverrideValues(
      OVERRIDE_FIELDS.reduce<Partial<Record<EditableOverrideField, string>>>(
        (acc, field) => {
          acc[field.key] = "";
          return acc;
        },
        {},
      ),
    );
    setDraftNotes("");
  };

  const saveAdjustments = async () => {
    if (!editingRow) return;
    const overrides: SalarySheetOverrideValues = {};
    for (const field of OVERRIDE_FIELDS) {
      const parsed = parseOptionalNumber(draftOverrideValues[field.key] ?? "");
      if (parsed != null) {
        overrides[field.key] = parsed;
      }
    }

    setSavingOverride(true);
    try {
      await saveSalarySheetOverride({
        employeeId: editingRow.id,
        year,
        month,
        fromDate: from,
        toDate: to,
        notes: draftNotes,
        overrides,
      });
      toast.success("Salary sheet adjustments saved");
      closeAdjustModal(true);
      await load();
    } catch {
      toast.error("Failed to save salary sheet adjustments");
    } finally {
      setSavingOverride(false);
    }
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
      toast.error("Failed to save employee order");
    } finally {
      setSavingOrder(false);
    }
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
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground font-heading">
              Salary sheet
            </h1>
            <p className="text-sm text-muted-foreground">
              Keep employee rows in the exact order you want for this sheet.
            </p>
          </div>
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="salary-range-mode">Range</Label>
              <Select
                value={rangeMode}
                onValueChange={(value) => setRangeMode(value as MonthRangeMode)}
              >
                <SelectTrigger
                  id="salary-range-mode"
                  className="min-w-[200px] min-h-12"
                >
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full-month">Full month</SelectItem>
                  <SelectItem value="first-half">1-15</SelectItem>
                  <SelectItem value="second-half">
                    {`16-${new Date(year, month + 1, 0).getDate()}`}
                  </SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rangeMode === "custom" && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="salary-range-from">From</Label>
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
                  <Label htmlFor="salary-range-to">To</Label>
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
              {reorderMode ? "Done ordering" : "Arrange order"}
            </Button>
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
              {rangeMode === "full-month" ? monthLabel : selectedRange.label}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Attendance, hourly adjustments (extra / less), monthly and effective rates, and calculated salary for the selected range.
            </p>
            {reorderMode && (
              <p className="text-sm text-muted-foreground mt-2">
                Use the arrow buttons to move employees. The order is saved immediately and stays fixed until you change it again.
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
                      {reorderMode && (
                        <TableHead className="w-[88px]">Order</TableHead>
                      )}
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right tabular-nums">Present</TableHead>
                      <TableHead className="text-right tabular-nums">Absent</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">Holiday present</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">Earned Sun.</TableHead>
                      <TableHead className="text-right tabular-nums">Sun. +</TableHead>
                      <TableHead className="text-right tabular-nums">Paid days</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">Monthly</TableHead>
                      <TableHead className="text-right tabular-nums">/ day</TableHead>
                      <TableHead className="text-right tabular-nums">/ hr</TableHead>
                      <TableHead className="text-right tabular-nums">+ hrs</TableHead>
                      <TableHead className="text-right tabular-nums">− hrs</TableHead>
                      <TableHead className="text-right tabular-nums">Salary</TableHead>
                      <TableHead className="text-right">Adjust</TableHead>
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
                                disabled={savingOrder || rows[0]?.id === r.id}
                                onClick={() => void moveRow(rows.findIndex((row) => row.id === r.id), -1)}
                                aria-label={`Move ${r.name} up`}
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={savingOrder || rows[rows.length - 1]?.id === r.id}
                                onClick={() => void moveRow(rows.findIndex((row) => row.id === r.id), 1)}
                                aria-label={`Move ${r.name} down`}
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{r.name}</TableCell>
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
                        <TableCell
                          className="text-right"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Button
                            type="button"
                            variant={r.hasOverrides ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => openAdjustModal(r)}
                          >
                            {r.hasOverrides ? "Adjusted" : "Adjust"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!editingRow} onOpenChange={(open) => !open && closeAdjustModal()}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                Adjust payroll values{editingRow ? ` · ${editingRow.name}` : ""}
              </DialogTitle>
              <DialogDescription>
                Blank fields stay automatic. Filled fields are saved permanently for this exact period: {from} to {to}.
              </DialogDescription>
            </DialogHeader>

            {editingRow && (
              <div className="grid gap-4">
                <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                  <p>
                    Effective values drive the salary sheet and print output. Calculated values stay visible here so manual corrections remain traceable.
                  </p>
                  {editingRow.overrideUpdatedAt ? (
                    <p className="mt-2">
                      Last adjusted: {editingRow.overrideUpdatedAt}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {OVERRIDE_FIELDS.map((field) => (
                    <div key={field.key} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <Label htmlFor={`override-${field.key}`}>{field.label}</Label>
                          <p className="text-xs text-muted-foreground">
                            Calculated: {field.key === "calculatedSalary"
                              ? currency(editingRow.calculatedValues[field.key])
                              : number(editingRow.calculatedValues[field.key])}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Current sheet: {field.key === "calculatedSalary"
                              ? currency(editingRow[field.key])
                              : number(editingRow[field.key])}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => resetDraftField(field.key)}
                        >
                          Auto
                        </Button>
                      </div>
                      <Input
                        id={`override-${field.key}`}
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        className="mt-3"
                        placeholder={
                          field.key === "calculatedSalary"
                            ? String(editingRow.calculatedValues[field.key])
                            : String(editingRow.calculatedValues[field.key])
                        }
                        value={draftOverrideValues[field.key] ?? ""}
                        onChange={(event) =>
                          setDraftOverrideValues((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border p-4">
                  <Label htmlFor="override-notes">Notes</Label>
                  <textarea
                    id="override-notes"
                    className="mt-3 min-h-24 w-full rounded-xl border-2 border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    placeholder="Why was this corrected?"
                    value={draftNotes}
                    onChange={(event) => setDraftNotes(event.target.value)}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closeAdjustModal()} disabled={savingOverride}>
                Cancel
              </Button>
              <Button type="button" variant="ghost" onClick={resetAllDraftFields} disabled={savingOverride}>
                Reset all to auto
              </Button>
              <Button type="button" onClick={() => void saveAdjustments()} disabled={savingOverride}>
                {savingOverride ? "Saving..." : "Save adjustments"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </AppShell>
  );
}
