"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/components/language-provider";
import type { Row } from "@/lib/utils/employeeDetail";

export type ProductionDraft = {
  itemId: string;
  shift: "day" | "night";
  quantity: number;
  date: string;
};

/** Record a day's piece-rate output for this employee. */
export function AddProductionForm({
  items,
  draft,
  onDraftChange,
  onSubmit,
}: {
  items: Row[];
  draft: ProductionDraft;
  onDraftChange: (patch: Partial<ProductionDraft>) => void;
  onSubmit: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Card className="p-6 sm:p-8">
      <CardHeader className="p-0 mb-5">
        <CardTitle className="text-xl font-semibold font-heading">
          {t("empAddProduction")}
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
            <Label htmlFor="prod-item">{t("reportsColPackagingGroup")}</Label>
            <Select
              value={draft.itemId}
              onValueChange={(v) => onDraftChange({ itemId: v })}
            >
              <SelectTrigger id="prod-item" className="w-56 min-h-12">
                <SelectValue placeholder={t("selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id as string} value={i.id as string}>
                    {i.name as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="prod-shift">{t("labelShift")}</Label>
            <Select
              value={draft.shift}
              onValueChange={(v) =>
                onDraftChange({ shift: v as "day" | "night" })
              }
            >
              <SelectTrigger id="prod-shift" className="min-w-[100px] min-h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t("shiftDay")}</SelectItem>
                <SelectItem value="night">{t("shiftNight")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="prod-qty">{t("labelQty")}</Label>
            <NumberInput
              id="prod-qty"
              min={1}
              value={draft.quantity}
              onChange={(e) =>
                onDraftChange({ quantity: parseInt(e.target.value, 10) || 1 })
              }
              className="w-24 min-h-12"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="prod-date">{t("labelDate")}</Label>
            <DatePicker
              id="prod-date"
              value={draft.date}
              onChange={(v) => onDraftChange({ date: v })}
              className="min-w-[180px] min-h-12"
            />
          </div>
          <Button type="submit" className="min-h-12 px-6">
            {t("add")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
