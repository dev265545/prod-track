"use client";

import * as React from "react";
import { Download, Ellipsis, Printer, Upload } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";

export interface DataMenuProps {
  /** Omitted where the action does not apply, e.g. import on a category page. */
  onImport?: () => void;
  onExport?: () => void;
  onPrint?: () => void;
  className?: string;
}

/**
 * The rare, owner-facing jobs — import, export, print — folded behind one
 * button so they stop competing with the daily ones. Built on Popover, the
 * same primitive as the row-level `ItemActionsMenu`, so the whole inventory
 * feature has exactly one overflow-menu pattern (and no dropdown-menu
 * dependency). Every entry is 44px tall and carries an icon *and* a word.
 */
export function DataMenu({
  onImport,
  onExport,
  onPrint,
  className,
}: DataMenuProps) {
  const { t } = useLanguage();
  const [open, setOpen] = React.useState(false);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const itemClass =
    "flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("min-h-[44px] gap-2", className)}
        >
          <Ellipsis className="size-4" aria-hidden />
          {t("invUxDataMenu")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-0.5 p-1.5">
        <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("invUxDataMenuTitle")}
        </p>
        <div
          role="menu"
          aria-label={t("invUxDataMenuTitle")}
          className="flex flex-col gap-0.5"
        >
          {onImport && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={run(onImport)}
            >
              <Upload className="size-4 shrink-0" aria-hidden />
              {t("inventoryImportExcel")}
            </button>
          )}
          {onExport && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={run(onExport)}
            >
              <Download className="size-4 shrink-0" aria-hidden />
              {t("inventoryExportExcel")}
            </button>
          )}
          {onPrint && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={run(onPrint)}
            >
              <Printer className="size-4 shrink-0" aria-hidden />
              {t("inventoryPrint")}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
