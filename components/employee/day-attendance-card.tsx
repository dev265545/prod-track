"use client";

import { CalendarDays, Check, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { useLanguage } from "@/components/language-provider";
import { currency, dateDisplay } from "@/lib/utils/formatter";
import { hoursInputsChanged, type Row } from "@/lib/utils/employeeDetail";

/**
 * Mark the selected day present or absent, clear it, and adjust its hours.
 *
 * The hours inputs are handed in already resolved for `selectedDate`, so the
 * numbers on screen always belong to the day being written.
 */
export function DayAttendanceCard({
  selectedDate,
  record,
  hoursReduced,
  hoursExtra,
  ratePerHour,
  hideRates,
  onHoursReducedChange,
  onHoursExtraChange,
  onMarkPresent,
  onMarkAbsent,
  onClear,
  onSaveHours,
}: {
  selectedDate: string | null;
  record: Row | undefined;
  hoursReduced: string;
  hoursExtra: string;
  ratePerHour: number;
  hideRates: boolean;
  onHoursReducedChange: (value: string) => void;
  onHoursExtraChange: (value: string) => void;
  onMarkPresent: () => void;
  onMarkAbsent: () => void;
  onClear: () => void;
  onSaveHours: () => void;
}) {
  const { t } = useLanguage();
  const isPresent = record?.status === "present";
  const isAbsent = record?.status === "absent";
  const dateLabel = selectedDate ? dateDisplay(selectedDate) : t("empThisDate");

  return (
    <Card className="p-3 flex flex-col min-h-0 min-w-0">
      <CardHeader className="p-0 pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <CalendarDays className="size-3.5 text-primary shrink-0" />
          {selectedDate
            ? t("empAttendanceDateTitle", { date: dateDisplay(selectedDate) })
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
                variant={isPresent ? "default" : "secondary"}
                size="sm"
                className={
                  isPresent
                    ? "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-[hsl(var(--success-foreground))] h-8 px-3 text-xs"
                    : "h-8 px-3 text-xs"
                }
                onClick={onMarkPresent}
              >
                <Check data-icon="inline-start" />
                {t("empBtnPresent")}
              </Button>
              <Button
                type="button"
                variant={isAbsent ? "destructive" : "secondary"}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={onMarkAbsent}
              >
                <X data-icon="inline-start" />
                {t("empBtnAbsent")}
              </Button>
              {record && (
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
                        {t("empClearAttendanceDesc", { date: dateLabel })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("commonCancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={onClear}
                      >
                        {t("commonClear")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            {isPresent && (
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
                      value={hoursReduced}
                      onChange={(e) => onHoursReducedChange(e.target.value)}
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
                      value={hoursExtra}
                      onChange={(e) => onHoursExtraChange(e.target.value)}
                    />
                  </div>
                </div>
                {!hideRates && (
                  <p className="text-xs text-muted-foreground">
                    {t("empRatePerHourLine", { rate: currency(ratePerHour) })}
                  </p>
                )}
                {hoursInputsChanged(record, hoursReduced, hoursExtra) && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="mt-1 h-9 text-sm px-4"
                    onClick={onSaveHours}
                  >
                    {t("empSaveHours")}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
