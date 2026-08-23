"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/language-provider";
import { currency } from "@/lib/utils/formatter";
import { computeSettlement } from "@/lib/utils/employeeDetail";

/** How much of the outstanding advance is cut from this period's pay. */
export function SettlementCard({
  gross,
  totalAdvancePaid,
  advanceToCut,
  loaded,
  onAdvanceToCutChange,
  onSave,
}: {
  gross: number;
  totalAdvancePaid: number;
  advanceToCut: number;
  loaded: boolean;
  onAdvanceToCutChange: (value: number) => void;
  onSave: () => void;
}) {
  const { t } = useLanguage();
  const { net, advanceLeft } = computeSettlement({
    gross,
    totalAdvancePaid,
    advanceToCut,
  });
  return (
    <Card className="p-6 sm:p-8 transition-all duration-300 ease-out animate-fade-in animate-stagger-5">
      <CardHeader className="p-0 mb-4">
        <CardTitle className="text-xl font-semibold font-heading">
          {t("empSettlementTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {t("empSettlementDesc")}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {loaded ? (
          <div className="space-y-4 max-w-xl">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-muted-foreground">
                {t("empTotalMakingGross")}
              </span>
              <span className="font-semibold tabular-nums">
                {currency(gross)}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-muted-foreground">
                {t("empTotalAdvancePaidAllTime")}
              </span>
              <span className="font-semibold tabular-nums">
                {currency(totalAdvancePaid)}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="advance-to-cut">
                {t("empAdvanceToCutThisPeriod")}
              </Label>
              <NumberInput
                id="advance-to-cut"
                min={0}
                className="w-full max-w-[200px] min-h-12"
                value={advanceToCut}
                onChange={(e) =>
                  onAdvanceToCutChange(parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <Separator className="my-4" />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{t("empNetThisPeriod")}</span>
              <span className="font-bold text-lg tabular-nums">
                {currency(net)}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-muted-foreground">
                {t("empAdvanceLeftAfter")}
              </span>
              <span className="font-semibold tabular-nums">
                {currency(advanceLeft)}
              </span>
            </div>
            <Button type="button" className="min-h-12 px-6" onClick={onSave}>
              {t("empSavePeriodSettlement")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
