"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/language-provider";
import { currency, number } from "@/lib/utils/formatter";

/** One small number tile: title, sub-caption, value and optional money line. */
export function StatTile({
  icon,
  title,
  caption,
  value,
  money,
}: {
  icon: ReactNode;
  title: string;
  caption: string;
  value: string;
  money: string | null;
}) {
  return (
    <Card className="p-3 min-w-0">
      <CardHeader className="p-0 pb-1 shrink-0">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          {icon}
          {title}
        </CardTitle>
        <p className="text-[10px] text-muted-foreground truncate">{caption}</p>
      </CardHeader>
      <CardContent className="p-0 pt-1">
        <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
        {money !== null && (
          <p className="text-xs text-muted-foreground">{money}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Present / absent / earned Sunday / paid days for the calendar month. */
export function MonthAttendanceCard({
  icon,
  monthTitle,
  presentDays,
  absentDays,
  earnedSundayPayDays,
  sundayPresentBonusDays,
  totalPaidDays,
  calculatedSalary,
  hideRates,
}: {
  icon: ReactNode;
  monthTitle: string;
  presentDays: number;
  absentDays: number;
  earnedSundayPayDays: number;
  sundayPresentBonusDays: number;
  totalPaidDays: number;
  calculatedSalary: number;
  hideRates: boolean;
}) {
  const { t } = useLanguage();
  const cell = "rounded-lg border bg-muted/40 px-2 py-1.5 text-xs";
  return (
    <Card className="p-3 flex flex-col min-h-0 min-w-0">
      <CardHeader className="p-0 pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          {icon}
          {t("empAttendanceCardTitle", { month: monthTitle })}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 pt-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <div className={cell}>
            <p className="text-muted-foreground text-[10px] font-medium">
              {t("empLegendPresent")}
            </p>
            <p className="font-bold tabular-nums text-foreground text-sm">
              {presentDays}
            </p>
          </div>
          <div className={cell}>
            <p className="text-muted-foreground text-[10px] font-medium">
              {t("empLegendAbsent")}
            </p>
            <p className="font-bold tabular-nums text-foreground text-sm">
              {absentDays}
            </p>
          </div>
          <div className={cell}>
            <p className="text-muted-foreground text-[10px] font-medium">
              {t("empEarnedSundayShort")}
            </p>
            <p className="font-bold tabular-nums text-foreground text-sm">
              {earnedSundayPayDays} / {sundayPresentBonusDays}
            </p>
          </div>
          <div className={cell}>
            <p className="text-muted-foreground text-[10px] font-medium">
              {t("empPaidDaysShort")}
            </p>
            <p className="font-bold tabular-nums text-foreground text-sm">
              {totalPaidDays}
            </p>
          </div>
          {!hideRates && (
            <div className="col-span-2 rounded-lg border-2 border-primary/30 bg-primary/10 px-2 py-2">
              <p className="text-muted-foreground text-[10px] font-medium">
                {t("salarySheetColSalary")}
              </p>
              <p className="text-base font-bold tabular-nums text-foreground">
                {currency(calculatedSalary)}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Formats an hours value the way every hours tile on this screen does. */
export function hoursTileValue(hours: number): string {
  return `${number(hours)}h`;
}

/** Formats a money caption, or nothing when money must stay hidden. */
export function moneyCaption(
  amount: number,
  hideRates: boolean,
): string | null {
  return hideRates ? null : currency(amount);
}
