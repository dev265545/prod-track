"use client";

import { memo } from "react";
import Link from "next/link";
import { TableCell, TableHead } from "@/components/ui/table";
import { SALARY_SHEET_COLUMNS } from "@/lib/print/salarySheet";
import type { SalarySheetRow } from "@/lib/services/salarySheetService";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";

/**
 * The thirteen data cells of one salary-sheet row.
 *
 * Split out of the page and memoised on purpose. Every cell calls
 * `currency()` / `number()`, and each of those builds a fresh
 * `Intl.NumberFormat` — on a 150-person factory that is ~1,800 formatter
 * constructions to paint the table, which is the single most expensive thing
 * this screen does. Re-rendering the page for a reason that has nothing to do
 * with the numbers (toggling reorder mode, the save-in-progress flag flipping
 * twice per arrow tap, swapping two rows) used to pay that cost again in full.
 *
 * `row` comes straight out of the page's `rows` state, so its identity is
 * stable across those re-renders — including a reorder, which only permutes
 * the array and keeps every row object. Memoising on it therefore skips the
 * formatting for every row whose data did not actually change.
 *
 * The reorder arrows deliberately stay in the page: they DO change on those
 * re-renders, and keeping them out of here is what lets this part stay still.
 */
export const SalarySheetRowCells = memo(function SalarySheetRowCells({
  row,
  hasAdjustment,
}: {
  row: SalarySheetRow;
  hasAdjustment: boolean;
}) {
  const { t: tr } = useLanguage();

  return (
    <>
      {SALARY_SHEET_COLUMNS.map((col) => {
        const body = (
          <>
            {col.isName ? (
              <Link
                href={`/employee?id=${encodeURIComponent(String(row.id))}`}
                aria-label={tr("viewEmployeeAria", { name: row.name })}
                className="inline-flex min-h-[44px] items-center rounded-md underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {col.format(row)}
              </Link>
            ) : (
              col.format(row)
            )}
            {col.isName && hasAdjustment ? (
              <span className="ml-2 text-xs font-normal text-warning">
                ({tr("salarySheetAdjustedBadge")})
              </span>
            ) : null}
          </>
        );
        const className = cn(
          col.align === "right" && "text-right tabular-nums",
          col.muted && "text-muted-foreground",
          col.emphasis && "font-semibold",
          col.isName && "font-medium",
        );
        // The name identifies the row, so it is the row's header cell —
        // otherwise a screen reader reading "₹8,240" ten columns in cannot say
        // whose it is.
        return col.isName ? (
          <TableHead
            key={col.key}
            scope="row"
            className={cn("h-auto p-4 text-foreground", className)}
          >
            {body}
          </TableHead>
        ) : (
          <TableCell key={col.key} className={className}>
            {body}
          </TableCell>
        );
      })}
    </>
  );
});
