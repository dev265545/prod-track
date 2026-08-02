"use client";

import { Package } from "lucide-react";
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
}: {
  sheet: ProductionPaySheet;
  periodLabel: string;
}) {
  const { t: tr } = useLanguage();

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

  return (
    <Card className="p-6 sm:p-8">
      <CardHeader className="p-0 mb-5">
        <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
          <Package className="size-5 shrink-0 text-primary" />
          {tr("prepTitle")} — {periodLabel}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">{tr("prepIntro")}</p>
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
                      {currency(r.amountToPay)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-surface-2 font-semibold">
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
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell colSpan={6} className="text-muted-foreground">
                          {tr("prepNoWork")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      r.items.map((item, index) => (
                        <TableRow key={`${r.id}-${item.itemName}-${item.rate}`}>
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
                            {currency(item.rate)}
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
