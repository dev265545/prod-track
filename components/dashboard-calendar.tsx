"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
    [factoryHolidays]
  );

  const totalEmployees = employees.length;
  const today = toISODate(new Date());

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="w-full h-full min-w-[320px] max-w-[400px] rounded-xl border border-border bg-card p-4 sm:p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            const prev = month === 0 ? 11 : month - 1;
            const py = month === 0 ? year - 1 : year;
            onMonthChange(py, prev);
          }}
          aria-label="Previous month"
        >
          <ChevronLeft data-icon="inline-start" />
        </Button>
        <h3 className="font-heading font-bold text-lg text-foreground">
          {MONTH_NAMES[month]} {year}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            const next = month === 11 ? 0 : month + 1;
            const ny = month === 11 ? year + 1 : year;
            onMonthChange(ny, next);
          }}
          aria-label="Next month"
        >
          <ChevronRight data-icon="inline-start" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-semibold text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 flex-1 min-h-0 content-stretch">
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
          const allEntered =
            totalEmployees > 0 && enteredEmps >= totalEmployees;
          const someEntered = enteredEmps > 0 && !allEntered;

          return (
            <Button
              key={dateStr}
              type="button"
              variant="ghost"
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg p-2 min-h-[48px] h-auto text-sm transition-all",
                isSelected && "ring-2 ring-chart-1 bg-chart-1/50",
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
              aria-label={`${day}${isDayOff ? ", Factory holiday" : ""}${allEntered ? ", All employees entered" : someEntered ? `, ${enteredEmps} employees entered` : ""}`}
              title={dateStr}
            >
              <span
                className={cn(
                  "text-xs leading-none",
                  isToday && !isSelected &&
                    "bg-primary text-primary-foreground rounded-full size-6 flex items-center justify-center",
                  isToday && isSelected && "bg-foreground/20 text-foreground rounded-full size-6 flex items-center justify-center font-semibold"
                )}
              >
                {day}
              </span>
              <div className="flex gap-0.5 mt-0.5">
                {allEntered && (
                  <span
                    className="size-1.5 rounded-full bg-[hsl(var(--success))]"
                    title="All employees entered"
                    aria-hidden
                  />
                )}
                {someEntered && (
                  <span
                    className="size-1.5 rounded-full bg-[hsl(var(--warning))]"
                    title={`${enteredEmps}/${totalEmployees} entered`}
                    aria-hidden
                  />
                )}
                {isDayOff && (
                  <span
                    className="size-1.5 rounded-full bg-destructive"
                    title="Factory holiday"
                    aria-hidden
                  />
                )}
              </div>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 mt-auto pt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[hsl(var(--success))]" /> All
          entered
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[hsl(var(--warning))]" />{" "}
          Partial
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-destructive" /> Factory
          holiday
        </div>
        {(periodFrom || periodTo) && (
          <div className="flex items-center gap-1.5">
            <span className="size-4 rounded border border-chart-1/50 bg-chart-1/20" />{" "}
            Selected period
          </div>
        )}
        {onToggleHoliday && (
          <p className="text-xs italic">Double-click a date to toggle holiday</p>
        )}
      </div>
    </div>
  );
}
