"use client";

import { Package, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguage } from "@/components/language-provider";
import { currency, dateDisplay, number } from "@/lib/utils/formatter";
import type { Row } from "@/lib/utils/employeeDetail";

/** Summary card that opens the period's production entries, each deletable. */
export function ProductionsDialog({
  open,
  onOpenChange,
  productions,
  itemMap,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productions: Row[];
  itemMap: Record<string, Row>;
  onDelete: (productionId: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Card className="p-6 sm:p-8 cursor-pointer transition-all duration-200 ease-out hover:ring-2 hover:ring-primary/20 focus-within:ring-2 focus-within:ring-primary/20 focus:outline-none">
          <CardContent className="p-0 flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-3">
                <Package className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("empProductionEntries")}
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {t("empThisPeriodCount", { count: productions.length })}
                </p>
              </div>
            </div>
            <span className="text-sm text-muted-foreground">
              {t("empViewDetailsArrow")}
            </span>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[var(--dialog-max-h)] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("empProdDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {productions.length === 0 ? (
            <Empty className="py-10 border-0 animate-fade-in">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Package className="size-6 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>{t("empNoProductionPeriod")}</EmptyTitle>
                <EmptyDescription>
                  {t("empNoProductionPeriodDesc")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("labelDate")}</TableHead>
                  <TableHead>{t("reportsColPackagingGroup")}</TableHead>
                  <TableHead>{t("labelShift")}</TableHead>
                  <TableHead className="text-right">{t("labelQty")}</TableHead>
                  <TableHead className="text-right">{t("colValue")}</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {productions.map((p) => {
                  const item = itemMap[p.itemId as string];
                  const rate = (item?.rate as number) || 0;
                  const qty = (p.quantity as number) || 0;
                  return (
                    <TableRow key={p.id as string}>
                      <TableCell>{dateDisplay(p.date as string)}</TableCell>
                      <TableCell>
                        {(item?.name as string) || (p.itemId as string)}
                      </TableCell>
                      <TableCell>
                        {p.shift === "night" ? t("shiftNight") : t("shiftDay")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {number(qty)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {currency(qty * rate)}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="size-11 p-0 text-destructive hover:text-destructive"
                            >
                              <X className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("empDeleteProductionTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("empDeleteProductionDesc", {
                                  date: dateDisplay(p.date as string),
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t("commonCancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => onDelete(p.id as string)}
                              >
                                {t("commonDelete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
