"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import { PayrollPeriodBadge } from "@/components/payroll-period-badge";
import {
  formatMonthCalendarHeading,
  weekdayShortLabels,
} from "@/lib/utils/date";

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface EmployeeCalendarProps {
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  productions: Record<string, unknown>[];
  attendance: Record<string, unknown>[];
  factoryHolidays: string[];
  selectedDate: string | null;
  onDateClick: (date: string) => void;
  /** Double-click on a date to mark employee present (e.g. from employee dashboard). */
  onDateDoubleClick?: (date: string) => void;
  periodFrom: string;
  periodTo: string;
  /** When set (e.g. selected payroll period label), shown under the month title. */
  periodStatusLabel?: string;
  /** True when this period has saved manual payroll overrides. */
  periodAdjusted?: boolean;
  /** Opens the payroll adjust flow (employee dashboard). */
  onPeriodBadgeClick?: () => void;
  periodBadgeLoading?: boolean;
}

export function EmployeeCalendar({
  year,
  month,
  onMonthChange,
  productions,
  attendance,
  factoryHolidays,
  selectedDate,
  onDateClick,
  onDateDoubleClick,
  periodFrom,
  periodTo,
  periodStatusLabel,
  periodAdjusted = false,
  onPeriodBadgeClick,
  periodBadgeLoading = false,
}: EmployeeCalendarProps) {
  const { locale, t } = useLanguage();
  const dayLabels = useMemo(() => weekdayShortLabels(locale), [locale]);
  const daysInMonth = getLastDayOfMonth(year, month);
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const productionDates = useMemo(() => {
    const set = new Set<string>();
    productions.forEach((p) => set.add(p.date as string));
    return set;
  }, [productions]);

  const attendanceMap = useMemo(() => {
    const map = new Map<string, "present" | "absent">();
    attendance.forEach((a) =>
      map.set(a.date as string, a.status as "present" | "absent"),
    );
    return map;
  }, [attendance]);

  const hoursAdjustMap = useMemo(() => {
    const map = new Map<
      string,
      { extra?: number; reduced?: number }
    >();
    attendance.forEach((a) => {
      const date = a.date as string;
      const extra = a.hoursExtra as number | undefined;
      const reduced = a.hoursReduced as number | undefined;
      if (extra != null && extra > 0) map.set(date, { ...map.get(date), extra });
      if (reduced != null && reduced > 0)
        map.set(date, { ...map.get(date), reduced });
    });
    return map;
  }, [attendance]);

  const dayOffSet = useMemo(() => new Set(factoryHolidays), [factoryHolidays]);

  const today = toISODate(new Date());

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex h-full w-full min-w-[320px] max-w-[380px] flex-col rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            const prev = month === 0 ? 11 : month - 1;
            const py = month === 0 ? year - 1 : year;
            onMonthChange(py, prev);
          }}
          aria-label={t("calPrevMonth")}
          className="shrink-0"
        >
          <ChevronLeft data-icon="inline-start" />
        </Button>
        <div className="flex min-w-0 flex-col items-center gap-1">
          <h3 className="text-center font-heading text-base font-bold text-foreground">
            {formatMonthCalendarHeading(year, month, locale)}
          </h3>
          {periodStatusLabel ? (
            <PayrollPeriodBadge
              label={periodStatusLabel}
              adjusted={periodAdjusted}
              loading={periodBadgeLoading}
              onClick={onPeriodBadgeClick}
            />
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            const next = month === 11 ? 0 : month + 1;
            const ny = month === 11 ? year + 1 : year;
            onMonthChange(ny, next);
          }}
          aria-label={t("calNextMonth")}
          className="shrink-0"
        >
          <ChevronRight data-icon="inline-start" />
        </Button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {dayLabels.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-xs font-semibold text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 gap-1 content-stretch">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;

          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
          const isSunday = new Date(year, month, day).getDay() === 0;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const inPeriod = dateStr >= periodFrom && dateStr <= periodTo;
          const hasProd = productionDates.has(dateStr);
          const attStatus = attendanceMap.get(dateStr);
          const hoursAdjust = hoursAdjustMap.get(dateStr);
          const hasExtra = (hoursAdjust?.extra ?? 0) > 0;
          const hasReduced = (hoursAdjust?.reduced ?? 0) > 0;
          const isDayOff = dayOffSet.has(dateStr);

          return (
            <Button
              key={dateStr}
              type="button"
              variant="ghost"
              className={cn(
                "relative flex h-auto min-h-[48px] flex-col items-center justify-center rounded-lg p-2 text-sm transition-all",
                isSelected && "bg-chart-1/50 ring-2 ring-chart-1",
                inPeriod && !isSelected && "bg-chart-1/20",
                !inPeriod && !isSelected && "hover:bg-muted",
                isToday && "font-bold",
                isSunday && !isSelected && "text-muted-foreground",
                isDayOff && !isSelected && "bg-destructive/10",
              )}
              onClick={() => onDateClick(dateStr)}
              onDoubleClick={
                onDateDoubleClick
                  ? () => onDateDoubleClick(dateStr)
                  : undefined
              }
              aria-label={[
                t("calAriaDay", { day }),
                isDayOff ? t("calAriaHoliday") : "",
                attStatus === "present"
                  ? t("empCalAriaPresent")
                  : attStatus === "absent"
                    ? t("empCalAriaAbsent")
                    : "",
                hasProd ? t("empCalAriaHasProduction") : "",
                hasExtra ? t("empCalAriaExtraHours") : "",
                hasReduced ? t("empCalAriaReducedHours") : "",
              ]
                .filter(Boolean)
                .join("")}
              title={dateStr}
            >
              <span
                className={cn(
                  "text-xs leading-none",
                  isToday &&
                    "flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground",
                )}
              >
                {day}
              </span>
              <div className="mt-0.5 flex gap-0.5">
                {hasProd && (
                  <span
                    className="size-1.5 rounded-full bg-success"
                    title={t("calTitleProductionEntry")}
                    aria-hidden
                  />
                )}
                {attStatus === "present" && (
                  <span
                    className="size-1.5 rounded-full bg-primary"
                    title={t("calTitlePresent")}
                    aria-hidden
                  />
                )}
                {attStatus === "absent" && (
                  <span
                    className="size-1.5 rounded-full bg-destructive"
                    title={t("calTitleAbsent")}
                    aria-hidden
                  />
                )}
                {hasExtra && (
                  <span
                    className="size-1.5 rounded-full bg-chart-2"
                    title={t("calTitleExtraHours", {
                      h: hoursAdjust?.extra ?? 0,
                    })}
                    aria-hidden
                  />
                )}
                {hasReduced && (
                  <span
                    className="size-1.5 rounded-full bg-warning"
                    title={t("calTitleReducedHours", {
                      h: hoursAdjust?.reduced ?? 0,
                    })}
                    aria-hidden
                  />
                )}
                {isDayOff && (
                  <span
                    className="size-1.5 rounded-full bg-muted-foreground"
                    title={t("calTitleFactoryHoliday")}
                    aria-hidden
                  />
                )}
              </div>
            </Button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-wrap gap-3 pt-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-success" />{" "}
          {t("empLegendProduction")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" />{" "}
          {t("empLegendPresent")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-destructive" />{" "}
          {t("empLegendAbsent")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-chart-2" />{" "}
          {t("empLegendExtraH")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-warning" />{" "}
          {t("empLegendLessH")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground" />{" "}
          {t("calLegendHoliday")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-4 rounded border border-chart-1/50 bg-chart-1/20" />{" "}
          {t("calLegendSelectedPeriod")}
        </div>
        {onDateDoubleClick && (
          <p className="text-[10px] italic">
            {t("empCalDoubleClickPresent")}
          </p>
        )}
      </div>
    </div>
  );
}
