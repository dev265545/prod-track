"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * react-day-picker sizes its day cells with a *fixed* `--rdp-day-width` (44px by
 * default), and the month itself is a `<table>` — so the grid never shrinks to
 * its container: it overflows it, spilling the last column ("Sa" and its dates)
 * outside whatever panel it sits in. Seven 44px cells plus the `p-3` padding
 * need 332px, which is more than a narrow popup or a 320px phone can give.
 *
 * So the cell size is capped by the viewport instead of being a constant. It
 * stays exactly 44px — the minimum touch target — at every width from 360px up
 * ((360 − 48) / 7 ≈ 44.6), and only shrinks below that on screens narrower than
 * the ones we support, where a slightly small cell beats a clipped column.
 *
 * `min()` and `calc()` only; no `color-mix`, nesting or `:has()` — Chrome 109 safe.
 */
const RESPONSIVE_DAY_SIZE: React.CSSProperties = {
  ["--rdp-day-width" as string]: "min(44px, calc((100vw - 3rem) / 7))",
  ["--rdp-day-height" as string]: "var(--rdp-day-width)",
  ["--rdp-day_button-width" as string]: "calc(var(--rdp-day-width) - 2px)",
  ["--rdp-day_button-height" as string]: "calc(var(--rdp-day-width) - 2px)",
};

function Calendar({
  className,
  showOutsideDays = true,
  style,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      style={{ ...RESPONSIVE_DAY_SIZE, ...style }}
      className={cn("rdp-root p-3", className)}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className="size-4" />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
