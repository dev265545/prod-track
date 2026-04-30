"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

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

/** Calendar popup on click - no portal, works in Tauri and web */
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
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);
  const [popupStyle, setPopupStyle] = React.useState<React.CSSProperties>({});
  const selected = toDate(value);
  const minDate = min ? toDate(min) : undefined;
  const maxDate = max ? toDate(max) : undefined;

  const updatePopupPosition = React.useCallback(() => {
    const button = containerRef.current?.querySelector("button");
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const desiredWidth = Math.max(rect.width, 280);
    const width = Math.min(desiredWidth, viewportWidth - 16);
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, viewportWidth - width - 8),
    );
    setPopupStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left,
      width,
      zIndex: 1000,
    });
  }, []);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePopupPosition();
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleReposition() {
      updatePopupPosition();
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updatePopupPosition]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        id={id}
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          "min-h-10 w-full justify-start text-left font-normal",
          !value && "text-muted-foreground",
          className
        )}
      >
        <CalendarIcon data-icon="inline-start" className="shrink-0" />
        {value ? formatDateForDisplay(value) : placeholder}
      </Button>
      {open &&
        mounted &&
        createPortal(
          <div
            className="rounded-xl border border-border bg-popover p-0 shadow-xl"
            style={popupStyle}
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
