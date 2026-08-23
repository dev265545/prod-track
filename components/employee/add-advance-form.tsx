"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { useLanguage } from "@/components/language-provider";

/** Record cash handed to the employee ahead of payday. */
export function AddAdvanceForm({
  amount,
  date,
  onAmountChange,
  onDateChange,
  onSubmit,
}: {
  amount: number;
  date: string;
  onAmountChange: (value: number) => void;
  onDateChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Card className="p-6 sm:p-8">
      <CardHeader className="p-0 mb-5">
        <CardTitle className="text-xl font-semibold font-heading">
          {t("empAddAdvance")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="adv-amount">{t("empAmountRupee")}</Label>
            <NumberInput
              id="adv-amount"
              min={0}
              value={amount}
              onChange={(e) =>
                onAmountChange(parseFloat(e.target.value) || 0)
              }
              className="w-36 min-w-[120px] min-h-12"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="adv-date">{t("labelDate")}</Label>
            <DatePicker
              id="adv-date"
              value={date}
              onChange={onDateChange}
              className="min-w-[180px] min-h-12"
            />
          </div>
          <Button type="submit" className="min-h-12 px-6">
            {t("empAddAdvance")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
