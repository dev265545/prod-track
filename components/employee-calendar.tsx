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
}: EmployeeCalendarProps) {
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

  const dayOffSet = useMemo(() => new Set(factoryHolidays), [factoryHolidays]);

  const today = toISODate(new Date());

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="w-full h-full min-w-[320px] max-w-[380px] rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
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
        <h3 className="font-heading font-bold text-base text-foreground">
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
          const inPeriod = dateStr >= periodFrom && dateStr <= periodTo;
          const hasProd = productionDates.has(dateStr);
          const attStatus = attendanceMap.get(dateStr);
          const isDayOff = dayOffSet.has(dateStr);

          return (
            <Button
              key={dateStr}
              type="button"
              variant="ghost"
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg p-2 min-h-[48px] h-auto text-sm transition-all",
                isSelected && "ring-2 ring-chart-1 bg-chart-1/50",
                inPeriod && !isSelected && "bg-chart-1/20",
                !inPeriod && !isSelected && "hover:bg-muted",
                isToday && "font-bold",
                isSunday && !isSelected && "text-destructive/70",
                isDayOff && !isSelected && "bg-destructive/10",
              )}
              onClick={() => onDateClick(dateStr)}
              onDoubleClick={
                onDateDoubleClick
                  ? () => onDateDoubleClick(dateStr)
                  : undefined
              }
              aria-label={`${day}${isDayOff ? ", Factory holiday" : ""}${attStatus ? `, ${attStatus}` : ""}${hasProd ? ", Has production" : ""}`}
              title={dateStr}
            >
              <span
                className={cn(
                  "text-xs leading-none",
                  isToday &&
                    "bg-primary text-primary-foreground rounded-full size-6 flex items-center justify-center",
                )}
              >
                {day}
              </span>
              <div className="flex gap-0.5 mt-0.5">
                {hasProd && (
                  <span
                    className="size-1.5 rounded-full bg-[hsl(var(--success))]"
                    title="Production entry"
                    aria-hidden
                  />
                )}
                {attStatus === "present" && (
                  <span
                    className="size-1.5 rounded-full bg-primary"
                    title="Present"
                    aria-hidden
                  />
                )}
                {attStatus === "absent" && (
                  <span
                    className="size-1.5 rounded-full bg-destructive"
                    title="Absent"
                    aria-hidden
                  />
                )}
                {isDayOff && !hasProd && !attStatus && (
                  <span
                    className="size-1.5 rounded-full bg-muted-foreground"
                    title="Factory holiday"
                    aria-hidden
                  />
                )}
              </div>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-auto pt-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[hsl(var(--success))]" />{" "}
          Production
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" /> Present
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-destructive" /> Absent
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground" /> Factory
          holiday
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-4 rounded border border-chart-1/50 bg-chart-1/20" />{" "}
          Selected period
        </div>
        {onDateDoubleClick && (
          <p className="text-[10px] italic">Double-click a date to mark present</p>
        )}
      </div>
    </div>
  );
}
