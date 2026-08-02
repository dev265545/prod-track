"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getHolidaysInRange } from "@/lib/services/factoryHolidayService";
import { saveSalarySheetOverride } from "@/lib/services/salarySheetOverrideService";
import type { SalarySheetRow } from "@/lib/services/salarySheetService";
import {
  buildSalarySheetDraftState,
  buildSalarySheetOverrideValuesFromDraft,
  getSalarySheetDriverDefaults,
  stepSalarySheetDriverValue,
  type SalarySheetDriverField,
  type SalarySheetDraftDrivers,
} from "@/lib/services/salarySheetEditorState";
import { currency, number } from "@/lib/utils/formatter";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import {
  clampPayrollDriverFieldsToPeriod,
  countSundaysInRange,
  getMaxEarnedSundayPayDaysInRange,
  getWorkingDaysInRange,
} from "@/lib/utils/date";

const DRIVER_FIELDS: Array<{
  key: SalarySheetDriverField;
  labelKey: MessageKey;
}> = [
  { key: "presentDays", labelKey: "salaryAdjustDriverPresentDays" },
  { key: "earnedSundayPayDays", labelKey: "salaryAdjustDriverEarnedSunday" },
  { key: "sundayPresentBonusDays", labelKey: "salaryAdjustDriverSundayBonus" },
];

function formatCalculatedValue(
  key:
    | SalarySheetDriverField
    | "absentDays"
    | "totalPaidDays"
    | "calculatedSalary",
  value: number,
): string {
  return key === "calculatedSalary" ? currency(value) : number(value);
}

export interface SalarySheetAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: SalarySheetRow | null;
  year: number;
  month: number;
  periodFrom: string;
  periodTo: string;
  onSaved: () => void | Promise<void>;
}

