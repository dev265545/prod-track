"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

const DATE_FORMAT = "yyyy-MM-dd";

/** Breathing room kept between the popup and either edge of the screen. */
const EDGE_GAP = 8;

/**
 * Where the popup sits for the one frame before it is measured. Off-screen but
 * laid out, so its natural width can be read; without a fixed position here the
 * first measurement would be of a block stretched across the whole page.
 */
const OFFSCREEN: React.CSSProperties = {
  position: "fixed",
  top: -9999,
  left: -9999,
  zIndex: 1000,
};

type ContainsTarget = {
  contains: (target: Node | null) => boolean;
};

export function isDatePickerInteractionOutside(input: {
  target: Node | null;
  container: ContainsTarget | null;
  popup: ContainsTarget | null;
}): boolean {
  const { target, container, popup } = input;
  const insideContainer = container?.contains(target) ?? false;
  const insidePopup = popup?.contains(target) ?? false;
  return !insideContainer && !insidePopup;
}

/** `useLayoutEffect` on the client, `useEffect` when prerendering (no DOM, no warning). */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

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

/** Calendar popup on click. Portalled to `<body>`, so no ancestor `overflow` can clip it. */
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
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);
  const [popupStyle, setPopupStyle] =
    React.useState<React.CSSProperties>(OFFSCREEN);
  const selected = toDate(value);
  const minDate = min ? toDate(min) : undefined;
  const maxDate = max ? toDate(max) : undefined;

  const updatePopupPosition = React.useCallback(() => {
    const button = containerRef.current?.querySelector("button");
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    // The popup takes its width from the calendar inside it (`w-max`, capped by
    // `max-w`), so it has to be *measured*. Forcing a width here — it used to be
    // a flat 280px — was narrower than the seven 44px day columns, and since the
    // month is a table it overflowed instead of shrinking: the "Sa" column and
    // the last date landed outside the panel.
    const width = Math.min(
      popupRef.current?.getBoundingClientRect().width ?? rect.width,
      viewportWidth - EDGE_GAP * 2,
    );
    const left = Math.min(
      Math.max(EDGE_GAP, rect.left),
      Math.max(EDGE_GAP, viewportWidth - width - EDGE_GAP),
    );
    setPopupStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left,
      zIndex: 1000,
    });
  }, []);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Layout effect: the popup is measured and moved into place before the browser
  // paints, so it is never seen at its off-screen starting position.
  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    updatePopupPosition();
    function handleClickOutside(e: MouseEvent) {
      if (
        isDatePickerInteractionOutside({
          target: e.target as Node | null,
          container: containerRef.current,
          popup: popupRef.current,
        })
      ) {
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
            ref={popupRef}
            // `w-max` lets the calendar decide the width instead of being told
            // one it does not fit in; `max-w` keeps it inside the screen, and
            // the calendar's own cells shrink to match on very narrow phones.
            className="w-max max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-popover p-0 shadow-xl"
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
