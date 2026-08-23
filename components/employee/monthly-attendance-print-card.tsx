"use client";

import { FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MonthSelect } from "@/components/employee/month-select";
import { useLanguage } from "@/components/language-provider";

/** Pick a month, print that month's attendance sheet. */
export function MonthlyAttendancePrintCard({
  year,
  month,
  monthOptions,
  onMonthChange,
  onPrint,
}: {
  year: number;
  month: number;
  monthOptions: { value: string; label: string }[];
  onMonthChange: (year: number, month: number) => void;
  onPrint: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Card className="p-6 sm:p-8 transition-all duration-300 ease-out animate-fade-in animate-stagger-3">
      <CardHeader className="p-0 mb-4 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-xl font-semibold font-heading flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary shrink-0" />
            {t("empMonthlyAttendancePrint")}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            {t("empMonthlyAttendancePrintDesc")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 shrink-0">
          <div className="flex flex-col gap-2">
            <Label htmlFor="month-sheet-month">{t("labelMonth")}</Label>
            <MonthSelect
              id="month-sheet-month"
              year={year}
              month={month}
              options={monthOptions}
              onChange={onMonthChange}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="min-h-12"
            onClick={onPrint}
          >
            <Printer data-icon="inline-start" className="size-4" />
            {t("empPrintMonthlyAttendance")}
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
