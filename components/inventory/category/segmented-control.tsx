"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name for the whole group, e.g. "Show stock level". */
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/**
 * One-of-many chooser with a real accessible state (`aria-pressed`), so the
 * selection is never conveyed by colour alone. Every segment is at least 44px
 * tall, flexes down to nothing (`min-w-0` + `truncate`) and wraps, so the
 * control can never push the page into horizontal scroll.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex min-w-0 flex-wrap items-stretch gap-1 rounded-xl border border-border bg-surface-2 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
