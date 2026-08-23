"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { useLanguage } from "@/components/language-provider";
import { readNumericInput } from "@/lib/utils/numericInput";
import type { Row } from "@/lib/utils/employeeDetail";

/**
 * This operator's own Sunday numbers — or neither, which is the point.
 *
 * The two boxes used to be filled in from `?? 26` / `?? 1.2` and saved on blur.
 * Merely opening a worker's page therefore wrote 26 and 1.2 onto the worker,
 * and since a number on the worker beats the Sunday category's own rule, the
 * category's extra Sunday pay could never reach them again — invisibly, with
 * nobody having typed anything.
 *
 * So an empty box is now a real, storable state meaning "follow the rule this
 * worker's Sunday category sets", the fallback appears only as grey placeholder
 * text, and clearing a box stores nothing rather than the number that was
 * showing. The same idea as the "No limit" state in the Sunday rule editor:
 * absent has to be reachable, or it is not really a default.
 */
export function OperatorSettingsCard({
  requiredPresentDays,
  sundayMultiplier,
  fallbackRequiredPresentDays,
  fallbackSundayMultiplier,
  onDraft,
  onSave,
}: {
  /** This worker's own value, or `undefined` to follow the rule. */
  requiredPresentDays: number | undefined;
  /** This worker's own value, or `undefined` to follow the rule. */
  sundayMultiplier: number | undefined;
  /** What applies when the worker has no number of their own — shown as a hint. */
  fallbackRequiredPresentDays: number;
  fallbackSundayMultiplier: number;
  onDraft: (patch: Row) => void;
  onSave: (patch: Row) => void | Promise<void>;
}) {
  const { t } = useLanguage();

  /**
   * An empty (or half-typed) box is "no number of their own", never a
   * substituted default. `readNumericInput` cannot express that — it takes a
   * fallback number — so the empty case is decided before it is called.
   */
  const read = (raw: string, min: number): number | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === ".") return undefined;
    return readNumericInput(trimmed, min, { min });
  };

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
            <div className="flex items-center gap-2">
              <NumberInput
                id="emp-required-present-days"
                min={1}
                value={requiredPresentDays ?? ""}
                placeholder={String(fallbackRequiredPresentDays)}
                onChange={(e) =>
                  onDraft({
                    requiredPresentDays: read(e.target.value, 1),
                  })
                }
                onBlur={(e) =>
                  void onSave({
                    requiredPresentDays: read(
                      (e.target as HTMLInputElement).value,
                      1,
                    ),
                  })
                }
                className="w-40 min-h-10"
              />
              {requiredPresentDays !== undefined && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] px-4 py-3 text-base"
                  aria-label={`${t("commonClear")} — ${t("empRequiredPresentDays")}`}
                  onClick={() => void onSave({ requiredPresentDays: undefined })}
                >
                  {t("commonClear")}
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="emp-sunday-multiplier">
              {t("empSundayMultiplier")}
            </Label>
            <div className="flex items-center gap-2">
              <NumberInput
                id="emp-sunday-multiplier"
                decimal
                min={1}
                value={sundayMultiplier ?? ""}
                placeholder={String(fallbackSundayMultiplier)}
                onChange={(e) =>
                  onDraft({
                    sundayMultiplier: read(e.target.value, 1),
                  })
                }
                onBlur={(e) =>
                  void onSave({
                    sundayMultiplier: read(
                      (e.target as HTMLInputElement).value,
                      1,
                    ),
                  })
                }
                className="w-40 min-h-10"
              />
              {sundayMultiplier !== undefined && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] px-4 py-3 text-base"
                  aria-label={`${t("commonClear")} — ${t("empSundayMultiplier")}`}
                  onClick={() => void onSave({ sundayMultiplier: undefined })}
                >
                  {t("commonClear")}
                </Button>
              )}
            </div>
          </div>
        </div>
        {/* Says out loud which number is actually being used when a box is
            empty — the precedence the Settings screen already spells out. */}
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("setgPayWhenBody")}
        </p>
      </CardContent>
    </Card>
  );
}
