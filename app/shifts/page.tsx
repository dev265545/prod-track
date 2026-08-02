"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SettingsSection } from "@/components/settings/shared";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { readNumericInput } from "@/lib/utils/numericInput";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Clock, Info, Trash2 } from "lucide-react";
import { useAuthGuard } from "@/lib/hooks/useAuthGuard";
import { getShifts, saveShift, deleteShift } from "@/lib/services/shiftService";
import {
  deleteSundayCategory,
  getSundayCategories,
  saveSundayCategory,
  type SundayCategory,
} from "@/lib/services/sundayCategoryService";
import { toast } from "sonner";
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
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { useLanguage } from "@/components/language-provider";

type PayRules = {
  shifts: Record<string, unknown>[];
  sundayCategories: SundayCategory[];
};

/** Module scope so the effect can hand the setter straight to the promise
 * rather than calling setState inside its own body. */
async function fetchPayRules(): Promise<PayRules> {
  const [shifts, sundayCategories] = await Promise.all([
    getShifts(),
    getSundayCategories(),
  ]);
  return { shifts, sundayCategories };
}

export default function ShiftsPage() {
  const { ready: guardReady } = useAuthGuard();
  const { t } = useLanguage();
  const [data, setData] = useState<PayRules | null>(null);
  const ready = guardReady && data !== null;
  const shifts = data?.shifts ?? [];
  const sundayCategories = data?.sundayCategories ?? [];
  const [shiftName, setShiftName] = useState("");
  // Held as text so an emptied box stays empty while it is being retyped; the
  // old on-keystroke `parseInt(...) || 8` snapped the field back to 8 the
  // instant it was cleared. Bounds are applied once, on submit.
  const [shiftHours, setShiftHours] = useState("8");

  const [categoryName, setCategoryName] = useState("");
  const [categoryMode, setCategoryMode] = useState<"threshold" | "step">(
    "threshold",
  );
  // Text for the same reason as shiftHours; `Math.max(1, ...)` on submit keeps
  // the "at least 1" guarantee the browser used to give us.
  const [requiredPresent, setRequiredPresent] = useState("12");
  const [earnedSundays, setEarnedSundays] = useState("2");
  const [everyPresentDays, setEveryPresentDays] = useState("6");
  const [earnedPerStep, setEarnedPerStep] = useState("1");

  const load = useCallback(async () => {
    setData(await fetchPayRules());
  }, []);

  useEffect(() => {
    if (!guardReady) return;
    fetchPayRules()
      .then(setData)
      .catch(() => {});
  }, [guardReady]);

  if (!ready) {
    return (
      <AppLoadingScreen
        title={t("loadingOpeningShifts")}
        description={t("loadingOpeningShiftsDesc")}
      />
    );
  }

  const btnPrimaryClass = "min-h-[44px] px-6 py-3 text-base";

  return (
    <AppShell>
      <main className="animate-fade-in flex w-full min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {t("shiftsPageTitle")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t("setgShiftsIntro")}
          </p>
        </header>

        {/* The two blocks below are not unrelated settings: together they are
            the whole answer to "how does a day of work turn into pay?". */}
        <div className="flex max-w-2xl flex-col gap-2 rounded-xl border border-border bg-surface-2 p-4">
          <p className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Info className="size-5 shrink-0" aria-hidden />
            {t("setgShiftsWhyTitle")}
          </p>
          <p className="text-base leading-relaxed text-muted-foreground">
            {t("setgShiftsWhyBody")}
          </p>
        </div>

        <SettingsSection
          icon={Clock}
          title={`${t("setgShiftsStep", { n: 1 })} · ${t("shiftsCardShiftsTitle")}`}
          description={t("shiftsCardShiftsSubtitle")}
        >
          <div className="w-full overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("shiftsColName")}</TableHead>
                  <TableHead className="text-right tabular-nums">
                    {t("shiftsColHoursPerDay")}
                  </TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-24 text-center text-base text-muted-foreground"
                    >
                      {t("shiftsEmptyHint")}
                    </TableCell>
                  </TableRow>
                ) : (
                  shifts.map((s) => (
                    <TableRow
                      key={s.id as string}
                      className="transition-colors hover:bg-surface-2"
                    >
                      <TableCell className="font-medium">
                        {s.name as string}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.hoursPerDay as number}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              title={t("shiftsDeleteTitle")}
                              aria-label={t("shiftsDeleteShiftAria")}
                            >
                              <Trash2 data-icon="inline-start" aria-hidden />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("shiftsDeleteTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("shiftsDeleteDesc", {
                                  name: String(s.name),
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t("commonCancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={async () => {
                                  try {
                                    await deleteShift(s.id as string);
                                    await load();
                                    toast.success(t("shiftsDeleteSuccess"));
                                  } catch {
                                    toast.error(t("shiftsDeleteFail"));
                                  }
                                }}
                              >
                                {t("commonDelete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <form
            className="flex flex-wrap gap-4 items-end rounded-xl border border-border bg-surface-2 p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!shiftName.trim()) return;
              try {
                await saveShift({
                  name: shiftName.trim(),
                  hoursPerDay: readNumericInput(shiftHours, 8, { min: 1, max: 24 }),
                });
                setShiftName("");
                setShiftHours("8");
                await load();
                toast.success(t("shiftsAddSuccess"));
              } catch {
                toast.error(t("shiftsAddFail"));
              }
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="shiftName">{t("shiftsFormNameLabel")}</Label>
              <Input
                id="shiftName"
                type="text"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                placeholder={t("shiftsFormNamePlaceholder")}
                className="w-48 min-h-[44px]"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="shiftHours">{t("shiftsFormHoursLabel")}</Label>
              <NumberInput
                id="shiftHours"
                min={1}
                max={24}
                value={shiftHours}
                onChange={(e) => setShiftHours(e.target.value)}
                className="w-24 min-h-[44px]"
              />
            </div>
            <Button type="submit" className={btnPrimaryClass}>
              {t("shiftsFormSubmit")}
            </Button>
          </form>
        </SettingsSection>

        <SettingsSection
          icon={CalendarDays}
          title={`${t("setgShiftsStep", { n: 2 })} · ${t("shiftsSundayCardTitle")}`}
          description={t("shiftsSundayCardSubtitle")}
        >
          <div className="w-full overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("shiftsSundayColName")}</TableHead>
                  <TableHead>{t("shiftsSundayColRule")}</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sundayCategories.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-24 text-center text-base text-muted-foreground"
                    >
                      {t("shiftsSundayEmptyHint")}
                    </TableCell>
                  </TableRow>
                ) : (
                  sundayCategories.map((c) => (
                    <TableRow
                      key={c.id as string}
                      className="transition-colors hover:bg-surface-2"
                    >
                      <TableCell className="font-medium">
                        {c.name as string}
                      </TableCell>
                      <TableCell>
                        {(c.mode as string) === "step"
                          ? t("shiftsSundayRuleStep", {
                              every: c.everyPresentDays as number,
                              earned: c.earnedPerStep as number,
                            })
                          : t("shiftsSundayRuleThreshold", {
                              required: c.requiredPresent as number,
                              earned: c.earnedSundays as number,
                            })}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              title={t("shiftsSundayDeleteTitle")}
                              aria-label={t("shiftsSundayDeleteCatAria")}
                            >
                              <Trash2 data-icon="inline-start" aria-hidden />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("shiftsSundayDeleteTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("shiftsSundayDeleteDesc", {
                                  name: String(c.name),
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t("commonCancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={async () => {
                                  try {
                                    await deleteSundayCategory(c.id as string);
                                    await load();
                                    toast.success(
                                      t("shiftsSundayDeleteSuccess"),
                                    );
                                  } catch {
                                    toast.error(t("shiftsSundayDeleteFail"));
                                  }
                                }}
                              >
                                {t("commonDelete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <form
            className="flex flex-wrap gap-4 items-end rounded-xl border border-border bg-surface-2 p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!categoryName.trim()) return;
              try {
                if (categoryMode === "threshold") {
                  await saveSundayCategory({
                    name: categoryName.trim(),
                    mode: "threshold",
                    requiredPresent: readNumericInput(requiredPresent, 12, { min: 1 }),
                    earnedSundays: readNumericInput(earnedSundays, 2, { min: 1 }),
                  });
                } else {
                  await saveSundayCategory({
                    name: categoryName.trim(),
                    mode: "step",
                    everyPresentDays: readNumericInput(everyPresentDays, 6, { min: 1 }),
                    earnedPerStep: readNumericInput(earnedPerStep, 1, { min: 1 }),
                  });
                }
                setCategoryName("");
                setCategoryMode("threshold");
                setRequiredPresent("12");
                setEarnedSundays("2");
                setEveryPresentDays("6");
                setEarnedPerStep("1");
                await load();
                toast.success(t("shiftsSundayAddSuccess"));
              } catch {
                toast.error(t("shiftsSundayAddFail"));
              }
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="catName">{t("shiftsSundayFormNameLabel")}</Label>
              <Input
                id="catName"
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder={t("shiftsSundayFormNamePlaceholder")}
                className="w-64 min-h-[44px]"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="catMode">{t("shiftsSundayFormModeLabel")}</Label>
              <Select
                value={categoryMode}
                onValueChange={(v) =>
                  setCategoryMode(v as "threshold" | "step")
                }
              >
                <SelectTrigger id="catMode" className="w-48 min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="threshold">
                    {t("shiftsSundayModeThreshold")}
                  </SelectItem>
                  <SelectItem value="step">
                    {t("shiftsSundayModeStep")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {categoryMode === "threshold" ? (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="requiredPresent">
                    {t("shiftsSundayPresentNeeded")}
                  </Label>
                  <NumberInput
                    id="requiredPresent"
                    min={1}
                    value={requiredPresent}
                    onChange={(e) => setRequiredPresent(e.target.value)}
                    className="w-40 min-h-[44px]"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="earnedSundays">
                    {t("shiftsSundayEarnedLabel")}
                  </Label>
                  <NumberInput
                    id="earnedSundays"
                    min={1}
                    value={earnedSundays}
                    onChange={(e) => setEarnedSundays(e.target.value)}
                    className="w-32 min-h-[44px]"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="everyPresentDays">
                    {t("shiftsSundayEveryPresent")}
                  </Label>
                  <NumberInput
                    id="everyPresentDays"
                    min={1}
                    value={everyPresentDays}
                    onChange={(e) => setEveryPresentDays(e.target.value)}
                    className="w-40 min-h-[44px]"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="earnedPerStep">
                    {t("shiftsSundayPerStep")}
                  </Label>
                  <NumberInput
                    id="earnedPerStep"
                    min={1}
                    value={earnedPerStep}
                    onChange={(e) => setEarnedPerStep(e.target.value)}
                    className="w-32 min-h-[44px]"
                  />
                </div>
              </>
            )}

            <Button type="submit" className={btnPrimaryClass}>
              {t("shiftsSundayFormSubmit")}
            </Button>
          </form>
        </SettingsSection>
      </main>
    </AppShell>
  );
}
