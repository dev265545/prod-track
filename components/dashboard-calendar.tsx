"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
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

export interface DashboardCalendarProps {
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  productions: Record<string, unknown>[];
  factoryHolidays: string[];
  employees: Record<string, unknown>[];
  selectedDate: string | null;
  onDateClick: (date: string) => void;
  onToggleHoliday?: (date: string) => void;
  /** 15-day salary period range to highlight (same as employee calendar). */
  periodFrom?: string;
  periodTo?: string;
}

export function DashboardCalendar({
  year,
  month,
  onMonthChange,
  productions,
  factoryHolidays,
  employees,
  selectedDate,
  onDateClick,
  onToggleHoliday,
  periodFrom = "",
  periodTo = "",
}: DashboardCalendarProps) {
  const { locale, t } = useLanguage();
  const dayLabels = useMemo(() => weekdayShortLabels(locale), [locale]);
  const daysInMonth = getLastDayOfMonth(year, month);
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const dateEntryStatus = useMemo(() => {
    const map = new Map<string, Set<string>>();
    productions.forEach((p) => {
      if (!map.has(p.date as string)) map.set(p.date as string, new Set());
      map.get(p.date as string)!.add(p.employeeId as string);
    });
    return map;
  }, [productions]);

  const dayOffSet = useMemo(
    () => new Set(factoryHolidays),
    [factoryHolidays],
  );

  /** Employees active on a given date (started on or before that date). */
  const countActiveOnDate = useMemo(() => {
    return (dateStr: string) =>
      employees.filter((e) => {
        const start = (e.createdAt as string) || "1970-01-01";
        return start <= dateStr;
      }).length;
  }, [employees]);

  const today = toISODate(new Date());

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    // The 320px floor is a *comfort* width, not a requirement: at a 320px
    // viewport the content box is only ~288px, so an unconditional `min-w-[320px]`
    // pushed the whole page sideways. Below `sm` the seven day-columns simply
    // share whatever width there is.
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-[400px] flex-col rounded-xl border border-border bg-card p-4 sm:min-w-[320px] sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => {
            const prev = month === 0 ? 11 : month - 1;
            const py = month === 0 ? year - 1 : year;
            onMonthChange(py, prev);
          }}
          aria-label={t("calPrevMonth")}
        >
          <ChevronLeft data-icon="inline-start" />
        </Button>
        <h3 className="font-heading text-lg font-bold text-foreground">
          {formatMonthCalendarHeading(year, month, locale)}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => {
            const next = month === 11 ? 0 : month + 1;
            const ny = month === 11 ? year + 1 : year;
            onMonthChange(ny, next);
          }}
          aria-label={t("calNextMonth")}
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
          const inPeriod =
            periodFrom &&
            periodTo &&
            dateStr >= periodFrom &&
            dateStr <= periodTo;
          const isDayOff = dayOffSet.has(dateStr);
          const enteredEmps = dateEntryStatus.get(dateStr)?.size ?? 0;
          const activeOnDate = countActiveOnDate(dateStr);
          const allEntered =
            activeOnDate > 0 && enteredEmps >= activeOnDate;
          const someEntered = enteredEmps > 0 && !allEntered;

          return (
            <Button
              key={dateStr}
              type="button"
              variant="ghost"
              className={cn(
                "relative flex h-auto min-h-[48px] flex-col items-center justify-center rounded-lg p-2 text-sm transition-all",
                isSelected && "bg-chart-1/50 ring-2 ring-chart-1",
                inPeriod && !isSelected && "bg-chart-1/20",
                !inPeriod && !isSelected && !isDayOff && "hover:bg-muted",
                isSunday && !isSelected && "text-destructive/70",
                isDayOff && !isSelected && "bg-destructive/10",
              )}
              onClick={() => onDateClick(dateStr)}
              onDoubleClick={
                onToggleHoliday
                  ? () => onToggleHoliday(dateStr)
                  : undefined
              }
              aria-label={[
                t("calAriaDay", { day }),
                isDayOff ? t("calAriaHoliday") : "",
                allEntered
                  ? t("calAriaAllEntered")
                  : someEntered
                    ? t("calAriaPartialEntered", {
                        entered: enteredEmps,
                        active: activeOnDate,
                      })
                    : "",
              ]
                .filter(Boolean)
                .join("")}
              title={dateStr}
            >
              <span
                className={cn(
                  "text-xs leading-none",
                  isToday &&
                    !isSelected &&
                    "flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground",
                  isToday &&
                    isSelected &&
                    "flex size-6 items-center justify-center rounded-full bg-foreground/20 font-semibold text-foreground",
                )}
              >
                {day}
              </span>
              <div className="mt-0.5 flex gap-0.5">
                {allEntered && (
                  <span
                    className="size-1.5 rounded-full bg-[hsl(var(--success))]"
                    title={t("calLegendAllEntered")}
                    aria-hidden
                  />
                )}
                {someEntered && (
                  <span
                    className="size-1.5 rounded-full bg-[hsl(var(--warning))]"
                    title={t("calTitleEnteredFraction", {
                      entered: enteredEmps,
                      active: activeOnDate,
                    })}
                    aria-hidden
                  />
                )}
                {isDayOff && (
                  <span
                    className="size-1.5 rounded-full bg-destructive"
                    title={t("calTitleFactoryHoliday")}
                    aria-hidden
                  />
                )}
              </div>
            </Button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-wrap gap-4 pt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[hsl(var(--success))]" />{" "}
          {t("calLegendAllEntered")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[hsl(var(--warning))]" />{" "}
          {t("calLegendPartial")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-destructive" />{" "}
          {t("calLegendHoliday")}
        </div>
        {(periodFrom || periodTo) && (
          <div className="flex items-center gap-1.5">
            <span className="size-4 rounded border border-chart-1/50 bg-chart-1/20" />{" "}
            {t("calLegendSelectedPeriod")}
          </div>
        )}
        {onToggleHoliday && (
          <p className="text-xs italic">{t("calDoubleClickHoliday")}</p>
        )}
      </div>
    </div>
  );
}
