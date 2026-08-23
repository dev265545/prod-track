"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/components/language-provider";
import { currency } from "@/lib/utils/formatter";
import { computeSettlement } from "@/lib/utils/employeeDetail";

/** Period picker plus gross / advance cut / net, for piece-rate workers. */
export function ProductionAdvancesCard({
  periods,
  from,
  to,
  onPeriodChange,
  gross,
  advanceToCut,
  showTotals,
  onPrint,
}: {
  periods: { from: string; to: string; label: string }[];
  from: string;
  to: string;
  onPeriodChange: (from: string, to: string) => void;
  gross: number;
  advanceToCut: number;
  showTotals: boolean;
  onPrint: () => void;
}) {
  const { t } = useLanguage();
  const { net } = computeSettlement({
    gross,
    totalAdvancePaid: 0,
    advanceToCut,
  });
  return (
    <Card className="p-6 sm:p-8 transition-all duration-300 ease-out animate-fade-in animate-stagger-4">
      <CardHeader className="p-0 mb-5">
        <CardTitle className="text-xl font-semibold font-heading">
          {t("empProductionAdvancesTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="salary-period">{t("reportsPeriod")}</Label>
            <Select
              value={`${from}|${to}`}
              onValueChange={(v) => {
                const [f, tTo] = v.split("|");
                onPeriodChange(f, tTo);
              }}
            >
              <SelectTrigger
                id="salary-period"
                className="min-w-[200px] w-56 min-h-12"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.from + p.to} value={`${p.from}|${p.to}`}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" className="min-h-12 px-6" onClick={onPrint}>
            <Printer data-icon="inline-start" className="size-4" />
            {t("empPrintProductionAdvances")}
          </Button>
        </div>
        {showTotals && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end mt-6">
            <div className="flex flex-col gap-2">
              <Label>{t("colGross")}</Label>
              <p className="text-base text-foreground font-medium">
                {currency(gross)}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("colAdvanceToCut")}</Label>
              <p className="text-base text-foreground font-medium">
                {currency(advanceToCut)}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("colNet")}</Label>
              <p className="text-base text-foreground font-medium">
                {currency(net)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
