"use client";

import { useState } from "react";
import { IndianRupee, Wallet, X } from "lucide-react";
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
import { currency, dateDisplay } from "@/lib/utils/formatter";
import { sumAdvances, type Row } from "@/lib/utils/employeeDetail";

/** Summary card opening the advances paid and the settlements already cut. */
export function AdvancesDialog({
  open,
  onOpenChange,
  advances,
  deductions,
  onDeleteAdvance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  advances: Row[];
  deductions: Row[];
  onDeleteAdvance: (advanceId: string) => void;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"advances" | "settlements">("advances");
  const tabClass = (active: boolean) =>
    `min-h-[44px] min-w-0 flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-background shadow-sm text-foreground"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Card className="p-6 sm:p-8 cursor-pointer transition-all duration-200 ease-out hover:ring-2 hover:ring-primary/20 focus-within:ring-2 focus-within:ring-primary/20 focus:outline-none">
          <CardContent className="p-0 flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-3">
                <Wallet className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("empTotalAdvancesPaid")}
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {currency(sumAdvances(advances))}
                </p>
              </div>
            </div>
            <span className="text-sm text-muted-foreground">
              {t("empViewDetailsArrow")}
            </span>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("empAdvancesSettlementsTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
          <button
            type="button"
            className={tabClass(tab === "advances")}
            onClick={() => setTab("advances")}
          >
            {t("empTabAdvances")}
          </button>
          <button
            type="button"
            className={tabClass(tab === "settlements")}
            onClick={() => setTab("settlements")}
          >
            {t("empTabSettlements")}
          </button>
        </div>
        {tab === "advances" ? (
          <div className="max-h-[40vh] overflow-y-auto -mx-1 px-1">
            {advances.length === 0 ? (
              <Empty className="py-8 border-0 animate-fade-in">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Wallet className="size-6 text-muted-foreground" />
                  </EmptyMedia>
                  <EmptyTitle>{t("empNoAdvancesYet")}</EmptyTitle>
                  <EmptyDescription>{t("empNoAdvancesDesc")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("labelDate")}</TableHead>
                    <TableHead className="text-right">
                      {t("empTableAmount")}
                    </TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...advances]
                    .sort((a, b) =>
                      (b.date as string).localeCompare(a.date as string),
                    )
                    .map((a) => (
                      <TableRow key={a.id as string}>
                        <TableCell>{dateDisplay(a.date as string)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {currency((a.amount as number) ?? 0)}
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
                                  {t("empDeleteAdvanceTitle")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("empDeleteAdvanceDesc", {
                                    amount: currency((a.amount as number) ?? 0),
                                    date: dateDisplay(a.date as string),
                                  })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {t("commonCancel")}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => onDeleteAdvance(a.id as string)}
                                >
                                  {t("commonDelete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : (
          <div className="max-h-[40vh] overflow-y-auto -mx-1 px-1">
            {deductions.length === 0 ? (
              <Empty className="py-8 border-0 animate-fade-in">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IndianRupee className="size-6 text-muted-foreground" />
                  </EmptyMedia>
                  <EmptyTitle>{t("empNoSettlementsYet")}</EmptyTitle>
                  <EmptyDescription>
                    {t("empNoSettlementsDesc")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reportsPeriod")}</TableHead>
                    <TableHead className="text-right">
                      {t("empTableDeducted")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...deductions]
                    .sort((a, b) =>
                      (b.periodFrom as string).localeCompare(
                        a.periodFrom as string,
                      ),
                    )
                    .map((d) => (
                      <TableRow key={d.id as string}>
                        <TableCell>
                          {dateDisplay(d.periodFrom as string)} –{" "}
                          {dateDisplay(d.periodTo as string)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {currency((d.amount as number) ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
