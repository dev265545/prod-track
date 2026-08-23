"use client";

import { AlertTriangle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLanguage } from "@/components/language-provider";
import { dateDisplay } from "@/lib/utils/formatter";

/** Warning bell listing days in the period with no attendance recorded. */
export function MissingDataPopover({ days }: { days: { date: string }[] }) {
  const { t } = useLanguage();
  if (days.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex size-11 shrink-0 items-center justify-center rounded-lg p-2 text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive/30 transition-colors"
          aria-label={t("dashboardMissingDataAria", { count: days.length })}
        >
          <AlertTriangle className="size-5" />
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse">
            {days.length > 9 ? "9+" : days.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-2">
          <p className="font-medium text-destructive">
            {t("dashboardMissingDataTitle")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("empMissingPopoverBody", { count: days.length })}
          </p>
          <ul className="text-sm max-h-40 overflow-y-auto space-y-1">
            {days.slice(0, 15).map((d) => (
              <li key={d.date}>{dateDisplay(d.date)}</li>
            ))}
            {days.length > 15 && (
              <li className="text-muted-foreground">
                {t("dashboardMissingMore", { n: days.length - 15 })}
              </li>
            )}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