export function SalarySheetAdjustDialog({
  open,
  onOpenChange,
  row,
  year,
  month,
  periodFrom,
  periodTo,
  onSaved,
}: SalarySheetAdjustDialogProps) {
  const { t } = useLanguage();
  const [draftDrivers, setDraftDrivers] =
    useState<SalarySheetDraftDrivers | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [periodHolidayDates, setPeriodHolidayDates] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !periodFrom || !periodTo) {
      setPeriodHolidayDates([]);
      return;
    }
    let cancelled = false;
    void getHolidaysInRange(periodFrom, periodTo).then((rows) => {
      if (!cancelled) {
        setPeriodHolidayDates(rows.map((h) => h.date as string));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, periodFrom, periodTo]);

  const driverCaps = useMemo(() => {
    if (!periodFrom || !periodTo || periodFrom > periodTo) {
      return { maxPresent: 0, maxEarned: 0, maxSunday: 0 };
    }
    return {
      maxPresent: getWorkingDaysInRange(
        periodFrom,
        periodTo,
        periodHolidayDates,
      ),
      maxEarned: getMaxEarnedSundayPayDaysInRange(periodFrom, periodTo),
      maxSunday: countSundaysInRange(periodFrom, periodTo),
    };
  }, [periodFrom, periodTo, periodHolidayDates]);

  const periodRangeValid = useMemo(
    () => Boolean(periodFrom && periodTo && periodFrom <= periodTo),
    [periodFrom, periodTo],
  );

  const clampDriverDraft = useCallback(
    (d: SalarySheetDraftDrivers): SalarySheetDraftDrivers => ({
      ...d,
      ...clampPayrollDriverFieldsToPeriod(
        periodFrom,
        periodTo,
        periodHolidayDates,
        {
          presentDays: d.presentDays,
          earnedSundayPayDays: d.earnedSundayPayDays,
          sundayPresentBonusDays: d.sundayPresentBonusDays,
        },
      ),
    }),
    [periodFrom, periodTo, periodHolidayDates],
  );

  useEffect(() => {
    if (!open || !row) return;
    setDraftNotes(row.overrideNotes);
  }, [open, row]);

  useEffect(() => {
    if (!open || !row) return;
    setDraftDrivers((prev) =>
      prev
        ? clampDriverDraft(prev)
        : clampDriverDraft(getSalarySheetDriverDefaults(row)),
    );
  }, [open, row, periodFrom, periodTo, periodHolidayDates, clampDriverDraft]);

  const closeModal = (force = false) => {
    if (savingOverride && !force) return;
    onOpenChange(false);
    setDraftDrivers(null);
    setDraftNotes("");
    setPeriodHolidayDates([]);
  };

  const resetDraftField = (field: SalarySheetDriverField) => {
    if (!row) return;
    const defaults = getSalarySheetDriverDefaults(row);
    setDraftDrivers((current) => {
      if (!current) return current;
      const merged = { ...current, [field]: defaults[field] };
      return clampDriverDraft(merged);
    });
  };

  const resetAllDraftFields = () => {
    if (row) setDraftDrivers(clampDriverDraft(getSalarySheetDriverDefaults(row)));
    setDraftNotes("");
  };

  const saveAdjustments = async () => {
    if (!row || !draftDrivers) return;
    const safeDrivers = clampDriverDraft(draftDrivers);
    const draftStateForSave = buildSalarySheetDraftState(row, safeDrivers);
    const overrides = buildSalarySheetOverrideValuesFromDraft(
      row,
      draftStateForSave,
    );

    setSavingOverride(true);
    try {
      await saveSalarySheetOverride({
        employeeId: row.id,
        year,
        month,
        fromDate: periodFrom,
        toDate: periodTo,
        notes: draftNotes,
        overrides,
      });
      toast.success(t("salaryAdjustSavedToast"));
      closeModal(true);
      await onSaved();
    } catch {
      toast.error(t("salaryAdjustSaveFail"));
    } finally {
      setSavingOverride(false);
    }
  };

  const draftState =
    row && draftDrivers
      ? buildSalarySheetDraftState(row, clampDriverDraft(draftDrivers))
      : null;

  const maxForAdjustDriver = (key: SalarySheetDriverField): number | undefined => {
    if (key === "presentDays") {
      return driverCaps.maxPresent > 0 ? driverCaps.maxPresent : undefined;
    }
    if (key === "earnedSundayPayDays") {
      return driverCaps.maxEarned;
    }
    if (key === "sundayPresentBonusDays") {
      return driverCaps.maxSunday;
    }
    return undefined;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && closeModal()}
    >
      <DialogContent
        className={cn(
          "flex max-h-[var(--dialog-max-h)] flex-col gap-0 overflow-hidden border-border p-0",
          "w-[min(96rem,calc(100%-1.5rem))] max-w-none rounded-xl shadow-xl",
        )}
      >
        {row && (
          <>
            <DialogHeader className="sticky top-0 z-10 shrink-0 gap-3 border-b bg-background/95 px-5 py-4 backdrop-blur sm:px-7">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <DialogTitle className="text-xl font-semibold">
                    {t("salaryAdjustTitle", { name: row.name })}
                  </DialogTitle>
                  <DialogDescription className="max-w-3xl text-sm leading-6">
                    {t("salaryAdjustDesc", {
                      from: periodFrom,
                      to: periodTo,
                    })}
                  </DialogDescription>
                </div>
                <Card className="min-w-0 shrink-0 rounded-2xl lg:min-w-[220px] border-chart-1/30 bg-chart-1/10 shadow-none">
                  <CardContent className="px-4 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-chart-4">
                      {t("salaryAdjustCurrentSalary")}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                      {currency(row.calculatedSalary)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("salaryAdjustAutoBase", {
                        amount: currency(row.baseCalculatedSalary),
                      })}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-6 px-5 py-5 sm:px-7 sm:py-6">
                <Card className="rounded-2xl border-chart-1/20 bg-chart-1/5 shadow-none">
                  <CardContent className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">
                        {t("salaryAdjustHowTitle")}
                      </p>
                      <p>
                        {t("salaryAdjustHowBody")}
                      </p>
                    </div>
                    <div className="grid gap-3 rounded-xl border border-chart-1/20 bg-background/95 p-4 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 text-muted-foreground">
                          {t("salaryAdjustOverrideStatus")}
                        </span>
                        <span className="min-w-0 font-medium text-foreground">
                          {row.hasOverrides
                            ? t("salaryAdjustManualSaved")
                            : t("salaryAdjustAutomaticOnly")}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 text-muted-foreground">
                          {t("salaryAdjustLastAdjusted")}
                        </span>
                        <span className="min-w-0 text-right text-foreground">
                          {row.overrideUpdatedAt || t("salaryAdjustNotYet")}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {draftState &&
                    DRIVER_FIELDS.map((field) => (
                      <Card
                        key={field.key}
                        className="rounded-2xl border-chart-1/20 bg-gradient-to-br from-card to-chart-1/5 shadow-none"
                      >
                        <CardHeader className="px-5 pb-3 pt-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <Label
                                htmlFor={`payroll-override-${field.key}`}
                                className="text-sm font-medium text-foreground"
                              >
                                {t(field.labelKey)}
                              </Label>
                              {/*
                                Only one reference number: what the app itself
                                counted. The box below already shows the value
                                that will be saved, so a third "current sheet"
                                number just confuses the clerk.
                              */}
                              <p className="text-xs text-muted-foreground">
                                {t("salaryAdjustCalculatedLabel")}{" "}
                                {formatCalculatedValue(
                                  field.key,
                                  row.calculatedValues[field.key],
                                )}
                              </p>
                              {field.key === "presentDays" &&
                              periodRangeValid &&
                              driverCaps.maxPresent > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  {t("salaryAdjustPresentDaysCap", {
                                    count: driverCaps.maxPresent,
                                  })}
                                </p>
                              ) : null}
                              {field.key === "earnedSundayPayDays" &&
                              periodRangeValid ? (
                                <p className="text-xs text-muted-foreground">
                                  {t("salaryAdjustEarnedSundayCap", {
                                    count: driverCaps.maxEarned,
                                  })}
                                </p>
                              ) : null}
                              {field.key === "sundayPresentBonusDays" &&
                              periodRangeValid ? (
                                <p className="text-xs text-muted-foreground">
                                  {t("salaryAdjustSundayBonusCap", {
                                    count: driverCaps.maxSunday,
                                  })}
                                </p>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="min-h-11 shrink-0 px-2.5 text-xs text-chart-4 hover:text-chart-5"
                              onClick={() => resetDraftField(field.key)}
                            >
                              {t("salaryAdjustAutoButton")}
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="px-5 pb-5">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              className="size-11 shrink-0 border-chart-1/30 bg-chart-1/5 hover:bg-chart-1/15"
                              onClick={() =>
                                setDraftDrivers((current) =>
                                  current
                                    ? clampDriverDraft({
                                        ...current,
                                        [field.key]:
                                          stepSalarySheetDriverValue(
                                            current[field.key],
                                            -1,
                                          ),
                                      })
                                    : current,
                                )
                              }
                            >
                              -
                            </Button>
                            <NumberInput
                              id={`payroll-override-${field.key}`}
                              min={0}
                              max={maxForAdjustDriver(field.key)}
                              className="h-11 min-w-0 flex-1 border-chart-1/30 bg-background text-center text-base tabular-nums"
                              value={String(draftState.drivers[field.key])}
                              onChange={(event) => {
                                const next = Number(event.target.value);
                                if (!Number.isFinite(next)) return;
                                const v = Math.max(0, Math.round(next));
                                setDraftDrivers((current) =>
                                  current
                                    ? clampDriverDraft({
                                        ...current,
                                        [field.key]: v,
                                      })
                                    : current,
                                );
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              className="size-11 shrink-0 border-chart-1/30 bg-chart-1/5 hover:bg-chart-1/15"
                              disabled={(() => {
                                const cap = maxForAdjustDriver(field.key);
                                return (
                                  cap !== undefined &&
                                  draftState.drivers[field.key] >= cap
                                );
                              })()}
                              onClick={() =>
                                setDraftDrivers((current) =>
                                  current
                                    ? clampDriverDraft({
                                        ...current,
                                        [field.key]:
                                          stepSalarySheetDriverValue(
                                            current[field.key],
                                            1,
                                          ),
                                      })
                                    : current,
                                )
                              }
                            >
                              +
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>

                {draftState && (
                  <Card className="rounded-2xl border-chart-2/20 bg-chart-1/10 shadow-none">
                    <CardHeader className="px-5 pb-3 pt-5">
                      <CardTitle className="text-base font-semibold">
                        {t("salaryAdjustAutoResultsTitle")}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {t("salaryAdjustAutoResultsSubtitle")}
                      </p>
                    </CardHeader>
                    <CardContent className="grid gap-4 px-5 pb-5 sm:grid-cols-2 md:grid-cols-3">
                      {(
                        [
                          ["absentDays", "salaryAdjustDerivedAbsent"],
                          ["totalPaidDays", "salaryAdjustDerivedPaid"],
                          ["calculatedSalary", "salaryAdjustDerivedSalary"],
                        ] as const
                      ).map(([key, labelKey]) => {
                        const isChanged =
                          draftState.changedDerivedFields.includes(key);
                        const value = draftState.derived[key];
                        return (
                          <div
                            key={key}
                            className={`rounded-xl border p-4 transition-colors ${
                              isChanged
                                ? "border-chart-2/35 bg-chart-1/15 ring-1 ring-inset ring-chart-2/20"
                                : "border-chart-1/15 bg-background"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="min-w-0 text-sm font-medium text-foreground">
                                {t(labelKey)}
                              </p>
                              {isChanged ? (
                                <span className="shrink-0 rounded-full bg-chart-2/10 px-2 py-0.5 text-[11px] font-medium text-chart-4">
                                  {t("salaryAdjustBadgeUpdated")}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
                              {formatCalculatedValue(key, value)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("salaryAdjustCurrentSheetLabel")}{" "}
                              {formatCalculatedValue(key, row[key])}
                            </p>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                <Card className="rounded-2xl border-chart-1/20 shadow-none">
                  <CardHeader className="px-5 pb-3 pt-5">
                    <CardTitle className="text-base font-semibold">
                      {t("salaryAdjustNotesTitle")}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {t("salaryAdjustNotesSubtitle")}
                    </p>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    <Label htmlFor="payroll-override-notes" className="sr-only">
                      {t("salaryAdjustNotesSrOnly")}
                    </Label>
                    <textarea
                      id="payroll-override-notes"
                      className="min-h-28 w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      placeholder={t("salaryAdjustNotesPlaceholder")}
                      value={draftNotes}
                      onChange={(event) => setDraftNotes(event.target.value)}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>

            <DialogFooter className="sticky bottom-0 z-10 shrink-0 flex-wrap gap-2 border-t bg-background/95 px-5 py-4 backdrop-blur sm:px-7">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 px-4"
                onClick={() => closeModal()}
                disabled={savingOverride}
              >
                {t("commonCancel")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 px-4"
                onClick={resetAllDraftFields}
                disabled={savingOverride}
              >
                {t("salaryAdjustResetAll")}
              </Button>
              <Button
                type="button"
                className="min-h-11 px-4"
                onClick={() => void saveAdjustments()}
                disabled={savingOverride}
              >
                {savingOverride ? t("salaryAdjustSaving") : t("salaryAdjustSave")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
