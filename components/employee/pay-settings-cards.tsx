"use client";

import { CalendarDays, Clock, IndianRupee } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/components/language-provider";
import { currency } from "@/lib/utils/formatter";
import type { SundayCategory } from "@/lib/services/sundayCategoryService";
import type { Row } from "@/lib/utils/employeeDetail";

/**
 * Shift, Sunday category, monthly salary and the derived day/hour rates.
 * Every write goes through `onSave`, which owns error handling and revert.
 */
export function PaySettingsCards({
  shiftId,
  sundayCategoryId,
  monthlySalary,
  shifts,
  sundayCategories,
  ratePerDay,
  ratePerHour,
  hoursPerDay,
  calendarDaysInMonth,
  workingDays,
  monthTitle,
  hideRates,
  onSave,
  onMonthlySalaryDraft,
}: {
  shiftId: string | undefined;
  sundayCategoryId: string | undefined;
  monthlySalary: number;
  shifts: Row[];
  sundayCategories: SundayCategory[];
  ratePerDay: number;
  ratePerHour: number;
  hoursPerDay: number;
  calendarDaysInMonth: number;
  workingDays: number;
  monthTitle: string;
  hideRates: boolean;
  onSave: (patch: Row) => void | Promise<void>;
  onMonthlySalaryDraft: (value: number) => void;
}) {
  const { t } = useLanguage();
  return (
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
            value={shiftId ?? "_none"}
            onValueChange={(v) => {
              void onSave({ shiftId: v === "_none" ? undefined : v });
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
            value={sundayCategoryId ?? "_default"}
            onValueChange={(v) => {
              void onSave({
                sundayCategoryId: v === "_default" ? undefined : v,
              });
            }}
          >
            <SelectTrigger
              id="emp-sunday-category"
              className="w-full min-h-10"
            >
              <SelectValue placeholder={t("employeesSundayDefault")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_default">
                {t("employeesSundayDefault")}
              </SelectItem>
              {sundayCategories.map((c) => (
                <SelectItem key={c.id as string} value={c.id as string}>
                  {c.name as string}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!hideRates && (
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
              onChange={(e) =>
                onMonthlySalaryDraft(parseFloat(e.target.value) || 0)
              }
              onBlur={(e) => {
                const v =
                  parseFloat((e.target as HTMLInputElement).value) || 0;
                void onSave({ monthlySalary: v });
              }}
              className="w-full min-h-10"
              placeholder="0"
            />
          </CardContent>
        </Card>
      )}

      {!hideRates && (
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
                month: monthTitle,
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {!hideRates && (
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
  );
}
