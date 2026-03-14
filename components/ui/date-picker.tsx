"use client";

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const DATE_FORMAT = "yyyy-MM-dd";

function formatDateForDisplay(dateStr: string): string {
  if (!dateStr) return "Pick a date";
  const d = parse(dateStr, DATE_FORMAT, new Date());
  return isValid(d) ? format(d, "MMM d, yyyy") : "Pick a date";
}

function toDate(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;
  const d = parse(dateStr, DATE_FORMAT, new Date());
  return isValid(d) ? d : undefined;
}

function toDateString(date: Date | undefined): string {
  if (!date) return "";
  return format(date, DATE_FORMAT);
}

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Min date as YYYY-MM-DD */
  min?: string;
  /** Max date as YYYY-MM-DD */
  max?: string;
}

export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Pick a date",
  className,
  disabled,
  min,
  max,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = toDate(value);
  const minDate = min ? toDate(min) : undefined;
  const maxDate = max ? toDate(max) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn(
            "min-h-10 w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon data-icon="inline-start" className="shrink-0" />
          {value ? formatDateForDisplay(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(toDateString(date));
              setOpen(false);
            }
          }}
          disabled={(d) => {
            if (minDate && d < minDate) return true;
            if (maxDate && d > maxDate) return true;
            return false;
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
