"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonthSelect } from "@/components/employee/month-select";
import { PayrollPeriodBadge } from "@/components/payroll-period-badge";
import { useLanguage } from "@/components/language-provider";
import { currency, dateDisplay, number } from "@/lib/utils/formatter";
import type { MonthRangeMode } from "@/lib/utils/date";
import type { SalaryRange } from "@/lib/utils/employeeDetail";

export type SalaryRangeSummary = {
  presentDays: number;
  absentDays: number;
  earnedSundayPayDays: number;
  sundayPresentBonusDays: number;
  totalPaidDays: number;
  hoursExtraTotal: number;
  hoursReducedTotal: number;
  calculatedSalary: number;
};

/**
 * Attendance-and-salary for a chosen slice of the month, with the payroll
 * adjust badge and the printable range sheet.
 */
export function SalaryRangeCard({
  year,
  month,
  monthOptions,
  onMonthChange,
  mode,
  onModeChange,
  range,
  rangeLabel,
  monthBounds,
  onCustomFromChange,
  onCustomToChange,
  summary,
  hideRates,
  showBadge,
  badgeAdjusted,
  badgeLoading,
  onBadgeClick,
  onPrint,
}: {
  year: number;
  month: number;
  monthOptions: { value: string; label: string }[];
  onMonthChange: (year: number, month: number) => void;
  mode: MonthRangeMode;
  onModeChange: (mode: MonthRangeMode) => void;
  range: SalaryRange;
  rangeLabel: string;
  monthBounds: { from: string; to: string };
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  summary: SalaryRangeSummary;
  hideRates: boolean;
  showBadge: boolean;
  badgeAdjusted: boolean;
  badgeLoading: boolean;
  onBadgeClick: () => void;
  onPrint: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Card className="p-6 sm:p-8 transition-all duration-300 ease-out animate-fade-in animate-stagger-4">
      <CardHeader className="p-0 mb-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl font-semibold font-heading">
                {t("empSalaryAttendanceRange")}
              </CardTitle>
              {showBadge ? (
                <PayrollPeriodBadge
                  label={rangeLabel}
                  adjusted={badgeAdjusted}
                  loading={badgeLoading}
                  onClick={onBadgeClick}
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
              <MonthSelect
                id="attendance-salary-month"
                year={year}
                month={month}
                options={monthOptions}
                onChange={onMonthChange}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="attendance-salary-range-mode">
                {t("empSalaryRangeBoxRange")}
              </Label>
              <Select
                value={mode}
                onValueChange={(value) => onModeChange(value as MonthRangeMode)}
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
                      lastDay: new Date(year, month + 1, 0).getDate(),
                    })}
                  </SelectItem>
                  <SelectItem value="custom">
                    {t("empSalaryRangeCustom")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "custom" && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="attendance-salary-from">
                    {t("labelFrom")}
                  </Label>
                  <DatePicker
                    id="attendance-salary-from"
                    value={range.from}
                    onChange={onCustomFromChange}
                    min={monthBounds.from}
                    max={monthBounds.to}
                    className="min-w-[180px] min-h-12"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="attendance-salary-to">{t("labelTo")}</Label>
                  <DatePicker
                    id="attendance-salary-to"
                    value={range.to}
                    onChange={onCustomToChange}
                    min={monthBounds.from}
                    max={monthBounds.to}
                    className="min-w-[180px] min-h-12"
                  />
                </div>
              </>
            )}
            <Button type="button" className="min-h-12 px-6" onClick={onPrint}>
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
              {rangeLabel}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {dateDisplay(range.from)} – {dateDisplay(range.to)}
            </p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("empPresentAbsent")}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
              {number(summary.presentDays)} / {number(summary.absentDays)}
            </p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("empEarnedSundayShort")}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
              {number(summary.earnedSundayPayDays)} /{" "}
              {number(summary.sundayPresentBonusDays)}
            </p>
          </div>
          {!hideRates && (
            <div className="rounded-xl border-2 border-primary/25 bg-primary/10 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                {t("empSalaryContribution")}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                {currency(summary.calculatedSalary)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("empPaidDaysHoursSummary", {
                  paid: number(summary.totalPaidDays),
                  extra: number(summary.hoursExtraTotal),
                  reduced: number(summary.hoursReducedTotal),
                })}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
