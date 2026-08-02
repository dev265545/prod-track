"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { useLanguage } from "@/components/language-provider";
import type { Row } from "@/lib/utils/employeeDetail";

/** Operator-only payroll rules: required present days and Sunday multiplier. */
export function OperatorSettingsCard({
  requiredPresentDays,
  sundayMultiplier,
  onDraft,
  onSave,
}: {
  requiredPresentDays: number;
  sundayMultiplier: number;
  onDraft: (patch: Row) => void;
  onSave: (patch: Row) => void | Promise<void>;
}) {
  const { t } = useLanguage();
  return (
    <Card className="p-5 sm:p-6 animate-fade-in animate-stagger-1">
      <CardHeader className="p-0 pb-2">
        <CardTitle className="text-base font-semibold font-heading">
          {t("empOperatorSettingsTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("empOperatorSettingsDesc")}
        </p>
      </CardHeader>
      <CardContent className="p-0 pt-2">
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="emp-required-present-days">
              {t("empRequiredPresentDays")}
            </Label>
            <NumberInput
              id="emp-required-present-days"
              min={1}
              value={requiredPresentDays}
              onChange={(e) =>
                onDraft({
                  requiredPresentDays: parseInt(e.target.value, 10) || 26,
                })
              }
              onBlur={(e) =>
                void onSave({
                  requiredPresentDays:
                    parseInt((e.target as HTMLInputElement).value, 10) || 26,
                })
              }
              className="w-40 min-h-10"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="emp-sunday-multiplier">
              {t("empSundayMultiplier")}
            </Label>
            <NumberInput
              id="emp-sunday-multiplier"
              decimal
              min={1}
              value={sundayMultiplier}
              onChange={(e) =>
                onDraft({
                  sundayMultiplier: parseFloat(e.target.value) || 1.2,
                })
              }
              onBlur={(e) =>
                void onSave({
                  sundayMultiplier:
                    parseFloat((e.target as HTMLInputElement).value) || 1.2,
                })
              }
              className="w-40 min-h-10"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
