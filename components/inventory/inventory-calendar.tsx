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
import {
  groupInventoryMovementsByDate,
  type InventoryDateSummary,
} from "@/lib/utils/inventoryCalendar";
import type { InventoryMovement } from "@/lib/services/inventoryService";

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface InventoryCalendarProps {
  year: number;
  month: number;
  movements: InventoryMovement[];
  selectedDate: string;
  onMonthChange: (year: number, month: number) => void;
  onDateClick: (date: string) => void;
}

export function InventoryCalendar({
  year,
  month,
  movements,
  selectedDate,
  onMonthChange,
  onDateClick,
}: InventoryCalendarProps) {
  const { locale, t } = useLanguage();
  const dayLabels = useMemo(() => weekdayShortLabels(locale), [locale]);
  const summaries = useMemo(
    () => groupInventoryMovementsByDate(movements),
    [movements],
  );
  const daysInMonth = getLastDayOfMonth(year, month);
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = toISODate(new Date());
  const cells: (number | null)[] = [];

  for (let index = 0; index < firstDayOfWeek; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);

  const changeMonth = (direction: -1 | 1) => {
    const nextMonth = month + direction;
    if (nextMonth < 0) onMonthChange(year - 1, 11);
    else if (nextMonth > 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, nextMonth);
  };

  return (
    <div className="flex min-h-[340px] w-full min-w-[320px] max-w-[400px] flex-col rounded-xl bg-card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => changeMonth(-1)}
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
          onClick={() => changeMonth(1)}
          aria-label={t("calNextMonth")}
        >
          <ChevronRight data-icon="inline-start" />
        </Button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {dayLabels.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-xs font-semibold text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (day === null) return <div key={`empty-${index}`} />;
          const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const summary: InventoryDateSummary | undefined = summaries.get(date);
          const isSelected = date === selectedDate;
          const isToday = date === today;
          const isSunday = new Date(year, month, day).getDay() === 0;

          return (
            <Button
              key={date}
              type="button"
              variant="ghost"
              className={cn(
                "relative flex h-auto min-h-[48px] flex-col items-center justify-center rounded-lg p-2 text-sm transition-colors",
                isSelected && "bg-primary/10 ring-2 ring-primary",
                !isSelected && "hover:bg-muted",
                isSunday && !isSelected && "text-destructive/70",
              )}
              onClick={() => onDateClick(date)}
              aria-label={`${date}${summary ? `, ${summary.count} ${t("inventoryCalendarEntries")}` : ""}`}
              title={date}
            >
              <span
                className={cn(
                  "text-xs leading-none",
                  isToday &&
                    !isSelected &&
                    "flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground",
                  isToday &&
                    isSelected &&
                    "flex size-6 items-center justify-center rounded-full bg-foreground/15 font-semibold text-foreground",
                )}
              >
                {day}
              </span>
              {summary && (
                <span
                  className="mt-1 flex min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-bold leading-4 text-primary"
                  aria-hidden
                >
                  {summary.count}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-primary" aria-hidden />
        {t("inventoryCalendarEntries")}
      </div>
    </div>
  );
}
