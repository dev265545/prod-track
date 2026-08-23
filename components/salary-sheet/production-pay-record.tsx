"use client";

import { ArrowDown, ArrowUp, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ProductionPaySheet } from "@/lib/services/productionPaySheetService";
import { currency, number } from "@/lib/utils/formatter";
import { useLanguage } from "@/components/language-provider";

/**
 * On-screen twin of the printed production work record: what each production
 * worker made in the day and the night shift, what that work is worth, and
 * what is left to hand over after the advance to cut.
 */
export function ProductionPayRecord({
  sheet,
  periodLabel,
  reorderMode = false,
  savingOrder = false,
  onMoveRow,
}: {
  sheet: ProductionPaySheet;
  periodLabel: string;
  /** Show the move-up/move-down controls used by both tables below. */
  reorderMode?: boolean;
  savingOrder?: boolean;
  onMoveRow?: (rowId: string, direction: -1 | 1) => void;
}) {
  const { t: tr } = useLanguage();
  const firstRowId = sheet.rows[0]?.id;
  const lastRowId = sheet.rows[sheet.rows.length - 1]?.id;

  if (sheet.rows.length === 0) {
    return (
      <Card className="p-6 sm:p-8">
        <CardContent className="p-0">
          <Empty className="py-12 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Package className="size-6 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle>{tr("prepEmptyTitle")}</EmptyTitle>
              <EmptyDescription>{tr("prepEmptyDesc")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  const noWorkAtAll = sheet.rows.every((r) => r.items.length === 0);

  /** Shared by both tables below: one employee, one pair of arrows. */
  function MoveButtons({ rowId, name }: { rowId: string; name: string }) {
    return (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-11"
          disabled={savingOrder || firstRowId === rowId}
          onClick={() => onMoveRow?.(rowId, -1)}
          aria-label={tr("salarySheetMoveUpAria", { name })}
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-11"
          disabled={savingOrder || lastRowId === rowId}
          onClick={() => onMoveRow?.(rowId, 1)}
          aria-label={tr("salarySheetMoveDownAria", { name })}
        >
          <ArrowDown className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <CardHeader className="p-0 mb-5">
        <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
          <Package className="size-5 shrink-0 text-primary" />
          {tr("prepTitle")} — {periodLabel}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">{tr("prepIntro")}</p>
        {reorderMode ? (
          <p className="text-sm text-muted-foreground mt-2">
            {tr("salarySheetReorderHint")}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="p-0 flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-foreground">
            {tr("prepPayHeading")}
          </h3>
          <div className="min-w-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {reorderMode && (
                    <TableHead scope="col" className="w-[104px]">
                      {tr("salarySheetColOrder")}
                    </TableHead>
                  )}
                  <TableHead>{tr("colEmployee")}</TableHead>
                  <TableHead className="text-right tabular-nums whitespace-nowrap">
                    {tr("prepColDayShift")}
                  </TableHead>
                  <TableHead className="text-right tabular-nums whitespace-nowrap">
                    {tr("prepColNightShift")}
                  </TableHead>
                  <TableHead className="text-right tabular-nums whitespace-nowrap">
                    {tr("prepColTotalMade")}
                  </TableHead>
                  <TableHead className="text-right tabular-nums whitespace-nowrap">
                    {tr("prepColWorkMoney")}
                  </TableHead>
                  <TableHead className="text-right tabular-nums whitespace-nowrap">
                    {tr("prepColAdvanceTaken")}
                  </TableHead>
                  <TableHead className="text-right tabular-nums whitespace-nowrap">
                    {tr("prepColAdvanceToCut")}
                  </TableHead>
                  <TableHead className="text-right tabular-nums whitespace-nowrap">
                    {tr("prepColAmountToPay")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheet.rows.map((r) => (
                  <TableRow key={r.id}>
                    {reorderMode && (
                      <TableCell className="w-[104px]">
                        <MoveButtons rowId={r.id} name={r.name} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number(r.dayQuantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number(r.nightQuantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number(r.totalQuantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency(r.workAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {currency(r.advanceTaken)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency(r.advanceDeduction)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {/* amountToPay is signed now: the Math.max(0, ...) floor was
                          removed because it showed 0 here while the payslip showed
                          the real negative. Label it so a minus reads as "owed
                          back" rather than looking like a bug. */}
                      <span className={r.amountToPay < 0 ? "text-destructive" : undefined}>
                        {currency(r.amountToPay)}
                      </span>
                      {r.amountToPay < 0 ? (
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {tr("payFixOwedNote", {
                            amount: currency(Math.abs(r.amountToPay)),
                          })}
                        </span>
                      ) : null}
                      {r.unpricedCount > 0 ? (
                        <span className="mt-0.5 block text-xs font-normal text-warning">
                          {tr("payFixUnpricedNote", { count: r.unpricedCount })}
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-surface-2 font-semibold">
                  {reorderMode && <TableCell />}
                  <TableCell>{tr("salarySheetPrintTotal")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number(sheet.totals.dayQuantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number(sheet.totals.nightQuantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number(sheet.totals.totalQuantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currency(sheet.totals.workAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currency(sheet.totals.advanceTaken)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currency(sheet.totals.advanceDeduction)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currency(sheet.totals.amountToPay)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-foreground">
            {tr("prepMadeHeading")}
          </h3>
          {noWorkAtAll ? (
            <p className="text-sm text-muted-foreground">
              {tr("prepNoWorkAtAll")}
            </p>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {reorderMode && (
                      <TableHead scope="col" className="w-[104px]">
                        {tr("salarySheetColOrder")}
                      </TableHead>
                    )}
                    <TableHead>{tr("colEmployee")}</TableHead>
                    <TableHead>{tr("prepColItem")}</TableHead>
                    <TableHead className="text-right tabular-nums whitespace-nowrap">
                      {tr("prepColDayShift")}
                    </TableHead>
                    <TableHead className="text-right tabular-nums whitespace-nowrap">
                      {tr("prepColNightShift")}
                    </TableHead>
                    <TableHead className="text-right tabular-nums whitespace-nowrap">
                      {tr("prepColTotalMade")}
                    </TableHead>
                    <TableHead className="text-right tabular-nums whitespace-nowrap">
                      {tr("prepColRateForOne")}
                    </TableHead>
                    <TableHead className="text-right tabular-nums whitespace-nowrap">
                      {tr("prepColWorkMoney")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheet.rows.map((r) =>
                    r.items.length === 0 ? (
                      <TableRow key={r.id}>
                        {reorderMode && (
                          <TableCell className="w-[104px]">
                            <MoveButtons rowId={r.id} name={r.name} />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell colSpan={6} className="text-muted-foreground">
                          {tr("prepNoWork")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      r.items.map((item, index) => (
                        <TableRow key={`${r.id}-${item.itemName}-${item.rate}`}>
                          {reorderMode && (
                            <TableCell className="w-[104px]">
                              {index === 0 ? (
                                <MoveButtons rowId={r.id} name={r.name} />
                              ) : null}
                            </TableCell>
                          )}
                          <TableCell className="font-medium">
                            {index === 0 ? r.name : ""}
                          </TableCell>
                          <TableCell>{item.itemName}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {number(item.dayQuantity)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {number(item.nightQuantity)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {number(item.totalQuantity)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {/* An unpriced line has rate null, and currency(null)
                                renders "₹ 0" — the silent zero this whole change
                                removed everywhere else. Say it instead. */}
                            {item.unpriced ? tr("payFixNotPriced") : currency(item.rate)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {currency(item.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    ),
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
